// Hot Potato — Trading Engine
// Handles all buy/sell decisions, money management, profit ladder

import { BotState, Trade, BotNotification, CoinData } from './types'
import { TRADE_FEE_PERCENT, FEE_MULTIPLIER, PROFIT_THRESHOLD } from './constants'
import { scanMarket, shouldBail } from './scanner'

// ============================================
// Calculate trade fee
// ============================================
function calcFee(amount: number): number {
  return amount * TRADE_FEE_PERCENT
}

// ============================================
// Create a notification
// ============================================
function notify(
  state: BotState,
  type: BotNotification['type'],
  message: string
): BotNotification {
  const notif: BotNotification = {
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    message,
    timestamp: Date.now(),
    read: false,
  }
  state.notifications.unshift(notif)
  return notif
}

// ============================================
// Create a trade record
// ============================================
function recordTrade(
  state: BotState,
  type: 'buy' | 'sell',
  coinId: string,
  coinSymbol: string,
  price: number,
  amount: number,
  reason: string
): Trade {
  const fee = calcFee(amount)
  const trade: Trade = {
    id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    coinId,
    coinSymbol,
    price,
    amount,
    fee,
    timestamp: Date.now(),
    reason,
  }
  state.trades.unshift(trade)
  state.totalTrades++
  return trade
}

// ============================================
// BUY a coin
// ============================================
function buyCoin(state: BotState, coin: CoinData, reason: string): BotState {
  const amount = state.tradingBalance
  const fee = calcFee(amount)
  const netAmount = amount - fee

  recordTrade(state, 'buy', coin.id, coin.symbol, coin.currentPrice, amount, reason)
  notify(state, 'trade', `Bought ${coin.symbol} at $${coin.currentPrice.toFixed(4)} — ${reason}`)

  state.tradingBalance = netAmount
  state.currentCoin = coin.id
  state.currentCoinSymbol = coin.symbol
  state.buyPrice = coin.currentPrice

  return state
}

// ============================================
// SELL current coin
// ============================================
function sellCoin(state: BotState, currentPrice: number, reason: string): BotState {
  if (!state.currentCoin || !state.buyPrice) return state

  const priceChange = (currentPrice - state.buyPrice) / state.buyPrice
  const saleValue = state.tradingBalance * (1 + priceChange)
  const fee = calcFee(saleValue)
  const netValue = saleValue - fee
  const profit = netValue - state.tradingBalance

  recordTrade(state, 'sell', state.currentCoin, state.currentCoinSymbol || '?', currentPrice, saleValue, reason)

  const symbol = state.currentCoinSymbol || '?'
  if (profit > 0) {
    notify(state, 'trade', `Sold ${symbol} at $${currentPrice.toFixed(4)} — profit: +$${profit.toFixed(4)}`)
  } else {
    notify(state, 'trade', `Sold ${symbol} at $${currentPrice.toFixed(4)} — loss: -$${Math.abs(profit).toFixed(4)}`)
  }

  state.tradingBalance = netValue
  state.totalProfit += profit
  state.profitSinceLastLock += profit
  state.currentCoin = null
  state.currentCoinSymbol = null
  state.buyPrice = null

  return state
}

// ============================================
// Check and apply profit ladder rules
// ============================================
function checkProfitLadder(state: BotState): BotState {
  // Check if we hit the profit threshold for locking
  if (state.profitSinceLastLock >= PROFIT_THRESHOLD) {
    const lockAmount = PROFIT_THRESHOLD
    state.lockedProfits += lockAmount
    state.tradingBalance -= lockAmount
    state.profitSinceLastLock = 0

    // Switch to profit-only mode after first lock
    if (state.mode === 'growth') {
      state.mode = 'profit-only'
      notify(state, 'profit_locked',
        `Profit locked! $${lockAmount.toFixed(2)} moved to safe pile. Seed money ($${state.seedAmount}) is now protected. Trading with profits only.`)
    } else {
      notify(state, 'profit_locked',
        `Profit locked! $${lockAmount.toFixed(2)} moved to safe pile. Total safe: $${(state.seedAmount + state.lockedProfits).toFixed(2)}`)
    }
  }

  return state
}

// ============================================
// Check if bot should pause (zeroed out)
// ============================================
function checkZeroOut(state: BotState): BotState {
  if (state.mode === 'profit-only' && state.tradingBalance <= 0.01) {
    state.status = 'paused'
    state.tradingBalance = 0
    state.profitSinceLastLock = 0
    notify(state, 'zeroed_out',
      `Trading profits zeroed out. Bot is paused. Your seed ($${state.seedAmount}) and locked profits ($${state.lockedProfits.toFixed(2)}) are safe. Restart manually when ready.`)
  }
  return state
}

// ============================================
// Should we jump to a better coin?
// ============================================
function shouldJump(
  state: BotState,
  bestCoin: CoinData
): { jump: boolean; reason: string } {
  if (!state.currentCoin) {
    return { jump: true, reason: 'Not holding anything — buy the best opportunity' }
  }

  // Don't jump to the same coin
  if (bestCoin.id === state.currentCoin) {
    return { jump: false, reason: 'Already holding the best coin' }
  }

  // Calculate if jumping is worth it (profit must be >= 2x fees)
  const jumpFee = calcFee(state.tradingBalance) * 2 // sell fee + buy fee
  const expectedGain = state.tradingBalance * (bestCoin.momentumScore / 100) * 0.5 // conservative estimate

  if (expectedGain < jumpFee * FEE_MULTIPLIER) {
    return { jump: false, reason: `Jump profit ($${expectedGain.toFixed(4)}) not worth 2x fees ($${(jumpFee * FEE_MULTIPLIER).toFixed(4)})` }
  }

  // The new coin must have significantly better momentum
  return { jump: true, reason: `Better momentum: ${bestCoin.symbol} (${bestCoin.momentumScore.toFixed(2)}%)` }
}

// ============================================
// MAIN TICK — called every scan interval
// ============================================
export async function tick(state: BotState): Promise<BotState> {
  if (state.status !== 'running') return state

  // 1. Scan the market
  const scan = await scanMarket()
  state.lastScanTime = scan.scannedAt

  // 2. If we're holding a coin, check if we should bail
  if (state.currentCoin) {
    const heldCoin = scan.topCoins.find((c) => c.id === state.currentCoin)

    if (heldCoin) {
      const bailCheck = shouldBail(heldCoin, state.buyPrice || 0)
      if (bailCheck.bail) {
        state = sellCoin(state, heldCoin.currentPrice, bailCheck.reason)
        state = checkProfitLadder(state)
        state = checkZeroOut(state)
        if (state.status === 'paused') return state
      }
    } else {
      // Coin fell off the qualified list — sell it
      // Use the last known price from any scan data
      const anyData = scan.topCoins[0] // fallback
      if (anyData && state.buyPrice) {
        state = sellCoin(state, state.buyPrice * 0.998, 'Coin no longer qualifies — bailing')
        state = checkProfitLadder(state)
        state = checkZeroOut(state)
        if (state.status === 'paused') return state
      }
    }
  }

  // 3. If we're not holding anything, look for the best opportunity
  if (!state.currentCoin && scan.bestOpportunity) {
    state = buyCoin(state, scan.bestOpportunity, 'Best momentum opportunity')
  }

  // 4. If we're holding but there's a much better coin, consider jumping
  if (state.currentCoin && scan.bestOpportunity) {
    const jumpCheck = shouldJump(state, scan.bestOpportunity)
    if (jumpCheck.jump && scan.bestOpportunity.id !== state.currentCoin) {
      // Sell current
      const heldCoin = scan.topCoins.find((c) => c.id === state.currentCoin)
      if (heldCoin) {
        state = sellCoin(state, heldCoin.currentPrice, 'Jumping to better opportunity')
        state = checkProfitLadder(state)
        state = checkZeroOut(state)
        if (state.status === 'paused') return state
      }
      // Buy new
      state = buyCoin(state, scan.bestOpportunity, jumpCheck.reason)
    }
  }

  return state
}

// ============================================
// START the bot
// ============================================
export function startBot(state: BotState): BotState {
  state.status = 'running'
  state.startedAt = Date.now()
  notify(state, 'info', 'Hot Potato is running! Scanning the market...')
  return state
}

// ============================================
// PAUSE the bot (manual)
// ============================================
export function pauseBot(state: BotState): BotState {
  state.status = 'paused'
  notify(state, 'info', 'Bot paused manually.')
  return state
}

// ============================================
// RESTART the bot after zero-out
// ============================================
export function restartBot(state: BotState): BotState {
  // Pull from locked profits to restart
  if (state.lockedProfits >= PROFIT_THRESHOLD) {
    state.lockedProfits -= PROFIT_THRESHOLD
    state.tradingBalance = PROFIT_THRESHOLD
    state.status = 'running'
    state.profitSinceLastLock = 0
    notify(state, 'info', `Restarted with $${PROFIT_THRESHOLD} from locked profits. Remaining safe: $${(state.seedAmount + state.lockedProfits).toFixed(2)}`)
  } else {
    notify(state, 'info', 'Not enough locked profits to restart. Need at least $' + PROFIT_THRESHOLD)
  }
  return state
}
