"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Wallet } from "lucide-react"

export interface WalletDetailsProps {
  walletInfo: {
    recipientId: string
    publicKey: string
    balanceUsd?: number
    recipientBalance?: number
    remainingBalance?: number
  }
}

export function WalletDetails({ walletInfo }: WalletDetailsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          Wallet Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Recipient ID</p>
          <p className="font-mono break-all text-xs">{walletInfo.recipientId}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Public Key</p>
          <p className="font-mono break-all text-xs">{walletInfo.publicKey}</p>
        </div>
        <div className="space-y-2 pt-2 border-t">
          {typeof walletInfo.balanceUsd === "number" && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Wallet Balance (USD)</span>
              <Badge className="bg-green-600">
                ${walletInfo.balanceUsd.toFixed(2)}
              </Badge>
            </div>
          )}
          {typeof walletInfo.remainingBalance === "number" && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Remaining Balance (USD)</span>
              <Badge variant="secondary">
                ${walletInfo.remainingBalance.toFixed(2)}
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

