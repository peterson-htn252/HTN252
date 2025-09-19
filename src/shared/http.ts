import { getApiBaseUrl } from "./env"

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "")
const ensureLeadingSlash = (value: string) => (value.startsWith("/") ? value : `/${value}`)

const buildUrl = (path: string): string => {
  if (/^https?:\/\//i.test(path)) {
    return path
  }
  const base = stripTrailingSlash(getApiBaseUrl())
  return `${base}${ensureLeadingSlash(path)}`
}

export const apiFetch = (path: string, init?: RequestInit) => fetch(buildUrl(path), init)

export const postJson = async <T>(path: string, body: unknown, init?: RequestInit): Promise<T> => {
  const response = await apiFetch(path, {
    ...init,
    method: init?.method ?? "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body ?? {}),
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => undefined)
    const message = (errorPayload as { detail?: string } | undefined)?.detail || response.statusText
    throw new Error(message || "API request failed")
  }

  return (await response.json()) as T
}
