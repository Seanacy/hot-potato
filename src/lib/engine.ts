// Hot Potato — Trading Engine
// Handles all buy/sell decisions, money management, step-up profit ladder
// Supports both Paper and Live (Coinbase) trading modes

import { BotState, BotNotification, CoinData, ProfitStep } from './types'
import { scanMarket, shouldBail } from './scanner'
import {
  marketBuy,
  marketSell,
  getOrder,
  toProductId,
  isCoinbaseConfigured,
  getUsdBalance,
} from './coinbase'

// ============================================
// Calculate trade fee (uses settings)
// ============================================
function calcFee(amount: number, feePercent: number): number {
  return amount * feePercent
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
) {
  const fee = calcFee(amount, state.settings.tradeFeePercent)
  const trade = {
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
// Get the current step (never goes out of bounds)
// ============================================
function getCurrentStep(state: BotState): ProfitStep {
  const steps = state.settings.steps
  if (steps.length === 0) {
    return { profitTarget: 5, lockAmount: 2.5, repeatCount: 0 }
  }
  const idx = Math.min(state.currentStepIndex, steps.length - 1)
  return steps[idx]
}

// ============================================
// BUY a coin — Paper or Live
// ============================================
async function buyCoin(state: BotState, coin: CoinData, reason: string): Promise<BotState> {
  const isLive = state.settings.tradingMode === 'live'
  const amount = state.tradingBalance

  if (isLive) {
    // === LIVE MODE: Place real order on Coinbase ===
    const productId = toProductId(coin.symbol)
    notify(state, 'info', `[LIVE] Placing buy order for ${coin.symbol} ($${amount.toFixed(2)})...`)

    const result = await marketBuy(productId, amount)

    if (!result.success) {
      notify(state, 'info', `[LIVE] Buy failed: ${result.error}`)
      return state // don't change state if order failed
    }

    // Wait a moment then check the order for fill details
    let filledPrice = coin.currentPrice
    let filledSize = 0
    if (result.orderId) {
      // Small delay to let order settle
      await new Promise((r) => setTimeout(r, 1500))
      const details = await getOrder(result.orderId)
      if (details) {
        filledPrice = details.averageFilledPrice || coin.currentPrice
        filledSize = details.filledSize || 0
      }
      state.lastOrderId = result.orderId
    }

    const fee = calcFee(amount, state.settings.tradeFeePercent)
    const netAmount = amount - fee

    recordTrade(state, 'buy', coin.id, coin.symbol, filledPrice, amount, `[LIVE] ${reason}`)
    notify(state, 'trade', `[LIVE] Bought ${coin.symbol} at $${filledPrice.toFixed(4)} — ${reason}`)

    state.tradingBalance = netAmount
    state.currentCoin = coin.id
    state.currentCoinSymbol = coin.symbol
    state.buyPrice = filledPrice
    state.coinHolding = filledSize

  } else {
    // === PAPER MODE: Simulated trade ===
    const fee = calcFee(amount, state.settings.tradeFeePercent)
    const netAmount = amount - fee

    recordTrade(state, 'buy', coin.id, coin.symbol, coin.currentPrice, amount, reason)
    notify(state, 'trade', `Bought ${coin.symbol} at $${coin.currentPrice.toFixed(4)} — ${reason}`)

    state.tradingBalance = netAmount
    state.currentCoin = coin.id
    state.currentCoinSymbol = coin.symbol
    state.buyPrice = coin.currentPrice
  }

  return state
}

// ============================================
// SELL current coin — Paper or Live
// ============================================
async function sellCoin(state: BotState, currentPrice: number, reason: string): Promise<BotState> {
  if (!state.currentCoin || !state.buyPrice) return state

  const isLive = state.settings.tradingMode === 'live'

  if (isLive) {
    // === LIVE MODE: Place real sell order on Coinbase ===
    const symbol = state.currentCoinSymbol || '?'
    const productId = toProductId(symbol)

    if (state.coinHolding <= 0) {
      notify(state, 'info', `[LIVE] No coin balance to sell`)
      return state
    }

    notify(state, 'info', `[LIVE] Placing sell order for ${symbol} (${state.coinHolding})...`)
    const result = await marketSell(productId, state.coinHolding)

    if (!result.success) {
      notify(state, 'info', `[LIVE] Sell failed: ${result.error}`)
      return state
    }

    let filledPrice = currentPrice
    let filledValue = state.tradingBalance
    if (result.orderId) {
      await new Promise((r) => setTimeout(r, 1500))
      const details = await getOrder(result.orderId)
      if (details) {
        filledPrice = details.averageFilledPrice || currentPrice
        filledValue = details.filledValue || state.tradingBalance
      }
      state.lastOrderId = result.orderId
    }

    const fee = calcFee(filledValue, state.settings.tradeFeePercent)
    const netValue = filledValue - fee
    const profit = netValue - state.tradingBalance

    recordTrade(state, 'sell', state.currentCoin, symbol, filledPrice, filledValue, `[LIVE] ${reason}`)

    if (profit > 0) {
      notify(state, 'trade', `[LIVE] Sold ${symbol} at $${filledPrice.toFixed(4)} — profit: +$${profit.toFixed(4)}`)
    } else {
      notify(state, 'trade', `[LIVE] Sold ${symbol} at $${filledPrice.toFixed(4)} — loss: -$${Math.abs(profit).toFixed(4)}`)
    }

    state.tradingBalance = netValue
    state.totalProfit += profit
    state.profitSinceLastLock += profit
    state.currentCoin = null
    state.currentCoinSymbol = null
    state.buyPrice = null
    state.coinHolding = 0

  } else {
    // === PAPER MODE: Simulated trade ===
    const priceChange = (currentPrice - state.buyPrice) / state.buyPrice
    const saleValue = state.tradingBalance * (1 + priceChange)
    const fee = calcFee(saleValue, state.settings.tradeFeePercent)
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
  }

  return state
}

// ============================================
// Profit Ladder — supports simple or step-up mode
// ============================================
function checkProfitLadder(state: BotState): BotState {
  if (state.settings.ladderMode === 'simple') {
    return checkSimpleLadder(state)
  }
  return checkStepUpLadder(state)
}

function checkSimpleLadder(state: BotState): BotState {
  const target = state.settings.simpleProfitTarget
  const lockAmount = state.settings.simpleLockAmount

  if (state.profitSinceLastLock >= target) {
    state.lockedProfits += lockAmount
    state.tradingBalance -= lockAmount
    state.profitSinceLastLock = 0

    if (state.mode === 'growth') {
      state.mode = 'profit-only'
      notify(state, 'profit_locked',
        `Profit locked! $${lockAmount.toFixed(2)} moved to safe pile. Seed ($${state.seedAmount}) is now protected.`)
    } else {
      notify(state, 'profit_locked',
        `Locked $${lockAmount.toFixed(2)}! Total safe: $${(state.seedAmount + state.lockedProfits).toFixed(2)}`)
    }
  }

  return state
}

function checkStepUpLadder(state: BotState): BotState {
  const step = getCurrentStep(state)
  const steps = state.settings.steps
  const isLastStep = state.currentStepIndex >= steps.length - 1

  if (state.profitSinceLastLock >= step.profitTarget) {
    const lockAmount = step.lockAmount
    state.lockedProfits += lockAmount
    state.tradingBalance -= lockAmount
    state.profitSinceLastLock = 0
    state.currentStepRepeats++

    if (state.mode === 'growth') {
      state.mode = 'profit-only'
      notify(state, 'profit_locked',
        `Step ${state.currentStepIndex + 1} — Profit locked! $${lockAmount.toFixed(2)} moved to safe pile. Seed ($${state.seedAmount}) is now protected.`)
    } else {
      notify(state, 'profit_locked',
        `Step ${state.currentStepIndex + 1} — Locked $${lockAmount.toFixed(2)}! (${state.currentStepRepeats}/${step.repeatCount || '∞'}) Total safe: $${(state.seedAmount + state.lockedProfits).toFixed(2)}`)
    }

    if (!isLastStep && step.repeatCount > 0 && state.currentStepRepeats >= step.repeatCount) {
      state.currentStepIndex++
      state.currentStepRepeats = 0
      const nextStep = getCurrentStep(state)
      notify(state, 'step_up',
        `Stepped up! Now on Step ${state.currentStepIndex + 1}: earn $${nextStep.profitTarget} → lock $${nextStep.lockAmount}`)
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
      `Trading profits zeroed out. Bot paused. Your seed ($${state.seedAmount}) and locked profits ($${state.lockedProfits.toFixed(2)}) are safe.`)
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

  if (bestCoin.id === state.currentCoin) {
    return { jump: false, reason: 'Already holding the best coin' }
  }

  const feePercent = state.settings.tradeFeePercent
  const feeMultiplier = state.settings.feeMultiplier
  const jumpFee = calcFee(state.tradingBalance, feePercent) * 2
  const expectedGain = state.tradingBalance * (bestCoin.momentumScore / 100) * 0.5

  if (expectedGain < jumpFee * feeMultiplier) {
    return { jump: false, reason: `Jump profit ($${expectedGain.toFixed(4)}) not worth ${feeMultiplier}x fees ($${(jumpFee * feeMultiplier).toFixed(4)})` }
  }

  return { jump: true, reason: `Better momentum: ${bestCoin.symbol} (${bestCoin.momentumScore.toFixed(2)}%)` }
}

// ============================================
// MAIN TICK — called every scan interval
// ============================================
export async function tick(state: BotState): Promise<BotState> {
  if (state.status !== 'running') return state

  // Check Coinbase config status
  state.coinbaseConfigured = isCoinbaseConfigured()

  // If live mode but Coinbase not configured, refuse to trade
  if (state.settings.tradingMode === 'live' && !state.coinbaseConfigured) {
    notify(state, 'info', 'Cannot trade in Live mode — Coinbase API keys not configured')
    state.status = 'paused'
    return state
  }

  const scan = await scanMarket(state.settings)
  state.lastScanTime = scan.scannedAt

  if (state.currentCoin) {
    const heldCoin = scan.topCoins.find((c) => c.id === state.currentCoin)

    if (heldCoin) {
      const bailCheck = shouldBail(heldCoin, state.buyPrice || 0, state.settings)
      if (bailCheck.bail) {
        state = await sellCoin(state, heldCoin.currentPrice, bailCheck.reason)
        state = checkProfitLadder(state)
        state = checkZeroOut(state)
        if (state.status === 'paused') return state
      }
    } else {
      const anyData = scan.topCoins[0]
      if (anyData && state.buyPrice) {
        state = await sellCoin(state, state.buyPrice * 0.998, 'Coin no longer qualifies — bailing')
        state = checkProfitLadder(state)
        state = checkZeroOut(state)
        if (state.status === 'paused') return state
      }
    }
  }

  if (!state.currentCoin && scan.bestOpportunity) {
    state = await buyCoin(state, scan.bestOpportunity, 'Best momentum opportunity')
  }

  if (state.currentCoin && scan.bestOpportunity) {
    const jumpCheck = shouldJump(state, scan.bestOpportunity)
    if (jumpCheck.jump && scan.bestOpportunity.id !== state.currentCoin) {
      const heldCoin = scan.topCoins.find((c) => c.id === state.currentCoin)
      if (heldCoin) {
        state = await sellCoin(state, heldCoin.currentPrice, 'Jumping to better opportunity')
        state = checkProfitLadder(state)
        state = checkZeroOut(state)
        if (state.status === 'paused') return state
      }
      state = await buyCoin(state, scan.bestOpportunity, jumpCheck.reason)
    }
  }

  return state
}

// ============================================
// START the bot
// ============================================
export function startBot(state: BotState): BotState {
  state.coinbaseConfigured = isCoinbaseConfigured()
  state.status = 'running'
  state.startedAt = Date.now()

  const modeLabel = state.settings.tradingMode === 'live' ? '[LIVE]' : '[PAPER]'
  const step = getCurrentStep(state)
  notify(state, 'info', `${modeLabel} Hot Potato is running! Step ${state.currentStepIndex + 1}: earn $${step.profitTarget} → lock $${step.lockAmount}`)
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
  let restartAmount: number
  if (state.settings.ladderMode === 'simple') {
    restartAmount = state.settings.simpleLockAmount
  } else {
    const step = getCurrentStep(state)
    restartAmount = step.lockAmount
  }

  if (state.lockedProfits >= restartAmount) {
    state.lockedProfits -= restartAmount
    state.tradingBalance = restartAmount
    state.status = 'running'
    state.profitSinceLastLock = 0
    notify(state, 'info', `Restarted with $${restartAmount} from locked profits. Remaining safe: $${(state.seedAmount + state.lockedProfits).toFixed(2)}`)
  } else {
    notify(state, 'info', `Not enough locked profits to restart. Need at least $${restartAmount}`)
  }
  return state
}

// ============================================
// Check Coinbase balance (for dashboard display)
// ============================================
export async function checkLiveBalance(): Promise<number> {
  try {
    return await getUsdBalance()
  } catch {
    return 0
  }
}
