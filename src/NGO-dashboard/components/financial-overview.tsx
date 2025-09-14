"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Loader2 } from "lucide-react"
import { apiClient } from "@/lib/api"
import { DashboardStats } from "@/lib/types"
import { formatCurrency } from "@/lib/utils"


export function FinancialOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Fetch dashboard data
        const dashboardStats = await apiClient.getDashboardStats()

        // Try to fetch wallet USD balance using the current account's public key
        // If we can derive a valid address, override available_funds even if balance is 0
        let overrideCents: number | null = null
        try {
          const me = await apiClient.getCurrentUser()
          if (me.public_key) {
            const bal = await apiClient.getWalletBalanceUSD(me.public_key)
            console.log("bal", bal)
            if (bal.address) {
              overrideCents = Math.round(bal.balance_usd * 100)
            }
          }
        } catch (e) {
          // swallow; fall back to server-computed available_funds
        }

        // Replace available_funds with wallet USD balance if available
        const patched = {
          ...dashboardStats,
          available_funds: overrideCents !== null ? overrideCents : dashboardStats.available_funds,
        }
        setStats(patched)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold text-foreground">Financial Overview</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/2 mb-4"></div>
                  <div className="h-8 bg-muted rounded w-3/4"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold text-foreground">Financial Overview</h2>
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" />
            <span>Error loading data</span>
          </div>
        </div>
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <div>
                <p className="font-medium">Failed to load dashboard data</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  // Convert minor units (cents) to dollars for display
  const totalAvailable = stats.available_funds / 100
  const totalExpenses = stats.total_expenses / 100
  const utilizationRate = stats.utilization_rate
  
  // Fund utilization data (total raised vs goal)
  const lifetimeDonations = stats.lifetime_donations / 100 // Convert from cents to dollars
  const goal = stats.goal // Already in dollars
  const fundUtilizationRate = goal > 0 ? (lifetimeDonations / goal * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-foreground">Financial Overview</h2>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4" />
          <span>Real-time data</span>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Money Available</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">${formatCurrency(totalAvailable)}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <TrendingUp className="w-3 h-3 text-green-600" />
              <span>Available for distribution</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total NGO Expenses</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">${formatCurrency(totalExpenses)}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <span>From auditor records</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lifetime Raised</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">${formatCurrency(lifetimeDonations)}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <span>Goal: ${formatCurrency(goal)}</span>
              {goal > 0 && (
                <span className="ml-2">({fundUtilizationRate.toFixed(1)}% of goal)</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
