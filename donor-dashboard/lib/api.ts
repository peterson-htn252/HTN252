// lib/api.ts

import { API_BASE_URL } from "./config"

export interface NGO {
  ngo_id: string
  name: string
  description: string
  goal: number              // ← number, not string
  status: string
  lifetime_donations: number
  created_at: string
  address?: string
}

export const API_URL = API_BASE_URL

export async function fetchNGOs(): Promise<NGO[]> {
  try {
    const res = await fetch(`${API_URL}/accounts/ngos`, { cache: "no-store" })
    if (!res.ok) throw new Error(`Failed to fetch NGOs: ${res.status}`)

    const json = await res.json()

    // Normalize top-level shape and coerce types
    const rawList: any[] =
      Array.isArray(json) ? json :
      Array.isArray(json?.Items) ? json.Items :
      Array.isArray(json?.data) ? json.data : []

    const ngos: NGO[] = rawList.map((r: any) => ({
      ngo_id: r.ngo_id ?? r.account_id ?? "",
      name: r.name ?? "",
      description: r.description ?? "",
      goal: Number(r.goal ?? 0),
      status: String(r.status ?? "inactive"),
      lifetime_donations: Number(r.lifetime_donations ?? 0),
      created_at: String(r.created_at ?? new Date().toISOString()),
      address: r.address ?? r.xrpl_address ?? "",  // 👈 keep classic r-address
    }))

    return ngos
  } catch (err) {
    console.error("Error fetching NGOs:", err)
    return []
  }
}

// Transform NGO data to match our component interfaces
export function transformNGOsToPrograms(ngos: NGO[]) {
  const arr = Array.isArray(ngos) ? ngos : []
  return arr.map((ngo, index) => ({
    id: ngo.ngo_id,
    name: ngo.name,
    totalRaised: Number(ngo.lifetime_donations ?? 0),
    goal: Math.max(Number(ngo.goal ?? 0), 1),
    beneficiaries: Math.floor(Number(ngo.lifetime_donations || 0) / 20),
    location: index % 3 === 0 ? "Philippines" : index % 3 === 1 ? "Turkey" : "India",
    status: ngo.status === "active" ? ("active" as const) : ("completed" as const),
    lastUpdate: new Date(ngo.created_at).toLocaleDateString(),
    description: ngo.description,
  }))
}

export function calculateImpactData(ngos: NGO[]) {
  const arr = Array.isArray(ngos) ? ngos : []
  const totalDonated = arr.reduce((sum, ngo) => sum + Number(ngo.lifetime_donations || 0), 0)
  const activePrograms = arr.filter((ngo) => String(ngo.status).toLowerCase() === "active").length

  return {
    totalDonated,
    peopleHelped: Math.floor(totalDonated / 20),
    programsSupported: activePrograms,
    transparencyScore: 98,
  }
}

export interface TrackingSample {
  donationId: string
  blockchainId: string | null
  ngoId?: string | null
  amount: number
  currency: string
  status?: string | null
  created_at?: string | null
}

export interface DonationTransaction {
  id: string
  hash: string
  type: string
  amount: number
  currency: string
  timestamp: string | null
  status: string
  from: string
  to: string
  description: string
  gasUsed?: number | null
  blockNumber?: number | null
}

export interface DonationRecipient {
  id: string
  location: string
  amount: number
  status: string
  redeemedAt?: string | null
}

export interface DonationOperationalCostBreakdown {
  category: string
  amount: number
  description: string
}

export interface DonationOperationalCosts {
  amount: number
  percentage: number
  breakdown: DonationOperationalCostBreakdown[]
}

export interface DonationTracking {
  donationId: string
  blockchainId: string
  amount: number
  currency: string
  program: string
  donor: string
  status: string
  ngoId?: string | null
  ngoName?: string | null
  transactions: DonationTransaction[]
  recipients: DonationRecipient[]
  ngoOperationalCosts: DonationOperationalCosts
}

function normalizeTransaction(tx: any): DonationTransaction {
  return {
    id: String(tx?.id ?? ""),
    hash: String(tx?.hash ?? ""),
    type: String(tx?.type ?? "distribution"),
    amount: Number(tx?.amount ?? 0),
    currency: String(tx?.currency ?? "USD"),
    timestamp: tx?.timestamp ?? null,
    status: String(tx?.status ?? "pending"),
    from: String(tx?.from ?? tx?.sender ?? ""),
    to: String(tx?.to ?? tx?.recipient ?? ""),
    description: String(tx?.description ?? ""),
    gasUsed: typeof tx?.gasUsed === "number" ? tx.gasUsed : null,
    blockNumber: typeof tx?.blockNumber === "number" ? tx.blockNumber : null,
  }
}

function normalizeRecipient(rec: any): DonationRecipient {
  return {
    id: String(rec?.id ?? ""),
    location: String(rec?.location ?? "Unknown"),
    amount: Number(rec?.amount ?? 0),
    status: String(rec?.status ?? "pending"),
    redeemedAt: rec?.redeemedAt ?? null,
  }
}

function normalizeOperationalCosts(costs: any): DonationOperationalCosts {
  const breakdownRaw = Array.isArray(costs?.breakdown) ? costs.breakdown : []
  const breakdown: DonationOperationalCostBreakdown[] = breakdownRaw.map((item: any) => ({
    category: String(item?.category ?? ""),
    amount: Number(item?.amount ?? 0),
    description: String(item?.description ?? ""),
  }))

  return {
    amount: Number(costs?.amount ?? 0),
    percentage: Number(costs?.percentage ?? 0),
    breakdown,
  }
}

export async function fetchTrackingSamples(limit = 5): Promise<TrackingSample[]> {
  try {
    const url = `${API_URL}/donor/track?limit=${encodeURIComponent(String(limit))}`
    const res = await fetch(url, { cache: "no-store" })
    if (!res.ok) throw new Error(`Failed to fetch tracking samples: ${res.status}`)

    const data = await res.json()
    const rawSamples: any[] = Array.isArray(data?.samples) ? data.samples : []

    return rawSamples.map((sample) => ({
      donationId: String(sample?.donationId ?? ""),
      blockchainId: sample?.blockchainId ?? null,
      ngoId: sample?.ngoId ?? null,
      amount: Number(sample?.amount ?? 0),
      currency: String(sample?.currency ?? "USD"),
      status: sample?.status ?? null,
      created_at: sample?.created_at ?? null,
    }))
  } catch (error) {
    console.error("Error fetching tracking samples:", error)
    return []
  }
}

export async function trackDonation(trackingId: string): Promise<DonationTracking> {
  const encoded = encodeURIComponent(trackingId)
  const res = await fetch(`${API_URL}/donor/track/${encoded}`, { cache: "no-store" })

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    const message = typeof detail?.detail === "string" ? detail.detail : `Failed to track donation (${res.status})`
    throw new Error(message)
  }

  const data = await res.json()

  return {
    donationId: String(data?.donationId ?? trackingId),
    blockchainId: String(data?.blockchainId ?? trackingId),
    amount: Number(data?.amount ?? 0),
    currency: String(data?.currency ?? "USD"),
    program: String(data?.program ?? "General Aid Program"),
    donor: String(data?.donor ?? "Anonymous Donor"),
    status: String(data?.status ?? "received"),
    ngoId: data?.ngoId ?? null,
    ngoName: data?.ngoName ?? null,
    transactions: Array.isArray(data?.transactions) ? data.transactions.map(normalizeTransaction) : [],
    recipients: Array.isArray(data?.recipients) ? data.recipients.map(normalizeRecipient) : [],
    ngoOperationalCosts: normalizeOperationalCosts(data?.ngoOperationalCosts),
  }
}
