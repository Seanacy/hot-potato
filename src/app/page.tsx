'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { BotState, DEFAULT_BOT_STATE, BotNotification, Trade } from '@/lib/types'
import { SCAN_INTERVAL_MS, SEED_AMOUNT, PROFIT_THRESHOLD } from '@/lib/constants'

// ============================================
// Status Badge
// ============================================
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-potato-green/20 text-potato-green border-potato-green/30',
    paused: 'bg-potato-amber/20 text-potato-amber border-potato-amber/30',
    stopped: 'bg-potato-muted/20 text-potato-muted border-potato-muted/30',
  }
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${colors[status] || colors.stopped}`}>
      {status.toUpperCase()}
    </span>
  )
}

// ============================================
// Money Card
// ============================================
function MoneyCard({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <div className="bg-potato-surface rounded-xl p-4 border border-potato-border">
      <p className="text-potato-muted text-xs mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>${amount.toFixed(2)}</p>
    </div>
  )
}

// ============================================
// Current Position
// ============================================
function CurrentPosition({ state }: { state: BotState }) {
  if (!state.currentCoin) {
    return (
      <div className="bg-potato-surface rounded-xl p-5 border border-potato-border text-center">
        <p className="text-potato-muted text-sm">Not holding any coin</p>
        <p className="text-potato-muted/50 text-xs mt-1">
          {state.status === 'running' ? 'Scanning for opportunities...' : 'Bot is not running'}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-potato-surface rounded-xl p-5 border border-potato-border">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-potato-muted text-xs">Currently holding</p>
          <p className="text-2xl font-bold text-potato-text">{state.currentCoinSymbol}</p>
        </div>
        <div className="text-right">
          <p className="text-potato-muted text-xs">Buy price</p>
          <p className="text-lg text-potato-text">${state.buyPrice?.toFixed(4)}</p>
        </div>
      </div>
    </div>
  )
}

// ============================================
// Trade History
// ============================================
function TradeHistory({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <div className="text-center text-potato-muted/50 text-sm py-8">
        No trades yet
      </div>
    )
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {trades.slice(0, 50).map((trade) => (
        <div
          key={trade.id}
          className="flex items-center justify-between bg-potato-surface rounded-lg p-3 border border-potato-border text-sm"
        >
          <div className="flex items-center gap-3">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              trade.type === 'buy' ? 'bg-potato-green/20 text-potato-green' : 'bg-potato-red/20 text-potato-red'
            }`}>
              {trade.type.toUpperCase()}
            </span>
            <span className="text-potato-text font-medium">{trade.coinSymbol}</span>
          </div>
          <div className="text-right">
            <p className="text-potato-text">${trade.price.toFixed(4)}</p>
            <p className="text-potato-muted text-xs">{trade.reason}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Notifications
// ============================================
function Notifications({ notifications }: { notifications: BotNotification[] }) {
  if (notifications.length === 0) {
    return (
      <div className="text-center text-potato-muted/50 text-sm py-8">
        No notifications yet
      </div>
    )
  }

  const icons: Record<string, string> = {
    profit_locked: '🔒',
    zeroed_out: '⚠️',
    trade: '🔄',
    info: 'ℹ️',
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {notifications.slice(0, 30).map((notif) => (
        <div
          key={notif.id}
          className={`p-3 rounded-lg border text-sm ${
            notif.type === 'profit_locked'
              ? 'bg-potato-green/5 border-potato-green/20'
              : notif.type === 'zeroed_out'
              ? 'bg-potato-red/5 border-potato-red/20'
              : 'bg-potato-surface border-potato-border'
          }`}
        >
          <div className="flex gap-2">
            <span>{icons[notif.type] || '📌'}</span>
            <div>
              <p className="text-potato-text">{notif.message}</p>
              <p className="text-potato-muted text-xs mt-1">
                {new Date(notif.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ============================================
// Profit Ladder Visual
// ============================================
function ProfitLadder({ state }: { state: BotState }) {
  const totalSafe = state.seedAmount + state.lockedProfits
  const segments = Math.floor(state.lockedProfits / PROFIT_THRESHOLD)

  return (
    <div className="bg-potato-surface rounded-xl p-5 border border-potato-border">
      <p className="text-potato-muted text-xs mb-3">Profit ladder</p>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Seed */}
        <div className="px-3 py-1.5 rounded-lg bg-potato-accent/20 border border-potato-accent/30 text-potato-accent text-xs font-medium">
          Seed ${state.seedAmount}
        </div>
        {/* Locked profit segments */}
        {Array.from({ length: segments }).map((_, i) => (
          <div key={i} className="px-3 py-1.5 rounded-lg bg-potato-green/20 border border-potato-green/30 text-potato-green text-xs font-medium">
            +${PROFIT_THRESHOLD}
          </div>
        ))}
        {/* Current trading */}
        <div className="px-3 py-1.5 rounded-lg bg-potato-surface-2 border border-potato-border text-potato-text text-xs">
          Trading: ${state.tradingBalance.toFixed(2)}
        </div>
      </div>
      <p className="text-potato-muted text-xs mt-3">
        Safe pile: ${totalSafe.toFixed(2)} &middot; Mode: {state.mode === 'growth' ? 'Growth (trading everything)' : 'Profit-only (seed protected)'}
      </p>
    </div>
  )
}

// ============================================
// Main Dashboard
// ============================================
export default function Dashboard() {
  const [state, setState] = useState<BotState>(DEFAULT_BOT_STATE)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'trades' | 'notifications'>('trades')
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load initial state
  useEffect(() => {
    fetch('/api/bot')
      .then((r) => r.json())
      .then((d) => setState(d.state))
      .finally(() => setLoading(false))
  }, [])

  // Auto-tick when running
  useEffect(() => {
    if (state.status === 'running') {
      tickRef.current = setInterval(async () => {
        const res = await fetch('/api/bot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'tick' }),
        })
        if (res.ok) {
          const data = await res.json()
          setState(data.state)
        }
      }, SCAN_INTERVAL_MS)
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [state.status])

  const sendAction = useCallback(async (action: string) => {
    const res = await fetch('/api/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok) {
      const data = await res.json()
      setState(data.state)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-potato-muted animate-pulse">Loading Hot Potato...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-potato-bg p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-potato-accent">Hot Potato</h1>
          <p className="text-potato-muted text-xs">Scalp trading bot &middot; Paper mode</p>
        </div>
        <StatusBadge status={state.status} />
      </div>

      {/* Money Cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <MoneyCard label="Trading balance" amount={state.tradingBalance} color="text-potato-text" />
        <MoneyCard label="Locked profits" amount={state.lockedProfits} color="text-potato-green" />
        <MoneyCard
          label="Total P/L"
          amount={state.totalProfit}
          color={state.totalProfit >= 0 ? 'text-potato-green' : 'text-potato-red'}
        />
      </div>

      {/* Current Position */}
      <div className="mb-4">
        <CurrentPosition state={state} />
      </div>

      {/* Profit Ladder */}
      <div className="mb-4">
        <ProfitLadder state={state} />
      </div>

      {/* Controls */}
      <div className="flex gap-3 mb-6">
        {state.status === 'stopped' && (
          <button
            onClick={() => sendAction('start')}
            className="flex-1 py-3 rounded-xl bg-potato-green text-white font-medium text-sm hover:bg-potato-green-dim transition"
          >
            Start Bot
          </button>
        )}
        {state.status === 'running' && (
          <button
            onClick={() => sendAction('pause')}
            className="flex-1 py-3 rounded-xl bg-potato-amber text-white font-medium text-sm hover:opacity-80 transition"
          >
            Pause Bot
          </button>
        )}
        {state.status === 'paused' && (
          <>
            <button
              onClick={() => sendAction('restart')}
              className="flex-1 py-3 rounded-xl bg-potato-green text-white font-medium text-sm hover:bg-potato-green-dim transition"
            >
              Restart
            </button>
            <button
              onClick={() => sendAction('start')}
              className="flex-1 py-3 rounded-xl bg-potato-accent text-white font-medium text-sm hover:bg-potato-accent-dim transition"
            >
              Resume
            </button>
          </>
        )}
        <button
          onClick={() => sendAction('reset')}
          className="px-4 py-3 rounded-xl bg-potato-surface border border-potato-border text-potato-muted text-sm hover:border-potato-red/50 hover:text-potato-red transition"
        >
          Reset
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-xs text-potato-muted mb-4">
        <span>Trades: {state.totalTrades}</span>
        <span>Profit to next lock: ${Math.max(0, state.profitSinceLastLock).toFixed(2)} / ${PROFIT_THRESHOLD}</span>
        {state.lastScanTime > 0 && (
          <span>Last scan: {new Date(state.lastScanTime).toLocaleTimeString()}</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-potato-surface rounded-xl p-1 mb-4">
        <button
          onClick={() => setActiveTab('trades')}
          className={`flex-1 py-2 rounded-lg text-sm transition ${
            activeTab === 'trades'
              ? 'bg-potato-surface-2 text-potato-text'
              : 'text-potato-muted hover:text-potato-text'
          }`}
        >
          Trades ({state.trades.length})
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`flex-1 py-2 rounded-lg text-sm transition ${
            activeTab === 'notifications'
              ? 'bg-potato-surface-2 text-potato-text'
              : 'text-potato-muted hover:text-potato-text'
          }`}
        >
          Notifications ({state.notifications.filter((n) => !n.read).length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'trades' ? (
        <TradeHistory trades={state.trades} />
      ) : (
        <Notifications notifications={state.notifications} />
      )}
    </div>
  )
}
