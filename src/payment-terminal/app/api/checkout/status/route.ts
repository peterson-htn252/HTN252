import { type NextRequest, NextResponse } from "next/server"

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

interface CheckoutItem {
  id: string
  name: string
  price: number
  quantity: number
}

interface TransactionData {
  vendorName: string
  items: CheckoutItem[]
  total: number
  transactionId: string
  storeId?: string
  programId?: string
}

let currentTransaction: TransactionData | null = null

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders })
}

export async function GET() {
  if (!currentTransaction) {
    return NextResponse.json({ transaction: null }, { headers: corsHeaders })
  }
  const tx = currentTransaction
  currentTransaction = null
  return NextResponse.json({ transaction: tx }, { headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      transactionId?: string
      vendorName?: string
      items?: CheckoutItem[]
      total?: number
      storeId?: string
      programId?: string
    }
    if (!body.vendorName || !body.items || !Array.isArray(body.items)) {
      return NextResponse.json({ error: "Invalid request format" }, { status: 400, headers: corsHeaders })
    }
    const calculatedTotal = body.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    )
    if (typeof body.total !== "number" || Math.abs(calculatedTotal - body.total) > 0.01) {
      return NextResponse.json({ error: "Total amount mismatch" }, { status: 400, headers: corsHeaders })
    }
    currentTransaction = {
      vendorName: body.vendorName,
      items: body.items,
      total: body.total,
      transactionId: body.transactionId ?? `txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      storeId: body.storeId,
      programId: body.programId,
    }
    return NextResponse.json({ success: true }, { headers: corsHeaders })
  } catch {
    return NextResponse.json({ error: "Invalid JSON format" }, { status: 400, headers: corsHeaders })
  }
}

