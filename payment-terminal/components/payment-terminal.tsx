"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  CameraView,
  type CameraViewHandle,
  type VerificationResult,
} from "@/components/camera-view"
import { TransactionSummary } from "@/components/transaction-summary"
import { PaymentActions } from "@/components/payment-actions"
import { PaymentAccepted } from "@/components/payment-accepted"
import { CustomerIdleScreen } from "@/components/customer-idle-screen"
import { WalletDetails, type WalletDetailsProps } from "@/components/wallet-details"
import { CreditCard, Shield, Clock } from "lucide-react"
import { API_BASE_URL } from "@/lib/config"

const DEFAULT_VENDOR_NAME = "Payment Terminal"

interface PaymentAuthorizationPayload {
  voucherId: string
  transactionId: string
  storeId: string
  programId: string
  amountMinor: number
  currency: string
  recipientId: string
}

interface PaymentTerminalMessageBase {
  scope: "payment-terminal"
  type?: string
}

interface CheckoutRequestMessage extends PaymentTerminalMessageBase {
  type: "checkout_request"
  transaction: TransactionData & { transactionId: string }
}

interface PaymentProcessedMessage extends PaymentTerminalMessageBase {
  type: "payment_processed"
  transactionId: string
  status: "success" | "error"
  result?: unknown
  error?: string
}

interface PaymentAuthorizedMessage extends PaymentTerminalMessageBase {
  type: "payment_authorized"
  transactionId: string
  payload: PaymentAuthorizationPayload
}

type TerminalInboundMessage = CheckoutRequestMessage | PaymentProcessedMessage

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
  const [vendorName, setVendorName] = useState(DEFAULT_VENDOR_NAME)
  const [walletInfo, setWalletInfo] = useState<WalletDetailsProps | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const storeWindowRef = useRef<Window | null>(null)
  const storeOriginRef = useRef<string | null>(null)
  const transactionRef = useRef<TransactionData | null>(null)
  const cameraRef = useRef<CameraViewHandle | null>(null)
  const autoCameraAttemptedRef = useRef(false)

  useEffect(() => {
    transactionRef.current = transactionData
  }, [transactionData])

  const sendMessageToStore = useCallback((message: PaymentTerminalMessageBase) => {
    if (!storeWindowRef.current) {
      return false
    }
    const targetOrigin = storeOriginRef.current ?? "*"
    try {
      storeWindowRef.current.postMessage(message, targetOrigin)
      return true
    } catch (error) {
      console.error("Failed to postMessage to store dashboard", error)
      return false
    }
  }, [])

  const handlePaymentComplete = useCallback(() => {
    const activeTransaction = transactionRef.current
    if (!activeTransaction) {
      setCurrentStep("idle")
      setVendorName(DEFAULT_VENDOR_NAME)
      setTransactionData(null)
      setWalletInfo(null)
      setPaymentError(null)
      return
    }

    cameraRef.current?.stop()
    setPaymentError(null)
    setCurrentStep("accepted")

    const audio = new Audio("/Happy.m4a")
    audio.play().catch(() => {
      console.log("Payment sound played")
    })

    setTimeout(() => {
      if (typeof window !== "undefined" && window.opener && !window.opener.closed) {
        window.close()
        return
      }

      setCurrentStep("idle")
      setTransactionData(null)
      transactionRef.current = null
      setWalletInfo(null)
      setPaymentError(null)
      setVendorName(DEFAULT_VENDOR_NAME)
    }, 3000)
  }, [])

  useEffect(() => {
    const inferOriginFromReferrer = () => {
      if (storeOriginRef.current || typeof document === "undefined") {
        return
      }
      if (!document.referrer) {
        return
      }
      try {
        const origin = new URL(document.referrer).origin
        storeOriginRef.current = origin
      } catch {
        // Ignore invalid referrers (e.g., about:blank)
      }
    }

    const handleInboundMessage = (event: MessageEvent) => {
      const incoming = event.data
      if (!incoming || typeof incoming !== "object") {
        return
      }

      const scopedMessage = incoming as Partial<PaymentTerminalMessageBase>
      if (scopedMessage.scope !== "payment-terminal") {
        return
      }

      if (event.origin && event.origin !== "null") {
        storeOriginRef.current = event.origin
      }
      if (event.source && "postMessage" in event.source) {
        storeWindowRef.current = event.source as Window
      }

      const typedMessage = incoming as Partial<TerminalInboundMessage>

      if (typedMessage.type === "checkout_request") {
        const checkoutMessage = incoming as CheckoutRequestMessage
        setTransactionData(checkoutMessage.transaction)
        transactionRef.current = checkoutMessage.transaction
        setVendorName(checkoutMessage.transaction.vendorName)
        setCurrentStep("checkout")
        setWalletInfo(null)
        setPaymentError(null)
        return
      }

      if (typedMessage.type === "payment_processed") {
        const processedMessage = incoming as PaymentProcessedMessage
        const activeTransaction = transactionRef.current
        if (!activeTransaction || activeTransaction.transactionId !== processedMessage.transactionId) {
          return
        }

        if (processedMessage.status === "success") {
          handlePaymentComplete()
          return
        }

        setPaymentError(processedMessage.error ?? "Payment failed. Please try again.")
        setCurrentStep("wallet")
      }
    }

    inferOriginFromReferrer()
    window.addEventListener("message", handleInboundMessage)

    if (typeof window !== "undefined" && window.opener) {
      storeWindowRef.current = window.opener
      inferOriginFromReferrer()
      sendMessageToStore({ scope: "payment-terminal", type: "terminal_ready" })
    }

    return () => {
      window.removeEventListener("message", handleInboundMessage)
    }
  }, [handlePaymentComplete, sendMessageToStore])

  const handleCheckout = () => {
    setCurrentStep("verification")
    setPaymentError(null)
  }

  useEffect(() => {
    if (currentStep !== "verification") {
      cameraRef.current?.stop()
      autoCameraAttemptedRef.current = false
      return
    }

    if (autoCameraAttemptedRef.current) {
      return
    }
    autoCameraAttemptedRef.current = true

    let cancelled = false
    const handle = cameraRef.current

    const startCamera = async () => {
      try {
        await handle?.start({ userInitiated: false })
        setPaymentError(null)
      } catch (error) {
        if (cancelled) {
          return
        }
        console.error("Camera start failed:", error)
        setPaymentError("Unable to access camera automatically. Please click 'Enable Camera'.")
        autoCameraAttemptedRef.current = false
      }
    }

    startCamera()

    return () => {
      cancelled = true
      handle?.stop()
    }
  }, [currentStep])

  const handleVerificationResult = async (result: VerificationResult) => {
    if (result.success && result.publicKey && result.recipientId) {
      setPaymentError(null)
      try {
        // Get XRPL wallet balance (this is what we use for payment)
        const walletRes = await fetch(`${API_BASE_URL}/wallets/balance-usd`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ public_key: result.publicKey }),
        })
        const walletData = await walletRes.json().catch(() => ({}))
        const walletBalance = walletData.balance_usd || 0

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
          remainingBalance: walletBalance - transactionAmount,
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

  const handleWalletConfirm = () => {
    const activeTransaction = transactionRef.current
    if (!activeTransaction || !walletInfo) {
      return
    }

    setCurrentStep("processing")
    setPaymentError(null)

    if (!storeWindowRef.current) {
      setPaymentError("Unable to reach the store dashboard. Please restart the checkout from the store.")
      setCurrentStep("wallet")
      return
    }

    const payload: PaymentAuthorizationPayload = {
      voucherId: activeTransaction.transactionId ?? `voucher_${Date.now()}`,
      transactionId: activeTransaction.transactionId ?? `txn_${Date.now()}`,
      storeId: activeTransaction.storeId || "store_001",
      programId: activeTransaction.programId || "general_aid",
      amountMinor: Math.round((activeTransaction.total || 0) * 100),
      currency: "USD",
      recipientId: walletInfo.recipientId,
    }

    const message: PaymentAuthorizedMessage = {
      scope: "payment-terminal",
      type: "payment_authorized",
      transactionId: payload.transactionId,
      payload,
    }

    const posted = sendMessageToStore(message)
    if (!posted) {
      setPaymentError("Unable to notify the store dashboard. Please retry from the store.")
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
                  ref={cameraRef}
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
            onWalletConfirm={handleWalletConfirm}
            transactionData={transactionData}
          />
        </div>
      </div>
    </div>
  )
}
