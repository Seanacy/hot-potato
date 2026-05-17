import { NextRequest, NextResponse } from 'next/server'
import { BotState, BotSettings, DEFAULT_BOT_STATE } from '@/lib/types'
import { startBot, pauseBot, restartBot, tick } from '@/lib/engine'

export const dynamic = 'force-dynamic'

// In-memory bot state (paper trading — no database needed)
let botState: BotState = { ...DEFAULT_BOT_STATE }

// GET — return current bot state
export async function GET() {
  return NextResponse.json({ state: botState })
}

// POST — control the bot (start, pause, restart, tick, reset, settings)
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  switch (action) {
    case 'start':
      botState = startBot(botState)
      return NextResponse.json({ state: botState })

    case 'pause':
      botState = pauseBot(botState)
      return NextResponse.json({ state: botState })

    case 'restart':
      botState = restartBot(botState)
      return NextResponse.json({ state: botState })

    case 'tick':
      botState = await tick(botState)
      return NextResponse.json({ state: botState })

    case 'reset':
      botState = { ...DEFAULT_BOT_STATE, settings: { ...botState.settings } }
      // Apply seed from settings
      botState.seedAmount = botState.settings.seedAmount
      botState.tradingBalance = botState.settings.seedAmount
      return NextResponse.json({ state: botState })

    case 'settings': {
      // Update settings — only allowed when bot is stopped
      const newSettings = body.settings as Partial<BotSettings>
      if (botState.status === 'running') {
        return NextResponse.json({ error: 'Pause or stop the bot before changing settings' }, { status: 400 })
      }
      botState.settings = { ...botState.settings, ...newSettings }
      // If seed changed and bot hasn't started trading yet, update balances
      if (newSettings.seedAmount !== undefined && botState.totalTrades === 0) {
        botState.seedAmount = newSettings.seedAmount
        botState.tradingBalance = newSettings.seedAmount
      }
      return NextResponse.json({ state: botState })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
