// /types/donations.ts

// Row shape coming from Supabase (snake_case from SQL/view)
export type Donation = {
  id: string
  amount_cents: number
  currency: string
  program: string
  status: "distributed" | "in-progress"
  location: string | null
  blockchain_id: string | null
  recipients: number | null
  created_at: string
}

export type ImpactDataDB = {
  total_donated: number
  people_helped: number
  programs_supported: number
  transparency_score: number
}

// CamelCase shape your React components will use
export type ImpactDataUI = {
  totalDonated: number
  peopleHelped: number
  programsSupported: number
  transparencyScore: number
}
