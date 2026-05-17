// Hot Potato — Market Scanner
// Scans all coins, finds the ones with steady upward momentum
// ALL thresholds come from BotSettings (user-configurable)

import { CoinData, PricePoint, ScanResult, BotSettings, DEFAULT_SETTINGS } from './types'
import { COINGECKO_API, MAX_COINS_TO_WATCH } from './constants'

// In-memory price history cache (for paper trading)
const priceHistoryCache: Map<string, PricePoint[]> = new Map()
const MAX_HISTORY_POINTS = 120

// ============================================
// Fetch market data from CoinGecko (free API)
// ============================================
export async function fetchMarketData(): Promise<CoinData[]> {
  try {
    const res = await fetch(
      `${COINGECKO_API}/coins/markets?vs_currency=usd&order=volume_desc&per_page=${MAX_COINS_TO_WATCH}&page=1&sparkline=false&price_change_percentage=1h`,
      { next: { revalidate: 5 } }
    )

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
// Analyze a coin's trend quality (uses settings)
// ============================================
export function analyzeCoin(coin: CoinData, settings: BotSettings): CoinData {
  const now = Date.now()
  const windowStart = now - (settings.trendWindowSec * 1000)
  const recentPrices = coin.priceHistory.filter((p) => p.timestamp >= windowStart)

  if (recentPrices.length < settings.minPricePoints) {
    return { ...coin, momentumScore: 0, stabilityScore: 0, qualified: false }
  }

  if (coin.volume24h < settings.minVolumeUsd) {
    return { ...coin, momentumScore: 0, stabilityScore: 0, qualified: false }
  }

  const oldestPrice = recentPrices[0].price
  const newestPrice = recentPrices[recentPrices.length - 1].price
  const priceChange = ((newestPrice - oldestPrice) / oldestPrice) * 100

  if (priceChange <= 0) {
    return { ...coin, momentumScore: 0, stabilityScore: 0, qualified: false }
  }

  if (hasSpike(recentPrices, settings)) {
    return { ...coin, momentumScore: priceChange, stabilityScore: 0, qualified: false }
  }

  const stability = calculateStability(recentPrices)
  if (stability > settings.maxVolatilityRatio) {
    return { ...coin, momentumScore: priceChange, stabilityScore: stability, qualified: false }
  }

  const trendDuration = (recentPrices[recentPrices.length - 1].timestamp - recentPrices[0].timestamp) / 1000
  if (trendDuration < settings.minTrendSec) {
    return { ...coin, momentumScore: priceChange, stabilityScore: stability, qualified: false }
  }

  return {
    ...coin,
    momentumScore: priceChange,
    stabilityScore: stability,
    qualified: true,
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
  const rawCoins = await fetchMarketData()
  const analyzed = rawCoins.map((c) => analyzeCoin(c, s))
  const qualified = analyzed
    .filter((c) => c.qualified)
    .sort((a, b) => b.momentumScore - a.momentumScore)

  return {
    topCoins: qualified.slice(0, 20),
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
