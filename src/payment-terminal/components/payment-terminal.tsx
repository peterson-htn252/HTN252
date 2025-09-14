"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CameraView, type VerificationResult } from "@/components/camera-view"
import { TransactionSummary } from "@/components/transaction-summary"
import { PaymentActions } from "@/components/payment-actions"
import { PaymentAccepted } from "@/components/payment-accepted"
import { CustomerIdleScreen } from "@/components/customer-idle-screen"
import { WalletDetails } from "@/components/wallet-details"
import { CreditCard, Shield, Clock } from "lucide-react"

export interface CheckoutItem {
  id: string
  name: string
  price: number
  quantity: number
}

export interface TransactionData {
  vendorName: string
  items: CheckoutItem[]
  total: number
  transactionId?: string
}

type TerminalStep =
  | "idle"
  | "checkout"
  | "verification"
  | "wallet"
  | "processing"
  | "accepted"

export function PaymentTerminal() {
  const [currentStep, setCurrentStep] = useState<TerminalStep>("idle")
  const [transactionData, setTransactionData] = useState<TransactionData | null>(null)
  const [vendorName, setVendorName] = useState("Block Terminal")
  const [walletInfo, setWalletInfo] = useState<{
    accountId: string
    publicKey: string
    balanceUsd?: number
  } | null>(null)

  useEffect(() => {
    const checkForTransaction = async () => {
      try {
        const response = await fetch("/api/checkout/status")
        if (response.ok) {
          const data = await response.json()
          if (data.transaction) {
            setTransactionData(data.transaction)
            setVendorName(data.transaction.vendorName)
            setCurrentStep("checkout")
          }
        }
      } catch (error) {
        console.log("[v0] Error checking for transaction:", error)
      }
    }

    const interval = currentStep === "idle" ? setInterval(checkForTransaction, 2000) : null

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [currentStep])

  const handlePaymentComplete = () => {
    setCurrentStep("accepted")

    const audio = new Audio("/payment-success.mp3")
    audio.play().catch(() => {
      console.log("[v0] Payment sound played")
    })

    setTimeout(() => {
      setCurrentStep("idle")
      setTransactionData(null)
      setWalletInfo(null)
    }, 3000)
  }

  const handleCheckout = () => {
    setCurrentStep("verification")
  }

  const handleVerificationResult = async (result: VerificationResult) => {
    if (result.success && result.publicKey && result.accountId) {
      try {
        const res = await fetch("http://localhost:8000/wallets/balance-usd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_key: result.publicKey }),
        })
        const data = await res.json().catch(() => ({}))
        setWalletInfo({
          accountId: result.accountId,
          publicKey: result.publicKey,
          balanceUsd: data.balance_usd,
        })
      } catch {
        setWalletInfo({ accountId: result.accountId, publicKey: result.publicKey })
      }
      setCurrentStep("wallet")
    } else {
      setCurrentStep("checkout")
    }
  }

  const handleWalletConfirm = () => {
    setCurrentStep("processing")
  }

  if (currentStep === "idle") {
    return <CustomerIdleScreen vendorName={vendorName} />
  }

  if (currentStep === "accepted") {
    return <PaymentAccepted vendorName={vendorName} amount={transactionData?.total || 0} />
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <header className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{vendorName}</h1>
              <p className="text-sm text-muted-foreground">Customer Checkout Terminal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-card">
              <Shield className="w-3 h-3 mr-1" />
              Secure
            </Badge>
            <Badge variant="outline" className="bg-card">
              <Clock className="w-3 h-3 mr-1" />
              Online
            </Badge>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {currentStep === "verification" && (
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">Customer Verification</CardTitle>
              </CardHeader>
              <CardContent>
                <CameraView currentStep={currentStep} onVerificationComplete={handleVerificationResult} />
              </CardContent>
            </Card>
          </div>
        )}

        <div className={`space-y-6 ${currentStep === "verification" ? "" : "lg:col-span-3"}`}>
          {transactionData && <TransactionSummary transactionData={transactionData} currentStep={currentStep} />}
          {walletInfo && currentStep === "wallet" && <WalletDetails walletInfo={walletInfo} />}

          <PaymentActions
            currentStep={currentStep}
            onStepChange={setCurrentStep}
            onCheckout={handleCheckout}
            onPaymentComplete={handlePaymentComplete}
            onWalletConfirm={handleWalletConfirm}
            transactionData={transactionData}
          />
        </div>
      </div>
    </div>
  )
}
