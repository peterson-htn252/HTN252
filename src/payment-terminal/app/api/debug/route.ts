import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    message: "Payment terminal API is running",
    timestamp: new Date().toISOString(),
    endpoints: [
      "GET /api/checkout/status - Get pending transaction",
      "POST /api/checkout/status - Create new transaction", 
      "GET /api/debug - This endpoint"
    ]
  })
}
