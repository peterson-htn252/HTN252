"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ExternalLink,
  Search,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Users,
  MapPin,
  Hash,
  TrendingUp,
  Shield,
} from "lucide-react"

interface BlockchainTransaction {
  id: string
  hash: string
  type: "donation" | "allocation" | "distribution" | "redemption"
  amount: number
  currency: string
  timestamp: string
  status: "confirmed" | "pending" | "failed"
  from: string
  to: string
  description: string
  gasUsed?: number
  blockNumber?: number
}

interface DonationTracking {
  donationId: string
  blockchainId: string
  amount: number
  program: string
  donor: string
  status: "received" | "allocated" | "distributed" | "completed"
  transactions: BlockchainTransaction[]
  recipients: {
    id: string
    location: string
    amount: number
    status: "pending" | "received" | "redeemed"
    redeemedAt?: string
  }[]
  ngoOperationalCosts: {
    amount: number
    percentage: number
    breakdown: {
      category: string
      amount: number
      description: string
    }[]
  }
}

const mockTrackingData: DonationTracking = {
  donationId: "DON-1704067200000",
  blockchainId: "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12",
  amount: 100,
  program: "Typhoon Relief Program",
  donor: "Anonymous Donor",
  status: "distributed",
  transactions: [
    {
      id: "1",
      hash: "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12",
      type: "donation",
      amount: 100,
      currency: "USD",
      timestamp: "2024-01-15T10:00:00Z",
      status: "confirmed",
      from: "Donor Wallet",
      to: "Program Pool",
      description: "Initial donation received",
      gasUsed: 21000,
      blockNumber: 18950123,
    },
    {
      id: "2",
      hash: "0x2b3c4d5e6f7890abcdef1234567890abcdef1234",
      type: "allocation",
      amount: 95,
      currency: "USD",
      timestamp: "2024-01-15T11:30:00Z",
      status: "confirmed",
      from: "Program Pool",
      to: "Distribution Wallet",
      description: "Funds allocated for distribution (5% operational costs)",
      gasUsed: 35000,
      blockNumber: 18950145,
    },
    {
      id: "3",
      hash: "0x3c4d5e6f7890abcdef1234567890abcdef123456",
      type: "distribution",
      amount: 95,
      currency: "USD",
      timestamp: "2024-01-15T14:00:00Z",
      status: "confirmed",
      from: "Distribution Wallet",
      to: "Voucher System",
      description: "5 vouchers issued to beneficiaries",
      gasUsed: 45000,
      blockNumber: 18950234,
    },
    {
      id: "4",
      hash: "0x4d5e6f7890abcdef1234567890abcdef12345678",
      type: "redemption",
      amount: 76,
      currency: "USD",
      timestamp: "2024-01-16T09:15:00Z",
      status: "confirmed",
      from: "Voucher System",
      to: "Local Merchants",
      description: "4 of 5 vouchers redeemed at local stores",
      gasUsed: 28000,
      blockNumber: 18951456,
    },
  ],
  recipients: [
    {
      id: "1",
      location: "Manila, Philippines",
      amount: 19,
      status: "redeemed",
      redeemedAt: "2024-01-16T08:30:00Z",
    },
    {
      id: "2",
      location: "Cebu, Philippines",
      amount: 19,
      status: "redeemed",
      redeemedAt: "2024-01-16T09:15:00Z",
    },
    {
      id: "3",
      location: "Davao, Philippines",
      amount: 19,
      status: "redeemed",
      redeemedAt: "2024-01-16T10:45:00Z",
    },
    {
      id: "4",
      location: "Iloilo, Philippines",
      amount: 19,
      status: "redeemed",
      redeemedAt: "2024-01-16T11:20:00Z",
    },
    {
      id: "5",
      location: "Baguio, Philippines",
      amount: 19,
      status: "pending",
    },
  ],
  ngoOperationalCosts: {
    amount: 5,
    percentage: 5,
    breakdown: [
      {
        category: "Transaction Fees",
        amount: 2,
        description: "Blockchain transaction costs and gas fees",
      },
      {
        category: "Platform Operations",
        amount: 2,
        description: "System maintenance and monitoring",
      },
      {
        category: "Verification & Audit",
        amount: 1,
        description: "Third-party verification and compliance",
      },
    ],
  },
}

interface BlockchainTrackerProps {
  initialTrackingId?: string
}

export function BlockchainTracker({ initialTrackingId }: BlockchainTrackerProps) {
  const [trackingId, setTrackingId] = useState(initialTrackingId || "")
  const [trackingData, setTrackingData] = useState<DonationTracking | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!trackingId.trim()) return

    setIsLoading(true)
    setError(null)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))

    if (trackingId === mockTrackingData.blockchainId || trackingId === mockTrackingData.donationId) {
      setTrackingData(mockTrackingData)
    } else {
      setError("Tracking ID not found. Please check your blockchain reference ID or donation ID.")
    }

    setIsLoading(false)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
      case "redeemed":
      case "completed":
        return "text-green-600"
      case "pending":
        return "text-yellow-600"
      case "failed":
        return "text-red-600"
      default:
        return "text-muted-foreground"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
      case "redeemed":
      case "completed":
        return <CheckCircle className="h-4 w-4" />
      case "pending":
        return <Clock className="h-4 w-4" />
      case "failed":
        return <AlertCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Track Your Donation
          </CardTitle>
          <CardDescription>
            Enter your blockchain reference ID or donation ID to see exactly how your money is being used
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter blockchain ID (0x...) or donation ID (DON-...)"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isLoading || !trackingId.trim()}>
              {isLoading ? "Searching..." : "Track"}
            </Button>
          </div>

          {error && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="text-sm text-muted-foreground">
            <p className="mb-2">Try these sample IDs:</p>
            <div className="space-y-1">
              <button
                className="block text-primary hover:underline font-mono text-xs"
                onClick={() => setTrackingId(mockTrackingData.blockchainId)}
              >
                {mockTrackingData.blockchainId}
              </button>
              <button
                className="block text-primary hover:underline font-mono text-xs"
                onClick={() => setTrackingId(mockTrackingData.donationId)}
              >
                {mockTrackingData.donationId}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tracking Results */}
      {trackingData && (
        <div className="space-y-6">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Donation Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <DollarSign className="h-8 w-8 text-primary mx-auto mb-2" />
                  <p className="text-2xl font-bold">${trackingData.amount}</p>
                  <p className="text-sm text-muted-foreground">Total Donated</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Users className="h-8 w-8 text-primary mx-auto mb-2" />
                  <p className="text-2xl font-bold">{trackingData.recipients.length}</p>
                  <p className="text-sm text-muted-foreground">Recipients</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <TrendingUp className="h-8 w-8 text-primary mx-auto mb-2" />
                  <p className="text-2xl font-bold">
                    {trackingData.recipients.filter((r) => r.status === "redeemed").length}
                  </p>
                  <p className="text-sm text-muted-foreground">Redeemed</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Hash className="h-8 w-8 text-primary mx-auto mb-2" />
                  <p className="text-2xl font-bold">{trackingData.transactions.length}</p>
                  <p className="text-sm text-muted-foreground">Transactions</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="transactions" className="space-y-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="recipients">Recipients</TabsTrigger>
              <TabsTrigger value="costs">NGO Costs</TabsTrigger>
              <TabsTrigger value="verification">Verification</TabsTrigger>
            </TabsList>

            {/* Blockchain Transactions */}
            <TabsContent value="transactions">
              <Card>
                <CardHeader>
                  <CardTitle>Blockchain Transaction History</CardTitle>
                  <CardDescription>Complete audit trail of your donation on the XRPL blockchain</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {trackingData.transactions.map((tx, index) => (
                      <div key={tx.id} className="flex items-start gap-4 p-4 border rounded-lg">
                        <div className={`mt-1 ${getStatusColor(tx.status)}`}>{getStatusIcon(tx.status)}</div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium capitalize">{tx.type}</h4>
                            <Badge variant="outline" className={getStatusColor(tx.status)}>
                              {tx.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{tx.description}</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
                            <div>
                              <span className="font-medium">Amount:</span> ${tx.amount} {tx.currency}
                            </div>
                            <div>
                              <span className="font-medium">Block:</span> #{tx.blockNumber}
                            </div>
                            <div>
                              <span className="font-medium">Gas:</span> {tx.gasUsed?.toLocaleString()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{tx.hash}</code>
                            <Button size="sm" variant="outline">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View on Explorer
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Recipients */}
            <TabsContent value="recipients">
              <Card>
                <CardHeader>
                  <CardTitle>Aid Recipients</CardTitle>
                  <CardDescription>See exactly who received help from your donation</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {trackingData.recipients.map((recipient, index) => (
                      <div key={recipient.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              recipient.status === "redeemed" ? "bg-green-500" : "bg-yellow-500"
                            }`}
                          />
                          <div>
                            <p className="font-medium">Recipient #{recipient.id}</p>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {recipient.location}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">${recipient.amount}</p>
                          <div className="flex items-center gap-1 text-sm">
                            {recipient.status === "redeemed" ? (
                              <>
                                <CheckCircle className="h-3 w-3 text-green-500" />
                                <span className="text-green-600">Redeemed</span>
                              </>
                            ) : (
                              <>
                                <Clock className="h-3 w-3 text-yellow-500" />
                                <span className="text-yellow-600">Pending</span>
                              </>
                            )}
                          </div>
                          {recipient.redeemedAt && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(recipient.redeemedAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* NGO Operational Costs */}
            <TabsContent value="costs">
              <Card>
                <CardHeader>
                  <CardTitle>NGO Operational Costs</CardTitle>
                  <CardDescription>Transparent breakdown of how operational funds are used</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="text-center p-6 border rounded-lg bg-muted/50">
                    <h3 className="text-2xl font-bold text-primary">
                      ${trackingData.ngoOperationalCosts.amount} ({trackingData.ngoOperationalCosts.percentage}%)
                    </h3>
                    <p className="text-muted-foreground">
                      Total operational costs from your ${trackingData.amount} donation
                    </p>
                  </div>

                  <div className="space-y-4">
                    {trackingData.ngoOperationalCosts.breakdown.map((cost, index) => (
                      <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium">{cost.category}</p>
                          <p className="text-sm text-muted-foreground">{cost.description}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">${cost.amount}</p>
                          <p className="text-xs text-muted-foreground">
                            {((cost.amount / trackingData.amount) * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertDescription>
                      All operational costs are capped at 5% and are fully transparent. 95% of your donation goes
                      directly to aid recipients.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Verification */}
            <TabsContent value="verification">
              <Card>
                <CardHeader>
                  <CardTitle>Blockchain Verification</CardTitle>
                  <CardDescription>Cryptographic proof that your donation was handled correctly</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">Donation Hash</h4>
                      <code className="text-xs bg-muted p-2 rounded block font-mono break-all">
                        {trackingData.blockchainId}
                      </code>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">Program ID</h4>
                      <code className="text-xs bg-muted p-2 rounded block font-mono">{trackingData.donationId}</code>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium">Donation Verified</p>
                        <p className="text-sm text-muted-foreground">Transaction confirmed on XRPL blockchain</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium">Smart Contract Executed</p>
                        <p className="text-sm text-muted-foreground">Automated distribution rules followed</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium">Third-Party Audited</p>
                        <p className="text-sm text-muted-foreground">Independent verification completed</p>
                      </div>
                    </div>
                  </div>

                  <Button className="w-full bg-transparent" variant="outline">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Full Audit Report
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}
