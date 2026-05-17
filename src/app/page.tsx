'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { BotState, BotSettings, ProfitStep, DEFAULT_BOT_STATE, DEFAULT_SETTINGS, DEFAULT_STEPS, BotNotification, Trade } from '@/lib/types'

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
  const isStepUp = state.settings.ladderMode === 'step-up'

  // Figure out current target for display
  let currentTarget: number
  let currentLock: number
  if (isStepUp && state.settings.steps.length > 0) {
    const idx = Math.min(state.currentStepIndex, state.settings.steps.length - 1)
    const step = state.settings.steps[idx]
    currentTarget = step.profitTarget
    currentLock = step.lockAmount
  } else {
    currentTarget = state.settings.simpleProfitTarget
    currentLock = state.settings.simpleLockAmount
  }

  // Count locked segments
  const segments = currentLock > 0 ? Math.floor(state.lockedProfits / currentLock) : 0

  return (
    <div className="bg-potato-surface rounded-xl p-5 border border-potato-border">
      <div className="flex items-center justify-between mb-3">
        <p className="text-potato-muted text-xs">Profit ladder</p>
        <span className="text-xs px-2 py-0.5 rounded bg-potato-surface-2 text-potato-muted">
          {isStepUp ? `Step ${state.currentStepIndex + 1} of ${state.settings.steps.length}` : 'Simple mode'}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="px-3 py-1.5 rounded-lg bg-potato-accent/20 border border-potato-accent/30 text-potato-accent text-xs font-medium">
          Seed ${state.seedAmount}
        </div>
        {Array.from({ length: Math.min(segments, 20) }).map((_, i) => (
          <div key={i} className="px-3 py-1.5 rounded-lg bg-potato-green/20 border border-potato-green/30 text-potato-green text-xs font-medium">
            +${currentLock}
          </div>
        ))}
        <div className="px-3 py-1.5 rounded-lg bg-potato-surface-2 border border-potato-border text-potato-text text-xs">
          Trading: ${state.tradingBalance.toFixed(2)}
        </div>
      </div>
      <div className="text-potato-muted text-xs mt-3 space-y-1">
        <p>Safe pile: ${totalSafe.toFixed(2)} &middot; Mode: {state.mode === 'growth' ? 'Growth (trading everything)' : 'Profit-only (seed protected)'}</p>
        <p>Current rule: earn ${currentTarget} → lock ${currentLock}
          {isStepUp && state.settings.steps.length > 0 && (
            <span> &middot; Repeats: {state.currentStepRepeats}/{state.settings.steps[Math.min(state.currentStepIndex, state.settings.steps.length - 1)].repeatCount || '∞'}</span>
          )}
        </p>
      </div>
    </div>
  )
}

// ============================================
// Setting Input Row
// ============================================
function SettingRow({
  label,
  hint,
  value,
  onChange,
  suffix,
  step,
  min,
  max,
}: {
  label: string
  hint: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  step?: number
  min?: number
  max?: number
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-potato-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-potato-text text-sm">{label}</p>
        <p className="text-potato-muted text-xs">{hint}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          step={step || 1}
          min={min}
          max={max}
          className="w-24 bg-potato-surface-2 border border-potato-border rounded-lg px-3 py-1.5 text-sm text-potato-text text-right focus:border-potato-accent focus:outline-none"
        />
        {suffix && <span className="text-potato-muted text-xs w-8">{suffix}</span>}
      </div>
    </div>
  )
}

// ============================================
// Settings Panel
// ============================================
// ============================================
// Step Editor Row
// ============================================
function StepRow({
  step,
  index,
  onChange,
  onRemove,
  isLast,
}: {
  step: ProfitStep
  index: number
  onChange: (s: ProfitStep) => void
  onRemove: () => void
  isLast: boolean
}) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-potato-border/30 last:border-0">
      <span className="text-potato-muted text-xs w-6 shrink-0">#{index + 1}</span>
      <div className="flex-1 grid grid-cols-3 gap-2">
        <div>
          <p className="text-potato-muted text-[10px] mb-0.5">Earn $</p>
          <input
            type="number"
            value={step.profitTarget}
            onChange={(e) => onChange({ ...step, profitTarget: parseFloat(e.target.value) || 0 })}
            step={1}
            min={1}
            className="w-full bg-potato-surface-2 border border-potato-border rounded-lg px-2 py-1 text-xs text-potato-text text-right focus:border-potato-accent focus:outline-none"
          />
        </div>
        <div>
          <p className="text-potato-muted text-[10px] mb-0.5">Lock $</p>
          <input
            type="number"
            value={step.lockAmount}
            onChange={(e) => onChange({ ...step, lockAmount: parseFloat(e.target.value) || 0 })}
            step={0.5}
            min={0.5}
            className="w-full bg-potato-surface-2 border border-potato-border rounded-lg px-2 py-1 text-xs text-potato-text text-right focus:border-potato-accent focus:outline-none"
          />
        </div>
        <div>
          <p className="text-potato-muted text-[10px] mb-0.5">{isLast ? 'Repeats (∞)' : 'Repeats'}</p>
          <input
            type="number"
            value={step.repeatCount}
            onChange={(e) => onChange({ ...step, repeatCount: parseInt(e.target.value) || 0 })}
            step={1}
            min={0}
            placeholder={isLast ? '∞' : '1'}
            className="w-full bg-potato-surface-2 border border-potato-border rounded-lg px-2 py-1 text-xs text-potato-text text-right focus:border-potato-accent focus:outline-none"
          />
        </div>
      </div>
      <button
        onClick={onRemove}
        className="text-potato-muted hover:text-potato-red text-xs px-1 shrink-0"
        title="Remove step"
      >
        ✕
      </button>
    </div>
  )
}

// ============================================
// Settings Panel
// ============================================
function SettingsPanel({
  settings,
  onSave,
  disabled,
}: {
  settings: BotSettings
  onSave: (s: BotSettings) => void
  disabled: boolean
}) {
  const [draft, setDraft] = useState<BotSettings>({ ...settings, steps: settings.steps.map(s => ({...s})) })
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraft({ ...settings, steps: settings.steps.map(s => ({...s})) })
    setDirty(false)
  }, [settings])

  const update = (key: keyof BotSettings, val: number | string) => {
    setDraft((prev) => ({ ...prev, [key]: val }))
    setDirty(true)
  }

  const updateStep = (index: number, step: ProfitStep) => {
    setDraft((prev) => {
      const newSteps = [...prev.steps]
      newSteps[index] = step
      return { ...prev, steps: newSteps }
    })
    setDirty(true)
  }

  const addStep = () => {
    setDraft((prev) => ({
      ...prev,
      steps: [...prev.steps, { profitTarget: 10, lockAmount: 5, repeatCount: 0 }],
    }))
    setDirty(true)
  }

  const removeStep = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }))
    setDirty(true)
  }

  const handleSave = () => {
    onSave(draft)
    setDirty(false)
  }

  const handleReset = () => {
    setDraft({ ...DEFAULT_SETTINGS, steps: DEFAULT_STEPS.map(s => ({...s})) })
    setDirty(true)
  }

  return (
    <div className="bg-potato-surface rounded-xl border border-potato-border overflow-hidden">
      {/* Section: Money Rules */}
      <div className="p-4 border-b border-potato-border/30">
        <p className="text-potato-accent text-xs font-medium mb-2 uppercase tracking-wider">Money Rules</p>
        <SettingRow
          label="Seed Amount"
          hint="Starting capital"
          value={draft.seedAmount}
          onChange={(v) => update('seedAmount', v)}
          suffix="$"
          step={1}
          min={1}
        />
        <SettingRow
          label="Trade Fee"
          hint="Fee per trade (0.006 = 0.6%)"
          value={draft.tradeFeePercent}
          onChange={(v) => update('tradeFeePercent', v)}
          suffix="%"
          step={0.001}
          min={0}
          max={0.1}
        />
        <SettingRow
          label="Fee Multiplier"
          hint="Only jump if gain >= Nx fees"
          value={draft.feeMultiplier}
          onChange={(v) => update('feeMultiplier', v)}
          suffix="x"
          step={0.5}
          min={1}
          max={10}
        />
      </div>

      {/* Section: Profit Ladder */}
      <div className="p-4 border-b border-potato-border/30">
        <p className="text-potato-accent text-xs font-medium mb-3 uppercase tracking-wider">Profit Ladder</p>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-potato-surface-2 rounded-lg p-1 mb-4">
          <button
            onClick={() => { update('ladderMode', 'simple'); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
              draft.ladderMode === 'simple'
                ? 'bg-potato-accent text-white'
                : 'text-potato-muted hover:text-potato-text'
            }`}
          >
            Simple
          </button>
          <button
            onClick={() => { update('ladderMode', 'step-up'); }}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${
              draft.ladderMode === 'step-up'
                ? 'bg-potato-accent text-white'
                : 'text-potato-muted hover:text-potato-text'
            }`}
          >
            Step-Up
          </button>
        </div>

        {draft.ladderMode === 'simple' ? (
          <>
            <p className="text-potato-muted text-xs mb-2">One rule, repeats forever.</p>
            <SettingRow
              label="Profit Target"
              hint="Earn this much to trigger a lock"
              value={draft.simpleProfitTarget}
              onChange={(v) => update('simpleProfitTarget', v)}
              suffix="$"
              step={1}
              min={1}
            />
            <SettingRow
              label="Lock Amount"
              hint="Lock this much when triggered"
              value={draft.simpleLockAmount}
              onChange={(v) => update('simpleLockAmount', v)}
              suffix="$"
              step={0.5}
              min={0.5}
            />
          </>
        ) : (
          <>
            <p className="text-potato-muted text-xs mb-2">
              Each step has a profit target, lock amount, and repeat count.
              The last step repeats forever (set repeats to 0 for infinite).
            </p>
            <div className="space-y-0">
              {draft.steps.map((step, i) => (
                <StepRow
                  key={i}
                  step={step}
                  index={i}
                  onChange={(s) => updateStep(i, s)}
                  onRemove={() => removeStep(i)}
                  isLast={i === draft.steps.length - 1}
                />
              ))}
            </div>
            <button
              onClick={addStep}
              className="mt-2 w-full py-2 rounded-lg border border-dashed border-potato-border text-potato-muted text-xs hover:border-potato-accent hover:text-potato-accent transition"
            >
              + Add Step
            </button>
          </>
        )}
      </div>

      {/* Section: Scanner Rules */}
      <div className="p-4 border-b border-potato-border/30">
        <p className="text-potato-accent text-xs font-medium mb-2 uppercase tracking-wider">Scanner Rules</p>
        <SettingRow
          label="Scan Interval"
          hint="How often to check the market"
          value={draft.scanIntervalMs / 1000}
          onChange={(v) => update('scanIntervalMs', v * 1000)}
          suffix="sec"
          step={1}
          min={3}
          max={60}
        />
        <SettingRow
          label="Trend Window"
          hint="Look at last N seconds for trend"
          value={draft.trendWindowSec}
          onChange={(v) => update('trendWindowSec', v)}
          suffix="sec"
          step={5}
          min={10}
          max={300}
        />
        <SettingRow
          label="Min Trend Duration"
          hint="Coin must be rising for at least N seconds"
          value={draft.minTrendSec}
          onChange={(v) => update('minTrendSec', v)}
          suffix="sec"
          step={5}
          min={5}
          max={120}
        />
        <SettingRow
          label="Min Volume"
          hint="Ignore coins below this daily volume"
          value={draft.minVolumeUsd}
          onChange={(v) => update('minVolumeUsd', v)}
          suffix="$"
          step={10000}
          min={0}
        />
      </div>

      {/* Section: Safety Filters */}
      <div className="p-4 border-b border-potato-border/30">
        <p className="text-potato-accent text-xs font-medium mb-2 uppercase tracking-wider">Safety Filters</p>
        <SettingRow
          label="Max Spike"
          hint="Reject if price jumps more than X% too fast"
          value={draft.maxSpikePercent}
          onChange={(v) => update('maxSpikePercent', v)}
          suffix="%"
          step={0.5}
          min={1}
          max={20}
        />
        <SettingRow
          label="Spike Window"
          hint="Time window for spike detection"
          value={draft.spikeWindowSec}
          onChange={(v) => update('spikeWindowSec', v)}
          suffix="sec"
          step={1}
          min={1}
          max={60}
        />
        <SettingRow
          label="Max Volatility Ratio"
          hint="Max down/up move ratio (lower = stricter)"
          value={draft.maxVolatilityRatio}
          onChange={(v) => update('maxVolatilityRatio', v)}
          step={0.05}
          min={0.05}
          max={1}
        />
        <SettingRow
          label="Min Price Points"
          hint="Need at least N data points to evaluate"
          value={draft.minPricePoints}
          onChange={(v) => update('minPricePoints', v)}
          step={1}
          min={2}
          max={30}
        />
      </div>

      {/* Section: Bail Rules */}
      <div className="p-4 border-b border-potato-border/30">
        <p className="text-potato-accent text-xs font-medium mb-2 uppercase tracking-wider">Bail Rules</p>
        <SettingRow
          label="Bail Drop"
          hint="Sell if price drops X% from buy price"
          value={draft.bailPercent}
          onChange={(v) => update('bailPercent', v)}
          suffix="%"
          step={0.1}
          min={0.1}
          max={10}
        />
        <SettingRow
          label="Stagnant Threshold"
          hint="Sell if coin moves less than X%"
          value={draft.stagnantThreshold}
          onChange={(v) => update('stagnantThreshold', v)}
          suffix="%"
          step={0.01}
          min={0}
          max={1}
        />
        <SettingRow
          label="Reversal Threshold"
          hint="Sell if recent trend is below -X%"
          value={draft.reversalThreshold}
          onChange={(v) => update('reversalThreshold', v)}
          suffix="%"
          step={0.05}
          min={0.01}
          max={5}
        />
      </div>

      {/* Buttons */}
      <div className="p-4 flex gap-3">
        <button
          onClick={handleSave}
          disabled={!dirty || disabled}
          className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
            dirty && !disabled
              ? 'bg-potato-accent text-white hover:bg-potato-accent-dim'
              : 'bg-potato-surface-2 text-potato-muted cursor-not-allowed'
          }`}
        >
          {disabled ? 'Pause bot to change settings' : dirty ? 'Save Settings' : 'Settings saved'}
        </button>
        <button
          onClick={handleReset}
          disabled={disabled}
          className="px-4 py-2.5 rounded-xl bg-potato-surface-2 border border-potato-border text-potato-muted text-sm hover:text-potato-red hover:border-potato-red/50 transition disabled:opacity-50"
        >
          Defaults
        </button>
      </div>
    </div>
  )
}

// ============================================
// Main Dashboard
// ============================================
export default function Dashboard() {
  const [state, setState] = useState<BotState>(DEFAULT_BOT_STATE)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'trades' | 'notifications' | 'settings'>('trades')
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load initial state
  useEffect(() => {
    fetch('/api/bot')
      .then((r) => r.json())
      .then((d) => setState(d.state))
      .finally(() => setLoading(false))
  }, [])

  // Auto-tick when running (use settings interval)
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
      }, state.settings.scanIntervalMs)
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [state.status, state.settings.scanIntervalMs])

  const sendAction = useCallback(async (action: string, extra?: Record<string, unknown>) => {
    const res = await fetch('/api/bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    if (res.ok) {
      const data = await res.json()
      setState(data.state)
    }
  }, [])

  const saveSettings = useCallback(async (newSettings: BotSettings) => {
    await sendAction('settings', { settings: newSettings })
  }, [sendAction])

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
        <span>Profit to next lock: ${Math.max(0, state.profitSinceLastLock).toFixed(2)} / ${
          state.settings.ladderMode === 'step-up' && state.settings.steps.length > 0
            ? state.settings.steps[Math.min(state.currentStepIndex, state.settings.steps.length - 1)].profitTarget
            : state.settings.simpleProfitTarget
        }</span>
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
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-2 rounded-lg text-sm transition ${
            activeTab === 'settings'
              ? 'bg-potato-surface-2 text-potato-text'
              : 'text-potato-muted hover:text-potato-text'
          }`}
        >
          Settings
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'trades' ? (
        <TradeHistory trades={state.trades} />
      ) : activeTab === 'notifications' ? (
        <Notifications notifications={state.notifications} />
      ) : (
        <SettingsPanel
          settings={state.settings}
          onSave={saveSettings}
          disabled={state.status === 'running'}
        />
      )}
    </div>
  )
}
