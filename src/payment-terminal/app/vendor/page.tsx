import { VendorScreen } from "@/components/vendor-screen"
import type { TransactionData } from "@/components/payment-terminal"

export default function VendorPage() {
  const handleCheckout = async (data: TransactionData) => {
    await fetch("/api/checkout/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  }

  return <VendorScreen vendorName="Block Terminal" onCheckoutRequest={handleCheckout} />
}
