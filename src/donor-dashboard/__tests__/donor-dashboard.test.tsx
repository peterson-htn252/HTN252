import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const apiMocks = vi.hoisted(() => ({
  fetchNgosMock: vi.fn<[], Promise<any[]>>(),
  calculateImpactDataMock: vi.fn(),
  transformProgramsMock: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  fetchNGOs: apiMocks.fetchNgosMock,
  calculateImpactData: apiMocks.calculateImpactDataMock,
  transformNGOsToPrograms: apiMocks.transformProgramsMock,
}))

vi.mock("../components/donation-form", () => ({
  DonationForm: () => <div data-testid="donation-form">Donation Form</div>,
}))

vi.mock("../components/blockchain-tracker", () => ({
  BlockchainTracker: () => <div data-testid="blockchain-tracker">Blockchain Tracker</div>,
}))

vi.mock("../components/audit-trail", () => ({
  AuditTrail: () => <div data-testid="audit-trail">Audit Trail</div>,
}))

const { fetchNgosMock, calculateImpactDataMock, transformProgramsMock } = apiMocks

import { DonorDashboard } from "../components/donor-dashboard"

describe("DonorDashboard", () => {
  beforeEach(() => {
    fetchNgosMock.mockResolvedValue([])
    calculateImpactDataMock.mockReturnValue({
      totalDonated: 12345,
      peopleHelped: 678,
      programsSupported: 3,
      transparencyScore: 97,
    })
    transformProgramsMock.mockReturnValue([])
  })

  it("renders the donor dashboard hero and donation form by default", async () => {
    render(<DonorDashboard />)

    expect(await screen.findByText(/Ripple Relief/i)).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: /Track Every Dollar/i })).toBeInTheDocument()
    expect(screen.getByTestId("donation-form")).toBeInTheDocument()
    await waitFor(() => expect(fetchNgosMock).toHaveBeenCalled())
  })

  it("passes computed impact metrics to the impact dashboard", async () => {
    const impact = {
      totalDonated: 555,
      peopleHelped: 42,
      programsSupported: 6,
      transparencyScore: 99,
    }
    calculateImpactDataMock.mockReturnValueOnce(impact)

    const ngoData = [
      {
        account_id: "ngo-1",
        name: "Water Wells",
        description: "Clean water access",
        goal: 1000,
        status: "active",
        lifetime_donations: 500,
        created_at: "2024-01-01T00:00:00Z",
        address: "rNGO",
      },
    ]
    transformProgramsMock.mockImplementation(() => [
      {
        id: "ngo-1",
        name: "Water Wells",
        totalRaised: 500,
        goal: 1000,
        beneficiaries: 25,
        location: "Kenya",
        status: "active" as const,
        lastUpdate: "Jan 1",
        description: "Clean water access",
      },
    ])
    fetchNgosMock.mockImplementation(async () => ngoData)

    render(<DonorDashboard />)

    await waitFor(() => expect(calculateImpactDataMock).toHaveBeenCalledWith(ngoData))
  })

  it("lets donors switch between the major dashboard tabs", async () => {
    render(<DonorDashboard />)
    const user = userEvent.setup()

    const donateTab = await screen.findByRole("tab", { name: /Donate/i })
    expect(donateTab).toHaveAttribute("aria-selected", "true")

    const trackerTab = screen.getByRole("tab", { name: /Blockchain Tracker/i })
    await user.click(trackerTab)

    await waitFor(() => expect(trackerTab).toHaveAttribute("aria-selected", "true"))

    const trackerPanel = screen.getByTestId("blockchain-tracker").closest("[data-slot='tabs-content']")
    expect(trackerPanel).toHaveAttribute("data-state", "active")
  })
})
