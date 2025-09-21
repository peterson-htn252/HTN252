const dashboards = [
  {
    title: "Donor Dashboard",
    href: "http://localhost:3000",
    description: "Track contributions, review program impact, and follow the audit trail in real time.",
    icon: "💧",
  },
  {
    title: "NGO Dashboard",
    href: "http://localhost:3001",
    description: "Publish initiatives, manage disbursements, and reconcile grant activity across programs.",
    icon: "🌍",
  },
  {
    title: "Vendor Dashboard",
    href: "http://localhost:3002",
    description: "Redeem vouchers, manage payouts, and keep tabs on beneficiary purchases.",
    icon: "🏪",
  },
  {
    title: "Sign-up Portal",
    href: "http://localhost:3004",
    description: "Register donor with a face map.",
    icon: "🚀",
  },
]

export default function Home() {
  return (
    <main>
      <div className="pill">RippleRelief Toolkit</div>
      <h1>Pick the dashboard that fits your role.</h1>
      <p className="lede">
        This hub routes you to every experience in the RippleRelief demo environment. Launch the interface that matches
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
