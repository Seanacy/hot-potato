import { NextResponse } from 'next/server'
import { scanMarket } from '@/lib/scanner'

export const dynamic = 'force-dynamic'

// GET — scan market and return results
export async function GET() {
  try {
    const scan = await scanMarket()
    return NextResponse.json({ scan })
  } catch (error) {
    console.error('Market scan error:', error)
    return NextResponse.json({ error: 'Failed to scan market' }, { status: 500 })
  }
}
