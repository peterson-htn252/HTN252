export interface NGO {
  account_id: string
  name: string
  description: string
  goal: string
  status: string
  lifetime_donations: number
  created_at: string
}

export async function fetchNGOs(): Promise<NGO[]> {
  try {
    const response = await fetch("http://127.0.0.1:8000/accounts/ngos")
    if (!response.ok) {
      throw new Error("Failed to fetch NGOs")
    }
    return await response.json()
  } catch (error) {
    console.error("Error fetching NGOs:", error)
    return []
  }
}

// Transform NGO data to match our component interfaces
export function transformNGOsToPrograms(ngos: NGO[]) {
  return ngos.map((ngo, index) => ({
    id: ngo.account_id,
    name: ngo.name,
    totalRaised: ngo.lifetime_donations,
    goal: Math.max(ngo.lifetime_donations * 2, 50000), // Estimate goal as 2x current donations or minimum 50k
    beneficiaries: Math.floor(ngo.lifetime_donations / 20), // Estimate 1 beneficiary per $20
    location: index % 3 === 0 ? "Philippines" : index % 3 === 1 ? "Turkey" : "India", // Distribute across regions
    status: ngo.status === "active" ? ("active" as const) : ("completed" as const),
    lastUpdate: new Date(ngo.created_at).toLocaleDateString(),
    description: ngo.description,
  }))
}

export function calculateImpactData(ngos: NGO[]) {
  const totalDonated = ngos.reduce((sum, ngo) => sum + ngo.lifetime_donations, 0)
  const activePrograms = ngos.filter((ngo) => ngo.status === "active").length

  return {
    totalDonated,
    peopleHelped: Math.floor(totalDonated / 20), // Estimate 1 person helped per $20
    programsSupported: activePrograms,
    transparencyScore: 98, // Fixed high transparency score
  }
}
