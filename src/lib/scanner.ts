// Hot Potato — Market Scanner
// Scans all coins, finds the ones with steady upward momentum
// Supports full-market scan or watchlist-only mode
// ALL thresholds come from BotSettings (user-configurable)

import { CoinData, PricePoint, ScanResult, ScannedCoin, BotSettings, DEFAULT_SETTINGS } from './types'
import { COINGECKO_API, MAX_COINS_TO_WATCH } from './constants'

// In-memory price history cache (for paper trading)
const priceHistoryCache: Map<string, PricePoint[]> = new Map()
const MAX_HISTORY_POINTS = 120

// ============================================
// Fetch market data from CoinGecko (free API)
// ============================================
export async function fetchMarketData(watchlist?: string[]): Promise<CoinData[]> {
  try {
    let url: string

    if (watchlist && watchlist.length > 0) {
      // Watchlist mode: fetch only specific coins by ID
      const ids = watchlist.join(',')
      url = `${COINGECKO_API}/coins/markets?vs_currency=usd&ids=${ids}&sparkline=false&price_change_percentage=1h`
    } else {
      // Market mode: fetch top coins by volume
      url = `${COINGECKO_API}/coins/markets?vs_currency=usd&order=volume_desc&per_page=${MAX_COINS_TO_WATCH}&page=1&sparkline=false&price_change_percentage=1h`
    }

    const res = await fetch(url, { next: { revalidate: 5 } })

    if (!res.ok) {
      console.error('CoinGecko API error:', res.status)
      return []
    }

    const data = await res.json()
    const now = Date.now()

    return data.map((coin: {
      id: string
      symbol: string
      name: string
      current_price: number
      total_volume: number
      price_change_percentage_1h_in_currency: number | null
    }) => {
      const historyKey = coin.id
      const existing = priceHistoryCache.get(historyKey) || []
      existing.push({ price: coin.current_price, timestamp: now })

      const cutoff = now - (MAX_HISTORY_POINTS * 1000)
      const trimmed = existing.filter((p) => p.timestamp > cutoff)
      priceHistoryCache.set(historyKey, trimmed)

      const coinData: CoinData = {
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        currentPrice: coin.current_price,
        priceHistory: trimmed,
        volume24h: coin.total_volume,
        priceChangePercent1h: coin.price_change_percentage_1h_in_currency || 0,
        momentumScore: 0,
        stabilityScore: 0,
        qualified: false,
      }

      return coinData
    })
  } catch (error) {
    console.error('Failed to fetch market data:', error)
    return []
  }
}

// ============================================
// Analyze a coin and return rejection reason
// ============================================
export function analyzeCoin(coin: CoinData, settings: BotSettings): { coin: CoinData; rejectionReason: string | null } {
  const now = Date.now()
  const windowStart = now - (settings.trendWindowSec * 1000)
  const recentPrices = coin.priceHistory.filter((p) => p.timestamp >= windowStart)

  if (recentPrices.length < settings.minPricePoints) {
    return {
      coin: { ...coin, momentumScore: 0, stabilityScore: 0, qualified: false },
      rejectionReason: `Not enough data (${recentPrices.length}/${settings.minPricePoints} points)`,
    }
  }

  if (coin.volume24h < settings.minVolumeUsd) {
    return {
      coin: { ...coin, momentumScore: 0, stabilityScore: 0, qualified: false },
      rejectionReason: `Low volume ($${(coin.volume24h / 1000).toFixed(0)}k < $${(settings.minVolumeUsd / 1000).toFixed(0)}k min)`,
    }
  }

  const oldestPrice = recentPrices[0].price
  const newestPrice = recentPrices[recentPrices.length - 1].price
  const priceChange = ((newestPrice - oldestPrice) / oldestPrice) * 100

  if (priceChange <= 0) {
    return {
      coin: { ...coin, momentumScore: priceChange, stabilityScore: 0, qualified: false },
      rejectionReason: `Not trending up (${priceChange.toFixed(2)}%)`,
    }
  }

  if (hasSpike(recentPrices, settings)) {
    return {
      coin: { ...coin, momentumScore: priceChange, stabilityScore: 0, qualified: false },
      rejectionReason: `Price spike detected (pump & dump risk)`,
    }
  }

  const stability = calculateStability(recentPrices)
  if (stability > settings.maxVolatilityRatio) {
    return {
      coin: { ...coin, momentumScore: priceChange, stabilityScore: stability, qualified: false },
      rejectionReason: `Too volatile (${stability.toFixed(2)} > ${settings.maxVolatilityRatio} max)`,
    }
  }

  const trendDuration = (recentPrices[recentPrices.length - 1].timestamp - recentPrices[0].timestamp) / 1000
  if (trendDuration < settings.minTrendSec) {
    return {
      coin: { ...coin, momentumScore: priceChange, stabilityScore: stability, qualified: false },
      rejectionReason: `Trend too short (${trendDuration.toFixed(0)}s < ${settings.minTrendSec}s min)`,
    }
  }

  return {
    coin: {
      ...coin,
      momentumScore: priceChange,
      stabilityScore: stability,
      qualified: true,
    },
    rejectionReason: null,
  }
}

// ============================================
// Spike detection — reject pump & dump coins
// ============================================
function hasSpike(prices: PricePoint[], settings: BotSettings): boolean {
  for (let i = 1; i < prices.length; i++) {
    const timeDiff = (prices[i].timestamp - prices[i - 1].timestamp) / 1000
    if (timeDiff <= settings.spikeWindowSec && timeDiff > 0) {
      const change = Math.abs(
        ((prices[i].price - prices[i - 1].price) / prices[i - 1].price) * 100
      )
      if (change >= settings.maxSpikePercent) {
        return true
      }
    }
  }
  return false
}

// ============================================
// Stability score — ratio of down moves to up moves
// ============================================
function calculateStability(prices: PricePoint[]): number {
  let upMoves = 0
  let downMoves = 0

  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i].price - prices[i - 1].price
    if (diff > 0) upMoves++
    else if (diff < 0) downMoves++
  }

  if (upMoves === 0) return 1
  return downMoves / upMoves
}

// ============================================
// Full market scan — returns ranked opportunities
// ============================================
export async function scanMarket(settings?: BotSettings): Promise<ScanResult> {
  const s = settings || DEFAULT_SETTINGS

  // Decide what to fetch based on watch mode
  const watchlist = s.watchMode === 'watchlist' && s.watchlist.length > 0
    ? s.watchlist
    : undefined

  const rawCoins = await fetchMarketData(watchlist)
  const results = rawCoins.map((c) => analyzeCoin(c, s))

  const analyzed = results.map((r) => r.coin)
  const qualified = analyzed
    .filter((c) => c.qualified)
    .sort((a, b) => b.momentumScore - a.momentumScore)

  // Build the allScanned list with rejection reasons
  const allScanned: ScannedCoin[] = results.map((r) => ({
    id: r.coin.id,
    symbol: r.coin.symbol,
    name: r.coin.name,
    currentPrice: r.coin.currentPrice,
    volume24h: r.coin.volume24h,
    priceChangePercent1h: r.coin.priceChangePercent1h,
    momentumScore: r.coin.momentumScore,
    stabilityScore: r.coin.stabilityScore,
    qualified: r.coin.qualified,
    rejectionReason: r.rejectionReason,
  }))

  // Sort: qualified first (by momentum), then rejected (by volume)
  allScanned.sort((a, b) => {
    if (a.qualified && !b.qualified) return -1
    if (!a.qualified && b.qualified) return 1
    if (a.qualified && b.qualified) return b.momentumScore - a.momentumScore
    return b.volume24h - a.volume24h
  })

  return {
    topCoins: qualified.slice(0, 20),
    allScanned,
    bestOpportunity: qualified[0] || null,
    scannedAt: Date.now(),
    totalScanned: rawCoins.length,
  }
}

// ============================================
// Check if current coin should be abandoned (uses settings)
// ============================================
export function shouldBail(coin: CoinData, buyPrice: number, settings?: BotSettings): { bail: boolean; reason: string } {
  const s = settings || DEFAULT_SETTINGS
  const now = Date.now()
  const recentWindow = 15000
  const recentPrices = coin.priceHistory.filter((p) => p.timestamp >= now - recentWindow)

  if (recentPrices.length < 3) {
    return { bail: false, reason: 'Not enough recent data' }
  }

  const currentPrice = recentPrices[recentPrices.length - 1].price
  const changeFromBuy = ((currentPrice - buyPrice) / buyPrice) * 100

  if (changeFromBuy < -s.bailPercent) {
    return { bail: true, reason: `Price dropped ${changeFromBuy.toFixed(2)}% from buy price` }
  }

  const oldest = recentPrices[0].price
  const newest = recentPrices[recentPrices.length - 1].price
  const recentChange = Math.abs(((newest - oldest) / oldest) * 100)

  if (recentChange < s.stagnantThreshold) {
    return { bail: true, reason: 'Coin is stagnant — not moving' }
  }

  const recentTrend = ((newest - oldest) / oldest) * 100
  if (recentTrend < -s.reversalThreshold) {
    return { bail: true, reason: 'Trend reversed — price dropping' }
  }

  return { bail: false, reason: 'Trend still good' }
}

// Reset cache (for testing)
export function resetPriceCache() {
  priceHistoryCache.clear()
}
