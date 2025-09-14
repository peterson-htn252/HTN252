// components/DonationForm.tsx
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CreditCard, Shield, CheckCircle, AlertCircle, Loader2, Wallet } from "lucide-react"
import { fetchNGOs } from "@/lib/api";

// Stripe UI wrapper you already added
import { StripePay } from "@/components/StripePay"

interface DonationFormProps {
  onDonationComplete?: (donationId: string, blockchainId: string) => void
}

type PaymentMethod = "card" | "ripple"

interface NGOProgram {
  account_id: string
  name: string
  description: string
  goal: number
  status: string
  lifetime_donations: number
  created_at: string
  xrpl_address?: string
}

export function DonationForm({ onDonationComplete }: DonationFormProps) {
  const [step, setStep] = useState<"select" | "amount" | "payment" | "processing" | "complete">("select")
  const [selectedProgram, setSelectedProgram] = useState<string>("")
  const [donationAmount, setDonationAmount] = useState("")
  const [email, setEmail] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card")
  const [isProcessing, setIsProcessing] = useState(false)
  const [programs, setPrograms] = useState<NGOProgram[]>([])
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(true)

  const [donationResult, setDonationResult] = useState<{
    donationId: string
    blockchainId: string
    amount: number
    program: string
    paymentMethod: string
  } | null>(null)

  // Load programs
useEffect(() => {
  const fetchPrograms = async () => {
    try {
      const ngos = await fetchNGOs();

      const progs: NGOProgram[] = ngos.map((n: any) => ({
        account_id: n.account_id,
        name: n.name,
        description: n.description,
        goal: Number(n.goal ?? 0),
        status: String(n.status ?? "inactive"),
        lifetime_donations: Number(n.lifetime_donations ?? 0),
        created_at: n.created_at,
        xrpl_address: n.address ?? n.xrpl_address ?? "",   // 👈 map it here
      }));

      setPrograms(progs.filter((p) => p.status.toLowerCase() === "active"));
    } catch (e) {
      console.error("Failed to load programs:", e);
    } finally {
      setIsLoadingPrograms(false);
    }
  };
  fetchPrograms();
}, []);



  const selectedProgramData = programs.find((p) => p.account_id === selectedProgram)

  const handleProgramSelect = (programId: string) => {
    setSelectedProgram(programId)
    setStep("amount")
  }

  const handleAmountSubmit = () => {
    if (donationAmount && Number.parseFloat(donationAmount) > 0) {
      setStep("payment")
    }
  }

  // ----- XRPL direct (non-Stripe) path -----
  const handlePayXRPL = async () => {
    setIsProcessing(true)
    setStep("processing")
    try {
      const res = await fetch("/api/payments/xrpl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number.parseFloat(donationAmount),
          programId: selectedProgram,
          email,
        }),
      })
      if (!res.ok) throw new Error("XRPL payment failed")
      const { donationId, txHash } = await res.json()

      setDonationResult({
        donationId,
        blockchainId: txHash,
        amount: Number.parseFloat(donationAmount),
        program: selectedProgramData?.name || "",
        paymentMethod: "Ripple (XRPL)",
      })
      setStep("complete")
      onDonationComplete?.(donationId, txHash)
    } catch (e) {
      alert(e instanceof Error ? e.message : "XRPL payment failed")
      setStep("payment")
    } finally {
      setIsProcessing(false)
    }
  }

  // ----- ✅ NEW: call fulfill route after Stripe confirms card -----
  const handleStripeConfirmed = async (paymentIntentId: string) => {
    setIsProcessing(true)
    setStep("processing")
    try {
      const r = await fetch("/api/payments/fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIntentId,
          // If your FastAPI/docs don’t return an address per program yet,
          // you can still pass one if present; otherwise your fulfill route
          overrideAddress: selectedProgramData?.xrpl_address || undefined,
        }),
      })
      const data = await r.json()
      console.log(data);
      if (!r.ok) throw new Error(data.error || "Fulfillment failed")

      setDonationResult({
        donationId: paymentIntentId,
        blockchainId: data.txHash,
        amount: Number.parseFloat(donationAmount),
        program: selectedProgramData?.name || "",
        paymentMethod: "Credit Card",
      })
      setStep("complete")
      onDonationComplete?.(paymentIntentId, data.txHash)
    } catch (err: any) {
      console.error("Fulfill failed:", err)
      alert(err?.message || "Sending XRP failed")
      setStep("payment")
    } finally {
      setIsProcessing(false)
    }
  }

  const resetForm = () => {
    setStep("select")
    setSelectedProgram("")
    setDonationAmount("")
    setEmail("")
    setPaymentMethod("card")
    setDonationResult(null)
  }

  // ----- UI -----
  if (step === "select") {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-2xl font-bold mb-2">Choose a Program to Support</h3>
          <p className="text-muted-foreground">Select an active NGO program where your donation will make an immediate impact</p>
        </div>

        {isLoadingPrograms ? (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading available programs...</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {programs.map((program) => (
              <Card
                key={program.account_id}
                className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary/50"
                onClick={() => handleProgramSelect(program.account_id)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{program.name}</CardTitle>
                    <Badge variant="default">{program.status}</Badge>
                  </div>
                  <CardDescription>{program.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Goal</span>
                      <span className="font-medium">{program.goal}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Total Donations</span>
                      <span>${program.lifetime_donations.toLocaleString()}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Established: {new Date(program.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {programs.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">No active programs available at the moment.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    )
  }

  if (step === "amount") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Donation Amount</CardTitle>
          <CardDescription>Supporting: {selectedProgramData?.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[25, 50, 100].map((amount) => (
                <Button
                  key={amount}
                  variant={donationAmount === amount.toString() ? "default" : "outline"}
                  onClick={() => setDonationAmount(amount.toString())}
                >
                  ${amount}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="custom-amount">Custom Amount ($)</Label>
              <Input
                id="custom-amount"
                type="number"
                placeholder="Enter custom amount"
                value={donationAmount}
                onChange={(e) => setDonationAmount(e.target.value)}
                min="1"
              />
            </div>
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              <strong>100% Transparent:</strong> You'll receive a blockchain reference ID to track exactly how your $
              {donationAmount || "0"} is used.
            </AlertDescription>
          </Alert>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("select")}>
              Back
            </Button>
            <Button
              className="flex-1"
              onClick={handleAmountSubmit}
              disabled={!donationAmount || Number.parseFloat(donationAmount) <= 0}
            >
              Continue to Payment
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  } // ← make sure this brace closes the amount block EXACTLY here

  if (step === "payment") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Payment Details</CardTitle>
          <CardDescription>
            Donating ${donationAmount} to {selectedProgramData?.name}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-3">
              <Label>Payment Method</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={paymentMethod === "card" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("card")}
                  className="flex items-center gap-2 h-12"
                >
                  <CreditCard className="h-4 w-4" />
                  Credit/Debit Card
                </Button>
                <Button
                  variant={paymentMethod === "ripple" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("ripple")}
                  className="flex items-center gap-2 h-12"
                >
                  <Wallet className="h-4 w-4" />
                  Ripple (XRPL)
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address (for blockchain reference)</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">We'll send your blockchain tracking ID to this email</p>
            </div>

            {paymentMethod === "card" ? (
              <>

                <StripePay
                amountCents={Math.round(Number.parseFloat(donationAmount || "0") * 100)}
                currency="usd"
                programId={selectedProgram}
                email={email}
                ngoPublicKey={selectedProgramData?.xrpl_address ?? ""}  // uses mapped value
                onConfirmed={handleStripeConfirmed}
              />
              </>
            ) : (
              <Alert>
                <Wallet className="h-4 w-4" />
                <AlertDescription>
                  <strong>Ripple Payment:</strong> You’ll be redirected to complete the payment using your XRPL wallet.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              {paymentMethod === "card"
                ? "Your payment is processed via Stripe. We never touch raw card numbers."
                : "Your XRPL payment is secured by the Ripple blockchain. All transactions are publicly verifiable."}
            </AlertDescription>
          </Alert>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("amount")}>
              Back
            </Button>

            {paymentMethod === "ripple" && (
              <Button
                className="flex-1"
                onClick={handlePayXRPL}
                disabled={!email || isProcessing || !donationAmount}
              >
                {`Pay $${donationAmount} with XRPL`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step === "processing") {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h3 className="text-xl font-semibold">Processing Your Donation</h3>
            <div className="space-y-2 text-muted-foreground">
              {paymentMethod === "card" ? (
                <>
                  <p>✓ Payment confirmed with Stripe</p>
                  <p>✓ Sending XRP to NGO wallet…</p>
                  <p>⏳ Waiting for blockchain confirmation…</p>
                </>
              ) : (
                <>
                  <p>✓ Connecting to XRPL network…</p>
                  <p>✓ Broadcasting transaction…</p>
                  <p>⏳ Confirming on blockchain…</p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (step === "complete" && donationResult) {
    return (
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <CardTitle className="text-2xl text-green-600">Donation Successful!</CardTitle>
          <CardDescription>
            Thank you for your ${donationResult.amount} donation to {donationResult.program}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              <strong>Your Blockchain Reference ID:</strong>
              <br />
              <code className="text-xs font-mono break-all">{donationResult.blockchainId}</code>
            </AlertDescription>
          </Alert>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span>Donation ID:</span>
              <span className="font-mono">{donationResult.donationId}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount:</span>
              <span className="font-semibold">${donationResult.amount}</span>
            </div>
            <div className="flex justify-between">
              <span>Program:</span>
              <span>{donationResult.program}</span>
            </div>
            <div className="flex justify-between">
              <span>Payment Method:</span>
              <span>{donationResult.paymentMethod}</span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <Badge variant="default">Confirmed</Badge>
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              A confirmation email with your blockchain tracking ID has been sent to {email}.
            </AlertDescription>
          </Alert>

          <Button className="w-full" onClick={resetForm}>
            Make Another Donation
          </Button>
        </CardContent>
      </Card>
    )
  }

  return null
}
