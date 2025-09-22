"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign, TrendingUp, TrendingDown, AlertCircle, Loader2 } from "lucide-react"
import { apiClient } from "@/lib/api"
import { API_BASE_URL } from "@/lib/config"
import { DashboardStats } from "@/lib/types"
import { formatCurrency } from "@/lib/utils"


export function FinancialOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [availableFundsCents, setAvailableFundsCents] = useState<number | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "closed">("connecting")
  const [wsError, setWsError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const fetchData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const dashboardStats = await apiClient.getDashboardStats()
        if (!isMounted) {
          return
        }

        setStats(dashboardStats)
        setAvailableFundsCents((prev) => (prev ?? dashboardStats.available_funds))
        setLastUpdated((prev) => prev ?? dashboardStats.last_updated)
      } catch (err) {
        if (!isMounted) {
          return
        }
        setError(err instanceof Error ? err.message : "Failed to load dashboard data")
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let isActive = true

    const connect = () => {
      if (!isActive) {
        return
      }

      const token = localStorage.getItem("auth_token")
      if (!token) {
        setWsStatus("closed")
        setWsError("Missing authentication token for live balance updates")
        return
      }

      try {
        const url = new URL("/ws/accounts/dashboard/balance", API_BASE_URL)
        url.searchParams.set("token", token)
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:"

        const ws = new WebSocket(url.toString())
        socket = ws
        setWsStatus("connecting")
        setWsError(null)

        ws.onopen = () => {
          if (!isActive) {
            return
          }
          if (reconnectTimer) {
            clearTimeout(reconnectTimer)
            reconnectTimer = null
          }
          setWsStatus("open")
          setWsError(null)
        }

        ws.onmessage = (event) => {
          if (!isActive) {
            return
          }
          try {
            const data = JSON.parse(event.data) as {
              available_funds?: number
              last_updated?: string
            }

            if (typeof data.available_funds === "number") {
              setAvailableFundsCents(data.available_funds)
            }
            if (typeof data.last_updated === "string") {
              setLastUpdated(data.last_updated)
            }
          } catch (parseError) {
            console.error("Failed to parse balance websocket message", parseError)
          }
        }

        ws.onerror = () => {
          if (!isActive) {
            return
          }
          setWsStatus("closed")
          setWsError("Unable to retrieve live balance updates")
        }

        ws.onclose = () => {
          if (!isActive) {
            return
          }
          setWsStatus("closed")
          socket = null
          if (reconnectTimer) {
            clearTimeout(reconnectTimer)
          }
          reconnectTimer = setTimeout(() => {
            if (!isActive) {
              return
            }
            setWsStatus("connecting")
            connect()
          }, 5000)
        }
      } catch (connectionError) {
        console.error("Failed to connect to balance websocket", connectionError)
        if (!isActive) {
          return
        }
        setWsStatus("closed")
        setWsError("Failed to connect to live balance updates")
      }
    }

    connect()

    return () => {
      isActive = false
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      if (socket) {
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close()
        }
      }
    }
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

  const resolvedAvailableFunds = (availableFundsCents ?? stats.available_funds)
  const totalAvailable = resolvedAvailableFunds / 100
  // Convert minor units (cents) to dollars for display
  const totalExpenses = stats.total_expenses / 100
  const utilizationRate = stats.utilization_rate

  // Fund utilization data (total raised vs goal)
  const lifetimeDonations = stats.lifetime_donations / 100 // Convert from cents to dollars
  const goal = stats.goal // Already in dollars
  const fundUtilizationRate = goal > 0 ? (lifetimeDonations / goal * 100) : 0

  const effectiveLastUpdated = lastUpdated ?? stats.last_updated
  let formattedLastUpdated: string | null = null
  if (effectiveLastUpdated) {
    const parsed = new Date(effectiveLastUpdated)
    if (!Number.isNaN(parsed.getTime())) {
      formattedLastUpdated = parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    }
  }

  const liveStatus = (() => {
    if (wsStatus === "open") {
      const label = formattedLastUpdated
        ? `Live balance updates • Updated ${formattedLastUpdated}`
        : "Live balance updates"
      return {
        text: label,
        icon: <TrendingUp className="w-4 h-4 text-green-600" />,
        className: "text-sm text-green-600",
      }
    }

    if (wsStatus === "connecting") {
      return {
        text: "Connecting to live balance…",
        icon: <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />,
        className: "text-sm text-muted-foreground",
      }
    }

    return {
      text: wsError ?? "Live updates unavailable",
      icon: <AlertCircle className="w-4 h-4 text-red-600" />,
      className: "text-sm text-red-600",
    }
  })()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-foreground">Financial Overview</h2>
        <div className={`flex items-center gap-2 ${liveStatus.className}`}>
          {liveStatus.icon}
          <span>{liveStatus.text}</span>
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
