// Persistent trade round storage using localStorage
// Survives server restarts, deployments, and zero-outs

import { TradeRound } from './types'

const STORAGE_KEY = 'hot-potato-trade-rounds'

export function loadTradeRounds(): TradeRound[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as TradeRound[]
  } catch {
    return []
  }
}

export function saveTradeRounds(rounds: TradeRound[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds))
  } catch {
    // localStorage full or unavailable — ignore
  }
}

/**
 * Merge server rounds into stored rounds.
 * Deduplicates by matching buyTimestamp + coinId (unique enough for trades).
 * Returns the merged array sorted newest-first.
 */
export function mergeTradeRounds(stored: TradeRound[], serverRounds: TradeRound[]): TradeRound[] {
  const seen = new Set<string>()
  const all: TradeRound[] = []

  // Build key for dedup
  const key = (r: TradeRound) => `${r.buyTimestamp}-${r.coinId}`

  // Add stored first (these are persisted)
  for (const r of stored) {
    const k = key(r)
    if (!seen.has(k)) {
      seen.add(k)
      all.push(r)
    }
  }

  // Add any new rounds from the server
  for (const r of serverRounds) {
    const k = key(r)
    if (!seen.has(k)) {
      seen.add(k)
      all.push(r)
    }
  }

  // Sort newest first
  return all.sort((a, b) => b.buyTimestamp - a.buyTimestamp)
}

export function clearStoredTradeRounds(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}
