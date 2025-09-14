import { NextResponse } from "next/server"

// In-memory storage for demo purposes
// In production, use a database or Redis
let currentTransaction: any = null

export async function GET() {
  try {
    if (currentTransaction) {
      const transaction = currentTransaction
      currentTransaction = null // Clear after reading
      return NextResponse.json({ transaction })
    }

    return NextResponse.json({ transaction: null })
  } catch (error) {
    console.error("Error getting transaction status:", error)
    return NextResponse.json({ error: "Failed to get transaction status" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const transactionData = await request.json()
    currentTransaction = {
      ...transactionData,
      transactionId: `txn_${Date.now()}`,
      timestamp: new Date().toISOString(),
    }

    return NextResponse.json({ success: true, transactionId: currentTransaction.transactionId })
  } catch (error) {
    console.error("Error setting transaction:", error)
    return NextResponse.json({ error: "Failed to set transaction" }, { status: 500 })
  }
}
