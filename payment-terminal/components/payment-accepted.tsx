"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { CheckCircle, CreditCard } from "lucide-react"

interface PaymentAcceptedProps {
  vendorName: string
  amount: number
}

export function PaymentAccepted({ vendorName, amount }: PaymentAcceptedProps) {
  const [showAnimation, setShowAnimation] = useState(false)

  useEffect(() => {
    // Trigger animation after component mounts
    setTimeout(() => setShowAnimation(true), 100)
  }, [])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <Card
        className={`w-full max-w-md p-8 text-center transition-all duration-1000 ${
          showAnimation ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        {/* Success Icon */}
        <div className="mb-6">
          <div
            className={`w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto transition-all duration-1000 ${
              showAnimation ? "scale-100 rotate-0" : "scale-0 rotate-180"
            }`}
          >
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
        </div>

        {/* Payment Accepted Message */}
        <div className="space-y-4 mb-8">
          <h1 className="text-3xl font-bold text-green-600">Payment Accepted</h1>
          <div className="space-y-2">
            <p className="text-2xl font-bold text-foreground">{formatCurrency(amount)}</p>
            <p className="text-muted-foreground">Transaction completed successfully</p>
          </div>
        </div>

        {/* Mastercard-style acceptance animation */}
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3 p-4 bg-muted/30 rounded-lg">
            <CreditCard className="w-6 h-6 text-muted-foreground" />
            <span className="font-medium">Mastercard ****1234</span>
            <div
              className={`w-6 h-6 rounded-full bg-green-500 flex items-center justify-center transition-all duration-500 ${
                showAnimation ? "scale-100" : "scale-0"
              }`}
            >
              <CheckCircle className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* Processing indicators */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Authorization</span>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </div>
            <div className="flex items-center justify-between">
              <span>Verification</span>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </div>
            <div className="flex items-center justify-between">
              <span>Settlement</span>
              <CheckCircle className="w-4 h-4 text-green-500" />
            </div>
          </div>
        </div>

        {/* Return message */}
        <div className="mt-8 pt-6 border-t border-border">
          <p className="text-sm text-muted-foreground">Returning to {vendorName} terminal...</p>
          <div className="flex justify-center mt-2">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
