"use client"

import { useState } from "react"
import { VoucherInput } from "@/components/voucher-input"
import { VoucherDetails } from "@/components/voucher-details"
import { PayoutsDashboard } from "@/components/payouts-dashboard"
import { CashOutModal } from "@/components/cash-out-modal"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Store, Ticket, Wallet, TrendingUp } from "lucide-react"

interface VoucherData {
  id: string
  amount: string
  currency: string
  issuer: string
  recipient: string
  expiry: string
}

export default function StorePage() {
  const [currentVoucher, setCurrentVoucher] = useState<VoucherData | null>(null)
  const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false)

  const handleVoucherScanned = (voucher: VoucherData) => {
    setCurrentVoucher(voucher)
  }

  const handleRedeem = async (voucherId: string): Promise<string> => {
    // Simulate XRPL transaction
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Mock transaction hash
    const mockHash = "0x" + Math.random().toString(16).substr(2, 40)
    return mockHash
  }

  const handleCashOutClick = () => {
    setIsCashOutModalOpen(true)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Store className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Store Portal</h1>
                <p className="text-sm text-muted-foreground">XRPL Voucher System</p>
              </div>
            </div>
            <Badge variant="secondary" className="font-mono">
              Connected to XRPL
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="scan" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-8">
            <TabsTrigger value="scan" className="flex items-center gap-2">
              <Ticket className="h-4 w-4" />
              Enter Code
            </TabsTrigger>
            <TabsTrigger value="payouts" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Payouts
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scan" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <VoucherInput onVoucherScanned={handleVoucherScanned} />
            </div>
          </TabsContent>

          <TabsContent value="payouts" className="space-y-6">
            <PayoutsDashboard onCashOutClick={handleCashOutClick} />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Today's Volume</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">127.50 XRP</div>
                  <p className="text-xs text-muted-foreground">+12% from yesterday</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Vouchers Redeemed</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">23</div>
                  <p className="text-xs text-muted-foreground">+5 from yesterday</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Pending Payouts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">45.25 XRP</div>
                  <p className="text-xs text-muted-foreground">Ready to cash out</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <CashOutModal isOpen={isCashOutModalOpen} onClose={() => setIsCashOutModalOpen(false)} />
    </div>
  )
}
