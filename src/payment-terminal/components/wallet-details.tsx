"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Wallet } from "lucide-react"

interface WalletDetailsProps {
  walletInfo: {
    accountId: string
    publicKey: string
    balanceUsd?: number
    recipientBalance?: number
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
          <p className="text-sm text-muted-foreground">Account ID</p>
          <p className="font-mono break-all text-xs">{walletInfo.accountId}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Public Key</p>
          <p className="font-mono break-all text-xs">{walletInfo.publicKey}</p>
        </div>
        <div className="space-y-2 pt-2 border-t">
          {typeof walletInfo.recipientBalance === "number" && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Voucher Balance</span>
              <Badge variant="default" className="bg-green-600">
                ${walletInfo.recipientBalance.toFixed(2)}
              </Badge>
            </div>
          )}
          {typeof walletInfo.balanceUsd === "number" && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Wallet Balance (USD)</span>
              <Badge variant="secondary">
                ${walletInfo.balanceUsd.toFixed(2)}
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

