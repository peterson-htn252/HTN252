"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Receipt, Clock, Package } from "lucide-react"
import type { TransactionData } from "./payment-terminal"

interface TransactionSummaryProps {
  transactionData: TransactionData
  currentStep: string
  walletDetails?: any
}

export function TransactionSummary({ transactionData, currentStep, walletDetails }: TransactionSummaryProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value)
  }

  const getTransactionStatus = () => {
    switch (currentStep) {
      case "checkout":
        return { label: "Ready", color: "secondary" as const }
      case "verification":
        return { label: "Verifying", color: "default" as const }
      case "wallet":
        return { label: "Verified", color: "secondary" as const }
      case "processing":
        return { label: "Processing", color: "default" as const }
      case "accepted":
        return { label: "Accepted", color: "secondary" as const }
      default:
        return { label: "Ready", color: "secondary" as const }
    }
  }

  const status = getTransactionStatus()
  const processingFee = transactionData.total * 0.029

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="w-5 h-5" />
          Transaction Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Package className="w-4 h-4" />
            Items ({transactionData.items.length})
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {transactionData.items.map((item) => (
              <div key={item.id} className="flex justify-between items-center text-sm">
                <div className="flex-1">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground ml-2">×{item.quantity}</span>
                </div>
                <span className="font-medium">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction Details */}
        <div className="space-y-3 pt-4 border-t border-border">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatCurrency(transactionData.total)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Processing Fee</span>
            <span className="font-medium">{formatCurrency(processingFee)}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <span className="font-semibold">Total</span>
            <span className="text-xl font-bold text-primary">
              {formatCurrency(transactionData.total + processingFee)}
            </span>
          </div>
        </div>

        {walletDetails && (
          <div className="space-y-3 pt-4 border-t border-border">
          {(walletDetails.accountId || walletDetails.account_id) && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Account</span>
              <span className="font-medium">{walletDetails.accountId || walletDetails.account_id}</span>
            </div>
          )}
          {walletDetails.balance !== undefined && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Balance</span>
              <span className="font-medium">${Number(walletDetails.balance).toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

        {/* Status */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Status</span>
          </div>
          <Badge variant={status.color}>{status.label}</Badge>
        </div>

        {/* Transaction ID */}
        {transactionData.transactionId && (
          <div className="text-center pt-2">
            <p className="text-xs text-muted-foreground">Transaction ID: {transactionData.transactionId}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
