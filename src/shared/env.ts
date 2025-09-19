const DEV_HOSTNAMES = new Set(["localhost", "127.0.0.1"])

type RuntimeEnv = "development" | "production"

const normalizeEnv = (value: string | undefined): RuntimeEnv | undefined => {
  if (!value) return undefined
  const normalized = value.toLowerCase()
  if (normalized.startsWith("prod")) return "production"
  if (normalized.startsWith("dev")) return "development"
  return undefined
}

export const detectRuntimeEnv = (): RuntimeEnv => {
  const explicit =
    normalizeEnv(process.env.NEXT_PUBLIC_RUNTIME_ENV) ||
    normalizeEnv(process.env.NEXT_PUBLIC_APP_ENV)
  if (explicit) return explicit

  if (typeof window !== "undefined") {
    const host = window.location.hostname
    if (host && !DEV_HOSTNAMES.has(host.toLowerCase())) {
      return "production"
    }
  }

  return normalizeEnv(process.env.NODE_ENV) || "development"
}

const firstDefined = (keys: Array<string | undefined>): string | undefined => {
  for (const key of keys) {
    if (!key) continue
    const value = process.env[key]
    if (value) return value
  }
  return undefined
}

interface ResolveUrlOptions {
  devKey?: string
  prodKey?: string
  baseKey?: string
  fallbackDev?: string
  fallbackProd?: string
}

export const resolveEnvironmentUrl = ({
  devKey,
  prodKey,
  baseKey,
  fallbackDev,
  fallbackProd,
}: ResolveUrlOptions): string => {
  const env = detectRuntimeEnv()
  const preferredKeys =
    env === "production"
      ? [prodKey, baseKey, devKey]
      : [devKey, baseKey, prodKey]

  const url = firstDefined(preferredKeys)
  if (url) return url

  if (env === "production") {
    return fallbackProd ?? fallbackDev ?? ""
  }
  return fallbackDev ?? fallbackProd ?? ""
}

export const getApiBaseUrl = (): string =>
  resolveEnvironmentUrl({
    devKey: "NEXT_PUBLIC_API_BASE_URL_DEV",
    prodKey: "NEXT_PUBLIC_API_BASE_URL_PROD",
    baseKey: "NEXT_PUBLIC_API_BASE_URL",
    fallbackDev: "http://localhost:8000",
  })
