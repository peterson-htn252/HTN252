"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Wallet } from "lucide-react"

interface WalletDetailsProps {
  walletInfo: {
    publicKey: string
    balanceUsd?: number
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
          <p className="text-sm text-muted-foreground">Public Key</p>
          <p className="font-mono break-all text-xs">{walletInfo.publicKey}</p>
        </div>
        {typeof walletInfo.balanceUsd === "number" && (
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">Balance (USD)</span>
            <Badge variant="secondary">
              ${walletInfo.balanceUsd.toFixed(2)}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

