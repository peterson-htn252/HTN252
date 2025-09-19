"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Shield } from "lucide-react"
import { DonationForm } from "./donation-form"
import { ImpactDashboard } from "./impact-dashboard"
import { BlockchainTracker } from "./blockchain-tracker"
import { AuditTrail } from "./audit-trail"
import { fetchNGOs, calculateImpactData } from "@/lib/api"

// Mock data for demonstration
const mockDonations = [
  {
    id: "1",
    amount: 100,
    program: "Typhoon Relief Program",
    date: "2024-01-15",
    blockchainId: "0x1a2b3c4d5e6f7890abcdef1234567890",
    status: "distributed",
    recipients: 5,
    location: "Philippines",
  },
  {
    id: "2",
    amount: 250,
    program: "Earthquake Emergency Fund",
    date: "2024-01-10",
    blockchainId: "0x9876543210fedcba0987654321abcdef",
    status: "in-progress",
    recipients: 12,
    location: "Turkey",
  },
]

export function DonorDashboard() {
  const [donations, setDonations] = useState(mockDonations)
  const [impactData, setImpactData] = useState<any>(null)

  useEffect(() => {
    async function loadImpactData() {
      try {
        const ngos = await fetchNGOs();           // ← now always an array
        setImpactData(calculateImpactData(ngos)); // ← safe reduce
      } catch (e) {
        console.error("Error loading impact data:", e);
        setImpactData({
          totalDonated: 146000,
          peopleHelped: 555,
          programsSupported: 3,
          transparencyScore: 98,
        });
      }
    }
    loadImpactData();
  }, []);

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
              <h1 className="text-2xl font-bold text-foreground">Ripple Relief</h1>
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
            <BlockchainTracker />
          </TabsContent>

          {/* Impact Dashboard Tab */}
          <TabsContent value="impact" className="space-y-6">
            <ImpactDashboard impactData={impactData} />
          </TabsContent>

          {/* Audit Trail Tab */}
          <TabsContent value="audit" className="space-y-6">
            <AuditTrail />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
