// ./impact-dashboard.tsx
import type { ImpactDataUI } from "@/types/donations"

export type ImpactDashboardProps = {
  impactData: ImpactDataUI
}

export function ImpactDashboard({ impactData }: ImpactDashboardProps) {
  const { totalDonated, peopleHelped, programsSupported, transparencyScore } = impactData
  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
      <CardStat label="Total Donated" value={`$${totalDonated.toLocaleString()}`} />
      <CardStat label="People Helped" value={peopleHelped.toLocaleString()} />
      <CardStat label="Programs" value={programsSupported.toString()} />
      <CardStat label="Transparency" value={`${transparencyScore}%`} />
    </div>
  )
}

function CardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  )
}
