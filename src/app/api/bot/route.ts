import { NextRequest, NextResponse } from 'next/server'
import { BotState, BotSettings, ScannedCoin, DEFAULT_BOT_STATE } from '@/lib/types'
import { startBot, pauseBot, restartBot, tick } from '@/lib/engine'
import { scanMarket } from '@/lib/scanner'

export const dynamic = 'force-dynamic'

// In-memory bot state (paper trading — no database needed)
let botState: BotState = { ...DEFAULT_BOT_STATE }

// Last scan results for the Scanner tab
let lastScanCoins: ScannedCoin[] = []

// GET — return current bot state + last scan data
export async function GET() {
  return NextResponse.json({ state: botState, scanResults: lastScanCoins })
}

// POST — control the bot (start, pause, restart, tick, reset, settings, scan)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  switch (action) {
    case 'start':
      botState = startBot(botState)
      return NextResponse.json({ state: botState, scanResults: lastScanCoins })

    case 'pause':
      botState = pauseBot(botState)
      return NextResponse.json({ state: botState, scanResults: lastScanCoins })

    case 'restart':
      botState = restartBot(botState)
      return NextResponse.json({ state: botState, scanResults: lastScanCoins })

    case 'tick': {
      botState = await tick(botState)
      // Also grab scan results for the dashboard
      const scan = await scanMarket(botState.settings)
      lastScanCoins = scan.allScanned
      return NextResponse.json({ state: botState, scanResults: lastScanCoins })
    }

    case 'scan': {
      // Manual scan — just fetch data without trading
      const scan = await scanMarket(botState.settings)
      lastScanCoins = scan.allScanned
      return NextResponse.json({ state: botState, scanResults: lastScanCoins })
    }

    case 'reset':
      botState = { ...DEFAULT_BOT_STATE, settings: { ...botState.settings } }
      botState.seedAmount = botState.settings.seedAmount
      botState.tradingBalance = botState.settings.seedAmount
      lastScanCoins = []
      return NextResponse.json({ state: botState, scanResults: lastScanCoins })

    case 'settings': {
      const newSettings = body.settings as Partial<BotSettings>
      if (botState.status === 'running') {
        return NextResponse.json({ error: 'Pause or stop the bot before changing settings' }, { status: 400 })
      }
      botState.settings = { ...botState.settings, ...newSettings }
      if (newSettings.seedAmount !== undefined && botState.totalTrades === 0) {
        botState.seedAmount = newSettings.seedAmount
        botState.tradingBalance = newSettings.seedAmount
      }
      return NextResponse.json({ state: botState, scanResults: lastScanCoins })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
