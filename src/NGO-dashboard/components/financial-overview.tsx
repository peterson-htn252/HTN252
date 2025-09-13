"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { DollarSign, TrendingUp, TrendingDown, AlertCircle } from "lucide-react"
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts"

const expenseData = [
  { name: "Food Aid", value: 45000, color: "hsl(var(--chart-1))" },
  { name: "Medical Support", value: 32000, color: "hsl(var(--chart-2))" },
  { name: "Education", value: 18000, color: "hsl(var(--chart-3))" },
  { name: "Emergency Relief", value: 25000, color: "hsl(var(--chart-4))" },
  { name: "Infrastructure", value: 15000, color: "hsl(var(--chart-5))" },
]

const monthlyData = [
  { month: "Jan", expenses: 28000, donations: 35000 },
  { month: "Feb", expenses: 32000, donations: 38000 },
  { month: "Mar", expenses: 45000, donations: 42000 },
  { month: "Apr", expenses: 38000, donations: 48000 },
  { month: "May", expenses: 42000, donations: 52000 },
  { month: "Jun", expenses: 48000, donations: 45000 },
]

export function FinancialOverview() {
  const totalAvailable = 285000
  const totalExpenses = 135000
  const utilizationRate = (totalExpenses / totalAvailable) * 100

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
              <span>+12% from last month</span>
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
              <span>47% of available funds</span>
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
              <span>Remaining: ${(totalAvailable - totalExpenses).toLocaleString()}</span>
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
                <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Amount"]} />
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
                  tickFormatter={(value) => `$${value / 1000}k`}
                />
                <Tooltip
                  formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
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
