import { type NextRequest, NextResponse } from "next/server"

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
}

let currentTransaction: TransactionData | null = null

export async function GET() {
  if (!currentTransaction) {
    return NextResponse.json({ transaction: null })
  }
  const tx = currentTransaction
  currentTransaction = null
  return NextResponse.json({ transaction: tx })
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      vendorName?: string
      items?: CheckoutItem[]
      total?: number
    }
    if (!body.vendorName || !body.items || !Array.isArray(body.items)) {
      return NextResponse.json({ error: "Invalid request format" }, { status: 400 })
    }
    const calculatedTotal = body.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    )
    if (typeof body.total !== "number" || Math.abs(calculatedTotal - body.total) > 0.01) {
      return NextResponse.json({ error: "Total amount mismatch" }, { status: 400 })
    }
    currentTransaction = {
      vendorName: body.vendorName,
      items: body.items,
      total: body.total,
      transactionId: `txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    }
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 })
  }
}

