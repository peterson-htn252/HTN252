"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { MapPin, Users, DollarSign, Heart, TrendingUp, Clock, CheckCircle } from "lucide-react"

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

const mockPrograms: ProgramImpact[] = [
  {
    id: "1",
    name: "Typhoon Relief Program",
    totalRaised: 45000,
    goal: 100000,
    beneficiaries: 150,
    location: "Philippines",
    status: "active",
    lastUpdate: "2 hours ago",
    description: "Emergency aid including food, water, and temporary shelter for typhoon victims.",
  },
  {
    id: "2",
    name: "Earthquake Emergency Fund",
    totalRaised: 78000,
    goal: 150000,
    beneficiaries: 320,
    location: "Turkey",
    status: "urgent",
    lastUpdate: "30 minutes ago",
    description: "Immediate medical assistance and emergency supplies for earthquake survivors.",
  },
  {
    id: "3",
    name: "Flood Recovery Initiative",
    totalRaised: 23000,
    goal: 75000,
    beneficiaries: 85,
    location: "India",
    status: "completed",
    lastUpdate: "1 day ago",
    description: "Long-term recovery support including housing reconstruction and livelihood restoration.",
  },
]

interface ImpactDashboardProps {
  impactData: ImpactData
}

export function ImpactDashboard({ impactData }: ImpactDashboardProps) {
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
            <CardTitle>Program Performance</CardTitle>
            <CardDescription>Progress tracking for active relief programs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {mockPrograms.map((program) => (
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
                  <span>Updated {program.lastUpdate}</span>
                </div>
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
            <div className="flex items-start gap-4 p-4 border rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Food packages distributed in Luzon</p>
                <p className="text-sm text-muted-foreground">
                  50 families received emergency food supplies funded by recent donations. Blockchain ID: 0x1a2b...7890
                </p>
                <p className="text-xs text-muted-foreground mt-1">2 hours ago</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 border rounded-lg">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Medical supplies delivered to Turkey</p>
                <p className="text-sm text-muted-foreground">
                  Emergency medical kit distribution completed at 3 refugee camps. Blockchain ID: 0x9876...cdef
                </p>
                <p className="text-xs text-muted-foreground mt-1">4 hours ago</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 border rounded-lg">
              <div className="w-2 h-2 bg-yellow-500 rounded-full mt-2 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Temporary shelter construction started</p>
                <p className="text-sm text-muted-foreground">
                  Construction materials purchased and shelter building commenced in Kerala. Blockchain ID:
                  0xabcd...1234
                </p>
                <p className="text-xs text-muted-foreground mt-1">6 hours ago</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
