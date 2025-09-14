"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import {
  ArrowLeft,
  Wallet,
  DollarSign,
  Clock,
  Shield,
  CheckCircle,
  AlertCircle,
  CreditCard,
  Building2,
} from "lucide-react"
import Link from "next/link"

interface BankAccount {
  id: string
  name: string
  accountNumber: string
  routingNumber: string
  isVerified: boolean
}

export default function CashoutPage() {
  const [currentStep, setCurrentStep] = useState(1)
  const [selectedAccount, setSelectedAccount] = useState<string>("")
  const [cashoutAmount, setCashoutAmount] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  // Mock data
  const availableBalance = 127.5
  const usdRate = 0.52
  const estimatedUsd = availableBalance * usdRate

  const mockBankAccounts: BankAccount[] = [
    {
      id: "1",
      name: "Business Checking",
      accountNumber: "****1234",
      routingNumber: "021000021",
      isVerified: true,
    },
    {
      id: "2",
      name: "Savings Account",
      accountNumber: "****5678",
      routingNumber: "021000021",
      isVerified: false,
    },
  ]

  const toUSD = (amtXrp: string) => {
    const n = Number.parseFloat(amtXrp)
    if (Number.isNaN(n) || n <= 0) return 0
    return n * usdRate
  }

  const handleCashout = async () => {
    setIsProcessing(true)
    await new Promise((resolve) => setTimeout(resolve, 3000))
    setCurrentStep(4)
    setIsProcessing(false)
  }

  const steps = [
    { number: 1, title: "Select Account", icon: Building2 },
    { number: 2, title: "Enter Amount", icon: DollarSign },
    { number: 3, title: "Confirm Details", icon: Shield },
    { number: 4, title: "Processing", icon: CheckCircle },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="http://localhost:3000/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Store
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Wallet className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Cash Out</h1>
                <p className="text-sm text-muted-foreground">Convert XRP to USD</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    currentStep >= step.number ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="ml-3 hidden sm:block">
                  <p
                    className={`text-sm font-medium ${
                      currentStep >= step.number ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.title}
                  </p>
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-12 h-0.5 mx-4 ${currentStep > step.number ? "bg-primary" : "bg-muted"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Select Account */}
            {currentStep === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Select Bank Account</CardTitle>
                  <p className="text-sm text-muted-foreground">Choose which account to receive your funds</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mockBankAccounts.map((account) => (
                    <div
                      key={account.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        selectedAccount === account.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => setSelectedAccount(account.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CreditCard className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{account.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {account.accountNumber} • {account.routingNumber}
                            </p>
                          </div>
                        </div>
                        {account.isVerified ? (
                          <Badge variant="secondary" className="text-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}

                  <Button className="w-full" disabled={!selectedAccount} onClick={() => setCurrentStep(2)}>
                    Continue
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Enter Amount */}
            {currentStep === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Enter Amount</CardTitle>
                  <p className="text-sm text-muted-foreground">How much XRP would you like to cash out?</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (XRP)</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="0.00"
                      value={cashoutAmount}
                      onChange={(e) => setCashoutAmount(e.target.value)}
                      max={availableBalance}
                    />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Available: {availableBalance} XRP</span>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() => setCashoutAmount(availableBalance.toString())}
                      >
                        Use Max
                      </Button>
                    </div>
                  </div>

                  {cashoutAmount && (
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Estimated USD:</span>
                        <span className="font-medium">${toUSD(cashoutAmount).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-sm text-muted-foreground">Exchange Rate:</span>
                        <span className="text-sm text-muted-foreground">1 XRP = ${usdRate}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setCurrentStep(1)}>
                      Back
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={!cashoutAmount || Number.parseFloat(cashoutAmount) <= 0}
                      onClick={() => setCurrentStep(3)}
                    >
                      Continue
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Confirm Details */}
            {currentStep === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>Confirm Cash Out</CardTitle>
                  <p className="text-sm text-muted-foreground">Review your cash out details before proceeding</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="font-medium">{cashoutAmount} XRP</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">USD Value:</span>
                      <span className="font-medium">${toUSD(cashoutAmount).toFixed(2)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-lg font-semibold">
                      <span>You'll Receive:</span>
                      <span>${toUSD(cashoutAmount).toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="flex items-start gap-3">
                      <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium">Processing Time</p>
                        <p className="text-sm text-muted-foreground">Funds typically arrive in 1-3 business days</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setCurrentStep(2)}>
                      Back
                    </Button>
                    <Button className="flex-1" onClick={handleCashout} disabled={isProcessing}>
                      {isProcessing ? "Processing..." : "Confirm Cash Out"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Processing/Complete */}
            {currentStep === 4 && (
              <Card>
                <CardHeader className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <CardTitle className="text-green-600">Cash Out Initiated</CardTitle>
                  <p className="text-sm text-muted-foreground">Your cash out request has been submitted successfully</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Transaction ID:</span>
                      <span className="font-mono text-sm">
                        TX-{Math.random().toString(36).substr(2, 9).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount:</span>
                      <span>${toUSD(cashoutAmount).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expected Arrival:</span>
                      <span>1-3 business days</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Balance Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Available Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="text-2xl font-bold">{availableBalance} XRP</div>
                    <div className="text-sm text-muted-foreground">≈ ${estimatedUsd.toFixed(2)} USD</div>
                  </div>
                  <Progress value={75} className="h-2" />
                  <div className="text-xs text-muted-foreground">75% of monthly limit used</div>
                </div>
              </CardContent>
            </Card>

            {/* Important Information */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Important Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {/* Removed fee mention per request */}
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />
                  <p>Bank transfers typically take 1-3 business days</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />
                  <p>Exchange rates are updated in real-time</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />
                  <p>Monthly cash out limits apply for security</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
