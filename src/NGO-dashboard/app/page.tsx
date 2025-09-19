"use client"

import { DashboardHeader } from "@/components/dashboard-header"
import { FinancialOverview } from "@/components/financial-overview"
import { AidRecipients } from "@/components/aid-recipients"
import { AuthWrapper } from "@/components/auth-wrapper"
import { useAuth } from "@/contexts/auth-context"
import { Loader2 } from "lucide-react"

export default function NGODashboard() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <AuthWrapper />
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <FinancialOverview />
        <AidRecipients />
      </main>
    </div>
  )
}
