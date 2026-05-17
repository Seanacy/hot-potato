// Hot Potato — Configuration

// Money rules
export const SEED_AMOUNT = 10 // starting capital in USD
export const PROFIT_THRESHOLD = 5 // lock profits every $5
export const FEE_MULTIPLIER = 2 // only trade if expected profit >= 2x the fee
export const TRADE_FEE_PERCENT = 0.006 // 0.6% per trade (Coinbase standard)

// Scanner rules
export const SCAN_INTERVAL_MS = 5000 // check market every 5 seconds
export const TREND_WINDOW_SEC = 90 // look at last 90 seconds for trend
export const MIN_TREND_SEC = 30 // coin must be rising for at least 30 seconds
export const MIN_VOLUME_USD = 50000 // ignore coins with less than $50k daily volume
export const MAX_SPIKE_PERCENT = 5 // reject coins that spiked more than 5% in under 10 seconds
export const SPIKE_WINDOW_SEC = 10 // time window for spike detection

// Stability filter
export const MAX_VOLATILITY_RATIO = 0.4 // ratio of downward moves to upward moves (lower = more stable uptrend)
export const MIN_PRICE_POINTS = 6 // need at least 6 price points in the trend window to evaluate

// Trading
export const STABLECOIN = 'USDC' // park money here when nothing is moving
export const MAX_COINS_TO_WATCH = 100 // scan up to 100 coins at a time

// API
export const COINGECKO_API = 'https://api.coingecko.com/api/v3' // free, no API key needed
