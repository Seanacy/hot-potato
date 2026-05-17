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

export interface BotState {
  status: 'running' | 'paused' | 'stopped'
  mode: 'growth' | 'profit-only'
  seedAmount: number
  lockedProfits: number
  tradingBalance: number
  currentCoin: string | null // coin ID currently held, null = in USDC
  currentCoinSymbol: string | null
  buyPrice: number | null // price we bought at
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
  seedAmount: 10,
  lockedProfits: 0,
  tradingBalance: 10,
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
