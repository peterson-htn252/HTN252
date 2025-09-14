"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Loader2 } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"
import { apiClient } from "@/lib/api"
import { DashboardStats, ExpenseBreakdown, MonthlyTrends } from "@/lib/types"

const defaultColors = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

export function FinancialOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [expenseData, setExpenseData] = useState<Array<{name: string; value: number; color: string}>>([])
  const [monthlyData, setMonthlyData] = useState<Array<{month: string; expenses: number; donations: number}>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Fetch all dashboard data in parallel
        const [dashboardStats, expenseBreakdown, monthlyTrends] = await Promise.all([
          apiClient.getDashboardStats(),
          apiClient.getExpenseBreakdown(),
          apiClient.getMonthlyTrends(),
        ])

        setStats(dashboardStats)

        // Format expense data with colors
        const formattedExpenseData = expenseBreakdown.expense_breakdown.map((item, index) => ({
          ...item,
          color: defaultColors[index % defaultColors.length],
        }))
        setExpenseData(formattedExpenseData)

        setMonthlyData(monthlyTrends.monthly_trends)
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
  const totalDonations = stats.total_donations_30d / 100
  const totalExpenses = stats.total_expenses_30d / 100
  const utilizationRate = stats.utilization_rate

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
            <div className="text-2xl font-bold text-foreground">${totalAvailable.toLocaleString()}</div>
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
            <div className="text-2xl font-bold text-foreground">${totalExpenses.toLocaleString()}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <span>Last 30 days</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fund Utilization</CardTitle>
            <div className="text-xs text-muted-foreground">{utilizationRate.toFixed(1)}%</div>
          </CardHeader>
          <CardContent>
            <Progress value={utilizationRate} className="w-full" />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>Used: ${totalExpenses.toLocaleString()}</span>
              <span>Available: ${totalAvailable.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Expense Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={expenseData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {expenseData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`$${(value / 100).toLocaleString()}`, "Amount"]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {expenseData.map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground">{item.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Monthly Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(value) => `$${(value / 100000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: number) => [`$${(value / 100).toLocaleString()}`, ""]}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
                    color: "black",
                  }}
                />
                <Bar dataKey="donations" fill="hsl(var(--chart-2))" name="Donations" />
                <Bar dataKey="expenses" fill="hsl(var(--chart-1))" name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
