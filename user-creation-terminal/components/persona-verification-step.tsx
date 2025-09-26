"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Shield, CheckCircle, ExternalLink, RefreshCw, AlertCircle } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { API_BASE_URL } from "@/lib/config"

interface PersonaHostedLink {
  url: string
  reference_id: string
  environment: string
  template_id: string
}

interface PersonaInquirySummary {
  inquiry_id: string
  status?: string | null
  reference_id?: string | null
  account_id?: string | null
  first_name?: string | null
  last_name?: string | null
  date_of_birth?: string | null
  id_number?: string | null
  address?: string | null
  document_type?: string | null
  confidence?: number | null
  expiration_date?: string | null
  decision?: string | null
  risk_score?: number | null
  fields?: Record<string, unknown>
  environment?: string | null
}

interface PersonaVerificationStepProps {
  accountId?: string | null
  onComplete: (summary: PersonaInquirySummary & { url: string; environment: string }) => void
}

type PendingReturn = {
  inquiryId?: string
  referenceId?: string
  status?: string
  state?: string
}

const STATUS_MESSAGES: Record<string, string> = {
  approved: "Identity verified successfully",
  completed: "Verification complete",
  declined: "Verification declined",
  expired: "Verification expired",
  failed: "Verification failed",
  needs_input: "Additional information required",
  pending: "Verification pending review",
  reopened: "Verification reopened",
  started: "Verification started",
}

const FALLBACK_CONFIDENCE = 0.85
const PERSONA_ENV_FALLBACK = process.env.NEXT_PUBLIC_PERSONA_ENV ?? "sandbox"

export function PersonaVerificationStep({ accountId, onComplete }: PersonaVerificationStepProps) {
  const [hostedLink, setHostedLink] = useState<PersonaHostedLink | null>(null)
  const [flowState, setFlowState] = useState<string | null>(null)
  const [summary, setSummary] = useState<PersonaInquirySummary | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLaunched, setHasLaunched] = useState(false)
  const [redirectUri, setRedirectUri] = useState<string | null>(null)
  const [pendingReturn, setPendingReturn] = useState<PendingReturn | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    setRedirectUri(`${window.location.origin}${window.location.pathname}`)

    try {
      const storedLink = window.localStorage.getItem("personaHostedLink")
      if (storedLink) {
        setHostedLink(JSON.parse(storedLink))
      }
    } catch (err) {
      console.warn("Failed to read stored Persona link", err)
      window.localStorage.removeItem("personaHostedLink")
    }

    const storedState = window.localStorage.getItem("personaFlowState")
    if (storedState) {
      setFlowState(storedState)
    }

    const params = new URLSearchParams(window.location.search)
    const inquiryId =
      params.get("inquiry_id") ??
      params.get("inquiry-id") ??
      params.get("persona_inquiry_id") ??
      params.get("persona_inquiry-id") ??
      undefined
    const referenceId =
      params.get("reference_id") ??
      params.get("reference-id") ??
      params.get("referenceId") ??
      params.get("persona_reference_id") ??
      params.get("persona_reference-id") ??
      params.get("personaReferenceId") ??
      undefined
    const retStatus = params.get("status") ?? params.get("persona_status") ?? undefined
    const retState = params.get("state") ?? undefined
    if (inquiryId || referenceId) {
      setPendingReturn({ inquiryId, referenceId, status: retStatus, state: retState })
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (hostedLink) {
      window.localStorage.setItem("personaHostedLink", JSON.stringify(hostedLink))
    }
  }, [hostedLink])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (flowState) {
      window.localStorage.setItem("personaFlowState", flowState)
    }
  }, [flowState])

  const generateState = useCallback(() => {
    if (typeof window === "undefined") return Math.random().toString(36).slice(2)
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID()
    }
    return Math.random().toString(36).slice(2)
  }, [])

  const fetchHostedLink = useCallback(async () => {
    if (!redirectUri) return
    try {
      setIsLoading(true)
      setError(null)
      const newState = generateState()
      const res = await fetch(`${API_BASE_URL}/persona/hosted-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId ?? undefined,
          redirect_uri: redirectUri,
          state: newState,
        }),
      })
      if (!res.ok) {
        const detail = await res.text()
        throw new Error(detail || "Failed to create Persona hosted flow link")
      }
      const data: PersonaHostedLink = await res.json()
      setHostedLink(data)
      setFlowState(newState)
      setSummary(null)
      setStatus(null)
      setHasLaunched(false)
    } catch (err: any) {
      setError(err?.message ?? "Unable to initialize Persona verification")
    } finally {
      setIsLoading(false)
    }
  }, [accountId, generateState, redirectUri])

  useEffect(() => {
    if (!hostedLink && !isLoading && redirectUri) {
      void fetchHostedLink()
    }
  }, [fetchHostedLink, hostedLink, isLoading, redirectUri])

  const launchHostedFlow = () => {
    if (!hostedLink) {
      setError("Hosted link is unavailable. Please refresh and try again.")
      return
    }

    window.location.href = hostedLink.url
    setHasLaunched(true)
    setError(null)
  }

  const retrieveInquiryDetails = useCallback(async (override?: PendingReturn) => {
    const inquiryId = override?.inquiryId
    const referenceId = override?.referenceId ?? hostedLink?.reference_id ?? summary?.reference_id
    const returnState = override?.state

    if (!inquiryId && !referenceId) {
      setError("Unable to determine Persona inquiry to retrieve. Please restart the verification.")
      return
    }
    if (returnState && flowState && returnState !== flowState) {
      setError("Persona verification session mismatch. Please restart the verification.")
      setPendingReturn(null)
      return
    }
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch(`${API_BASE_URL}/persona/inquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inquiry_id: inquiryId ?? undefined,
          reference_id: referenceId ?? undefined,
          account_id: accountId ?? undefined,
        }),
      })
      if (!res.ok) {
        const detail = await res.text()
        throw new Error(detail || "Unable to retrieve Persona inquiry details. Please try again shortly.")
      }
      const data: PersonaInquirySummary = await res.json()
      const resolvedReference = data.reference_id ?? referenceId ?? hostedLink?.reference_id ?? summary?.reference_id ?? null
      const resolvedEnvironment = data.environment ?? hostedLink?.environment ?? PERSONA_ENV_FALLBACK
      const mergedData: PersonaInquirySummary = {
        ...data,
        reference_id: resolvedReference ?? undefined,
        environment: resolvedEnvironment,
      }
      setSummary(mergedData)
      setStatus(mergedData.status ?? override?.status ?? null)
      onComplete({
        ...mergedData,
        url: hostedLink?.url ?? "",
        environment: resolvedEnvironment,
      })
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("personaHostedLink")
        window.localStorage.removeItem("personaFlowState")
        const params = new URLSearchParams(window.location.search)
        ;["inquiry_id", "persona_inquiry_id", "reference_id", "persona_reference_id", "status", "persona_status", "state"].forEach(
          (key) => params.delete(key)
        )
        const newUrl = params.toString() ? `${window.location.pathname}?${params.toString()}` : window.location.pathname
        window.history.replaceState({}, document.title, newUrl)
      }
      setFlowState(null)
      setPendingReturn(null)
    } catch (err: any) {
      setError(err?.message ?? "Unable to finalize Persona verification")
    } finally {
      setIsLoading(false)
    }
  }, [accountId, flowState, hostedLink, onComplete, summary])

  const statusMessage = useMemo(() => {
    if (!status) {
      return "Launch the Persona verification flow to begin."
    }
    return STATUS_MESSAGES[status] ?? status
  }, [status])

  useEffect(() => {
    if (!pendingReturn) return
    void retrieveInquiryDetails(pendingReturn)
  }, [pendingReturn, retrieveInquiryDetails])

  useEffect(() => {
    if (pendingReturn) {
      setHasLaunched(true)
    }
  }, [pendingReturn])

  return (
    <Card className="border-border">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-balance">{"Identity Verification"}</CardTitle>
        <CardDescription className="text-pretty">
          {
            "We use Persona's hosted flow for secure identity verification. Complete the verification in the new tab, then pull the results back here."
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 text-sm text-muted-foreground">
          <p>{"Steps:"}</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>{"Open the Persona verification in a new tab."}</li>
            <li>{"Complete the document and selfie capture steps."}</li>
            <li>{"Return here and fetch the verification results."}</li>
          </ol>
        </div>

        {hostedLink && (
          <div className="space-y-3 rounded-lg border p-4 bg-muted/40">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <span className="font-semibold text-sm">{"Hosted Flow Details"}</span>
              </div>
              <Badge variant="outline" className="uppercase text-xs">
                {hostedLink.environment}
              </Badge>
            </div>
            <div className="space-y-1 text-sm">
              <p className="text-muted-foreground">{"Reference"}</p>
              <p className="font-mono text-xs break-all">{hostedLink.reference_id}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => navigator.clipboard?.writeText(hostedLink.url)}
            >
              <ExternalLink className="w-4 h-4" />
              {"Copy verification link"}
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            className="flex-1 gap-2"
            onClick={launchHostedFlow}
            disabled={isLoading || !hostedLink}
          >
            <ExternalLink className="w-4 h-4" />
            {hasLaunched ? "Reopen Persona" : "Open Persona verification"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 gap-2"
            onClick={fetchHostedLink}
            disabled={isLoading}
          >
            <RefreshCw className="w-4 h-4" />
            {"Refresh link"}
          </Button>
        </div>

        <div className="rounded-lg border border-dashed p-4 space-y-3 text-center">
          <p className="text-sm text-muted-foreground">{statusMessage}</p>
          <Button
            type="button"
            variant={summary ? "default" : "secondary"}
            className="gap-2"
            disabled={!hasLaunched || (!hostedLink && !summary) || isLoading}
            onClick={() => void retrieveInquiryDetails()}
          >
            <CheckCircle className="w-4 h-4" />
            {summary ? "Refresh Persona status" : "Pull Persona results"}
          </Button>
        </div>

        {summary && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3 p-4 bg-primary/5 rounded-lg">
              <Shield className="w-6 h-6 text-primary" />
              <div className="text-center">
                <p className="font-semibold">{"Persona verification details"}</p>
                <p className="text-sm text-muted-foreground">
                  {STATUS_MESSAGES[summary.status ?? "completed"] ?? summary.status ?? "Verification details retrieved"}
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">{"Name"}</p>
                <p className="font-semibold text-lg">
                  {[summary.first_name, summary.last_name].filter(Boolean).join(" ") || "—"}
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">{"Date of birth"}</p>
                <p className="font-semibold text-lg">{summary.date_of_birth || "—"}</p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">{"ID number"}</p>
                <p className="font-semibold text-lg">{summary.id_number || "—"}</p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">{"Document type"}</p>
                <p className="font-semibold text-lg">{summary.document_type || "—"}</p>
              </div>
              <div className="border rounded-lg p-4 md:col-span-2">
                <p className="text-sm text-muted-foreground">{"Address"}</p>
                <p className="font-semibold text-lg">{summary.address || "—"}</p>
              </div>
              <div className="border rounded-lg p-4">
                <p className="text-sm text-muted-foreground">{"Confidence"}</p>
                <p className="font-semibold text-lg">
                  {summary.confidence ? `${Math.round(summary.confidence * 100)}%` : `${Math.round(FALLBACK_CONFIDENCE * 100)}%`}
                </p>
              </div>
              {typeof summary.risk_score === "number" && (
                <div className="border rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">{"Risk score"}</p>
                  <p className="font-semibold text-lg">{summary.risk_score.toFixed(2)}</p>
                </div>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              <p className="font-semibold mb-1">{"Raw fields"}</p>
              <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto">
                {JSON.stringify(summary.fields ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
