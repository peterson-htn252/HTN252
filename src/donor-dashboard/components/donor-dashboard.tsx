"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Shield } from "lucide-react"
import { DonationForm } from "./donation-form"
import { ImpactDashboard } from "./impact-dashboard"
import { BlockchainTracker } from "./blockchain-tracker"
import { AuditTrail } from "./audit-trail"
import { supabaseBrowser } from "@/lib/supabase-browser"
import type { Donation, ImpactDataDB, ImpactDataUI } from "@/types/donations"

const toUI = (d: ImpactDataDB): ImpactDataUI => ({
  totalDonated: d.total_donated ?? 0,
  peopleHelped: d.people_helped ?? 0,
  programsSupported: d.programs_supported ?? 0,
  transparencyScore: d.transparency_score ?? 0,
})

export function DonorDashboard() {
  const [donations, setDonations] = useState<Donation[] | null>(null)
  const [impactDB, setImpactDB] = useState<ImpactDataDB | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = useMemo(() => supabaseBrowser(), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)

      // donations
      const { data: d, error: dErr } = await supabase
        .from("donations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100)

      if (!cancelled) {
        if (dErr) console.error(dErr)
        else setDonations(d as Donation[])
      }

      // impact view (single row)
      const { data: i, error: iErr } = await supabase
        .from("impact_dashboard")
        .select("*")
        .single()

      if (!cancelled) {
        if (iErr) console.error(iErr)
        else setImpactDB(i as ImpactDataDB)
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [supabase])

  // realtime on donations
  useEffect(() => {
    const channel = supabase
      .channel("donations-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "donations" },
        async (payload) => {
          setDonations((prev) => {
            const list = prev ? [...prev] : []
            const row = payload.new as Donation
            const idx = list.findIndex((d) => d.id === row.id)
            if (idx >= 0) list[idx] = row
            else list.unshift(row)
            return list
          })
          // refresh impact view
          const { data } = await supabase.from("impact_dashboard").select("*").single()
          if (data) setImpactDB(data as ImpactDataDB)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase])

  const handleDonationComplete = (donationId: string, blockchainId: string) => {
    console.log("Donation completed:", { donationId, blockchainId })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Transparent Aid</h1>
            </div>
            <Badge variant="secondary" className="text-sm">
              Powered by Ripple XRPL
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-foreground mb-4 text-balance">
            Track Every Dollar, Change Every Life
          </h2>
          <p className="text-xl text-muted-foreground mb-8 text-pretty max-w-2xl mx-auto">
            Donate with confidence knowing exactly where your money goes. Every transaction is recorded on the
            blockchain for complete transparency.
          </p>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground">Loading dashboard…</div>
        ) : (
          <Tabs defaultValue="donate" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="donate">Donate</TabsTrigger>
              <TabsTrigger value="track">Blockchain Tracker</TabsTrigger>
              <TabsTrigger value="impact">Impact Dashboard</TabsTrigger>
              <TabsTrigger value="audit">Audit Trail</TabsTrigger>
            </TabsList>

            {/* Donation Tab */}
            <TabsContent value="donate" className="space-y-6">
              <DonationForm onDonationComplete={handleDonationComplete} />
            </TabsContent>

            {/* Track Donations Tab */}
            <TabsContent value="track" className="space-y-6">
              <BlockchainTracker donations={donations ?? []} />
            </TabsContent>

            {/* Impact Dashboard Tab */}
            <TabsContent value="impact" className="space-y-6">
              <ImpactDashboard
                impactData={
                  impactDB
                    ? toUI(impactDB)
                    : { totalDonated: 0, peopleHelped: 0, programsSupported: 0, transparencyScore: 0 }
                }
              />
            </TabsContent>

            {/* Audit Trail Tab */}
            <TabsContent value="audit" className="space-y-6">
              <AuditTrail donations={donations ?? []} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
