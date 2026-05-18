// Trade history export — shared between history page and auto-export on reset

import { TradeRound } from './types'

interface Analytics {
  totalRounds: number
  wins: number
  losses: number
  winRate: number
  totalProfit: number
  totalFees: number
  avgProfit: number
  avgHoldMs: number
  bestCoin: { symbol: string; profit: number; count: number } | null
  worstCoin: { symbol: string; profit: number; count: number } | null
  bailCount: number
  jumpCount: number
  avgWinProfit: number
  avgLossProfit: number
  longestHold: number
  shortestHold: number
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const remainSec = sec % 60
  if (min < 60) return `${min}m ${remainSec}s`
  const hr = Math.floor(min / 60)
  const remainMin = min % 60
  return `${hr}h ${remainMin}m`
}

export function computeAnalytics(rounds: TradeRound[]): Analytics {
  if (rounds.length === 0) {
    return {
      totalRounds: 0, wins: 0, losses: 0, winRate: 0,
      totalProfit: 0, totalFees: 0, avgProfit: 0, avgHoldMs: 0,
      bestCoin: null, worstCoin: null,
      bailCount: 0, jumpCount: 0,
      avgWinProfit: 0, avgLossProfit: 0,
      longestHold: 0, shortestHold: 0,
    }
  }

  const wins = rounds.filter(r => r.won)
  const losses = rounds.filter(r => !r.won)
  const totalProfit = rounds.reduce((s, r) => s + r.profit, 0)
  const totalFees = rounds.reduce((s, r) => s + r.totalFees, 0)
  const avgHoldMs = rounds.reduce((s, r) => s + r.holdDurationMs, 0) / rounds.length

  const coinMap: Record<string, { symbol: string; profit: number; count: number }> = {}
  rounds.forEach(r => {
    if (!coinMap[r.coinId]) coinMap[r.coinId] = { symbol: r.coinSymbol, profit: 0, count: 0 }
    coinMap[r.coinId].profit += r.profit
    coinMap[r.coinId].count++
  })
  const coins = Object.values(coinMap).sort((a, b) => b.profit - a.profit)
  const bestCoin = coins[0] || null
  const worstCoin = coins[coins.length - 1] || null

  const bailCount = rounds.filter(r => r.sellReason.toLowerCase().includes('bail')).length
  const jumpCount = rounds.filter(r => r.sellReason.toLowerCase().includes('jump')).length

  const avgWinProfit = wins.length > 0 ? wins.reduce((s, r) => s + r.profit, 0) / wins.length : 0
  const avgLossProfit = losses.length > 0 ? losses.reduce((s, r) => s + r.profit, 0) / losses.length : 0

  const holdDurations = rounds.map(r => r.holdDurationMs)
  const longestHold = Math.max(...holdDurations)
  const shortestHold = Math.min(...holdDurations)

  return {
    totalRounds: rounds.length,
    wins: wins.length,
    losses: losses.length,
    winRate: (wins.length / rounds.length) * 100,
    totalProfit,
    totalFees,
    avgProfit: totalProfit / rounds.length,
    avgHoldMs,
    bestCoin,
    worstCoin,
    bailCount,
    jumpCount,
    avgWinProfit,
    avgLossProfit,
    longestHold,
    shortestHold,
  }
}

export async function exportTradeHistory(rounds: TradeRound[]): Promise<boolean> {
  if (rounds.length === 0) return false

  const XLSX = await import('xlsx')
  const analytics = computeAnalytics(rounds)

  // Trades sheet
  const tradeRows = rounds.map(r => ({
    'Date': new Date(r.buyTimestamp).toISOString(),
    'Coin': r.coinSymbol,
    'Buy Price': r.buyPrice,
    'Sell Price': r.sellPrice,
    'Amount ($)': r.buyAmount,
    'Sale Value ($)': r.sellAmount,
    'Buy Fee ($)': r.buyFee,
    'Sell Fee ($)': r.sellFee,
    'Total Fees ($)': r.totalFees,
    'Profit ($)': r.profit,
    'Profit (%)': r.profitPercent,
    'Hold Time': formatDuration(r.holdDurationMs),
    'Hold (ms)': r.holdDurationMs,
    'Won': r.won ? 'Yes' : 'No',
    'Buy Reason': r.buyReason,
    'Sell Reason': r.sellReason,
  }))

  // Summary sheet
  const summaryRows = [
    { 'Metric': 'Total Trades', 'Value': analytics.totalRounds },
    { 'Metric': 'Wins', 'Value': analytics.wins },
    { 'Metric': 'Losses', 'Value': analytics.losses },
    { 'Metric': 'Win Rate (%)', 'Value': analytics.winRate.toFixed(1) },
    { 'Metric': 'Total Profit ($)', 'Value': analytics.totalProfit.toFixed(4) },
    { 'Metric': 'Total Fees ($)', 'Value': analytics.totalFees.toFixed(4) },
    { 'Metric': 'Avg Profit/Trade ($)', 'Value': analytics.avgProfit.toFixed(4) },
    { 'Metric': 'Avg Win ($)', 'Value': analytics.avgWinProfit.toFixed(4) },
    { 'Metric': 'Avg Loss ($)', 'Value': analytics.avgLossProfit.toFixed(4) },
    { 'Metric': 'Avg Hold Time', 'Value': formatDuration(analytics.avgHoldMs) },
    { 'Metric': 'Longest Hold', 'Value': formatDuration(analytics.longestHold) },
    { 'Metric': 'Shortest Hold', 'Value': formatDuration(analytics.shortestHold) },
    { 'Metric': 'Bail Count', 'Value': analytics.bailCount },
    { 'Metric': 'Jump Count', 'Value': analytics.jumpCount },
    { 'Metric': 'Best Coin', 'Value': analytics.bestCoin ? `${analytics.bestCoin.symbol} ($${analytics.bestCoin.profit.toFixed(4)})` : 'N/A' },
    { 'Metric': 'Worst Coin', 'Value': analytics.worstCoin ? `${analytics.worstCoin.symbol} ($${analytics.worstCoin.profit.toFixed(4)})` : 'N/A' },
  ]

  const wb = XLSX.utils.book_new()
  const ws1 = XLSX.utils.json_to_sheet(tradeRows)
  const ws2 = XLSX.utils.json_to_sheet(summaryRows)
  XLSX.utils.book_append_sheet(wb, ws1, 'Trades')
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary')

  XLSX.writeFile(wb, `hot-potato-trades-${new Date().toISOString().slice(0, 10)}.xlsx`)
  return true
}
