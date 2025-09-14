// ./audit-trail.tsx
import type { Donation } from "@/types/donations"

export type AuditTrailProps = {
  donations: Donation[]
}

export function AuditTrail({ donations }: AuditTrailProps) {
  if (!donations.length) {
    return <div className="text-muted-foreground">No records.</div>
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <Th>Time</Th>
            <Th>Program</Th>
            <Th>Amount</Th>
            <Th>Status</Th>
            <Th>Location</Th>
            <Th>Tx / Reference</Th>
          </tr>
        </thead>
        <tbody>
          {donations.map((d) => (
            <tr key={d.id} className="border-t">
              <Td>{new Date(d.created_at).toLocaleString()}</Td>
              <Td>{d.program}</Td>
              <Td>
                ${ (d.amount_cents / 100).toFixed(2) } {d.currency}
              </Td>
              <Td>{d.status}</Td>
              <Td>{d.location ?? "-"}</Td>
              <Td className="max-w-[280px] truncate">{d.blockchain_id ?? "-"}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <th className={`text-left px-3 py-2 font-medium ${className ?? ""}`}>
      {children}
    </th>
  )
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>
}
