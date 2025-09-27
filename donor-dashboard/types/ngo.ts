// /types/ngo.ts
export type NGO = {
  ngo_id: string
  name: string
  description: string
  goal: string
  status: "active" | "suspended" | string
  lifetime_donations: number
  created_at: string
}
