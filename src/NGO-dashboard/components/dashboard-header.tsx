"use client"

import { useState, useEffect } from "react"
import { Heart, Users, DollarSign, Loader2, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { apiClient } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"

export function DashboardHeader() {
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { user, logout } = useAuth()

  useEffect(() => {
    const fetchRecipientCount = async () => {
      try {
        setIsLoading(true)
        const response = await apiClient.getRecipients()
        setRecipientCount(response.count)
      } catch (err) {
        // Silently fail for header component
        setRecipientCount(0)
      } finally {
        setIsLoading(false)
      }
    }

    if (user) {
      fetchRecipientCount()
    }
  }, [user])

  return (
    <header className="bg-card border-b border-border">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-primary rounded-lg">
              <Heart className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {user?.organization_name || "NGO Dashboard"}
              </h1>
              <p className="text-muted-foreground">Humanitarian Aid Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Active Recipients:</span>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <span className="font-semibold text-foreground">{recipientCount ?? 0}</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Last Updated:</span>
              <span className="font-semibold text-foreground">Live</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              className="flex items-center gap-2 border-border text-foreground hover:bg-muted"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
