"use client"

import { useState } from "react"
import { PayoutsDashboard } from "@/components/payouts-dashboard"
import { CashOutModal } from "@/components/cash-out-modal"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Store, Wallet, TrendingUp } from "lucide-react"

export default function StorePage() {
  const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false)

  const handleCashOutClick = () => setIsCashOutModalOpen(true)

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
                <p className="text-sm text-muted-foreground">XRPL Merchant Dashboard</p>
              </div>
            </div>
            <Badge variant="secondary" className="font-mono">Connected to XRPL</Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="payouts" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="payouts" className="flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Payouts
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

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
                  <CardTitle className="text-sm font-medium">Payouts Created</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">8</div>
                  <p className="text-xs text-muted-foreground">Past 24 hours</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Pending Balance</CardTitle>
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

      <CashOutModal
        isOpen={isCashOutModalOpen}
        onClose={() => setIsCashOutModalOpen(false)}
      />
    </div>
  )
}
