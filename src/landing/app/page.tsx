import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Shield, Eye, Zap, Users, ArrowRight, Globe, Heart, DollarSign } from "lucide-react"

const DONOR_DASHBOARD_URL = process.env.NEXT_PUBLIC_DONOR_DASHBOARD_URL ?? "http://localhost:3000"
const NGO_DASHBOARD_URL = process.env.NEXT_PUBLIC_NGO_DASHBOARD_URL ?? "http://localhost:3001"
const NGO_ONBOARDING_URL = process.env.NEXT_PUBLIC_NGO_ONBOARDING_URL ?? NGO_DASHBOARD_URL
const SIGN_IN_URL = process.env.NEXT_PUBLIC_SIGN_IN_URL ?? DONOR_DASHBOARD_URL

function buildProgramLink(baseUrl: string, programId: number) {
  try {
    const url = new URL(baseUrl)
    url.searchParams.set("program", String(programId))
    return url.toString()
  } catch {
    const separator = baseUrl.includes("?") ? "&" : "?"
    return `${baseUrl}${separator}program=${encodeURIComponent(String(programId))}`
  }
}

export default function DonationPlatform() {
  const placeholderImage =
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80"

  const donationPrograms = [
    {
      id: 1,
      ngo: "Global Water Initiative",
      title: "Clean Water for Rural Communities",
      description:
        "Providing clean water access to 500 families in rural Kenya through well construction and water purification systems.",
      raised: 45000,
      goal: 75000,
      donors: 234,
      image:
        "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQF2oZ_qiLsMIqgx_h8THNe9dkGFN667bn2Pw&s",
    },
    {
      id: 2,
      ngo: "Education First",
      title: "School Supplies for Refugee Children",
      description:
        "Supporting 300 refugee children with essential school supplies, books, and learning materials for the academic year.",
      raised: 28000,
      goal: 40000,
      donors: 156,
      image:
        "https://theturquoisetable.com/wp-content/uploads/2015/09/SupplyDrive2.jpg",
    },
    {
      id: 3,
      ngo: "Food Security Alliance",
      title: "Emergency Food Relief",
      description:
        "Providing emergency food packages to 1,000 families affected by natural disasters in Southeast Asia.",
      raised: 62000,
      goal: 80000,
      donors: 412,
      image:
        "https://www.wfp.org/sites/default/files/images/WFP-emergency-relief.jpg",
    },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto max-w-7xl flex h-16 items-center justify-between px-4">
          <div className="flex items-center space-x-2">
            <Heart className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">RippleRelief</span>
          </div>
          <nav className="hidden md:flex items-center space-x-6">
            <a href="#programs" className="text-sm font-medium hover:text-primary transition-colors">
              Programs
            </a>
            <a href="#how-it-works" className="text-sm font-medium hover:text-primary transition-colors">
              How It Works
            </a>
            <a href="#about" className="text-sm font-medium hover:text-primary transition-colors">
              About
            </a>
            <Button asChild variant="outline" size="sm">
              <a href={SIGN_IN_URL}>Sign In</a>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 lg:py-32">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-4xl text-center">
            <Badge variant="secondary" className="mb-4">
              HTN252 • Powered by Ripple XRPL
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl">
              Transparent Donations with <span className="text-primary">Blockchain Trust</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground text-pretty max-w-2xl mx-auto">
              Connect donors directly with NGO programs through blockchain-powered transparency. Track every donation
              from contribution to impact with real-time verification on XRPL.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Button asChild size="lg" className="text-lg px-8 py-6">
                <a href={DONOR_DASHBOARD_URL}>
                  Browse Programs
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-lg px-8 py-6 bg-transparent">
                <a href={NGO_ONBOARDING_URL}>
                  Join as NGO
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section id="programs" className="py-20 bg-muted/50">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Active Donation Programs</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Support verified NGO programs with complete transparency and blockchain-verified impact tracking.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {donationPrograms.map((program) => (
              <Card key={program.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow overflow-hidden">
                <div className="aspect-video bg-muted">
                  <img
                    src={program.image || placeholderImage}
                    alt={program.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <CardHeader>
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className="text-xs">
                      {program.ngo}
                    </Badge>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Users className="h-4 w-4 mr-1" />
                      {program.donors}
                    </div>
                  </div>
                  <CardTitle className="text-lg">{program.title}</CardTitle>
                  <CardDescription className="text-sm">{program.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium">${program.raised.toLocaleString()} raised</span>
                        <span className="text-muted-foreground">${program.goal.toLocaleString()} goal</span>
                      </div>
                      <Progress value={(program.raised / program.goal) * 100} className="h-2" />
                    </div>
                    <Button asChild className="w-full">
                      <a href={buildProgramLink(DONOR_DASHBOARD_URL, program.id)}>
                        <DollarSign className="mr-2 h-4 w-4" />
                        Donate Now
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button asChild variant="outline" size="lg">
              <a href={DONOR_DASHBOARD_URL}>
                View All Programs
                <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 scroll-mt-24">
        <div id="about" aria-hidden />
        <div className="container mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Built for Trust & Impact</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Our platform connects donors and NGOs through transparent, blockchain-verified donation tracking.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Verified NGOs</CardTitle>
                <CardDescription>
                  All NGOs are verified and their programs are blockchain-tracked to ensure donations reach intended
                  causes.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Eye className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Donation Tracking</CardTitle>
                <CardDescription>
                  Track your donations in real-time from contribution to impact with complete transparency.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Instant Verification</CardTitle>
                <CardDescription>
                  Powered by Ripple's XRPL for fast, secure, and cost-effective transaction verification.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Multi-Stakeholder</CardTitle>
                <CardDescription>
                  Connect donors, NGOs, and recipients in a unified, transparent ecosystem.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Globe className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Global Reach</CardTitle>
                <CardDescription>
                  Scalable solution designed to work across borders and currencies with minimal infrastructure.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Heart className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Impact Focused</CardTitle>
                <CardDescription>
                  Comprehensive analytics and reporting to measure and maximize humanitarian impact.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 bg-muted/50">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">How It Works</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Simple, secure, and transparent donations in four steps.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary-foreground">1</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">NGO Programs</h3>
              <p className="text-muted-foreground">
                Verified NGOs create and list their donation programs with clear goals and impact metrics.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary-foreground">2</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Secure Donations</h3>
              <p className="text-muted-foreground">
                Donors contribute to programs with blockchain-verified transactions on XRPL testnet.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary-foreground">3</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Fund Distribution</h3>
              <p className="text-muted-foreground">
                NGOs receive funds and distribute them to programs with full transaction transparency.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl font-bold text-primary-foreground">4</span>
              </div>
              <h3 className="text-xl font-semibold mb-2">Impact Tracking</h3>
              <p className="text-muted-foreground">
                Monitor program progress and impact with comprehensive analytics and reporting tools.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary">
        <div className="container mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-primary-foreground sm:text-4xl">
              Ready to Make a Transparent Impact?
            </h2>
            <p className="mt-4 text-lg text-primary-foreground/80">
              Join donors and NGOs worldwide in creating a more transparent and efficient donation ecosystem.
            </p>
            <div className="mt-8 flex items-center justify-center gap-x-6">
              <Button asChild size="lg" variant="secondary" className="text-lg px-8 py-6">
                <a href={DONOR_DASHBOARD_URL}>
                  Start Donating
                  <ArrowRight className="ml-2 h-5 w-5" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="text-lg px-8 py-6 border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary bg-transparent"
              >
                <a href={NGO_ONBOARDING_URL}>
                  Join as NGO
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
