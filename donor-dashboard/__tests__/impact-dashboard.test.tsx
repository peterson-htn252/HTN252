import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const apiMocks = vi.hoisted(() => ({
  fetchNgosMock: vi.fn<[], Promise<any[]>>(),
  transformProgramsMock: vi.fn(),
  calculateImpactMock: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  API_URL: "https://example.com",
  fetchNGOs: apiMocks.fetchNgosMock,
  transformNGOsToPrograms: apiMocks.transformProgramsMock,
  calculateImpactData: apiMocks.calculateImpactMock,
}))

const { fetchNgosMock, transformProgramsMock, calculateImpactMock } = apiMocks

type ImpactDashboardComponent = (typeof import("../components/impact-dashboard"))["ImpactDashboard"]
let ImpactDashboard: ImpactDashboardComponent

describe("ImpactDashboard", () => {
  beforeEach(async () => {
    fetchNgosMock.mockReset()
    transformProgramsMock.mockReset()
    calculateImpactMock.mockReset()
    vi.resetModules()
    ;({ ImpactDashboard } = await import("../components/impact-dashboard"))
  })

  it("renders impact metrics and programs from the API", async () => {
    const ngo = {
      account_id: "ngo-1",
      name: "Water Wells",
      description: "Clean water access",
      goal: 1000,
      status: "active",
      lifetime_donations: 5000,
      created_at: "2024-01-01T00:00:00Z",
      address: "rNGO",
    }
    fetchNgosMock.mockResolvedValue([ngo])
    transformProgramsMock.mockReturnValue([
      {
        id: "ngo-1",
        name: "Water Wells",
        totalRaised: 5000,
        goal: 10000,
        beneficiaries: 250,
        location: "Kenya",
        status: "active" as const,
        lastUpdate: "Jan 1",
        description: "Clean water access",
      },
    ])
    calculateImpactMock.mockReturnValue({
      totalDonated: 5000,
      peopleHelped: 250,
      programsSupported: 1,
      transparencyScore: 96,
    })

    render(<ImpactDashboard />)

    expect(await screen.findByText("$5,000")).toBeInTheDocument()
    expect(screen.getByText("250")).toBeInTheDocument()
    const programNames = screen.getAllByText(/Water Wells/)
    expect(programNames.length).toBeGreaterThan(0)
  })

  it("surfaces errors when NGO data cannot be loaded", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    fetchNgosMock.mockRejectedValue(new Error("Network error"))

    render(<ImpactDashboard />)

    expect(await screen.findByText(/Failed to load NGO data/i)).toBeInTheDocument()
    expect(screen.getByText(/API server is running/i)).toBeInTheDocument()

    consoleSpy.mockRestore()
  })
})
