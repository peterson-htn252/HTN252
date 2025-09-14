"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Wallet, ExternalLink, Clock, CheckCircle, AlertCircle, DollarSign, TrendingUp, Info } from "lucide-react"
import Link from "next/link"

interface Transaction {
  id: string
  voucherId: string
  amount: string
  currency: string
  status: "pending" | "completed" | "failed"
  timestamp: string
  txHash?: string
  fee: string
}

interface PayoutsDashboardProps {
  onCashOutClick: () => void
}

export function PayoutsDashboard({ onCashOutClick }: PayoutsDashboardProps) {
  const [transactions] = useState<Transaction[]>([
    {
      id: "TX-001",
      voucherId: "VCH-ABC123",
      amount: "25.50",
      currency: "XRP",
      status: "completed",
      timestamp: "2024-01-15 14:30:22",
      txHash: "0x1234567890abcdef1234567890abcdef12345678",
      fee: "0.01",
    },
    {
      id: "TX-002",
      voucherId: "VCH-DEF456",
      amount: "15.75",
      currency: "XRP",
      status: "pending",
      timestamp: "2024-01-15 15:45:10",
      fee: "0.01",
    },
    {
      id: "TX-003",
      voucherId: "VCH-GHI789",
      amount: "42.00",
      currency: "XRP",
      status: "completed",
      timestamp: "2024-01-15 16:20:45",
      txHash: "0xabcdef1234567890abcdef1234567890abcdef12",
      fee: "0.01",
    },
    {
      id: "TX-004",
      voucherId: "VCH-JKL012",
      amount: "8.25",
      currency: "XRP",
      status: "failed",
      timestamp: "2024-01-15 17:10:33",
      fee: "0.01",
    },
  ])

  const totalPending = transactions
    .filter((tx) => tx.status === "pending")
    .reduce((sum, tx) => sum + Number.parseFloat(tx.amount), 0)

  const totalCompleted = transactions
    .filter((tx) => tx.status === "completed")
    .reduce((sum, tx) => sum + Number.parseFloat(tx.amount), 0)

  const totalFees = transactions
    .filter((tx) => tx.status === "completed")
    .reduce((sum, tx) => sum + Number.parseFloat(tx.fee), 0)

  const getStatusIcon = (status: Transaction["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-600" />
    }
  }

  const getStatusBadge = (status: Transaction["status"]) => {
    const variants = {
      completed: "default" as const,
      pending: "secondary" as const,
      failed: "destructive" as const,
    }
    return <Badge variant={variants[status]}>{status}</Badge>
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totalCompleted.toFixed(2)} XRP</div>
            <p className="text-xs text-muted-foreground">Ready to cash out</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{totalPending.toFixed(2)} XRP</div>
            <p className="text-xs text-muted-foreground">Processing transactions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Fees</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalFees.toFixed(3)} XRP</div>
            <p className="text-xs text-muted-foreground">Network fees paid</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Volume</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(totalCompleted + totalPending).toFixed(2)} XRP</div>
            <p className="text-xs text-muted-foreground">+12% from yesterday</p>
          </CardContent>
        </Card>
      </div>

      {/* Cash Out Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="font-bold">Cash Out</span>
            <Button onClick={onCashOutClick} className="font-semibold">
              How to Cash Out
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-card rounded-lg border">
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">Available to withdraw</div>
              <div className="text-2xl font-bold text-primary">{totalCompleted.toFixed(2)} XRP</div>
            </div>
            <Link href="/cashout">
              <Button size="lg" className="font-semibold" disabled={totalCompleted === 0}>
                <Wallet className="h-4 w-4 mr-2" />
                Cash Out Now
              </Button>
            </Link>
          </div>

          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <strong>Note:</strong> Cash out transfers your XRP balance to your connected bank account. Processing
                typically takes 1-2 business days.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="font-bold">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Hash</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(tx.status)}
                      <span className="font-mono text-sm">{tx.id}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {tx.voucherId}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold">
                      {tx.amount} {tx.currency}
                    </div>
                    <div className="text-xs text-muted-foreground">Fee: {tx.fee} XRP</div>
                  </TableCell>
                  <TableCell>{getStatusBadge(tx.status)}</TableCell>
                  <TableCell>
                    <div className="text-sm">{tx.timestamp.split(" ")[0]}</div>
                    <div className="text-xs text-muted-foreground">{tx.timestamp.split(" ")[1]}</div>
                  </TableCell>
                  <TableCell>
                    {tx.txHash ? (
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {tx.txHash.slice(0, 8)}...{tx.txHash.slice(-6)}
                        </code>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
