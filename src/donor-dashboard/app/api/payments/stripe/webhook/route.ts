// app/api/stripe/webhook/route.ts
import { NextRequest } from "next/server";
import Stripe from "stripe";
import * as xrpl from "xrpl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);


async function sendXrp(toAddress: string, amountXrp: number): Promise<string> {
  const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();

  const wallet = xrpl.Wallet.fromSeed(process.env.XRPL_HOT_WALLET_SEED!);

  const prepared = await client.autofill({
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: toAddress,
    Amount: xrpl.xrpToDrops(amountXrp),
  });

  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  await client.disconnect();

  // @ts-ignore - result typing
  return result.result?.hash || result.tx_json?.hash || "unknown_hash";
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

if (event.type === "payment_intent.succeeded") {
  const pi = event.data.object as Stripe.PaymentIntent;

  const amountUsd = (pi.amount ?? 0) / 100;
  const ngoAddress = "rsvyku1E1iaDBTbgWVQMwpMTtLrtwHvFYb"; 
  const programId = pi.metadata?.programId;

  if (ngoAddress && amountUsd > 0) {
    // 👇 Add these logs
    console.log(`[webhook] Preparing to send ${amountUsd} XRP`);
    console.log(`[webhook] Destination NGO wallet: ${ngoAddress}`);
    console.log(`[webhook] Program ID: ${programId}`);
    console.log(`[webhook] Stripe PaymentIntent ID: ${pi.id}`);

    const txHash = await sendXrp(ngoAddress, amountUsd);
    console.log(`[xrpl] Sent: txHash=${txHash}`);
    console.log(`Txn explorer: https://testnet.xrpl.org/transactions/${txHash}`);
    console.log(`NGO account: https://testnet.xrpl.org/accounts/${ngoAddress}`);


    // Optionally record in your FastAPI DB
    try {
      await fetch(`${process.env.FASTAPI_BASE_URL}/donations/record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.APP_SECRET ?? ""}`,
        },
        body: JSON.stringify({
          donationId: pi.id,
          programId,
          amount: amountUsd,
          txHash,
          stripePaymentId: pi.id,
          email: pi.receipt_email,
        }),
      });
    } catch (_) {
      // swallow for dev
    }
  }
}

return new Response("ok", { status: 200 });
}