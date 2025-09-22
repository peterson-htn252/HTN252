import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const hoisted = vi.hoisted(() => ({
  fetchNgosMock: vi.fn<[], Promise<any[]>>(),
  stripeSpy: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  fetchNGOs: hoisted.fetchNgosMock,
  API_URL: "http://example.com",
}))

vi.mock("@/components/StripePay", () => ({
  StripePay: (props: any) => {
    hoisted.stripeSpy(props)
    return <div data-testid="stripe-pay">Stripe Pay</div>
  },
}))

const { fetchNgosMock, stripeSpy } = hoisted

import { DonationForm } from "../components/donation-form"

describe("DonationForm", () => {
  beforeEach(() => {
    fetchNgosMock.mockReset()
    stripeSpy.mockClear()
  })

  it("loads NGO programs and advances to the amount step when one is selected", async () => {
    fetchNgosMock.mockResolvedValue([
      {
        account_id: "ngo-1",
        name: "Clean Water",
        description: "Bring water",
        goal: 1000,
        status: "active",
        lifetime_donations: 500,
        created_at: "2024-01-01T00:00:00Z",
        address: "rNGO",
      },
    ])

    render(<DonationForm />)

    const programCard = await screen.findByText("Clean Water")
    expect(programCard).toBeInTheDocument()

    await userEvent.click(programCard)

    expect(await screen.findByText(/Donation Amount/i)).toBeInTheDocument()
  })

  it("sends ripple payments and shows the blockchain confirmation", async () => {
    fetchNgosMock.mockResolvedValue([
      {
        account_id: "ngo-1",
        name: "Clean Water",
        description: "Bring water",
        goal: 1000,
        status: "active",
        lifetime_donations: 500,
        created_at: "2024-01-01T00:00:00Z",
        address: "rNGO",
      },
    ])

    const fetchResponse = {
      ok: true,
      json: async () => ({ donationId: "DON123", txHash: "HASH456" }),
    }
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(fetchResponse as Response)
    const onComplete = vi.fn()

    render(<DonationForm onDonationComplete={onComplete} />)

    const programCard = await screen.findByText("Clean Water")
    await userEvent.click(programCard)

    const amountInput = await screen.findByLabelText(/Custom Amount/i)
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, "50")

    const continueButton = screen.getByRole("button", { name: /Continue to Payment/i })
    await userEvent.click(continueButton)

    const rippleButton = screen.getByRole("button", { name: /Ripple \(XRPL\)/i })
    await userEvent.click(rippleButton)

    const emailInput = screen.getByLabelText(/Email Address/i)
    await userEvent.type(emailInput, "donor@example.com")

    const payButton = screen.getByRole("button", { name: /Pay \$50 with XRPL/i })
    await userEvent.click(payButton)

    expect(await screen.findByText(/Donation Successful!/i)).toBeInTheDocument()
    expect(onComplete).toHaveBeenCalledWith("DON123", "HASH456")
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://example.com/donor/xrpl/send-dev",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    )

    const body = JSON.parse((fetchSpy.mock.calls[0]?.[1]?.body as string) ?? "{}")
    expect(body).toMatchObject({
      to: "rNGO",
      amountXrp: 50,
      programId: "ngo-1",
      email: "donor@example.com",
    })
  })
})
