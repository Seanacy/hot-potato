// Hot Potato — Coinbase Advanced Trade API Client
// Handles JWT auth, placing orders, checking balances
// Uses Coinbase Developer Platform (CDP) API keys

import { SignJWT, importPKCS8 } from 'jose'

const COINBASE_API_URL = 'https://api.coinbase.com'

// ============================================
// JWT Token Generation (Coinbase CDP auth)
// ============================================
async function generateJWT(
  method: string,
  path: string
): Promise<string> {
  const apiKey = process.env.COINBASE_API_KEY
  const apiSecret = process.env.COINBASE_API_SECRET

  if (!apiKey || !apiSecret) {
    throw new Error('COINBASE_API_KEY and COINBASE_API_SECRET must be set')
  }

  // The private key from Coinbase is in EC PEM format
  const privateKey = await importPKCS8(apiSecret, 'ES256')

  const uri = `${method} ${path}`

  const jwt = await new SignJWT({
    sub: apiKey,
    iss: 'cdp',
    aud: ['retail_rest_api_proxy'],
  })
    .setProtectedHeader({
      alg: 'ES256',
      kid: apiKey,
      nonce: crypto.randomUUID(),
      typ: 'JWT',
    })
    .setIssuedAt()
    .setExpirationTime('2m')
    .setNotBefore(Math.floor(Date.now() / 1000))
    .sign(privateKey)

  return jwt
}

// ============================================
// Make authenticated API request
// ============================================
async function coinbaseRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const token = await generateJWT(method, path)

  const res = await fetch(`${COINBASE_API_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const errorText = await res.text()
    console.error(`Coinbase API error ${res.status}:`, errorText)
    throw new Error(`Coinbase API error ${res.status}: ${errorText}`)
  }

  return res.json()
}

// ============================================
// Get all accounts (balances)
// ============================================
export interface CoinbaseAccount {
  uuid: string
  name: string
  currency: string
  available_balance: {
    value: string
    currency: string
  }
}

export async function getAccounts(): Promise<CoinbaseAccount[]> {
  const data = await coinbaseRequest('GET', '/api/v3/brokerage/accounts?limit=50') as {
    accounts: CoinbaseAccount[]
  }
  return data.accounts || []
}

// ============================================
// Get USD balance
// ============================================
export async function getUsdBalance(): Promise<number> {
  const accounts = await getAccounts()
  const usdAccount = accounts.find(
    (a) => a.currency === 'USD' || a.currency === 'USDC'
  )
  if (!usdAccount) return 0
  return parseFloat(usdAccount.available_balance.value) || 0
}

// ============================================
// Get specific coin balance
// ============================================
export async function getCoinBalance(currency: string): Promise<number> {
  const accounts = await getAccounts()
  const account = accounts.find(
    (a) => a.currency.toUpperCase() === currency.toUpperCase()
  )
  if (!account) return 0
  return parseFloat(account.available_balance.value) || 0
}

// ============================================
// Place a MARKET BUY order (buy coin with USD)
// ============================================
export interface OrderResult {
  success: boolean
  orderId: string | null
  error: string | null
  filledPrice?: number
  filledSize?: number
}

export async function marketBuy(
  productId: string, // e.g. "BTC-USD"
  usdAmount: number   // how much USD to spend
): Promise<OrderResult> {
  try {
    const data = await coinbaseRequest('POST', '/api/v3/brokerage/orders', {
      client_order_id: `hp-buy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      product_id: productId,
      side: 'BUY',
      order_configuration: {
        market_market_ioc: {
          quote_size: usdAmount.toFixed(2), // USD amount to spend
        },
      },
    }) as {
      success: boolean
      order_id?: string
      success_response?: { order_id: string }
      error_response?: { error: string; message: string }
    }

    if (data.success && (data.success_response || data.order_id)) {
      const orderId = data.success_response?.order_id || data.order_id || ''
      return {
        success: true,
        orderId,
        error: null,
      }
    }

    return {
      success: false,
      orderId: null,
      error: data.error_response?.message || 'Order failed',
    }
  } catch (err) {
    return {
      success: false,
      orderId: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ============================================
// Place a MARKET SELL order (sell coin for USD)
// ============================================
export async function marketSell(
  productId: string, // e.g. "BTC-USD"
  coinAmount: number  // how much coin to sell
): Promise<OrderResult> {
  try {
    const data = await coinbaseRequest('POST', '/api/v3/brokerage/orders', {
      client_order_id: `hp-sell-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      product_id: productId,
      side: 'SELL',
      order_configuration: {
        market_market_ioc: {
          base_size: coinAmount.toString(), // amount of coin to sell
        },
      },
    }) as {
      success: boolean
      order_id?: string
      success_response?: { order_id: string }
      error_response?: { error: string; message: string }
    }

    if (data.success && (data.success_response || data.order_id)) {
      const orderId = data.success_response?.order_id || data.order_id || ''
      return {
        success: true,
        orderId,
        error: null,
      }
    }

    return {
      success: false,
      orderId: null,
      error: data.error_response?.message || 'Order failed',
    }
  } catch (err) {
    return {
      success: false,
      orderId: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

// ============================================
// Get order details (to check fill price)
// ============================================
export interface OrderDetails {
  orderId: string
  status: string
  filledSize: number
  filledValue: number
  averageFilledPrice: number
  settled: boolean
}

export async function getOrder(orderId: string): Promise<OrderDetails | null> {
  try {
    const data = await coinbaseRequest('GET', `/api/v3/brokerage/orders/historical/${orderId}`) as {
      order: {
        order_id: string
        status: string
        filled_size: string
        filled_value: string
        average_filled_price: string
        settled: boolean
      }
    }

    const order = data.order
    return {
      orderId: order.order_id,
      status: order.status,
      filledSize: parseFloat(order.filled_size) || 0,
      filledValue: parseFloat(order.filled_value) || 0,
      averageFilledPrice: parseFloat(order.average_filled_price) || 0,
      settled: order.settled,
    }
  } catch {
    return null
  }
}

// ============================================
// Get product info (trading pair details)
// ============================================
export async function getProduct(productId: string): Promise<{
  baseMinSize: number
  quoteMinSize: number
  price: number
} | null> {
  try {
    const data = await coinbaseRequest('GET', `/api/v3/brokerage/products/${productId}`) as {
      base_min_size: string
      quote_min_size: string
      price: string
    }

    return {
      baseMinSize: parseFloat(data.base_min_size) || 0,
      quoteMinSize: parseFloat(data.quote_min_size) || 0,
      price: parseFloat(data.price) || 0,
    }
  } catch {
    return null
  }
}

// ============================================
// Check if Coinbase credentials are configured
// ============================================
export function isCoinbaseConfigured(): boolean {
  return !!(process.env.COINBASE_API_KEY && process.env.COINBASE_API_SECRET)
}

// ============================================
// Convert coin symbol to Coinbase product ID
// e.g. "BTC" → "BTC-USD"
// ============================================
export function toProductId(symbol: string): string {
  return `${symbol.toUpperCase()}-USD`
}
