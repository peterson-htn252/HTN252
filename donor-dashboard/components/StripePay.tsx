// components/StripePay.tsx
"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { API_URL } from "@/lib/api";

const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = pk ? loadStripe(pk) : Promise.resolve(null);

export function StripePay({
  amountCents,
  currency,
  programId,
  email,
  ngoPublicKey,
  onConfirmed,
}: {
  amountCents: number;
  currency: "usd";
  programId: string;
  email: string;
  ngoPublicKey: string;   // XRPL address (r...)
  onConfirmed: (paymentIntentId: string) => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ✅ don’t even try unless everything is valid
  const emailValid = !!email && email.includes("@");
  const ready = amountCents > 0 && !!programId && emailValid && !!ngoPublicKey;

  useEffect(() => {
    if (!ready) return; // wait for inputs
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/donor/payments/stripe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: amountCents,
            currency,
            programId,
            email,
            ngoPublicKey, // passed to metadata for webhook
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Create PI failed (${res.status})`);
        if (!data.clientSecret) throw new Error("No clientSecret returned");
        setClientSecret(data.clientSecret);
      } catch (e: any) {
        setError(e?.message || "Failed to initialize payment");
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, amountCents, currency, programId, email, ngoPublicKey]);

  if (!pk) return <div className="text-sm text-red-600">Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</div>;
  if (!emailValid)
    return <div className="text-sm text-amber-700">Enter a valid email to continue.</div>;
  if (!ngoPublicKey)
    return <div className="text-sm text-amber-700">NGO wallet address missing.</div>;
  if (amountCents <= 0)
    return <div className="text-sm text-amber-700">Enter a positive amount.</div>;

  if (error) return <div className="text-sm text-red-600">Stripe init error: {error}</div>;
  if (loading || !clientSecret)
    return <div className="text-sm text-muted-foreground">Initializing payment…</div>;

  return (
    <Elements stripe={stripePromise!} options={{ clientSecret }}>
      <InnerPay onConfirmed={onConfirmed} />
    </Elements>
  );
}

function InnerPay({ onConfirmed }: { onConfirmed: (paymentIntentId: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setErr(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    setSubmitting(false);
    if (error) return setErr(error.message || "Payment failed");
    if (paymentIntent?.status === "succeeded") onConfirmed(paymentIntent.id);
    else setErr(`Unexpected status: ${paymentIntent?.status}`);
  };

  return (
    <div className="space-y-3">
      <PaymentElement />
      {err && <div className="text-sm text-red-600">{err}</div>}
      <button
        disabled={!stripe || submitting}
        onClick={submit}
        className="w-full rounded bg-primary text-primary-foreground h-10"
      >
        {submitting ? "Processing…" : "Pay"}
      </button>
    </div>
  );
}
