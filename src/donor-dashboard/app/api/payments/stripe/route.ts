// app/api/payments/stripe/route.ts
import Stripe from "stripe";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // You can omit apiVersion to use account default
  // apiVersion: "2025-08-27.basil" as any,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const amount = Number(body?.amount);
    const currency = (body?.currency || "usd").toLowerCase();
    const programId = String(body?.programId || "");
    const email = String(body?.email || "");
    const ngoPublicKey = String(body?.ngoPublicKey || "");

    // Helpful logging while debugging
    console.log("[PI:create] incoming", { amount, currency, programId, email, ngoPublicKeyPresent: !!ngoPublicKey });

    if (!amount || isNaN(amount) || amount < 50) { // Stripe min amount > 0; 50 = $0.50 in cents
      return Response.json({ error: "Invalid amount (cents) supplied" }, { status: 400 });
    }
    if (!email.includes("@")) {
      return Response.json({ error: "Missing/invalid email" }, { status: 400 });
    }
    if (!programId) {
      return Response.json({ error: "Missing programId" }, { status: 400 });
    }
    if (!ngoPublicKey) {
      return Response.json({ error: "Missing ngoPublicKey (XRPL address)" }, { status: 400 });
    }

    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      receipt_email: email,
      automatic_payment_methods: { enabled: true },
      metadata: { programId, email, ngoPublicKey },
    });

    if (!intent.client_secret) {
      return Response.json({ error: "No client secret from Stripe" }, { status: 500 });
    }

    return Response.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
  } catch (e: any) {
    console.error("[PI:create] error", e);
    return Response.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
