const DONOR_DASHBOARD_URL = process.env.NEXT_PUBLIC_DONOR_DASHBOARD_URL ?? "http://localhost:3000"
const NGO_DASHBOARD_URL = process.env.NEXT_PUBLIC_NGO_DASHBOARD_URL ?? "http://localhost:3001"
const VENDOR_DASHBOARD_URL = process.env.NEXT_PUBLIC_VENDOR_DASHBOARD_URL ?? "http://localhost:3002"
const SIGNUP_PORTAL_URL = process.env.NEXT_PUBLIC_SIGNUP_PORTAL_URL ?? "http://localhost:3004"

const dashboards = [
  {
    title: "Donor Dashboard",
    href: DONOR_DASHBOARD_URL,
    description: "Track donations and impact.",
    icon: "💧",
  },
  {
    title: "NGO Dashboard",
    href: NGO_DASHBOARD_URL,
    description: "Manage programs and disbursements.",
    icon: "🌍",
  },
  {
    title: "Vendor Dashboard",
    href: VENDOR_DASHBOARD_URL,
    description: "Accept payments from recipients.",
    icon: "🏪",
  },
  {
    title: "Sign-up Portal",
    href: SIGNUP_PORTAL_URL,
    description: "Register donor with a face map.",
    icon: "🚀",
  },
]

export default function Home() {
  return (
    <main>
      <div className="pill">PulseRelief Toolkit</div>
      <h1>Pick the dashboard that fits your role.</h1>
      <p className="lede">
        This hub routes you to every experience in the PulseRelief demo environment. Launch the interface that matches
        what you want to explore first.
      </p>
      <div className="grid">
        {dashboards.map((dashboard) => (
          <a key={dashboard.title} className="tile" href={dashboard.href} target="_blank" rel="noreferrer">
            <span className="label">
              <span aria-hidden>{dashboard.icon}</span>
              {dashboard.title}
            </span>
            <p>{dashboard.description}</p>
          </a>
        ))}
      </div>
    </main>
  )
}
