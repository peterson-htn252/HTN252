import { type NextRequest, NextResponse } from "next/server"

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
}

export interface CheckoutItem {
  id: string
  name: string
  price: number
  quantity: number
}

export interface CheckoutRequest {
  vendorName: string
  items: CheckoutItem[]
  total: number
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body: CheckoutRequest = await request.json()

    // Validate the request
    if (!body.vendorName || !body.items || !Array.isArray(body.items)) {
      return NextResponse.json({ error: "Invalid request format" }, { status: 400, headers: corsHeaders })
    }

    // Calculate total to verify
    const calculatedTotal = body.items.reduce((sum, item) => sum + item.price * item.quantity, 0)

    if (Math.abs(calculatedTotal - body.total) > 0.01) {
      return NextResponse.json({ error: "Total amount mismatch" }, { status: 400, headers: corsHeaders })
    }

    // Return success with transaction ID
    return NextResponse.json({
      success: true,
      transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      vendorName: body.vendorName,
      items: body.items,
      total: body.total,
    }, { headers: corsHeaders })
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON format" }, { status: 400, headers: corsHeaders })
  }
}
