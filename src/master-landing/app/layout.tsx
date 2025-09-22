import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "PulseRelief Dashboards",
  description: "Central hub for navigating PulseRelief donor, NGO, vendor, and onboarding tools.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
