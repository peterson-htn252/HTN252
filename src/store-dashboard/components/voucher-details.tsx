"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { CheckCircle, Clock, AlertCircle, ExternalLink } from "lucide-react"

interface VoucherData {
  id: string
  amount: string
  currency: string
  issuer: string
  recipient: string
  expiry: string
}

interface VoucherDetailsProps {
  voucher: VoucherData
  onRedeem: (voucherId: string) => Promise<string>
}

export function VoucherDetails({ voucher, onRedeem }: VoucherDetailsProps) {
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [redeemStatus, setRedeemStatus] = useState<"pending" | "success" | "error" | null>(null)
  const [transactionHash, setTransactionHash] = useState<string | null>(null)

  const handleRedeem = async () => {
    setIsRedeeming(true)
    setRedeemStatus("pending")

    try {
      const txHash = await onRedeem(voucher.id)
      setTransactionHash(txHash)
      setRedeemStatus("success")
    } catch (error) {
      setRedeemStatus("error")
    } finally {
      setIsRedeeming(false)
    }
  }

  const isExpired = new Date(voucher.expiry) < new Date()

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="font-bold">Voucher Details</span>
          <Badge variant={isExpired ? "destructive" : "secondary"} className="font-mono text-xs">
            {voucher.id}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Amount Display */}
        <div className="text-center p-6 bg-card rounded-lg border">
          <div className="text-3xl font-bold text-primary mb-2">
            {voucher.amount} {voucher.currency}
          </div>
          <div className="text-sm text-muted-foreground">Voucher Value</div>
        </div>

        {/* Voucher Information */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Issued by</span>
            <span className="text-sm font-medium">{voucher.issuer}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Recipient</span>
            <span className="text-sm font-medium">{voucher.recipient}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Expires</span>
            <div className="flex items-center gap-2">
              {isExpired ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={`text-sm ${isExpired ? "text-destructive" : ""}`}>{voucher.expiry}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Redemption Status */}
        {redeemStatus === "success" && transactionHash && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-semibold">Redemption Successful!</span>
            </div>

            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="text-sm text-green-800 mb-2">Transaction Hash:</div>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-green-100 px-2 py-1 rounded font-mono break-all">{transactionHash}</code>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {redeemStatus === "error" && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive mb-2">
              <AlertCircle className="h-4 w-4" />
              <span className="font-semibold">Redemption Failed</span>
            </div>
            <p className="text-sm text-destructive">Unable to process voucher. Please try again or contact support.</p>
          </div>
        )}

        {/* Redeem Button */}
        {redeemStatus !== "success" && (
          <Button
            onClick={handleRedeem}
            disabled={isRedeeming || isExpired || redeemStatus === "pending"}
            className="w-full font-semibold"
            size="lg"
          >
            {isRedeeming ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                Processing...
              </div>
            ) : isExpired ? (
              "Voucher Expired"
            ) : (
              "Redeem Voucher"
            )}
          </Button>
        )}

        {redeemStatus === "pending" && (
          <div className="text-center text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              Confirming transaction on XRPL...
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
