"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Search, Plus, DollarSign, User, MapPin, Calendar, Loader2, AlertCircle } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { apiClient } from "@/lib/api"
import { Recipient as APIRecipient, RecipientCreate, BalanceOperation } from "@/lib/types"
import { useAuth } from "@/contexts/auth-context"
import { formatCurrency } from "@/lib/utils"

// Transform API recipient to local format
interface LocalRecipient {
  id: string
  name: string
  location: string
  registrationDate: string
  walletBalance: number
}

function transformRecipient(apiRecipient: APIRecipient): LocalRecipient {
  return {
    id: apiRecipient.recipient_id,
    name: apiRecipient.name,
    location: apiRecipient.location,
    registrationDate: apiRecipient.created_at.split('T')[0],
    walletBalance: apiRecipient.balance,
  }
}

export function AidRecipients() {
  const [recipients, setRecipients] = useState<LocalRecipient[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedRecipient, setSelectedRecipient] = useState<LocalRecipient | null>(null)
  const [depositAmount, setDepositAmount] = useState("")
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newRecipient, setNewRecipient] = useState({
    name: "",
    location: "",
  })
  const { toast } = useToast()
  const { user } = useAuth()

  // Fetch recipients data with debounce for smoother searching
  useEffect(() => {
    const fetchRecipients = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const response = await apiClient.getRecipients(searchTerm || undefined)
        const transformedRecipients = response.recipients.map(transformRecipient)
        setRecipients(transformedRecipients)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load recipients")
      } finally {
        setIsLoading(false)
      }
    }

    const handler = setTimeout(() => {
      fetchRecipients()
    }, 300)

    return () => clearTimeout(handler)
  }, [searchTerm])

  const filteredRecipients = recipients.filter(
    (recipient) =>
      recipient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      recipient.location.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const handleDeposit = async () => {
    if (!selectedRecipient || !depositAmount || !user) return

    const amount = Number.parseFloat(depositAmount)
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid deposit amount.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)
      
      const balanceOperation: BalanceOperation = {
        amount: amount, // Use amount directly (major units)
        operation_type: "deposit",
        description: `Deposit to ${selectedRecipient.name}`,
      }

      const result = await apiClient.updateRecipientBalance(selectedRecipient.id, balanceOperation)

      // Update local state
      setRecipients((prev) =>
        prev.map((recipient) =>
          recipient.id === selectedRecipient.id
            ? { ...recipient, walletBalance: result.new_balance }
            : recipient,
        ),
      )

      toast({
        title: "Deposit Successful",
        description: result.tx_hash 
          ? `$${formatCurrency(amount)} has been transferred to ${selectedRecipient.name}'s wallet. Transaction: ${result.tx_hash.substring(0, 8)}...`
          : `$${formatCurrency(amount)} has been deposited to ${selectedRecipient.name}'s wallet.`,
      })

      setDepositAmount("")
      setIsDepositDialogOpen(false)
      setSelectedRecipient(null)
    } catch (err) {
      toast({
        title: "Deposit Failed",
        description: err instanceof Error ? err.message : "Failed to deposit funds",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddRecipient = async () => {
    if (!newRecipient.name.trim() || !newRecipient.location.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields (Name and Location).",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)

      const recipientData: RecipientCreate = {
        name: newRecipient.name.trim(),
        location: newRecipient.location.trim(),
      }

      const result = await apiClient.createRecipient(recipientData)

      // Refresh the recipients list
      const response = await apiClient.getRecipients()
      const transformedRecipients = response.recipients.map(transformRecipient)
      setRecipients(transformedRecipients)

      toast({
        title: "Recipient Added",
        description: `${recipientData.name} has been successfully registered for aid.`,
      })

      setNewRecipient({ name: "", location: "" })
      setIsAddDialogOpen(false)
    } catch (err) {
      toast({
        title: "Failed to Add Recipient",
        description: err instanceof Error ? err.message : "Failed to register recipient",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }


  if (isLoading && recipients.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold text-foreground">Aid Recipients</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading recipients...</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="bg-card border-border">
              <CardContent className="p-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/2 mb-4"></div>
                  <div className="h-6 bg-muted rounded w-1/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold text-foreground">Aid Recipients</h2>
          <div className="flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4" />
            <span>Error loading recipients</span>
          </div>
        </div>
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <div>
                <p className="font-medium">Failed to load recipients</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-foreground">Aid Recipients</h2>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Add Recipient
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">Add New Recipient</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Register a new person for aid assistance. They will start with a $0 wallet balance.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right text-foreground">
                  Name *
                </Label>
                <Input
                  id="name"
                  placeholder="Full name"
                  value={newRecipient.name}
                  onChange={(e) => setNewRecipient((prev) => ({ ...prev, name: e.target.value }))}
                  className="col-span-3 bg-input border-border"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="location" className="text-right text-foreground">
                  Location *
                </Label>
                <Input
                  id="location"
                  placeholder="City, Country"
                  value={newRecipient.location}
                  onChange={(e) => setNewRecipient((prev) => ({ ...prev, location: e.target.value }))}
                  className="col-span-3 bg-input border-border"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false)
                  setNewRecipient({ name: "", location: "" })
                }}
                disabled={isSubmitting}
                className="border-border text-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleAddRecipient}
                disabled={isSubmitting}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isSubmitting ? "Adding..." : "Add Recipient"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <Card className="bg-card border-border">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search recipients by name or location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-input border-border"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredRecipients.length} of {recipients.length} recipients
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recipients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRecipients.map((recipient) => (
          <Card key={recipient.id} className="bg-card border-border hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-lg text-foreground">{recipient.name}</CardTitle>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                    <MapPin className="w-3 h-3" />
                    <span>{recipient.location}</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm">
                <div className="text-muted-foreground">Wallet Balance</div>
                <div className="font-bold text-lg text-foreground">${formatCurrency(recipient.walletBalance)}</div>
              </div>

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>Registered: {new Date(recipient.registrationDate).toLocaleDateString()}</span>
              </div>

              <Dialog
                open={isDepositDialogOpen && selectedRecipient?.id === recipient.id}
                onOpenChange={setIsDepositDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button
                    className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90"
                    onClick={() => setSelectedRecipient(recipient)}
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    Deposit Money
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">Deposit Money</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      Add funds to {recipient.name}'s wallet. Current balance: ${formatCurrency(selectedRecipient.walletBalance)}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="amount" className="text-right text-foreground">
                        Amount
                      </Label>
                      <Input
                        id="amount"
                        type="number"
                        placeholder="0.00"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        className="col-span-3 bg-input border-border"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsDepositDialogOpen(false)
                        setDepositAmount("")
                        setSelectedRecipient(null)
                      }}
                      className="border-border text-foreground hover:bg-muted"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleDeposit}
                      disabled={isSubmitting}
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      {isSubmitting ? "Processing..." : "Confirm Deposit"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredRecipients.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="text-center py-12">
            <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No recipients found</h3>
            <p className="text-muted-foreground">
              {searchTerm ? "Try adjusting your search terms." : "Start by adding your first aid recipient."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
