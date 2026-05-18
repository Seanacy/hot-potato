// Hot Potato — Trading Engine
// Handles all buy/sell decisions, money management, step-up profit ladder
// Supports both Paper and Live (Coinbase) trading modes
// Logs every action to the activity feed

import { BotState, BotNotification, CoinData, ProfitStep, ActivityEntry, ActivityType, TradeRound } from './types'
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
// Activity log — stores recent bot actions
// ============================================
const MAX_ACTIVITY_ENTRIES = 200
let activityLog: ActivityEntry[] = []

export function getActivityLog(): ActivityEntry[] {
  return activityLog
}

export function clearActivityLog(): void {
  activityLog = []
}

// ============================================
// Trade rounds — complete buy→sell records
// ============================================
let tradeRounds: TradeRound[] = []

export function getTradeRounds(): TradeRound[] {
  return tradeRounds
}

export function clearTradeRounds(): void {
  tradeRounds = []
}

// Temporary storage for current buy info (to pair with sell)
let pendingBuy: {
  coinId: string
  coinSymbol: string
  buyPrice: number
  buyAmount: number
  buyFee: number
  buyTimestamp: number
  buyReason: string
} | null = null

function log(type: ActivityType, message: string, detail?: string): void {
  const entry: ActivityEntry = {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    message,
    detail,
    timestamp: Date.now(),
  }
  activityLog.unshift(entry)
  if (activityLog.length > MAX_ACTIVITY_ENTRIES) {
    activityLog = activityLog.slice(0, MAX_ACTIVITY_ENTRIES)
  }
}

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
  const modeTag = isLive ? '[LIVE] ' : ''

  log('buy', `${modeTag}Buying ${coin.symbol} at $${coin.currentPrice.toFixed(4)}`, `$${amount.toFixed(2)} — ${reason}`)

  if (isLive) {
    const productId = toProductId(coin.symbol)
    notify(state, 'info', `[LIVE] Placing buy order for ${coin.symbol} ($${amount.toFixed(2)})...`)

    const result = await marketBuy(productId, amount)

    if (!result.success) {
      log('error', `Buy failed: ${result.error}`, coin.symbol)
      notify(state, 'info', `[LIVE] Buy failed: ${result.error}`)
      return state
    }

    let filledPrice = coin.currentPrice
    let filledSize = 0
    if (result.orderId) {
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
    log('buy', `[LIVE] Filled ${coin.symbol} at $${filledPrice.toFixed(4)}`, `Size: ${filledSize} — Fee: $${fee.toFixed(4)}`)

    state.tradingBalance = netAmount
    state.currentCoin = coin.id
    state.currentCoinSymbol = coin.symbol
    state.buyPrice = filledPrice
    state.buyTimestamp = Date.now()
    state.peakPrice = filledPrice
    state.coinHolding = filledSize

    // Save pending buy for trade round pairing
    pendingBuy = {
      coinId: coin.id,
      coinSymbol: coin.symbol,
      buyPrice: filledPrice,
      buyAmount: amount,
      buyFee: fee,
      buyTimestamp: Date.now(),
      buyReason: `[LIVE] ${reason}`,
    }

  } else {
    const fee = calcFee(amount, state.settings.tradeFeePercent)
    const netAmount = amount - fee

    recordTrade(state, 'buy', coin.id, coin.symbol, coin.currentPrice, amount, reason)
    notify(state, 'trade', `Bought ${coin.symbol} at $${coin.currentPrice.toFixed(4)} — ${reason}`)

    state.tradingBalance = netAmount
    state.currentCoin = coin.id
    state.currentCoinSymbol = coin.symbol
    state.buyPrice = coin.currentPrice
    state.buyTimestamp = Date.now()
    state.peakPrice = coin.currentPrice

    // Save pending buy for trade round pairing
    pendingBuy = {
      coinId: coin.id,
      coinSymbol: coin.symbol,
      buyPrice: coin.currentPrice,
      buyAmount: amount,
      buyFee: fee,
      buyTimestamp: Date.now(),
      buyReason: reason,
    }
  }

  return state
}

// ============================================
// SELL current coin — Paper or Live
// ============================================
async function sellCoin(state: BotState, currentPrice: number, reason: string): Promise<BotState> {
  if (!state.currentCoin || !state.buyPrice) return state

  const isLive = state.settings.tradingMode === 'live'
  const symbol = state.currentCoinSymbol || '?'
  const modeTag = isLive ? '[LIVE] ' : ''

  log('sell', `${modeTag}Selling ${symbol} at $${currentPrice.toFixed(4)}`, reason)

  if (isLive) {
    const productId = toProductId(symbol)

    if (state.coinHolding <= 0) {
      log('error', `No coin balance to sell`, symbol)
      notify(state, 'info', `[LIVE] No coin balance to sell`)
      return state
    }

    notify(state, 'info', `[LIVE] Placing sell order for ${symbol} (${state.coinHolding})...`)
    const result = await marketSell(productId, state.coinHolding)

    if (!result.success) {
      log('error', `Sell failed: ${result.error}`, symbol)
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

    const profitStr = profit > 0 ? `+$${profit.toFixed(4)}` : `-$${Math.abs(profit).toFixed(4)}`
    notify(state, 'trade', `[LIVE] Sold ${symbol} at $${filledPrice.toFixed(4)} — ${profitStr}`)
    log('sell', `[LIVE] Sold ${symbol} — ${profitStr}`, `Filled at $${filledPrice.toFixed(4)}`)

    state.tradingBalance = netValue
    state.totalProfit += profit
    state.profitSinceLastLock += profit
    // Set cooldown on this coin before clearing state
    if (state.currentCoin) {
      state.coinCooldowns[state.currentCoin] = Date.now() + state.settings.coinCooldownMs
    }

    state.currentCoin = null
    state.currentCoinSymbol = null
    state.buyPrice = null
    state.buyTimestamp = null
    state.peakPrice = null
    state.coinHolding = 0

    // Record trade round
    if (pendingBuy) {
      const round: TradeRound = {
        id: `round-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        coinId: pendingBuy.coinId,
        coinSymbol: pendingBuy.coinSymbol,
        buyPrice: pendingBuy.buyPrice,
        sellPrice: filledPrice,
        buyAmount: pendingBuy.buyAmount,
        sellAmount: filledValue,
        buyFee: pendingBuy.buyFee,
        sellFee: fee,
        totalFees: pendingBuy.buyFee + fee,
        profit,
        profitPercent: (profit / pendingBuy.buyAmount) * 100,
        holdDurationMs: Date.now() - pendingBuy.buyTimestamp,
        buyTimestamp: pendingBuy.buyTimestamp,
        sellTimestamp: Date.now(),
        buyReason: pendingBuy.buyReason,
        sellReason: `[LIVE] ${reason}`,
        won: profit > 0,
      }
      tradeRounds.unshift(round)
      pendingBuy = null
    }

  } else {
    const priceChange = (currentPrice - state.buyPrice) / state.buyPrice
    const saleValue = state.tradingBalance * (1 + priceChange)
    const fee = calcFee(saleValue, state.settings.tradeFeePercent)
    const netValue = saleValue - fee
    const profit = netValue - state.tradingBalance

    recordTrade(state, 'sell', state.currentCoin, symbol, currentPrice, saleValue, reason)

    const profitStr = profit > 0 ? `+$${profit.toFixed(4)}` : `-$${Math.abs(profit).toFixed(4)}`
    notify(state, 'trade', `Sold ${symbol} at $${currentPrice.toFixed(4)} — ${profitStr}`)

    state.tradingBalance = netValue
    state.totalProfit += profit
    state.profitSinceLastLock += profit
    // Set cooldown on this coin before clearing state
    if (state.currentCoin) {
      state.coinCooldowns[state.currentCoin] = Date.now() + state.settings.coinCooldownMs
    }

    state.currentCoin = null
    state.currentCoinSymbol = null
    state.buyPrice = null
    state.buyTimestamp = null
    state.peakPrice = null

    // Record trade round
    if (pendingBuy) {
      const round: TradeRound = {
        id: `round-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        coinId: pendingBuy.coinId,
        coinSymbol: pendingBuy.coinSymbol,
        buyPrice: pendingBuy.buyPrice,
        sellPrice: currentPrice,
        buyAmount: pendingBuy.buyAmount,
        sellAmount: saleValue,
        buyFee: pendingBuy.buyFee,
        sellFee: fee,
        totalFees: pendingBuy.buyFee + fee,
        profit,
        profitPercent: (profit / pendingBuy.buyAmount) * 100,
        holdDurationMs: Date.now() - pendingBuy.buyTimestamp,
        buyTimestamp: pendingBuy.buyTimestamp,
        sellTimestamp: Date.now(),
        buyReason: pendingBuy.buyReason,
        sellReason: reason,
        won: profit > 0,
      }
      tradeRounds.unshift(round)
      pendingBuy = null
    }
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

    log('profit_lock', `Locked $${lockAmount.toFixed(2)} in profits`, `Total safe: $${(state.seedAmount + state.lockedProfits).toFixed(2)}`)

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

    log('profit_lock', `Step ${state.currentStepIndex + 1}: Locked $${lockAmount.toFixed(2)}`, `Repeat ${state.currentStepRepeats}/${step.repeatCount || '∞'}`)

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
      log('step_up', `Stepped up to Step ${state.currentStepIndex + 1}`, `Earn $${nextStep.profitTarget} → Lock $${nextStep.lockAmount}`)
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
    log('zero_out', 'Trading balance zeroed out — bot paused', `Seed $${state.seedAmount} + Locked $${state.lockedProfits.toFixed(2)} are safe`)
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

  state.coinbaseConfigured = isCoinbaseConfigured()

  if (state.settings.tradingMode === 'live' && !state.coinbaseConfigured) {
    log('error', 'Cannot trade in Live mode — Coinbase API keys not configured')
    notify(state, 'info', 'Cannot trade in Live mode — Coinbase API keys not configured')
    state.status = 'paused'
    return state
  }

  // --- SCAN ---
  const watchMode = state.settings.watchMode === 'watchlist' ? `watchlist (${state.settings.watchlist.length} coins)` : 'full market'
  log('scan_start', `Scanning ${watchMode}...`)

  const scan = await scanMarket(state.settings)
  state.lastScanTime = scan.scannedAt

  const qualCount = scan.topCoins.length
  log('scan_complete', `Scan done: ${scan.totalScanned} checked, ${qualCount} qualified`, scan.bestOpportunity ? `Best: ${scan.bestOpportunity.symbol} (+${scan.bestOpportunity.momentumScore.toFixed(2)}%)` : 'No opportunities')

  // Log top qualified coins
  scan.topCoins.slice(0, 3).forEach((c) => {
    log('coin_qualified', `${c.symbol} qualified`, `+${c.momentumScore.toFixed(2)}% momentum · $${c.currentPrice.toFixed(4)}`)
  })

  // --- Clean up expired cooldowns ---
  const now = Date.now()
  for (const coinId of Object.keys(state.coinCooldowns)) {
    if (state.coinCooldowns[coinId] <= now) {
      delete state.coinCooldowns[coinId]
    }
  }

  // --- CHECK HELD COIN ---
  if (state.currentCoin) {
    // Find current price from scan (check all scanned, not just qualified)
    const heldCoin = scan.topCoins.find((c) => c.id === state.currentCoin)
    const heldFromAll = !heldCoin ? scan.allScanned.find((c) => c.id === state.currentCoin) : null
    const currentPrice = heldCoin ? heldCoin.currentPrice : heldFromAll ? heldFromAll.currentPrice : null

    if (currentPrice !== null && state.buyPrice) {
      // Update peak price for trailing stop
      if (state.peakPrice === null || currentPrice > state.peakPrice) {
        state.peakPrice = currentPrice
      }

      const changeFromBuy = ((currentPrice - state.buyPrice) / state.buyPrice) * 100

      // Take-profit check — ring the cash register
      if (changeFromBuy >= state.settings.takeProfitPercent) {
        log('sell', `Take profit! ${state.currentCoinSymbol} up ${changeFromBuy.toFixed(2)}%`, `Bought $${state.buyPrice.toFixed(4)} → Now $${currentPrice.toFixed(4)}`)
        state = await sellCoin(state, currentPrice, `Take profit — up ${changeFromBuy.toFixed(2)}%`)
        state = checkProfitLadder(state)
        state = checkZeroOut(state)
        if (state.status === 'paused') return state
      }

      // Trailing stop check — protect gains from reversing
      if (state.currentCoin && state.peakPrice && state.peakPrice > state.buyPrice) {
        const dropFromPeak = ((state.peakPrice - currentPrice) / state.peakPrice) * 100
        if (dropFromPeak >= state.settings.trailingStopPercent) {
          log('sell', `Trailing stop! ${state.currentCoinSymbol} dropped ${dropFromPeak.toFixed(2)}% from peak`, `Peak $${state.peakPrice.toFixed(4)} → Now $${currentPrice.toFixed(4)}`)
          state = await sellCoin(state, currentPrice, `Trailing stop — dropped ${dropFromPeak.toFixed(2)}% from peak $${state.peakPrice.toFixed(4)}`)
          state = checkProfitLadder(state)
          state = checkZeroOut(state)
          if (state.status === 'paused') return state
        }
      }

      // Regular bail checks (stagnant, reversal, hard drop)
      if (state.currentCoin && heldCoin) {
        const bailCheck = shouldBail(heldCoin, state.buyPrice || 0, state.settings, state.buyTimestamp || 0)
        if (bailCheck.bail) {
          log('bail', `Bailing on ${heldCoin.symbol}`, bailCheck.reason)
          state = await sellCoin(state, heldCoin.currentPrice, bailCheck.reason)
          state = checkProfitLadder(state)
          state = checkZeroOut(state)
          if (state.status === 'paused') return state
        } else {
          log('hold', `Holding ${heldCoin.symbol} at $${heldCoin.currentPrice.toFixed(4)}`, bailCheck.reason)
        }
      } else if (state.currentCoin && !heldCoin) {
        // Coin no longer in qualified list — still run bail checks with current price
        const bailCheck = shouldBail(
          { ...scan.allScanned[0], priceHistory: [] } as any,
          state.buyPrice || 0, state.settings, state.buyTimestamp || 0
        )
        if (bailCheck.bail || (state.buyTimestamp && now - state.buyTimestamp > state.settings.minHoldBeforeBailMs)) {
          log('bail', `${state.currentCoinSymbol} no longer qualifies — bailing`)
          state = await sellCoin(state, currentPrice, 'Coin no longer qualifies — bailing')
          state = checkProfitLadder(state)
          state = checkZeroOut(state)
          if (state.status === 'paused') return state
        }
      }
    } else if (!currentPrice && state.buyPrice) {
      // Can't find price at all — bail at slight loss
      log('bail', `${state.currentCoinSymbol} disappeared from scan — bailing`)
      state = await sellCoin(state, state.buyPrice * 0.998, 'Coin disappeared from scan — bailing')
      state = checkProfitLadder(state)
      state = checkZeroOut(state)
      if (state.status === 'paused') return state
    }
  }

  // --- BUY if not holding (respect cooldowns) ---
  if (!state.currentCoin && scan.bestOpportunity) {
    // Check if best opportunity is on cooldown
    const cooldownExpiry = state.coinCooldowns[scan.bestOpportunity.id]
    if (cooldownExpiry && cooldownExpiry > now) {
      const secsLeft = Math.ceil((cooldownExpiry - now) / 1000)
      log('idle', `Best coin ${scan.bestOpportunity.symbol} is on cooldown (${secsLeft}s left)`, 'Looking for alternatives...')

      // Try to find next best coin not on cooldown
      const alternative = scan.topCoins.find((c) => {
        const cd = state.coinCooldowns[c.id]
        return !cd || cd <= now
      })
      if (alternative) {
        state = await buyCoin(state, alternative, `Best available (${scan.bestOpportunity.symbol} on cooldown)`)
      }
    } else {
      state = await buyCoin(state, scan.bestOpportunity, 'Best momentum opportunity')
    }
  } else if (!state.currentCoin && !scan.bestOpportunity) {
    log('idle', 'No opportunities found — waiting...')
  }

  // --- JUMP to better coin ---
  if (state.currentCoin && scan.bestOpportunity) {
    const jumpCheck = shouldJump(state, scan.bestOpportunity)
    if (jumpCheck.jump && scan.bestOpportunity.id !== state.currentCoin) {
      log('jump', `Jumping from ${state.currentCoinSymbol} to ${scan.bestOpportunity.symbol}`, jumpCheck.reason)
      const heldCoin = scan.topCoins.find((c) => c.id === state.currentCoin)
      if (heldCoin) {
        state = await sellCoin(state, heldCoin.currentPrice, 'Jumping to better opportunity')
        state = checkProfitLadder(state)
        state = checkZeroOut(state)
        if (state.status === 'paused') return state
      }
      state = await buyCoin(state, scan.bestOpportunity, jumpCheck.reason)
    } else if (!jumpCheck.jump && scan.bestOpportunity.id !== state.currentCoin) {
      log('jump_skip', `Considered ${scan.bestOpportunity.symbol} but skipped`, jumpCheck.reason)
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
  const watchLabel = state.settings.watchMode === 'watchlist' ? `Watchlist (${state.settings.watchlist.length})` : 'Full market'

  log('bot_start', `${modeLabel} Bot started — ${watchLabel}`, `Step ${state.currentStepIndex + 1}: earn $${step.profitTarget} → lock $${step.lockAmount}`)
  notify(state, 'info', `${modeLabel} Hot Potato is running! Step ${state.currentStepIndex + 1}: earn $${step.profitTarget} → lock $${step.lockAmount}`)
  return state
}

// ============================================
// PAUSE the bot (manual)
// ============================================
export function pauseBot(state: BotState): BotState {
  state.status = 'paused'
  log('bot_pause', 'Bot paused manually')
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
    log('bot_start', `Restarted with $${restartAmount} from locked profits`, `Safe: $${(state.seedAmount + state.lockedProfits).toFixed(2)}`)
    notify(state, 'info', `Restarted with $${restartAmount} from locked profits. Remaining safe: $${(state.seedAmount + state.lockedProfits).toFixed(2)}`)
  } else {
    log('error', `Not enough locked profits to restart`, `Need $${restartAmount}, have $${state.lockedProfits.toFixed(2)}`)
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
