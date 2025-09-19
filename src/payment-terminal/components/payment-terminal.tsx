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
import { postJson } from "@shared/http"

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
  storeId?: string
  programId?: string
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
    recipientId: string
    publicKey: string
    balanceUsd?: number
    recipientBalance?: number
  } | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

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
        console.log("Error checking for transaction:", error)
      }
    }

    const interval = currentStep === "idle" ? setInterval(checkForTransaction, 500) : null

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [currentStep])

  const handlePaymentComplete = () => {
    setCurrentStep("accepted")

    const audio = new Audio("/Happy.m4a")
    audio.play().catch(() => {
      console.log("Payment sound played")
    })

    setTimeout(() => {
      setCurrentStep("idle")
      setTransactionData(null)
      setWalletInfo(null)
      setPaymentError(null)
    }, 3000)
  }

  const handleCheckout = () => {
    setCurrentStep("verification")
    setPaymentError(null)
  }

  const handleVerificationResult = async (result: VerificationResult) => {
    if (result.success && result.publicKey && result.recipientId) {
      setPaymentError(null)
      try {
        // Get XRPL wallet balance (this is what we use for payment)
        const walletData = await postJson<{ balance_usd?: number }>("/wallets/balance-usd", {
          public_key: result.publicKey,
        })
        const walletBalance = walletData.balance_usd ?? 0

        // Check if recipient has sufficient XRPL wallet balance
        const transactionAmount = transactionData?.total || 0
        if (walletBalance < transactionAmount) {
          setPaymentError(`Insufficient wallet balance. Available: $${walletBalance.toFixed(2)}, Required: $${transactionAmount.toFixed(2)}`)
          setCurrentStep("checkout")
          return
        }

        setWalletInfo({
          recipientId: result.recipientId,
          publicKey: result.publicKey,
          balanceUsd: walletBalance,
          recipientBalance: walletBalance,  // Same as wallet balance since that's what matters
        })
        setCurrentStep("wallet")
      } catch (error) {
        console.error("Error fetching wallet/recipient data:", error)
        setPaymentError("Failed to verify account details. Please try again.")
        setCurrentStep("checkout")
      }
    } else {
      setPaymentError("Face verification failed. Please try again.")
      setCurrentStep("checkout")
    }
  }

  const handleWalletConfirm = async () => {
    if (!transactionData || !walletInfo) return
    
    setCurrentStep("processing")
    setPaymentError(null)

    try {
      // Call the /redeem endpoint to process the actual payment
      const redeemData = await postJson<{ status: string }>("/redeem", {
        voucher_id: transactionData.transactionId || `voucher_${Date.now()}`,
        store_id: transactionData.storeId || "store_001",
        recipient_id: walletInfo.recipientId,
        program_id: transactionData.programId || "general_aid",
        amount_minor: Math.round(transactionData.total * 100),
        currency: "USD",
      })
      console.log("Payment processed successfully:", redeemData)
      
      // Payment successful
      handlePaymentComplete()
    } catch (error) {
      console.error("Payment processing failed:", error)
      setPaymentError(error instanceof Error ? error.message : "Payment processing failed. Please try again.")
      setCurrentStep("wallet")
    }
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
                <CameraView 
                  currentStep={currentStep} 
                  onVerificationComplete={handleVerificationResult} 
                />
              </CardContent>
            </Card>
          </div>
        )}

        <div className={`space-y-6 ${currentStep === "verification" ? "" : "lg:col-span-3"}`}>
          {paymentError && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-red-800">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">{paymentError}</span>
                </div>
              </CardContent>
            </Card>
          )}
          {transactionData && <TransactionSummary transactionData={transactionData} currentStep={currentStep} />}
          {walletInfo && currentStep === "wallet" && <WalletDetails walletInfo={walletInfo} />}

          <PaymentActions
            currentStep={currentStep}
            onStepChange={(step: string) => setCurrentStep(step as TerminalStep)}
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
