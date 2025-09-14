"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { CreditCard, X, AlertTriangle } from "lucide-react"
import type { TransactionData } from "./payment-terminal"

interface PaymentActionsProps {
  currentStep: string
  onStepChange: (step: string) => void
  onCheckout: () => void
  onPaymentComplete: () => void
  transactionData: TransactionData | null
}

export function PaymentActions({
  currentStep,
  onStepChange,
  onCheckout,
  onPaymentComplete,
  transactionData,
}: PaymentActionsProps) {
  const [progress, setProgress] = useState(0)

  const handleProcessing = () => {
    let currentProgress = 0
    const interval = setInterval(() => {
      currentProgress += Math.random() * 15
      setProgress(Math.min(currentProgress, 100))

      if (currentProgress >= 100) {
        clearInterval(interval)
        setTimeout(() => {
          onPaymentComplete()
        }, 500)
      }
    }, 200)
  }

  if (currentStep === "processing" && progress === 0) {
    handleProcessing()
  }

  const handleCancel = () => {
    onStepChange("vendor")
    setProgress(0)
  }

  const renderActionButtons = () => {
    switch (currentStep) {
      case "checkout":
        return (
          <Button
            onClick={onCheckout}
            disabled={!transactionData}
            className="w-full h-12 text-lg font-semibold"
            size="lg"
          >
            <CreditCard className="w-5 h-5 mr-2" />
            Checkout - {transactionData ? `$${transactionData.total.toFixed(2)}` : "$0.00"}
          </Button>
        )

      case "verification":
        return (
          <div className="space-y-3">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6 text-accent animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">Please complete face verification</p>
            </div>
            <Button onClick={handleCancel} variant="outline" className="w-full bg-transparent">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        )

      case "processing":
        return (
          <div className="space-y-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-sm text-muted-foreground">Processing your payment...</p>
            </div>
            <Progress value={progress} className="w-full" />
            <p className="text-xs text-center text-muted-foreground">{Math.round(progress)}% complete</p>
          </div>
        )

      default:
        return (
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">Waiting for transaction...</p>
          </div>
        )
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-center">Payment Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderActionButtons()}

        {/* Security Notice */}
        <div className="text-center pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">🔒 Your payment is secured with end-to-end encryption</p>
        </div>
      </CardContent>
    </Card>
  )
}
