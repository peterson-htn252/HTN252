// /lib/use-ngos.ts
import { useEffect, useState } from "react"
import type { NGO } from "@/types/ngo"

export function useNGOs(apiUrl = process.env.NEXT_PUBLIC_NGO_API_URL) {
  const [ngos, setNGOs] = useState<NGO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      try {
        setLoading(true)
        if (!apiUrl) throw new Error("NEXT_PUBLIC_NGO_API_URL is not set")
        const res = await fetch(apiUrl, { cache: "no-store" })
        if (!res.ok) throw new Error(`NGO API failed: ${res.status}`)
        const data = await res.json()
        const list: NGO[] = Array.isArray(data) ? data : (data?.ngos ?? [])
        if (!cancel) setNGOs(list)
      } catch (e: any) {
        if (!cancel) setError(e)
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
  }, [apiUrl])

  return { ngos, loading, error }
}
