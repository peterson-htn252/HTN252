"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, User, Calendar, MapPin, CreditCard, Shield } from "lucide-react"

interface ReviewStepProps {
  extractedData: any
  onComplete: (updatedData: any) => void
}

export function ReviewStep({ extractedData, onComplete }: ReviewStepProps) {
  if (!extractedData) return null

  const [formData, setFormData] = useState({
    firstName: extractedData.firstName,
    lastName: extractedData.lastName,
    dateOfBirth: extractedData.dateOfBirth,
    idNumber: extractedData.idNumber,
    address: extractedData.address,
    expirationDate: extractedData.expirationDate,
  })

  const [isEditing, setIsEditing] = useState(false)

  const dataFields = [
    { icon: User, label: "First Name", name: "firstName", type: "text" },
    { icon: User, label: "Last Name", name: "lastName", type: "text" },
    { icon: Calendar, label: "Date of Birth", name: "dateOfBirth", type: "date" },
    { icon: CreditCard, label: "ID Number", name: "idNumber", type: "text" },
    { icon: MapPin, label: "Address", name: "address", type: "text" },
    { icon: Calendar, label: "ID Expiration", name: "expirationDate", type: "date" },
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
            {dataFields.map((field) => {
              const IconComponent = field.icon
              return (
                <div key={field.name} className="flex items-center gap-3 p-3 bg-card rounded-lg border">
                  <IconComponent className="w-5 h-5 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">{field.label}</p>
                    {isEditing ? (
                      <input
                        type={field.type}
                        value={formData[field.name]}
                        onChange={(e) =>
                          setFormData({ ...formData, [field.name]: e.target.value })
                        }
                        className="w-full p-1 border rounded bg-background"
                      />
                    ) : (
                      <p className="font-semibold">
                        {field.type === "date"
                          ? new Date(formData[field.name]).toLocaleDateString()
                          : formData[field.name]}
                      </p>
                    )}
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
          <Button
            variant="outline"
            className="flex-1 bg-transparent"
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? "Done Editing" : "Edit Information"}
          </Button>
          <Button onClick={() => onComplete(formData)} className="flex-1" size="lg">
            {"Confirm & Create Account"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
