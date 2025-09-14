"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Ticket, CheckCircle, Search, Wallet, AlertTriangle } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface VoucherData {
  id: string
  amount: string            // (optional: original grant) kept for backward-compat
  currency: string          // "XRP"
  issuer: string
  recipient: string
  expiry: string            // "YYYY-MM-DD"
  balanceXrp: string        // remaining balance in XRP, e.g. "150.00"
}

interface VoucherInputProps {
  onVoucherScanned: (voucher: VoucherData) => void
  // Optional: if you want the withdraw to hit your backend:
  onWithdraw?: (payload: {
    voucherId: string
    debitXrp: string
    fiatAmount: string
    fiatCurrency: string
  }) => Promise<{ newBalanceXrp: string; xrplTxHash?: string }>
}

export function VoucherInput({ onVoucherScanned, onWithdraw }: VoucherInputProps) {
  const [voucherCode, setVoucherCode] = useState("")
  const [foundVoucher, setFoundVoucher] = useState<VoucherData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Withdraw UI state
  const [fiatAmount, setFiatAmount] = useState("")
  const [fiatCurrency, setFiatCurrency] = useState("USD")
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawMsg, setWithdrawMsg] = useState<string | null>(null)

  // Demo FX rates: 1 FIAT ≈ N XRP. Replace with live rates.
  const RATES: Record<string, number> = { USD: 2.0, CAD: 2.6, EUR: 1.8, GBP: 1.5 }

  const xrpToDebit = useMemo(() => {
    const n = parseFloat(fiatAmount)
    const rate = RATES[fiatCurrency] ?? 2.0
    if (!foundVoucher || isNaN(n) || n <= 0) return ""
    return (n * rate).toFixed(6)
  }, [fiatAmount, fiatCurrency, foundVoucher])

  const newBalancePreview = useMemo(() => {
    if (!foundVoucher || !xrpToDebit) return ""
    const curr = parseFloat(foundVoucher.balanceXrp)
    const debit = parseFloat(xrpToDebit)
    if (isNaN(curr) || isNaN(debit)) return ""
    return (curr - debit).toFixed(6)
  }, [foundVoucher, xrpToDebit])

  const lookupVoucher = async () => {
    if (!voucherCode.trim()) {
      setError("Please enter a voucher code")
      return
    }

    setIsLoading(true)
    setError(null)
    setWithdrawMsg(null)

    try {
      // Simulate API lookup
      await new Promise((resolve) => setTimeout(resolve, 800))

      // Basic mock validation
      if (voucherCode.length < 6) throw new Error("Invalid voucher code format")

      // Mock voucher (now includes a remaining balance)
      const mock: VoucherData = {
        id: voucherCode.toUpperCase(),
        amount: "200.00",
        currency: "XRP",
        issuer: "NGO Foundation",
        recipient: "Store Voucher",
        expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        balanceXrp: "150.000000",
      }

      setFoundVoucher(mock)
      onVoucherScanned(mock)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voucher not found")
      setFoundVoucher(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") lookupVoucher()
  }

  const resetForm = () => {
    setVoucherCode("")
    setFoundVoucher(null)
    setError(null)
    setFiatAmount("")
    setFiatCurrency("USD")
    setWithdrawMsg(null)
  }

  const withdraw = async () => {
    if (!foundVoucher) return
    setWithdrawMsg(null)

    const n = parseFloat(fiatAmount)
    const debitXrp = xrpToDebit
    if (!debitXrp || isNaN(n) || n <= 0) {
      setWithdrawMsg("Enter a valid amount.")
      return
    }

    const currBal = parseFloat(foundVoucher.balanceXrp)
    const debit = parseFloat(debitXrp)
    if (debit > currBal) {
      setWithdrawMsg("Amount exceeds remaining balance.")
      return
    }

    setWithdrawing(true)
    try {
      if (onWithdraw) {
        // Send to backend: it should verify + submit XRPL tx + return new balance
        const res = await onWithdraw({
          voucherId: foundVoucher.id,
          debitXrp,
          fiatAmount: n.toFixed(2),
          fiatCurrency,
        })
        setFoundVoucher({ ...foundVoucher, balanceXrp: res.newBalanceXrp })
        setWithdrawMsg("Withdrawal successful.")
      } else {
        // Client-side demo path: just subtract locally
        const newBal = (currBal - debit).toFixed(6)
        setFoundVoucher({ ...foundVoucher, balanceXrp: newBal })
        setWithdrawMsg("Withdrawal simulated.")
      }
      setFiatAmount("")
    } catch {
      setWithdrawMsg("Withdrawal failed. Please try again.")
    } finally {
      setWithdrawing(false)
    }
  }

  const isExpired =
    !!foundVoucher &&
    (foundVoucher.expiry < new Date().toISOString().slice(0, 10))

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-bold">
          <Ticket className="h-5 w-5" />
          Enter Voucher Code
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {!foundVoucher && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Input
                placeholder="Enter voucher code (e.g., VCH-ABC123)"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value)}
                onKeyDown={handleKeyDown}
                className="font-mono text-center text-lg"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground text-center">
                Enter the voucher code provided by the recipient
              </p>
            </div>

            <Button
              onClick={lookupVoucher}
              className="w-full font-semibold"
              disabled={isLoading || !voucherCode.trim()}
            >
              {isLoading ? (
                <>
                  <Search className="h-4 w-4 mr-2 animate-spin" />
                  Looking up...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Lookup Voucher
                </>
              )}
            </Button>
          </div>
        )}

        {foundVoucher && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-semibold">Voucher Found</span>
            </div>

            <div className="space-y-2 p-4 bg-card rounded-lg border">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Voucher ID</span>
                <Badge variant="secondary" className="font-mono text-xs">
                  {foundVoucher.id}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Issuer</span>
                <span className="text-sm">{foundVoucher.issuer}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Expires</span>
                <span className={`text-sm ${isExpired ? "text-destructive font-semibold" : ""}`}>
                  {foundVoucher.expiry}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Remaining</span>
                <span className="font-semibold">{foundVoucher.balanceXrp} XRP</span>
              </div>
              {isExpired && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Voucher is not redeemable.</span>
                </div>
              )}
            </div>

            {/* Withdraw section */}
            {!isExpired && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  <span className="font-medium">Withdraw to store (enter local currency)</span>
                </div>

                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Amount (e.g., 25.00)"
                    value={fiatAmount}
                    onChange={(e) => setFiatAmount(e.target.value)}
                  />
                  <Select value={fiatCurrency} onValueChange={setFiatCurrency}>
                    <SelectTrigger className="w-28">
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD</SelectItem>
                      <SelectItem value="CAD">CAD</SelectItem>
                      <SelectItem value="EUR">EUR</SelectItem>
                      <SelectItem value="GBP">GBP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Conversion + new balance preview */}
                <div className="text-sm text-muted-foreground">
                  {!!xrpToDebit && !isNaN(parseFloat(xrpToDebit)) && (
                    <div className="flex justify-between">
                      <span>
                        {parseFloat(fiatAmount || "0").toFixed(2)} {fiatCurrency} ≈
                      </span>
                      <span className="font-semibold">{xrpToDebit} XRP</span>
                    </div>
                  )}
                  {!!newBalancePreview && (
                    <div className="flex justify-between">
                      <span>New balance (preview):</span>
                      <span className="font-semibold">{newBalancePreview} XRP</span>
                    </div>
                  )}
                </div>

                <Button
                  onClick={withdraw}
                  className="w-full font-semibold"
                  disabled={
                    withdrawing ||
                    !xrpToDebit ||
                    parseFloat(xrpToDebit || "0") <= 0
                  }
                >
                  {withdrawing ? "Withdrawing…" : "Withdraw"}
                </Button>

                {withdrawMsg && (
                  <p
                    className={`text-sm ${
                      /success|simulated/i.test(withdrawMsg) ? "text-green-600" : "text-destructive"
                    }`}
                  >
                    {withdrawMsg}
                  </p>
                )}

                <Button onClick={resetForm} variant="outline" className="w-full bg-transparent">
                  Enter Another Code
                </Button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
