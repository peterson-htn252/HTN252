import Stripe from "stripe";
import { sendXrp } from "@/lib/xrpl"; // your working sender
import * as rac from "ripple-address-codec";
import * as keypairs from "ripple-keypairs";

export const runtime = "nodejs";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const FASTAPI = process.env.FASTAPI_BASE_URL ?? "http://127.0.0.1:8000";

/** Normalize anything (classic r..., X-address, hex pubkey) into a classic r-address. */
function toClassic(input?: string | null): string | null {
  if (!input) return null;
  const a = input.trim();
  if (!a) return null;
  if (rac.isValidClassicAddress(a)) return a;
  if (rac.isValidXAddress(a)) {
    try { return rac.xAddressToClassicAddress(a).classicAddress; } catch {}
  }
  // compressed/uncompressed hex pubkey
  if (/^[A-Fa-f0-9]{66}$/.test(a) || /^[A-Fa-f0-9]{130}$/.test(a)) {
    try { return keypairs.deriveAddress(a); } catch {}
  }
  return null;
}

/** Fetch NGO/account by id; prefer /accounts/{id}, fall back to /accounts/ngos and scan. */
async function fetchNgoFromDb(programId: string) {
  // Try direct endpoint
  try {
    const r = await fetch(`${FASTAPI}/accounts/${programId}`);
    if (r.ok) return await r.json();
  } catch (_) {}

  // Fallback: scan list and match
  try {
    const r = await fetch(`${FASTAPI}/accounts/ngos`);
    if (r.ok) {
      const list = await r.json();
      return Array.isArray(list) ? list.find((x: any) => x.account_id === programId) : null;
    }
  } catch (_) {}

  return null;
}

export async function POST(req: Request) {
  try {
    const { paymentIntentId, programId: bodyProgramId, overrideAddress } = await req.json();

    if (!paymentIntentId) {
      return Response.json({ error: "Missing paymentIntentId" }, { status: 400 });
    }

    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== "succeeded") {
      return Response.json({ error: `PaymentIntent not succeeded (status=${pi.status})` }, { status: 400 });
    }

    // 1) Work out which program/NGO this payment is for.
    const programId =
      (pi.metadata?.programId as string | undefined) ||
      (typeof bodyProgramId === "string" ? bodyProgramId : undefined);

    if (!programId) {
      return Response.json({ error: "No programId found (metadata or body)" }, { status: 400 });
    }

    // 2) Pull the destination from your DB first.
    const ngo = await fetchNgoFromDb(programId);
    const dbAddress: string | undefined =
      (ngo?.address as string | undefined) ||
      (ngo?.xrpl_address as string | undefined) || // in case you named it differently
      (ngo?.public_key as string | undefined);     // legacy: hex pubkey

    // 3) Build candidate list in precedence order:
    //    override (for testing) -> DB address -> PI metadata -> env fallback.
    const candidates = [
      overrideAddress as string | undefined,
      dbAddress,
      (pi.metadata?.ngoAddress as string | undefined),
      (pi.metadata?.ngoPublicKey as string | undefined),
      process.env.XRPL_HARDCODED_ADDRESS,
    ];

    // 4) Normalize the first valid candidate into classic r-address.
    let toAddress: string | null = null;
    let rawUsed: string | undefined;
    for (const c of candidates) {
      const classic = toClassic(c);
      if (classic) { toAddress = classic; rawUsed = c; break; }
    }

    if (!toAddress) {
      return Response.json(
        {
          error: "No valid XRPL destination (accounts.address was empty or invalid).",
          programId,
          candidates,
          note: "accounts.address must be a classic r-address (or X-address / hex pubkey we can normalize).",
        },
        { status: 400 }
      );
    }

    // 5) Convert amount: dev mapping 1 USD = 1 XRP
    const amountXrp = (pi.amount ?? 0) / 100;

    console.log(`[fulfill] programId=${programId} DEST=${toAddress} (from=${rawUsed}) amountXrp=${amountXrp}`);

    // 6) Send
    const { txHash, via } = await sendXrp(toAddress, amountXrp);

    return Response.json({ ok: true, txHash, toAddress, via, programId });
  } catch (e: any) {
    console.error("[fulfill] error", e);
    return Response.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}