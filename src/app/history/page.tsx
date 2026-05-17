'use client'

import { useState, useEffect, useMemo } from 'react'
import { TradeRound, BotState, DEFAULT_BOT_STATE } from '@/lib/types'

// ============================================
// Analytics calculations
// ============================================
interface Analytics {
  totalRounds: number
  wins: number
  losses: number
  winRate: number
  totalProfit: number
  totalFees: number
  avgProfit: number
  avgHoldMs: number
  bestTrade: TradeRound | null
  worstTrade: TradeRound | null
  bestCoin: { symbol: string; profit: number; count: number } | null
  worstCoin: { symbol: string; profit: number; count: number } | null
  bailCount: number
  jumpCount: number
  avgWinProfit: number
  avgLossProfit: number
  longestHold: number
  shortestHold: number
  profitByHour: Record<number, { profit: number; count: number }>
}

function computeAnalytics(rounds: TradeRound[]): Analytics {
  if (rounds.length === 0) {
    return {
      totalRounds: 0, wins: 0, losses: 0, winRate: 0,
      totalProfit: 0, totalFees: 0, avgProfit: 0, avgHoldMs: 0,
      bestTrade: null, worstTrade: null,
      bestCoin: null, worstCoin: null,
      bailCount: 0, jumpCount: 0,
      avgWinProfit: 0, avgLossProfit: 0,
      longestHold: 0, shortestHold: 0,
      profitByHour: {},
    }
  }

  const wins = rounds.filter(r => r.won)
  const losses = rounds.filter(r => !r.won)
  const totalProfit = rounds.reduce((s, r) => s + r.profit, 0)
  const totalFees = rounds.reduce((s, r) => s + r.totalFees, 0)
  const avgHoldMs = rounds.reduce((s, r) => s + r.holdDurationMs, 0) / rounds.length

  // Best/worst individual trades
  const sorted = [...rounds].sort((a, b) => b.profit - a.profit)
  const bestTrade = sorted[0]
  const worstTrade = sorted[sorted.length - 1]

  // Coin performance
  const coinMap: Record<string, { symbol: string; profit: number; count: number }> = {}
  rounds.forEach(r => {
    if (!coinMap[r.coinId]) coinMap[r.coinId] = { symbol: r.coinSymbol, profit: 0, count: 0 }
    coinMap[r.coinId].profit += r.profit
    coinMap[r.coinId].count++
  })
  const coins = Object.values(coinMap).sort((a, b) => b.profit - a.profit)
  const bestCoin = coins[0] || null
  const worstCoin = coins[coins.length - 1] || null

  // Bail vs jump reasons
  const bailCount = rounds.filter(r => r.sellReason.toLowerCase().includes('bail')).length
  const jumpCount = rounds.filter(r => r.sellReason.toLowerCase().includes('jump')).length

  // Win/loss averages
  const avgWinProfit = wins.length > 0 ? wins.reduce((s, r) => s + r.profit, 0) / wins.length : 0
  const avgLossProfit = losses.length > 0 ? losses.reduce((s, r) => s + r.profit, 0) / losses.length : 0

  // Hold duration extremes
  const holdDurations = rounds.map(r => r.holdDurationMs)
  const longestHold = Math.max(...holdDurations)
  const shortestHold = Math.min(...holdDurations)

  // Profit by hour of day
  const profitByHour: Record<number, { profit: number; count: number }> = {}
  rounds.forEach(r => {
    const hour = new Date(r.buyTimestamp).getHours()
    if (!profitByHour[hour]) profitByHour[hour] = { profit: 0, count: 0 }
    profitByHour[hour].profit += r.profit
    profitByHour[hour].count++
  })

  return {
    totalRounds: rounds.length,
    wins: wins.length,
    losses: losses.length,
    winRate: (wins.length / rounds.length) * 100,
    totalProfit,
    totalFees,
    avgProfit: totalProfit / rounds.length,
    avgHoldMs,
    bestTrade,
    worstTrade,
    bestCoin,
    worstCoin,
    bailCount,
    jumpCount,
    avgWinProfit,
    avgLossProfit,
    longestHold,
    shortestHold,
    profitByHour,
  }
}

// ============================================
// Helpers
// ============================================
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

function formatMoney(n: number): string {
  const prefix = n >= 0 ? '+' : ''
  return `${prefix}$${n.toFixed(4)}`
}

// ============================================
// Stat Card
// ============================================
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-mono font-bold ${color || 'text-white'}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-600 mt-1">{sub}</p>}
    </div>
  )
}

// ============================================
// Trade Row
// ============================================
function TradeRow({ round }: { round: TradeRound }) {
  const date = new Date(round.buyTimestamp).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  return (
    <div className={`flex items-center gap-3 px-4 py-3 border-l-2 ${
      round.won ? 'border-green-500/40 bg-green-500/[0.02]' : 'border-red-500/40 bg-red-500/[0.02]'
    }`}>
      <span className="text-lg">{round.won ? '🟢' : '🔴'}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-white">{round.coinSymbol}</span>
          <span className={`text-sm font-mono ${round.won ? 'text-green-400' : 'text-red-400'}`}>
            {formatMoney(round.profit)} ({round.profitPercent.toFixed(2)}%)
          </span>
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
          Buy: ${round.buyPrice.toFixed(4)} → Sell: ${round.sellPrice.toFixed(4)} · Held {formatDuration(round.holdDurationMs)} · Fees: ${round.totalFees.toFixed(4)}
        </p>
        <p className="text-[10px] text-gray-600 mt-0.5 truncate">
          {round.sellReason}
        </p>
      </div>
      <span className="text-[10px] text-gray-600 font-mono shrink-0">{date}</span>
    </div>
  )
}

// ============================================
// Hour chart (simple bar visualization)
// ============================================
function HourChart({ profitByHour }: { profitByHour: Record<number, { profit: number; count: number }> }) {
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const maxAbs = Math.max(
    ...hours.map(h => Math.abs(profitByHour[h]?.profit || 0)),
    0.001
  )

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-3">Profit by Hour of Day</p>
      <div className="flex items-end gap-[2px] h-20">
        {hours.map(h => {
          const data = profitByHour[h]
          if (!data) {
            return <div key={h} className="flex-1 bg-gray-800/50 rounded-t" style={{ height: '2px' }} />
          }
          const height = Math.max((Math.abs(data.profit) / maxAbs) * 100, 5)
          const isPositive = data.profit >= 0
          return (
            <div
              key={h}
              className={`flex-1 rounded-t ${isPositive ? 'bg-green-500/60' : 'bg-red-500/60'}`}
              style={{ height: `${height}%` }}
              title={`${h}:00 — ${formatMoney(data.profit)} (${data.count} trades)`}
            />
          )
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[9px] text-gray-700">0:00</span>
        <span className="text-[9px] text-gray-700">12:00</span>
        <span className="text-[9px] text-gray-700">23:00</span>
      </div>
    </div>
  )
}

// ============================================
// XLSX Export
// ============================================
async function downloadXlsx(rounds: TradeRound[], analytics: Analytics) {
  const XLSX = await import('xlsx')

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
}

// ============================================
// History Page
// ============================================
export default function HistoryPage() {
  const [state, setState] = useState<BotState>(DEFAULT_BOT_STATE)
  const [rounds, setRounds] = useState<TradeRound[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/bot')
        if (res.ok) {
          const data = await res.json()
          setState(data.state)
          setRounds(data.tradeRounds || [])
        }
      } catch { /* ignore */ }
      setLoading(false)
    }
    fetchData()
  }, [])

  const analytics = useMemo(() => computeAnalytics(rounds), [rounds])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading trade history...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <a href="/" className="text-orange-500 font-bold text-lg hover:text-orange-400 transition">
            Hot Potato
          </a>
          <span className="text-gray-600">·</span>
          <span className="text-gray-400 text-sm">Trade History</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => downloadXlsx(rounds, analytics)}
            disabled={rounds.length === 0}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-medium transition"
          >
            📥 Export .xlsx
          </button>
          <a
            href="/activity"
            className="px-3 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-xs hover:text-white hover:border-gray-600 transition"
          >
            Activity
          </a>
          <a
            href="/"
            className="px-3 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-xs hover:text-white hover:border-gray-600 transition"
          >
            Dashboard
          </a>
        </div>
      </div>

      {rounds.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
          <p className="text-4xl mb-4">📊</p>
          <p className="text-sm">No completed trades yet</p>
          <p className="text-xs text-gray-700 mt-1">Once the bot buys and sells a coin, the round-trip will appear here</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Top stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatCard label="Win Rate" value={`${analytics.winRate.toFixed(1)}%`} sub={`${analytics.wins}W / ${analytics.losses}L`} color={analytics.winRate >= 50 ? 'text-green-400' : 'text-red-400'} />
            <StatCard label="Total Profit" value={`$${analytics.totalProfit.toFixed(4)}`} color={analytics.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'} />
            <StatCard label="Total Fees Paid" value={`$${analytics.totalFees.toFixed(4)}`} color="text-orange-400" />
            <StatCard label="Avg Profit/Trade" value={`$${analytics.avgProfit.toFixed(4)}`} color={analytics.avgProfit >= 0 ? 'text-green-400' : 'text-red-400'} />
            <StatCard label="Avg Hold Time" value={formatDuration(analytics.avgHoldMs)} />
            <StatCard label="Total Rounds" value={`${analytics.totalRounds}`} />
          </div>

          {/* Second row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Avg Win" value={formatMoney(analytics.avgWinProfit)} color="text-green-400" />
            <StatCard label="Avg Loss" value={formatMoney(analytics.avgLossProfit)} color="text-red-400" />
            <StatCard label="Bails" value={`${analytics.bailCount}`} sub="Price dropped, got out" color="text-orange-400" />
            <StatCard label="Jumps" value={`${analytics.jumpCount}`} sub="Switched to better coin" color="text-yellow-400" />
          </div>

          {/* Best/Worst coins */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {analytics.bestCoin && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Best Coin</p>
                <p className="text-lg font-mono font-bold text-green-400">{analytics.bestCoin.symbol}</p>
                <p className="text-xs text-gray-500 mt-1">{formatMoney(analytics.bestCoin.profit)} over {analytics.bestCoin.count} trade(s)</p>
              </div>
            )}
            {analytics.worstCoin && analytics.worstCoin.symbol !== analytics.bestCoin?.symbol && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">Worst Coin</p>
                <p className="text-lg font-mono font-bold text-red-400">{analytics.worstCoin.symbol}</p>
                <p className="text-xs text-gray-500 mt-1">{formatMoney(analytics.worstCoin.profit)} over {analytics.worstCoin.count} trade(s)</p>
              </div>
            )}
          </div>

          {/* Hour chart */}
          {Object.keys(analytics.profitByHour).length > 0 && (
            <HourChart profitByHour={analytics.profitByHour} />
          )}

          {/* Trade list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm text-gray-400 font-medium">All Trades</h2>
              <span className="text-[10px] text-gray-600">{rounds.length} rounds</span>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800/50">
              {rounds.map(round => (
                <TradeRow key={round.id} round={round} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
