import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import DonationPlatform from "../app/page"

describe("Landing Donation Platform", () => {
  it("highlights the hero call to action", () => {
    render(<DonationPlatform />)

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /Transparent Donations with Blockchain Trust/i,
      })
    ).toBeInTheDocument()

    expect(screen.getByText(/HTN252 • Powered by Ripple XRPL/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Browse Programs/i })).toBeInTheDocument()
    const joinButtons = screen.getAllByRole("button", { name: /Join as NGO/i })
    expect(joinButtons.length).toBeGreaterThan(0)
  })

  it("lists featured donation programs with actionable buttons", () => {
    render(<DonationPlatform />)

    expect(
      screen.getByRole("heading", { level: 2, name: /Active Donation Programs/i })
    ).toBeInTheDocument()

    const featuredPrograms = [
      "Clean Water for Rural Communities",
      "School Supplies for Refugee Children",
      "Emergency Food Relief",
    ]
    featuredPrograms.forEach((title) => {
      expect(screen.getByText(title)).toBeInTheDocument()
    })

    const donateButtons = screen.getAllByRole("button", { name: /Donate Now/i })
    expect(donateButtons).toHaveLength(3)
  })

  it("promotes the platform trust features", () => {
    render(<DonationPlatform />)

    expect(
      screen.getByRole("heading", { level: 2, name: /Built for Trust & Impact/i })
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Verified NGOs/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Donation Tracking/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Instant Verification/i).length).toBeGreaterThan(0)
  })
})
