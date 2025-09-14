"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Wallet, CreditCard, Clock, Shield, CheckCircle, ArrowRight, Info } from "lucide-react"

interface CashOutModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CashOutModal({ isOpen, onClose }: CashOutModalProps) {
  const [currentStep, setCurrentStep] = useState(1)

  const steps = [
    {
      number: 1,
      title: "Connect Bank Account",
      description: "Link your bank account for secure transfers",
      icon: <CreditCard className="h-5 w-5" />,
      status: "completed",
    },
    {
      number: 2,
      title: "Verify Identity",
      description: "Complete KYC verification (one-time setup)",
      icon: <Shield className="h-5 w-5" />,
      status: "completed",
    },
    {
      number: 3,
      title: "Initiate Transfer",
      description: "Convert XRP to your local currency",
      icon: <Wallet className="h-5 w-5" />,
      status: "current",
    },
    {
      number: 4,
      title: "Receive Funds",
      description: "Funds arrive in 1-2 business days",
      icon: <CheckCircle className="h-5 w-5" />,
      status: "pending",
    },
  ]

  const getStepStatus = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200"
      case "current":
        return "bg-primary text-primary-foreground border-primary"
      case "pending":
        return "bg-muted text-muted-foreground border-border"
      default:
        return "bg-muted text-muted-foreground border-border"
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Wallet className="h-6 w-6" />
            How to Cash Out Your XRP
          </DialogTitle>
          <DialogDescription>Follow these steps to convert your XRPL voucher earnings to cash</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Balance */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Available Balance</div>
                  <div className="text-2xl font-bold text-primary">67.25 XRP</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">≈ USD Value</div>
                  <div className="text-xl font-semibold">$42.15</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Process Steps */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Cash Out Process</h3>

            {steps.map((step, index) => (
              <div key={step.number} className="flex items-start gap-4">
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${getStepStatus(step.status)}`}
                >
                  {step.status === "completed" ? <CheckCircle className="h-5 w-5" /> : step.icon}
                </div>

                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{step.title}</h4>
                    {step.status === "completed" && (
                      <Badge variant="secondary" className="text-xs">
                        Complete
                      </Badge>
                    )}
                    {step.status === "current" && <Badge className="text-xs">Current Step</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>

                {index < steps.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground mt-3" />}
              </div>
            ))}
          </div>

          <Separator />

          {/* Important Information */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Important Information</h3>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="font-medium text-sm">Processing Time</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Transfers typically complete within 1-2 business days</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-sm">Security</span>
                  </div>
                  <p className="text-sm text-muted-foreground">All transfers are secured with bank-level encryption</p>
                </CardContent>
              </Card>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <strong>First-time setup:</strong> You'll need to complete identity verification and link a bank
                  account before your first cash out. This is a one-time process that ensures secure and compliant
                  transfers.
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <Button onClick={onClose} variant="outline" className="flex-1 bg-transparent">
              Close
            </Button>
            <Button className="flex-1 font-semibold">Start Cash Out Process</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
