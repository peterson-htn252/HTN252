"use client"

import { useCallback, useEffect, useState } from "react"
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

interface PersonaHostedSummary {
  inquiry_id: string
  reference_id: string
  url: string
  environment: string
  template_id: string
}

interface PersonaVerificationStepProps {
  accountId?: string | null
  onComplete: (summary: PersonaHostedSummary) => void
}

export function PersonaVerificationStep({ accountId, onComplete }: PersonaVerificationStepProps) {
  const [hostedLink, setHostedLink] = useState<PersonaHostedLink | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLaunched, setHasLaunched] = useState(false)
  const [hasAcknowledged, setHasAcknowledged] = useState(false)

  const fetchHostedLink = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      const res = await fetch(`${API_BASE_URL}/persona/hosted-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId ?? undefined }),
      })
      if (!res.ok) {
        const detail = await res.text()
        throw new Error(detail || "Failed to create Persona hosted flow link")
      }
      const data: PersonaHostedLink = await res.json()
      setHostedLink(data)
      setHasLaunched(false)
      setHasAcknowledged(false)
    } catch (err: any) {
      setError(err?.message ?? "Unable to initialize Persona verification")
    } finally {
      setIsLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    if (!hostedLink && !isLoading) {
      void fetchHostedLink()
    }
  }, [fetchHostedLink, hostedLink, isLoading])

  const launchHostedFlow = () => {
    if (!hostedLink) {
      setError("Hosted link is unavailable. Please refresh and try again.")
      return
    }

    window.open(hostedLink.url, "_blank", "noopener,noreferrer")
    setHasLaunched(true)
    setError(null)
  }

  const completeHostedFlow = () => {
    if (!hostedLink) {
      setError("Hosted link is unavailable. Please refresh and try again.")
      return
    }

    setHasAcknowledged(true)
    onComplete({
      inquiry_id: hostedLink.reference_id,
      reference_id: hostedLink.reference_id,
      url: hostedLink.url,
      environment: hostedLink.environment,
      template_id: hostedLink.template_id,
    })
  }

  return (
    <Card className="border-border">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-balance">{"Identity Verification"}</CardTitle>
        <CardDescription className="text-pretty">
          {
            "We use Persona's hosted flow for secure identity verification. Open the secure Persona page, complete the verification steps, then return here to confirm."
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
            <li>{"Launch the hosted Persona verification."}</li>
            <li>{"Complete the document and selfie capture flow in the new tab."}</li>
            <li>{"Return to this window and confirm the verification is finished."}</li>
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

        <div className="rounded-lg border border-dashed p-4 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {"Finished the Persona verification in the new tab? Let us know so we can continue."}
          </p>
          <Button
            type="button"
            variant={hasAcknowledged ? "default" : "secondary"}
            className="gap-2"
            disabled={!hasLaunched || !hostedLink}
            onClick={completeHostedFlow}
          >
            <CheckCircle className="w-4 h-4" />
            {hasAcknowledged ? "Verification confirmed" : "I've completed Persona"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
