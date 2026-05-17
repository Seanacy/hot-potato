// Hot Potato — Core Types

export interface CoinData {
  id: string
  symbol: string
  name: string
  currentPrice: number
  priceHistory: PricePoint[] // recent price snapshots
  volume24h: number
  priceChangePercent1h: number
  momentumScore: number // calculated: how strong is the uptrend
  stabilityScore: number // calculated: how steady is the rise
  qualified: boolean // passes all filters
}

export interface PricePoint {
  price: number
  timestamp: number // unix ms
}

export interface Trade {
  id: string
  type: 'buy' | 'sell'
  coinId: string
  coinSymbol: string
  price: number
  amount: number // USD amount
  fee: number
  timestamp: number
  reason: string // why the bot made this trade
}

// ============================================
// ALL user-controllable settings
// ============================================
export interface BotSettings {
  // Money
  seedAmount: number          // starting capital in USD
  profitThreshold: number     // lock profits every $X
  tradeFeePercent: number     // fee per trade (0.006 = 0.6%)
  feeMultiplier: number       // only jump if gain >= Nx fees

  // Scanner
  scanIntervalMs: number      // how often to scan (ms)
  trendWindowSec: number      // look at last N seconds for trend
  minTrendSec: number         // coin must be rising for at least N seconds
  minVolumeUsd: number        // ignore coins below this daily volume
  maxSpikePercent: number     // reject if price jumps more than X% too fast
  spikeWindowSec: number      // time window for spike detection

  // Stability
  maxVolatilityRatio: number  // max ratio of down-moves to up-moves (lower = stricter)
  minPricePoints: number      // need at least N price points to evaluate

  // Bail rules
  bailPercent: number         // sell if price drops X% from buy price
  stagnantThreshold: number   // sell if price moves less than X% in recent window
  reversalThreshold: number   // sell if recent trend is below -X%
}

export const DEFAULT_SETTINGS: BotSettings = {
  seedAmount: 10,
  profitThreshold: 5,
  tradeFeePercent: 0.006,
  feeMultiplier: 2,
  scanIntervalMs: 5000,
  trendWindowSec: 90,
  minTrendSec: 30,
  minVolumeUsd: 50000,
  maxSpikePercent: 5,
  spikeWindowSec: 10,
  maxVolatilityRatio: 0.4,
  minPricePoints: 6,
  bailPercent: 0.5,
  stagnantThreshold: 0.02,
  reversalThreshold: 0.1,
}

export interface BotState {
  status: 'running' | 'paused' | 'stopped'
  mode: 'growth' | 'profit-only'
  settings: BotSettings
  seedAmount: number
  lockedProfits: number
  tradingBalance: number
  currentCoin: string | null
  currentCoinSymbol: string | null
  buyPrice: number | null
  totalTrades: number
  totalProfit: number
  profitSinceLastLock: number
  trades: Trade[]
  notifications: BotNotification[]
  lastScanTime: number
  startedAt: number
}

export interface BotNotification {
  id: string
  type: 'profit_locked' | 'zeroed_out' | 'trade' | 'info'
  message: string
  timestamp: number
  read: boolean
}

export interface ScanResult {
  topCoins: CoinData[]
  bestOpportunity: CoinData | null
  scannedAt: number
  totalScanned: number
}

export const DEFAULT_BOT_STATE: BotState = {
  status: 'stopped',
  mode: 'growth',
  settings: { ...DEFAULT_SETTINGS },
  seedAmount: DEFAULT_SETTINGS.seedAmount,
  lockedProfits: 0,
  tradingBalance: DEFAULT_SETTINGS.seedAmount,
  currentCoin: null,
  currentCoinSymbol: null,
  buyPrice: null,
  totalTrades: 0,
  totalProfit: 0,
  profitSinceLastLock: 0,
  trades: [],
  notifications: [],
  lastScanTime: 0,
  startedAt: 0,
}
