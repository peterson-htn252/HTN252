import { type NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
})

export async function POST(request: NextRequest) {
  try {
    const { amount, currency, programId, email } = await request.json()

    // Create payment intent with Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        programId,
        email,
      },
    })

    // Generate donation ID
    const donationId = `DON-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Store donation record in database
    // TODO: Replace with actual database call
    console.log("[v0] Creating donation record:", {
      donationId,
      programId,
      amount: amount / 100,
      email,
      stripePaymentIntentId: paymentIntent.id,
      status: "pending",
    })

    return NextResponse.json({
      paymentIntent: {
        id: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
      },
      donationId,
    })
  } catch (error) {
    console.error("[v0] Stripe payment error:", error)
    return NextResponse.json({ error: "Payment processing failed" }, { status: 500 })
  }
}
