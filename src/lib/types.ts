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
// Step-Up Profit Ladder
// ============================================
export interface ProfitStep {
  profitTarget: number   // earn this much profit to trigger a lock
  lockAmount: number     // lock this much when triggered
  repeatCount: number    // how many times to repeat this step before moving on
}

export const DEFAULT_STEPS: ProfitStep[] = [
  { profitTarget: 5, lockAmount: 2.5, repeatCount: 4 },
  { profitTarget: 10, lockAmount: 5, repeatCount: 3 },
  { profitTarget: 20, lockAmount: 10, repeatCount: 0 }, // 0 = repeat forever (last step)
]

// ============================================
// ALL user-controllable settings
// ============================================
export interface BotSettings {
  // Trading mode
  tradingMode: 'paper' | 'live'  // paper = fake money, live = real Coinbase trades

  // Money
  seedAmount: number          // starting capital in USD
  tradeFeePercent: number     // fee per trade (0.006 = 0.6%)
  feeMultiplier: number       // only jump if gain >= Nx fees

  // Profit ladder mode: 'simple' = one flat threshold, 'step-up' = staircase
  ladderMode: 'simple' | 'step-up'

  // Simple mode settings
  simpleProfitTarget: number  // earn this much to trigger a lock
  simpleLockAmount: number    // lock this much when triggered

  // Step-up profit ladder
  steps: ProfitStep[]         // the step-up rules

  // Watchlist
  watchMode: 'market' | 'watchlist'  // scan everything or just specific coins
  watchlist: string[]                // coin IDs to watch (e.g. ['bitcoin', 'ethereum'])

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
  tradingMode: 'paper',
  seedAmount: 10,
  tradeFeePercent: 0.006,
  feeMultiplier: 2,
  ladderMode: 'simple',
  simpleProfitTarget: 5,
  simpleLockAmount: 2.5,
  steps: [...DEFAULT_STEPS],
  watchMode: 'market',
  watchlist: [],
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

// ============================================
// Bot State
// ============================================
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

  // Step-up ladder tracking
  currentStepIndex: number    // which step we're on (0-based)
  currentStepRepeats: number  // how many times we've completed the current step

  // Live trading state
  coinbaseConfigured: boolean // are API keys set up?
  coinHolding: number         // amount of coin currently held (for live sells)
  lastOrderId: string | null  // last Coinbase order ID

  trades: Trade[]
  notifications: BotNotification[]
  lastScanTime: number
  startedAt: number
}

export interface BotNotification {
  id: string
  type: 'profit_locked' | 'zeroed_out' | 'trade' | 'info' | 'step_up'
  message: string
  timestamp: number
  read: boolean
}

export interface ScannedCoin {
  id: string
  symbol: string
  name: string
  currentPrice: number
  volume24h: number
  priceChangePercent1h: number
  momentumScore: number
  stabilityScore: number
  qualified: boolean
  rejectionReason: string | null  // why it was filtered out (null if qualified)
}

export interface ScanResult {
  topCoins: CoinData[]
  allScanned: ScannedCoin[]       // every coin that was checked, with reasons
  bestOpportunity: CoinData | null
  scannedAt: number
  totalScanned: number
}

export const DEFAULT_BOT_STATE: BotState = {
  status: 'stopped',
  mode: 'growth',
  settings: { ...DEFAULT_SETTINGS, steps: [...DEFAULT_STEPS] },
  seedAmount: DEFAULT_SETTINGS.seedAmount,
  lockedProfits: 0,
  tradingBalance: DEFAULT_SETTINGS.seedAmount,
  currentCoin: null,
  currentCoinSymbol: null,
  buyPrice: null,
  totalTrades: 0,
  totalProfit: 0,
  profitSinceLastLock: 0,
  currentStepIndex: 0,
  currentStepRepeats: 0,
  coinbaseConfigured: false,
  coinHolding: 0,
  lastOrderId: null,
  trades: [],
  notifications: [],
  lastScanTime: 0,
  startedAt: 0,
}
