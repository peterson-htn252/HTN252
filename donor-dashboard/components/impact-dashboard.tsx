"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { MapPin, Users, DollarSign, Heart, TrendingUp, Clock, CheckCircle, Loader2 } from "lucide-react"
import {
  API_URL,
  fetchNGOs,
  transformNGOsToPrograms,
  calculateImpactData,
  type NGO,
} from "@/lib/api"

interface ImpactData {
  totalDonated: number
  peopleHelped: number  
  programsSupported: number
  transparencyScore: number
}

interface RegionData {
  id: string
  name: string
  country: string
  coordinates: [number, number]
  totalReceived: number
  peopleHelped: number
  status: "active" | "completed" | "urgent"
  programs: string[]
}

interface ProgramImpact {
  id: string
  name: string
  totalRaised: number
  goal: number
  beneficiaries: number
  location: string
  status: "active" | "completed" | "urgent"
  lastUpdate: string
  description: string
}

const mockRegions: RegionData[] = [
  {
    id: "1",
    name: "Luzon Region",
    country: "Philippines",
    coordinates: [14.5995, 120.9842],
    totalReceived: 45000,
    peopleHelped: 150,
    status: "active",
    programs: ["Typhoon Relief", "Food Distribution"],
  },
  {
    id: "2",
    name: "Hatay Province",
    country: "Turkey",
    coordinates: [36.2012, 36.161],
    totalReceived: 78000,
    peopleHelped: 320,
    status: "urgent",
    programs: ["Earthquake Emergency", "Medical Aid"],
  },
  {
    id: "3",
    name: "Kerala State",
    country: "India",
    coordinates: [10.8505, 76.2711],
    totalReceived: 23000,
    peopleHelped: 85,
    status: "completed",
    programs: ["Flood Recovery"],
  },
]

interface ImpactDashboardProps {
  impactData?: ImpactData
}

export function ImpactDashboard({ impactData: propImpactData }: ImpactDashboardProps) {
  const [ngos, setNgos] = useState<NGO[]>([])
  const [programs, setPrograms] = useState<ProgramImpact[]>([])
  const [impactData, setImpactData] = useState<ImpactData | null>(propImpactData || null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadNGOData() {
      try {
        setIsLoading(true)
        const ngoData = await fetchNGOs()

        setNgos(ngoData)
        setPrograms(transformNGOsToPrograms(ngoData))
        setImpactData(calculateImpactData(ngoData))
        setError(null)
      } catch (err) {
        console.error("Error loading NGO data:", err)
        setError("Failed to load NGO data")
      } finally {
        setIsLoading(false)
      }
    }

    loadNGOData()
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading NGO data...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center p-8">
        <p className="text-red-500 mb-4">{error}</p>
        <p className="text-muted-foreground">Please check if the API server is running at {API_URL}</p>
      </div>
    )
  }

  if (!impactData) {
    return <div>No impact data available</div>
  }

  return (
    <div className="space-y-8">
      {/* Global Impact Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="text-center">
          <CardHeader className="pb-2">
            <CardTitle className="text-3xl font-bold text-primary">
              ${impactData.totalDonated.toLocaleString()}
            </CardTitle>
            <CardDescription>Total Donated</CardDescription>
          </CardHeader>
          <CardContent>
            <DollarSign className="h-8 w-8 text-primary mx-auto" />
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardHeader className="pb-2">
            <CardTitle className="text-3xl font-bold text-primary">
              {impactData.peopleHelped.toLocaleString()}
            </CardTitle>
            <CardDescription>Lives Impacted</CardDescription>
          </CardHeader>
          <CardContent>
            <Users className="h-8 w-8 text-primary mx-auto" />
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardHeader className="pb-2">
            <CardTitle className="text-3xl font-bold text-primary">{impactData.programsSupported}</CardTitle>
            <CardDescription>Active Programs</CardDescription>
          </CardHeader>
          <CardContent>
            <Heart className="h-8 w-8 text-primary mx-auto" />
          </CardContent>
        </Card>

        <Card className="text-center">
          <CardHeader className="pb-2">
            <CardTitle className="text-3xl font-bold text-primary">{impactData.transparencyScore}%</CardTitle>
            <CardDescription>Transparency Score</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendingUp className="h-8 w-8 text-primary mx-auto" />
          </CardContent>
        </Card>
      </div>

      {/* Interactive World Map Placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Global Impact Map</CardTitle>
          <CardDescription>Real-time visualization of aid distribution worldwide</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96 bg-gradient-to-br from-muted/50 to-muted rounded-lg relative overflow-hidden">
            {/* Map placeholder with region markers */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-4">
                <MapPin className="h-16 w-16 text-primary mx-auto opacity-50" />
                <div>
                  <p className="text-lg font-medium">Interactive Map</p>
                  <p className="text-muted-foreground">Click on regions to see detailed impact data</p>
                </div>
              </div>
            </div>

            {/* Region markers */}
            {mockRegions.map((region, index) => (
              <div
                key={region.id}
                className={`absolute w-4 h-4 rounded-full cursor-pointer transform -translate-x-2 -translate-y-2 ${
                  region.status === "urgent" ? "bg-red-500" : region.status === "active" ? "bg-primary" : "bg-green-500"
                } animate-pulse`}
                style={{
                  left: `${20 + index * 25}%`,
                  top: `${30 + index * 15}%`,
                }}
                title={`${region.name}, ${region.country}`}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Regional Impact Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Regional Impact</CardTitle>
            <CardDescription>Aid distribution by geographic region</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mockRegions.map((region) => (
              <div key={region.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      region.status === "urgent"
                        ? "bg-red-500"
                        : region.status === "active"
                          ? "bg-primary"
                          : "bg-green-500"
                    }`}
                  />
                  <div>
                    <p className="font-medium">{region.name}</p>
                    <p className="text-sm text-muted-foreground">{region.country}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">${region.totalReceived.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground">{region.peopleHelped} people helped</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>NGO Programs</CardTitle>
            <CardDescription>Real NGO programs from your API</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {programs.map((program) => (
              <div key={program.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{program.name}</p>
                    <p className="text-sm text-muted-foreground">{program.location}</p>
                  </div>
                  <Badge
                    variant={
                      program.status === "urgent"
                        ? "destructive"
                        : program.status === "active"
                          ? "default"
                          : "secondary"
                    }
                  >
                    {program.status === "completed" ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" /> Completed
                      </>
                    ) : program.status === "urgent" ? (
                      <>
                        <Clock className="h-3 w-3 mr-1" /> Urgent
                      </>
                    ) : (
                      <>
                        <TrendingUp className="h-3 w-3 mr-1" /> Active
                      </>
                    )}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>
                      ${program.totalRaised.toLocaleString()} of ${program.goal.toLocaleString()}
                    </span>
                  </div>
                  <Progress value={(program.totalRaised / program.goal) * 100} />
                </div>

                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{program.beneficiaries} beneficiaries</span>
                  <span>Created {program.lastUpdate}</span>
                </div>

                <p className="text-sm text-muted-foreground">{program.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Real-time Updates */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Impact Updates</CardTitle>
          <CardDescription>Live updates from the field showing how donations are being used</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {ngos.slice(0, 3).map((ngo, index) => (
              <div key={ngo.account_id} className="flex items-start gap-4 p-4 border rounded-lg">
                <div
                  className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                    index === 0 ? "bg-green-500" : index === 1 ? "bg-blue-500" : "bg-yellow-500"
                  }`}
                />
                <div className="flex-1">
                  <p className="font-medium">{ngo.name} - Aid Distribution</p>
                  <p className="text-sm text-muted-foreground">
                    {ngo.description.slice(0, 100)}... Blockchain ID: 0x{ngo.account_id.slice(0, 8)}...
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{Math.floor(Math.random() * 24)} hours ago</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
