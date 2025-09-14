// lib/api.ts

export interface NGO {
  account_id: string
  name: string
  description: string
  goal: number              // ← number, not string
  status: string
  lifetime_donations: number
  created_at: string
  address?: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"

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
      account_id: r.account_id ?? r.ngo_id ?? "",
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
    id: ngo.account_id,
    name: ngo.name,
    totalRaised: Number(ngo.lifetime_donations || 0),
    goal: Math.max(Number(ngo.lifetime_donations || 0) * 2, 50_000),
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
