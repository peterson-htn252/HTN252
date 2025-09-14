"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Shield,
  Download,
  ExternalLink,
  FileText,
  TrendingUp,
  DollarSign,
  Users,
  Hash,
  Search,
} from "lucide-react"

interface AuditEvent {
  id: string
  timestamp: string
  type: "donation" | "allocation" | "distribution" | "redemption" | "verification" | "compliance"
  description: string
  amount?: number
  currency?: string
  status: "verified" | "pending" | "flagged"
  blockchainHash?: string
  participants: string[]
  metadata: Record<string, any>
}

interface ComplianceReport {
  id: string
  period: string
  totalDonations: number
  totalDistributed: number
  operationalCosts: number
  beneficiaries: number
  verificationScore: number
  auditedBy: string
  reportUrl: string
  generatedAt: string
}

interface TransparencyMetrics {
  totalTransactions: number
  verifiedTransactions: number
  averageProcessingTime: number
  complianceScore: number
  auditFrequency: string
  lastAudit: string
}

const mockAuditEvents: AuditEvent[] = [
  {
    id: "1",
    timestamp: "2024-01-16T11:20:00Z",
    type: "redemption",
    description: "Voucher redeemed at local store in Iloilo, Philippines",
    amount: 19,
    currency: "USD",
    status: "verified",
    blockchainHash: "0x4d5e6f7890abcdef1234567890abcdef12345678",
    participants: ["Recipient #4", "Store #23", "Verification Agent"],
    metadata: {
      storeLocation: "Iloilo, Philippines",
      itemsPurchased: ["Rice", "Canned goods", "Water"],
      verificationMethod: "QR Code + Biometric",
    },
  },
  {
    id: "2",
    timestamp: "2024-01-16T10:45:00Z",
    type: "redemption",
    description: "Voucher redeemed at local store in Davao, Philippines",
    amount: 19,
    currency: "USD",
    status: "verified",
    blockchainHash: "0x3c4d5e6f7890abcdef1234567890abcdef123456",
    participants: ["Recipient #3", "Store #18", "Verification Agent"],
    metadata: {
      storeLocation: "Davao, Philippines",
      itemsPurchased: ["Medicine", "Baby formula", "Hygiene items"],
      verificationMethod: "QR Code + SMS",
    },
  },
  {
    id: "3",
    timestamp: "2024-01-15T14:00:00Z",
    type: "distribution",
    description: "Digital vouchers issued to 5 verified beneficiaries",
    amount: 95,
    currency: "USD",
    status: "verified",
    blockchainHash: "0x3c4d5e6f7890abcdef1234567890abcdef123456",
    participants: ["NGO Coordinator", "Field Agent", "Blockchain Oracle"],
    metadata: {
      vouchersIssued: 5,
      verificationMethod: "KYC + GPS Location",
      distributionMethod: "SMS + QR Code",
    },
  },
  {
    id: "4",
    timestamp: "2024-01-15T11:30:00Z",
    type: "allocation",
    description: "Funds allocated from donation pool to distribution wallet",
    amount: 95,
    currency: "USD",
    status: "verified",
    blockchainHash: "0x2b3c4d5e6f7890abcdef1234567890abcdef1234",
    participants: ["Smart Contract", "NGO Treasury", "Compliance Monitor"],
    metadata: {
      operationalCostDeducted: 5,
      operationalCostPercentage: 5,
      allocationReason: "Typhoon Relief Distribution",
    },
  },
  {
    id: "5",
    timestamp: "2024-01-15T10:00:00Z",
    type: "donation",
    description: "Initial donation received from anonymous donor",
    amount: 100,
    currency: "USD",
    status: "verified",
    blockchainHash: "0x1a2b3c4d5e6f7890abcdef1234567890abcdef12",
    participants: ["Anonymous Donor", "Payment Processor", "Program Pool"],
    metadata: {
      paymentMethod: "Credit Card",
      donorCountry: "United States",
      programSelected: "Typhoon Relief Program",
    },
  },
]

const mockComplianceReports: ComplianceReport[] = [
  {
    id: "1",
    period: "Q4 2024",
    totalDonations: 2500000,
    totalDistributed: 2375000,
    operationalCosts: 125000,
    beneficiaries: 8500,
    verificationScore: 98.5,
    auditedBy: "PwC Blockchain Audit",
    reportUrl: "#",
    generatedAt: "2024-01-01T00:00:00Z",
  },
  {
    id: "2",
    period: "Q3 2024",
    totalDonations: 1800000,
    totalDistributed: 1710000,
    operationalCosts: 90000,
    beneficiaries: 6200,
    verificationScore: 97.8,
    auditedBy: "Deloitte Crypto Assurance",
    reportUrl: "#",
    generatedAt: "2023-10-01T00:00:00Z",
  },
]

const mockTransparencyMetrics: TransparencyMetrics = {
  totalTransactions: 15847,
  verifiedTransactions: 15823,
  averageProcessingTime: 2.3,
  complianceScore: 98.5,
  auditFrequency: "Quarterly",
  lastAudit: "2024-01-01",
}

export function AuditTrail() {
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState<string>("all")

  const filteredEvents = mockAuditEvents.filter((event) => {
    const matchesSearch =
      event.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      event.blockchainHash?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesFilter = filterType === "all" || event.type === filterType
    return matchesSearch && matchesFilter
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "verified":
        return "text-green-600"
      case "pending":
        return "text-yellow-600"
      case "flagged":
        return "text-red-600"
      default:
        return "text-muted-foreground"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "verified":
        return <CheckCircle className="h-4 w-4" />
      case "pending":
        return <Clock className="h-4 w-4" />
      case "flagged":
        return <AlertCircle className="h-4 w-4" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "donation":
        return "bg-blue-100 text-blue-800"
      case "allocation":
        return "bg-purple-100 text-purple-800"
      case "distribution":
        return "bg-green-100 text-green-800"
      case "redemption":
        return "bg-orange-100 text-orange-800"
      case "verification":
        return "bg-gray-100 text-gray-800"
      case "compliance":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  return (
    <div className="space-y-6">
      {/* Transparency Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Transparency Overview
          </CardTitle>
          <CardDescription>Real-time transparency metrics and compliance scores</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <Hash className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">{mockTransparencyMetrics.totalTransactions.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Total Transactions</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">
                {(
                  (mockTransparencyMetrics.verifiedTransactions / mockTransparencyMetrics.totalTransactions) *
                  100
                ).toFixed(1)}
                %
              </p>
              <p className="text-sm text-muted-foreground">Verified</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <Clock className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <p className="text-2xl font-bold">{mockTransparencyMetrics.averageProcessingTime}s</p>
              <p className="text-sm text-muted-foreground">Avg Processing</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <TrendingUp className="h-8 w-8 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold">{mockTransparencyMetrics.complianceScore}%</p>
              <p className="text-sm text-muted-foreground">Compliance Score</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="events" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="events">Audit Events</TabsTrigger>
          <TabsTrigger value="reports">Compliance Reports</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
        </TabsList>

        {/* Audit Events */}
        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Complete Audit Trail</CardTitle>
              <CardDescription>
                Chronological record of all transactions and events with blockchain verification
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search and Filter */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="search">Search Events</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Search by description or blockchain hash..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="filter">Filter by Type</Label>
                  <select
                    id="filter"
                    className="w-full p-2 border border-input bg-background rounded-md"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option value="all">All Types</option>
                    <option value="donation">Donations</option>
                    <option value="allocation">Allocations</option>
                    <option value="distribution">Distributions</option>
                    <option value="redemption">Redemptions</option>
                    <option value="verification">Verifications</option>
                  </select>
                </div>
              </div>

              {/* Events List */}
              <div className="space-y-3">
                {filteredEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className={`mt-1 ${getStatusColor(event.status)}`}>{getStatusIcon(event.status)}</div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge className={getTypeColor(event.type)}>{event.type}</Badge>
                          {event.amount && (
                            <span className="text-sm font-medium">
                              ${event.amount} {event.currency}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm">{event.description}</p>
                      {event.blockchainHash && (
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                            {event.blockchainHash.slice(0, 20)}...
                          </code>
                          <Button size="sm" variant="ghost" className="h-6 px-2">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Event Details Modal */}
          {selectedEvent && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Event Details</CardTitle>
                  <Button variant="ghost" onClick={() => setSelectedEvent(null)}>
                    ×
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Event Type</Label>
                    <Badge className={getTypeColor(selectedEvent.type)}>{selectedEvent.type}</Badge>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <div className={`flex items-center gap-1 ${getStatusColor(selectedEvent.status)}`}>
                      {getStatusIcon(selectedEvent.status)}
                      <span className="capitalize">{selectedEvent.status}</span>
                    </div>
                  </div>
                  <div>
                    <Label>Timestamp</Label>
                    <p className="text-sm">{new Date(selectedEvent.timestamp).toLocaleString()}</p>
                  </div>
                  {selectedEvent.amount && (
                    <div>
                      <Label>Amount</Label>
                      <p className="text-sm font-medium">
                        ${selectedEvent.amount} {selectedEvent.currency}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <Label>Description</Label>
                  <p className="text-sm">{selectedEvent.description}</p>
                </div>

                {selectedEvent.blockchainHash && (
                  <div>
                    <Label>Blockchain Hash</Label>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted p-2 rounded font-mono flex-1">
                        {selectedEvent.blockchainHash}
                      </code>
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                )}

                <div>
                  <Label>Participants</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {selectedEvent.participants.map((participant, index) => (
                      <Badge key={index} variant="outline">
                        {participant}
                      </Badge>
                    ))}
                  </div>
                </div>

                {Object.keys(selectedEvent.metadata).length > 0 && (
                  <div>
                    <Label>Additional Details</Label>
                    <div className="bg-muted p-3 rounded text-xs">
                      <pre>{JSON.stringify(selectedEvent.metadata, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Compliance Reports */}
        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Reports</CardTitle>
              <CardDescription>Quarterly audit reports from independent third-party auditors</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {mockComplianceReports.map((report) => (
                <div key={report.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-medium">{report.period} Compliance Report</h4>
                      <p className="text-sm text-muted-foreground">Audited by {report.auditedBy}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">{report.verificationScore}%</p>
                      <p className="text-xs text-muted-foreground">Verification Score</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center">
                      <DollarSign className="h-6 w-6 text-primary mx-auto mb-1" />
                      <p className="text-lg font-semibold">${report.totalDonations.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Total Donations</p>
                    </div>
                    <div className="text-center">
                      <TrendingUp className="h-6 w-6 text-green-500 mx-auto mb-1" />
                      <p className="text-lg font-semibold">${report.totalDistributed.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Distributed</p>
                    </div>
                    <div className="text-center">
                      <Users className="h-6 w-6 text-blue-500 mx-auto mb-1" />
                      <p className="text-lg font-semibold">{report.beneficiaries.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Beneficiaries</p>
                    </div>
                    <div className="text-center">
                      <FileText className="h-6 w-6 text-orange-500 mx-auto mb-1" />
                      <p className="text-lg font-semibold">
                        {((report.operationalCosts / report.totalDonations) * 100).toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Operational</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 bg-transparent">
                      <Download className="h-3 w-3 mr-1" />
                      Download PDF
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 bg-transparent">
                      <ExternalLink className="h-3 w-3 mr-1" />
                      View Online
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Verification */}
        <TabsContent value="verification" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Verification</CardTitle>
              <CardDescription>Technical verification of blockchain integrity and system security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h4 className="font-medium">Blockchain Verification</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium">XRPL Network Status</p>
                        <p className="text-sm text-muted-foreground">Connected and synchronized</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium">Smart Contract Integrity</p>
                        <p className="text-sm text-muted-foreground">All contracts verified</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium">Transaction Validation</p>
                        <p className="text-sm text-muted-foreground">100% transactions validated</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-medium">Security Verification</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium">Multi-Signature Security</p>
                        <p className="text-sm text-muted-foreground">3-of-5 signature scheme active</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium">Fraud Detection</p>
                        <p className="text-sm text-muted-foreground">AI monitoring active</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 border rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <p className="font-medium">Data Encryption</p>
                        <p className="text-sm text-muted-foreground">AES-256 encryption verified</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  <strong>Last Security Audit:</strong> January 1, 2024 by CertiK
                  <br />
                  <strong>Next Scheduled Audit:</strong> April 1, 2024
                  <br />
                  All systems are operating within security parameters with 99.9% uptime.
                </AlertDescription>
              </Alert>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 bg-transparent">
                  <FileText className="h-4 w-4 mr-2" />
                  View Security Report
                </Button>
                <Button variant="outline" className="flex-1 bg-transparent">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Verify on Blockchain
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
