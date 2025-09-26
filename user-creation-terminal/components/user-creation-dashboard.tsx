"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, Camera, User, Shield, FileText } from "lucide-react"
import { FaceScanStep } from "@/components/face-scan-step"
import { PersonaVerificationStep } from "@/components/persona-verification-step"
import { ReviewStep } from "@/components/review-step"
import { API_BASE_URL } from "@/lib/config"

type Step = "welcome" | "face-scan" | "persona" | "review" | "complete"

const STORAGE_KEY = "userCreationTerminalState"

export function UserCreationDashboard() {
  const [currentStep, setCurrentStep] = useState<Step>("welcome")
  const [faceScanComplete, setFaceScanComplete] = useState(false)
  const [personaComplete, setPersonaComplete] = useState(false)
  const [extractedData, setExtractedData] = useState<any>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  const steps = [
    { id: "welcome", title: "Welcome", icon: User },
    { id: "face-scan", title: "Face Scan", icon: Camera },
    { id: "persona", title: "ID Verification", icon: Shield },
    { id: "review", title: "Review", icon: FileText },
  ]

  const getStepProgress = () => {
    const stepIndex = steps.findIndex((step) => step.id === currentStep)
    return ((stepIndex + 1) / steps.length) * 100
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY)
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw)
      if (parsed.currentStep && steps.some((step) => step.id === parsed.currentStep)) {
        setCurrentStep(parsed.currentStep as Step)
      }
      if (typeof parsed.faceScanComplete === "boolean") {
        setFaceScanComplete(parsed.faceScanComplete)
      }
      if (typeof parsed.personaComplete === "boolean") {
        setPersonaComplete(parsed.personaComplete)
      }
      if (parsed.extractedData) {
        setExtractedData(parsed.extractedData)
      }
      if (parsed.accountId) {
        setAccountId(parsed.accountId)
      }
      if (parsed.sessionId) {
        setSessionId(parsed.sessionId)
      }
    } catch (error) {
      console.warn("Failed to restore onboarding state", error)
      window.sessionStorage.removeItem(STORAGE_KEY)
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return
    }
    // Remove sensitive fields from extractedData before persisting
    let safeExtractedData = extractedData
    if (extractedData && typeof extractedData === "object") {
      const { dateOfBirth, idNumber, ...rest } = extractedData
      safeExtractedData = { ...rest }
    }
    const payload = {
      currentStep,
      faceScanComplete,
      personaComplete,
      extractedData: safeExtractedData,
      accountId,
      sessionId,
    }
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      console.warn("Failed to persist onboarding state", error)
    }
  }, [hydrated, currentStep, faceScanComplete, personaComplete, extractedData, accountId, sessionId])

  useEffect(() => {
    if (currentStep === "complete" && typeof window !== "undefined") {
      window.sessionStorage.removeItem(STORAGE_KEY)
    }
  }, [currentStep])

  const handleFaceScanComplete = async (faceData: any) => {
    const fd = new FormData()
    if (accountId) fd.append("account_id", accountId)
    for (const f of faceData.files) fd.append("files", f)
    const res = await fetch(`${API_BASE_URL}/face/enroll`, {
      method: "POST",
      body: fd,
    })
    const data = await res.json()
    if (!data || !data.face_id) {
      alert("Face enrollment failed. Please try again.")
      return
    }
    setSessionId(data.session_id)
    setAccountId(data.account_id)
    setFaceScanComplete(true)
    setPersonaComplete(false)
    setCurrentStep("persona")
  }

  const handlePersonaComplete = (summary: any) => {
    setPersonaComplete(true)
    setExtractedData({
      firstName: summary.first_name ?? "",
      lastName: summary.last_name ?? "",
      dateOfBirth: summary.date_of_birth ?? "",
      idNumber: summary.id_number ?? "",
      address: summary.address ?? "",
      expirationDate: summary.expiration_date ?? "",
      idType: summary.document_type ?? "Government ID",
      confidence: summary.confidence ?? 0.85,
      inquiryId: summary.inquiry_id,
      personaReferenceId: summary.reference_id,
      personaHostedUrl: summary.url,
      personaEnvironment: summary.environment,
      personaStatus: summary.status,
      personaDecision: summary.decision,
      personaRiskScore: summary.risk_score,
      personaFields: summary.fields ?? {},
    })
    setCurrentStep("review")
  }

  const handleReviewComplete = async (updatedData: any) => {
    const fd = new FormData()
    if (sessionId) {
      fd.append("session_id", sessionId)
    }
    fd.append("name", `${updatedData.firstName} ${updatedData.lastName}`)

    const res = await fetch(`${API_BASE_URL}/face/promote`, {
      method: "POST",
      body: fd,
    })

    if (!res.ok) {
      alert("Account creation failed")
      return
    }
    const data = await res.json()
    if (data.account_id) setAccountId(data.account_id)
    setCurrentStep("complete")
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2 text-balance">{"Secure Identity Verification"}</h1>
          <p className="text-muted-foreground text-lg text-pretty">
            {"Complete your account setup with our advanced verification system"}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            {steps.map((step, index) => {
              const StepIcon = step.icon
              const isActive = step.id === currentStep
              const isComplete =
                (step.id === "persona" && personaComplete) ||
                (step.id === "face-scan" && faceScanComplete) ||
                (step.id === "welcome" && currentStep !== "welcome") ||
                (step.id === "review" && currentStep === "complete")

              return (
                <div key={step.id} className="flex flex-col items-center">
                  <div
                    className={`
                    w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-colors
                    ${
                      isComplete
                        ? "bg-primary text-primary-foreground"
                        : isActive
                          ? "bg-accent text-accent-foreground"
                          : "bg-muted text-muted-foreground"
                    }
                  `}
                  >
                    {isComplete ? <CheckCircle className="w-6 h-6" /> : <StepIcon className="w-6 h-6" />}
                  </div>
                  <span className={`text-sm font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                    {step.title}
                  </span>
                </div>
              )
            })}
          </div>
          <Progress value={getStepProgress()} className="h-2" />
        </div>

        {/* Step Content */}
        <div className="mb-8">
          {currentStep === "welcome" && (
            <Card className="border-border">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl text-balance">{"Welcome to Secure Verification"}</CardTitle>
                <CardDescription className="text-lg text-pretty">
                  {
                    "We'll guide you through a quick and secure verification process. No manual data entry required - everything is automated for your convenience."
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="text-center p-4">
                    <Camera className="w-12 h-12 text-primary mx-auto mb-3" />
                    <h3 className="font-semibold mb-2">{"Face Scan"}</h3>
                    <p className="text-sm text-muted-foreground text-pretty">
                      {"Secure biometric verification using your device camera"}
                    </p>
                  </div>
                  <div className="text-center p-4">
                    <Shield className="w-12 h-12 text-primary mx-auto mb-3" />
                    <h3 className="font-semibold mb-2">{"Persona Identity Verification"}</h3>
                    <p className="text-sm text-muted-foreground text-pretty">
                      {"Complete document and selfie verification powered by Persona"}
                    </p>
                  </div>
                  <div className="text-center p-4">
                    <FileText className="w-12 h-12 text-primary mx-auto mb-3" />
                    <h3 className="font-semibold mb-2">{"Secure Review"}</h3>
                    <p className="text-sm text-muted-foreground text-pretty">
                      {"Review and confirm the data returned by Persona before activating your account"}
                    </p>
                  </div>
                </div>
                <div className="flex justify-center">
                  <Button onClick={() => setCurrentStep("face-scan")} size="lg" className="px-8">
                    {"Start Verification"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {currentStep === "face-scan" && <FaceScanStep onComplete={handleFaceScanComplete} />}

          {currentStep === "persona" && (
            <PersonaVerificationStep accountId={accountId} onComplete={handlePersonaComplete} />
          )}

          {currentStep === "review" && <ReviewStep extractedData={extractedData} onComplete={handleReviewComplete} />}

          {currentStep === "complete" && (
            <Card className="border-border">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-primary-foreground" />
                </div>
                <CardTitle className="text-2xl text-balance">{"Verification Complete!"}</CardTitle>
                <CardDescription className="text-lg text-pretty">
                  {"Your account has been successfully created and verified. You can now access all features."}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Badge variant="secondary" className="mb-4">
                  {"Account Status: Verified"}
                </Badge>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>{"✓ Persona identity verification completed"}</p>
                  <p>{"✓ Face scan completed and processed"}</p>
                  <p>{"✓ Account security measures activated"}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
