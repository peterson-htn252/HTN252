// ./blockchain-tracker.tsx
import type { Donation } from "@/types/donations"

export type BlockchainTrackerProps = {
  donations: Donation[]
}

export function BlockchainTracker({ donations }: BlockchainTrackerProps) {
  if (!donations.length) {
    return <div className="text-muted-foreground">No donations yet.</div>
  }

  return (
    <div className="space-y-3">
      {donations.map((d) => (
        <div key={d.id} className="rounded-xl border p-4 flex items-center justify-between">
          <div>
            <div className="font-medium">{d.program}</div>
            <div className="text-sm text-muted-foreground">
              {(d.amount_cents / 100).toFixed(2)} {d.currency} • {new Date(d.created_at).toLocaleString()}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm">{d.status}</div>
            <div className="text-xs text-muted-foreground truncate max-w-[220px]">
              {d.blockchain_id ?? "pending…"}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
