import { NextRequest, NextResponse } from 'next/server'
import { BotState, BotSettings, ScannedCoin, DEFAULT_BOT_STATE } from '@/lib/types'
import { startBot, pauseBot, restartBot, tick, getActivityLog, clearActivityLog, getTradeRounds, clearTradeRounds } from '@/lib/engine'
import { scanMarket } from '@/lib/scanner'

export const dynamic = 'force-dynamic'

// In-memory bot state (paper trading — no database needed)
let botState: BotState = { ...DEFAULT_BOT_STATE }

// Last scan results for the Scanner tab
let lastScanCoins: ScannedCoin[] = []

function buildResponse() {
  return { state: botState, scanResults: lastScanCoins, activity: getActivityLog(), tradeRounds: getTradeRounds() }
}

// GET — return current bot state + scan data + activity log
export async function GET() {
  return NextResponse.json(buildResponse())
}

// POST — control the bot (start, pause, restart, tick, reset, settings, scan)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  switch (action) {
    case 'start':
      botState = startBot(botState)
      return NextResponse.json(buildResponse())

    case 'pause':
      botState = pauseBot(botState)
      return NextResponse.json(buildResponse())

    case 'restart':
      botState = restartBot(botState)
      return NextResponse.json(buildResponse())

    case 'tick': {
      botState = await tick(botState)
      const scan = await scanMarket(botState.settings)
      lastScanCoins = scan.allScanned
      return NextResponse.json(buildResponse())
    }

    case 'scan': {
      const scan = await scanMarket(botState.settings)
      lastScanCoins = scan.allScanned
      return NextResponse.json(buildResponse())
    }

    case 'reset':
      botState = { ...DEFAULT_BOT_STATE, settings: { ...botState.settings } }
      botState.seedAmount = botState.settings.seedAmount
      botState.tradingBalance = botState.settings.seedAmount
      lastScanCoins = []
      clearActivityLog()
      clearTradeRounds()
      return NextResponse.json(buildResponse())

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
      return NextResponse.json(buildResponse())
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
