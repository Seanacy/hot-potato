import { NextRequest, NextResponse } from 'next/server'
import { BotState, DEFAULT_BOT_STATE } from '@/lib/types'
import { startBot, pauseBot, restartBot, tick } from '@/lib/engine'

export const dynamic = 'force-dynamic'

// In-memory bot state (paper trading — no database needed)
let botState: BotState = { ...DEFAULT_BOT_STATE }
let tickInterval: ReturnType<typeof setInterval> | null = null

// GET — return current bot state
export async function GET() {
  return NextResponse.json({ state: botState })
}

// POST — control the bot (start, pause, restart, tick, reset)
export async function POST(req: NextRequest) {
  const { action } = await req.json()

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
      botState = { ...DEFAULT_BOT_STATE }
      return NextResponse.json({ state: botState })

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
