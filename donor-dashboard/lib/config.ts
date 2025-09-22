const PROD_BACKEND_URL_DEFAULT = "https://relief-919616498022.northamerica-northeast2.run.app"
const DEFAULT_DEV_URL = "http://127.0.0.1:8000"
const ALT_DEV_URL = "http://localhost:8000"

function normalizeUrl(url?: string | null): string | undefined {
  if (!url) {
    return undefined
  }
  const trimmed = url.trim()
  if (!trimmed) {
    return undefined
  }
  return trimmed.replace(/\/+$/, "")
}

export function getApiBaseUrl(): string {
  const explicit = normalizeUrl(process.env.NEXT_PUBLIC_API_URL)
  if (explicit) {
    return explicit
  }

  const env = (
    process.env.NEXT_PUBLIC_API_ENV ?? process.env.NEXT_PUBLIC_ENVIRONMENT ?? ""
  ).toLowerCase()

  const prodUrl =
    [process.env.NEXT_PUBLIC_PROD_API_URL, PROD_BACKEND_URL_DEFAULT]
      .map((candidate) => normalizeUrl(candidate))
      .find((value): value is string => Boolean(value)) ?? PROD_BACKEND_URL_DEFAULT

  const devUrl =
    [
      process.env.NEXT_PUBLIC_DEV_API_URL,
      process.env.NEXT_PUBLIC_LOCAL_API_URL,
      DEFAULT_DEV_URL,
      ALT_DEV_URL,
    ]
      .map((candidate) => normalizeUrl(candidate))
      .find((value): value is string => Boolean(value)) ?? DEFAULT_DEV_URL

  if (env === "prod" || env === "production") {
    return prodUrl
  }

  if (env === "dev" || env === "development") {
    return devUrl
  }

  if (process.env.NODE_ENV?.toLowerCase() === "production") {
    return prodUrl
  }

  return devUrl
}

export const API_BASE_URL = getApiBaseUrl()
