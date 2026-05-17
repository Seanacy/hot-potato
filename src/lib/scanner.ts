// Hot Potato — Market Scanner
// Scans all coins, finds the ones with steady upward momentum

import { CoinData, PricePoint, ScanResult } from './types'
import {
  COINGECKO_API,
  MAX_COINS_TO_WATCH,
  MIN_VOLUME_USD,
  TREND_WINDOW_SEC,
  MIN_TREND_SEC,
  MAX_SPIKE_PERCENT,
  SPIKE_WINDOW_SEC,
  MAX_VOLATILITY_RATIO,
  MIN_PRICE_POINTS,
} from './constants'

// In-memory price history cache (for paper trading)
const priceHistoryCache: Map<string, PricePoint[]> = new Map()
const MAX_HISTORY_POINTS = 120 // keep ~2 minutes of data at 1 point/sec

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
      // Update price history cache
      const historyKey = coin.id
      const existing = priceHistoryCache.get(historyKey) || []
      existing.push({ price: coin.current_price, timestamp: now })

      // Trim old data
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
// Analyze a coin's trend quality
// ============================================
export function analyzeCoin(coin: CoinData): CoinData {
  const now = Date.now()
  const windowStart = now - (TREND_WINDOW_SEC * 1000)
  const recentPrices = coin.priceHistory.filter((p) => p.timestamp >= windowStart)

  // Not enough data points yet
  if (recentPrices.length < MIN_PRICE_POINTS) {
    return { ...coin, momentumScore: 0, stabilityScore: 0, qualified: false }
  }

  // Check volume filter
  if (coin.volume24h < MIN_VOLUME_USD) {
    return { ...coin, momentumScore: 0, stabilityScore: 0, qualified: false }
  }

  // Calculate momentum (overall price change in the window)
  const oldestPrice = recentPrices[0].price
  const newestPrice = recentPrices[recentPrices.length - 1].price
  const priceChange = ((newestPrice - oldestPrice) / oldestPrice) * 100

  // Must be positive (going up)
  if (priceChange <= 0) {
    return { ...coin, momentumScore: 0, stabilityScore: 0, qualified: false }
  }

  // Check for spike rejection
  if (hasSpike(recentPrices)) {
    return { ...coin, momentumScore: priceChange, stabilityScore: 0, qualified: false }
  }

  // Check trend stability
  const stability = calculateStability(recentPrices)
  if (stability > MAX_VOLATILITY_RATIO) {
    return { ...coin, momentumScore: priceChange, stabilityScore: stability, qualified: false }
  }

  // Check minimum trend duration
  const trendDuration = (recentPrices[recentPrices.length - 1].timestamp - recentPrices[0].timestamp) / 1000
  if (trendDuration < MIN_TREND_SEC) {
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
function hasSpike(prices: PricePoint[]): boolean {
  for (let i = 1; i < prices.length; i++) {
    const timeDiff = (prices[i].timestamp - prices[i - 1].timestamp) / 1000
    if (timeDiff <= SPIKE_WINDOW_SEC && timeDiff > 0) {
      const change = Math.abs(
        ((prices[i].price - prices[i - 1].price) / prices[i - 1].price) * 100
      )
      if (change >= MAX_SPIKE_PERCENT) {
        return true // sudden spike detected
      }
    }
  }
  return false
}

// ============================================
// Stability score — ratio of down moves to up moves
// Lower = more stable uptrend
// ============================================
function calculateStability(prices: PricePoint[]): number {
  let upMoves = 0
  let downMoves = 0

  for (let i = 1; i < prices.length; i++) {
    const diff = prices[i].price - prices[i - 1].price
    if (diff > 0) upMoves++
    else if (diff < 0) downMoves++
  }

  if (upMoves === 0) return 1 // no up moves = not stable
  return downMoves / upMoves
}

// ============================================
// Full market scan — returns ranked opportunities
// ============================================
export async function scanMarket(): Promise<ScanResult> {
  const rawCoins = await fetchMarketData()
  const analyzed = rawCoins.map(analyzeCoin)
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
// Check if current coin should be abandoned
// ============================================
export function shouldBail(coin: CoinData, buyPrice: number): { bail: boolean; reason: string } {
  const now = Date.now()
  const recentWindow = 15000 // last 15 seconds
  const recentPrices = coin.priceHistory.filter((p) => p.timestamp >= now - recentWindow)

  if (recentPrices.length < 3) {
    return { bail: false, reason: 'Not enough recent data' }
  }

  // Check if price is falling from our buy price
  const currentPrice = recentPrices[recentPrices.length - 1].price
  const changeFromBuy = ((currentPrice - buyPrice) / buyPrice) * 100

  // If we're down more than 0.5% from buy, bail
  if (changeFromBuy < -0.5) {
    return { bail: true, reason: `Price dropped ${changeFromBuy.toFixed(2)}% from buy price` }
  }

  // Check if price is stagnant (barely moving in last 15 seconds)
  const oldest = recentPrices[0].price
  const newest = recentPrices[recentPrices.length - 1].price
  const recentChange = Math.abs(((newest - oldest) / oldest) * 100)

  if (recentChange < 0.02) {
    return { bail: true, reason: 'Coin is stagnant — not moving' }
  }

  // Check if trend reversed (going down in recent window)
  const recentTrend = ((newest - oldest) / oldest) * 100
  if (recentTrend < -0.1) {
    return { bail: true, reason: 'Trend reversed — price dropping' }
  }

  return { bail: false, reason: 'Trend still good' }
}

// Reset cache (for testing)
export function resetPriceCache() {
  priceHistoryCache.clear()
}
