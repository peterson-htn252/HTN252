"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CreditCard, Wifi, Shield } from "lucide-react"

interface CustomerIdleScreenProps {
  vendorName: string
}

export function CustomerIdleScreen({ vendorName }: CustomerIdleScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardContent className="p-12 text-center">
          {/* Logo and Branding */}
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center shadow-lg">
              <CreditCard className="w-10 h-10 text-primary-foreground" />
            </div>
          </div>

          {/* Vendor Name */}
          <h1 className="text-4xl font-bold text-foreground mb-2">{vendorName}</h1>
          <p className="text-xl text-muted-foreground mb-8">Payment Terminal</p>

          {/* Status Indicators */}
          <div className="flex justify-center gap-4 mb-8">
            <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700 px-4 py-2">
              <Wifi className="w-4 h-4 mr-2" />
              Connected
            </Badge>
            <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700 px-4 py-2">
              <Shield className="w-4 h-4 mr-2" />
              Secure
            </Badge>
          </div>

          {/* Waiting Message */}
          <div className="space-y-4">
            <p className="text-lg text-muted-foreground">Waiting for transaction...</p>
            <p className="text-sm text-muted-foreground">A store clerk will initiate your payment</p>
            <div className="flex justify-center mt-6">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
