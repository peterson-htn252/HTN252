import { DashboardHeader } from "@/components/dashboard-header"
import { FinancialOverview } from "@/components/financial-overview"
import { AidRecipients } from "@/components/aid-recipients"

export default function NGODashboard() {
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
