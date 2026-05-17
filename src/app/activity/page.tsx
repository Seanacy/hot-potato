'use client'

import { useState, useEffect, useRef } from 'react'
import { ActivityEntry, ActivityType, BotState, DEFAULT_BOT_STATE } from '@/lib/types'

// ============================================
// Activity type config — icons, colors, labels
// ============================================
const ACTIVITY_CONFIG: Record<ActivityType, { icon: string; color: string; glow: string }> = {
  scan_start:    { icon: '🔍', color: 'text-blue-400',    glow: 'border-blue-500/30' },
  scan_complete: { icon: '📡', color: 'text-blue-300',    glow: 'border-blue-500/20' },
  coin_qualified:{ icon: '✅', color: 'text-green-400',   glow: 'border-green-500/30' },
  coin_rejected: { icon: '❌', color: 'text-gray-500',    glow: 'border-gray-500/20' },
  evaluating:    { icon: '🔬', color: 'text-purple-400',  glow: 'border-purple-500/30' },
  buy:           { icon: '🟢', color: 'text-green-400',   glow: 'border-green-500/40' },
  sell:          { icon: '🔴', color: 'text-red-400',     glow: 'border-red-500/40' },
  bail:          { icon: '🏃', color: 'text-orange-400',  glow: 'border-orange-500/30' },
  jump:          { icon: '⚡', color: 'text-yellow-400',  glow: 'border-yellow-500/40' },
  jump_skip:     { icon: '⏭️', color: 'text-gray-400',    glow: 'border-gray-500/20' },
  profit_lock:   { icon: '🔒', color: 'text-emerald-400', glow: 'border-emerald-500/40' },
  step_up:       { icon: '📈', color: 'text-emerald-300', glow: 'border-emerald-500/30' },
  zero_out:      { icon: '💀', color: 'text-red-500',     glow: 'border-red-500/50' },
  hold:          { icon: '💎', color: 'text-cyan-400',    glow: 'border-cyan-500/20' },
  idle:          { icon: '😴', color: 'text-gray-500',    glow: 'border-gray-500/15' },
  bot_start:     { icon: '🚀', color: 'text-green-300',   glow: 'border-green-500/40' },
  bot_pause:     { icon: '⏸️', color: 'text-amber-400',   glow: 'border-amber-500/30' },
  error:         { icon: '⚠️', color: 'text-red-400',     glow: 'border-red-500/40' },
}

// ============================================
// Single activity row
// ============================================
function ActivityRow({ entry, isNew }: { entry: ActivityEntry; isNew: boolean }) {
  const config = ACTIVITY_CONFIG[entry.type] || ACTIVITY_CONFIG.idle
  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const isHighlight = ['buy', 'sell', 'jump', 'profit_lock', 'step_up', 'bot_start', 'zero_out'].includes(entry.type)

  return (
    <div
      className={`flex items-start gap-3 px-4 py-2.5 border-l-2 transition-all duration-700 ${config.glow} ${
        isNew ? 'animate-slide-in bg-white/[0.03]' : ''
      } ${isHighlight ? 'bg-white/[0.02]' : ''}`}
    >
      <span className="text-base mt-0.5 shrink-0 w-6 text-center">{config.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-medium ${config.color}`}>{entry.message}</span>
        </div>
        {entry.detail && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{entry.detail}</p>
        )}
      </div>
      <span className="text-[10px] text-gray-600 font-mono shrink-0 mt-1">{time}</span>
    </div>
  )
}

// ============================================
// Pulse indicator
// ============================================
function PulseIndicator({ running }: { running: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2.5 h-2.5 rounded-full ${
        running ? 'bg-green-500 animate-pulse shadow-lg shadow-green-500/50' : 'bg-gray-600'
      }`} />
      <span className={`text-xs font-medium ${running ? 'text-green-400' : 'text-gray-500'}`}>
        {running ? 'LIVE' : 'IDLE'}
      </span>
    </div>
  )
}

// ============================================
// Stats bar
// ============================================
function StatsBar({ state }: { state: BotState }) {
  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-900/80 border-b border-gray-800 text-xs overflow-x-auto">
      <span className="text-gray-500">Balance:</span>
      <span className="text-white font-mono">${state.tradingBalance.toFixed(2)}</span>
      <span className="text-gray-700">|</span>
      <span className="text-gray-500">Locked:</span>
      <span className="text-green-400 font-mono">${state.lockedProfits.toFixed(2)}</span>
      <span className="text-gray-700">|</span>
      <span className="text-gray-500">P/L:</span>
      <span className={`font-mono ${state.totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
        {state.totalProfit >= 0 ? '+' : ''}{state.totalProfit.toFixed(2)}
      </span>
      <span className="text-gray-700">|</span>
      <span className="text-gray-500">Holding:</span>
      <span className="text-cyan-400 font-mono">{state.currentCoinSymbol || '—'}</span>
      <span className="text-gray-700">|</span>
      <span className="text-gray-500">Trades:</span>
      <span className="text-white font-mono">{state.totalTrades}</span>
    </div>
  )
}

// ============================================
// Activity Feed Page
// ============================================
export default function ActivityPage() {
  const [state, setState] = useState<BotState>(DEFAULT_BOT_STATE)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [prevIds, setPrevIds] = useState<Set<string>>(new Set())
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState<'all' | 'actions' | 'scans'>('all')
  const feedRef = useRef<HTMLDivElement>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch state + activity
  const fetchData = async () => {
    try {
      const res = await fetch('/api/bot')
      if (res.ok) {
        const data = await res.json()
        setState(data.state)
        if (data.activity) {
          const incoming = data.activity as ActivityEntry[]
          // Detect new entries
          const incomingIds = new Set(incoming.map((a: ActivityEntry) => a.id))
          const fresh = new Set<string>()
          incoming.forEach((a: ActivityEntry) => {
            if (!prevIds.has(a.id)) fresh.add(a.id)
          })
          setNewIds(fresh)
          setPrevIds(incomingIds)
          setActivity(incoming)

          // Clear "new" highlight after animation
          if (fresh.size > 0) {
            setTimeout(() => setNewIds(new Set()), 1500)
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Also tick the bot when it's running
  const tickBot = async () => {
    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tick' }),
      })
      if (res.ok) {
        const data = await res.json()
        setState(data.state)
        if (data.activity) {
          const incoming = data.activity as ActivityEntry[]
          const incomingIds = new Set(incoming.map((a: ActivityEntry) => a.id))
          const fresh = new Set<string>()
          incoming.forEach((a: ActivityEntry) => {
            if (!prevIds.has(a.id)) fresh.add(a.id)
          })
          setNewIds(fresh)
          setPrevIds(incomingIds)
          setActivity(incoming)
          if (fresh.size > 0) {
            setTimeout(() => setNewIds(new Set()), 1500)
          }
        }
      }
    } catch { /* ignore */ }
  }

  // Initial load
  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll interval — tick when running, just fetch when not
  useEffect(() => {
    const interval = state.status === 'running' ? state.settings.scanIntervalMs : 3000
    tickRef.current = setInterval(() => {
      if (state.status === 'running') {
        tickBot()
      } else {
        fetchData()
      }
    }, interval)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.settings.scanIntervalMs])

  // Auto-scroll to top (newest entries appear at top)
  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = 0
    }
  }, [activity, autoScroll])

  // Filter entries
  const filteredActivity = activity.filter((entry) => {
    if (filter === 'all') return true
    if (filter === 'actions') return !['scan_start', 'scan_complete', 'coin_qualified', 'coin_rejected', 'evaluating', 'hold', 'idle', 'jump_skip'].includes(entry.type)
    if (filter === 'scans') return ['scan_start', 'scan_complete', 'coin_qualified', 'coin_rejected'].includes(entry.type)
    return true
  })

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <a href="/" className="text-orange-500 font-bold text-lg hover:text-orange-400 transition">
            Hot Potato
          </a>
          <span className="text-gray-600">·</span>
          <span className="text-gray-400 text-sm">Activity Feed</span>
        </div>
        <div className="flex items-center gap-4">
          <PulseIndicator running={state.status === 'running'} />
          <a
            href="/"
            className="px-3 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-xs hover:text-white hover:border-gray-600 transition"
          >
            Dashboard
          </a>
        </div>
      </div>

      {/* Stats */}
      <StatsBar state={state} />

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/50 border-b border-gray-800/50">
        <span className="text-gray-600 text-xs mr-1">Filter:</span>
        {(['all', 'actions', 'scans'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
              filter === f
                ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {f === 'all' ? 'Everything' : f === 'actions' ? 'Actions Only' : 'Scans Only'}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`px-2.5 py-1 rounded text-[11px] transition ${
            autoScroll
              ? 'text-green-400 bg-green-500/10'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Auto-scroll {autoScroll ? 'ON' : 'OFF'}
        </button>
        <span className="text-gray-700 text-xs">{filteredActivity.length} entries</span>
      </div>

      {/* Feed */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto divide-y divide-gray-800/30"
      >
        {filteredActivity.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <p className="text-4xl mb-4">📡</p>
            <p className="text-sm">No activity yet</p>
            <p className="text-xs text-gray-700 mt-1">Start the bot from the Dashboard to see the feed</p>
          </div>
        ) : (
          filteredActivity.map((entry) => (
            <ActivityRow
              key={entry.id}
              entry={entry}
              isNew={newIds.has(entry.id)}
            />
          ))
        )}
      </div>

      {/* Keyboard hint */}
      <div className="px-4 py-1.5 bg-gray-900 border-t border-gray-800 text-[10px] text-gray-600 text-center">
        Showing real-time bot activity · Refreshes every {state.status === 'running' ? `${state.settings.scanIntervalMs / 1000}s` : '3s'}
      </div>
    </div>
  )
}
