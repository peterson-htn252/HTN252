"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, User, Calendar, MapPin, CreditCard, Shield } from "lucide-react"

interface ReviewStepProps {
  extractedData: any
  onComplete: () => void
}

export function ReviewStep({ extractedData, onComplete }: ReviewStepProps) {
  if (!extractedData) return null

  const dataFields = [
    {
      icon: User,
      label: "Full Name",
      value: `${extractedData.firstName} ${extractedData.lastName}`,
    },
    {
      icon: Calendar,
      label: "Date of Birth",
      value: new Date(extractedData.dateOfBirth).toLocaleDateString(),
    },
    {
      icon: CreditCard,
      label: "ID Number",
      value: extractedData.idNumber,
    },
    {
      icon: MapPin,
      label: "Address",
      value: extractedData.address,
    },
    {
      icon: Calendar,
      label: "ID Expiration",
      value: new Date(extractedData.expirationDate).toLocaleDateString(),
    },
  ]

  return (
    <Card className="border-border">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-balance">{"Review Extracted Information"}</CardTitle>
        <CardDescription className="text-pretty">
          {
            "Please review the information automatically extracted from your ID. All data has been verified and processed securely."
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Verification Status */}
        <div className="flex items-center justify-center gap-4 p-4 bg-primary/5 rounded-lg">
          <CheckCircle className="w-6 h-6 text-primary" />
          <div className="text-center">
            <p className="font-semibold">{"Verification Complete"}</p>
            <p className="text-sm text-muted-foreground">{"Face scan and ID processing successful"}</p>
          </div>
        </div>

        {/* Document Type */}
        <div className="text-center">
          <Badge variant="secondary" className="text-sm">
            {extractedData.idType}
          </Badge>
          <p className="text-sm text-muted-foreground mt-1">
            {"Confidence: "}
            {Math.round(extractedData.confidence * 100)}
            {"%"}
          </p>
        </div>

        {/* Extracted Data */}
        <div className="space-y-4">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            {"Extracted Information"}
          </h3>

          <div className="grid gap-4">
            {dataFields.map((field, index) => {
              const IconComponent = field.icon
              return (
                <div key={index} className="flex items-center gap-3 p-3 bg-card rounded-lg border">
                  <IconComponent className="w-5 h-5 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">{field.label}</p>
                    <p className="font-semibold">{field.value}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-muted/50 p-4 rounded-lg">
          <h4 className="font-semibold mb-2">{"Security & Privacy"}</h4>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>{"• Your face map is encrypted and stored securely"}</p>
            <p>{"• ID information is processed using advanced OCR technology"}</p>
            <p>{"• All data is protected with enterprise-grade security"}</p>
            <p>{"• No manual data entry required - fully automated process"}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-4">
          <Button variant="outline" className="flex-1 bg-transparent">
            {"Edit Information"}
          </Button>
          <Button onClick={onComplete} className="flex-1" size="lg">
            {"Confirm & Create Account"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
