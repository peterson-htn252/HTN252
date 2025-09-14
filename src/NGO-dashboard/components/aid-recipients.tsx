"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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

// Transform API recipient to local format for compatibility
interface LocalRecipient {
  id: string
  name: string
  location: string
  registrationDate: string
  walletBalance: number
  status: "active" | "pending" | "inactive"
  category: string
  program_id: string
}

function transformRecipient(apiRecipient: APIRecipient): LocalRecipient {
  return {
    id: apiRecipient.recipient_id,
    name: apiRecipient.name,
    location: apiRecipient.location,
    registrationDate: apiRecipient.created_at.split('T')[0],
    walletBalance: apiRecipient.wallet_balance / 100, // Convert from minor units to dollars
    status: apiRecipient.status,
    category: apiRecipient.category,
    program_id: apiRecipient.program_id,
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
    category: "Family Aid",
    phone: "",
    email: "",
  })
  const { toast } = useToast()
  const { user } = useAuth()

  // Fetch recipients data
  useEffect(() => {
    const fetchRecipients = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        const response = await apiClient.getRecipients(searchTerm || undefined)
        const transformedRecipients = response.recipients.map(transformRecipient)
        setRecipients(transformedRecipients)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load recipients')
      } finally {
        setIsLoading(false)
      }
    }

    fetchRecipients()
  }, [searchTerm])

  const filteredRecipients = recipients.filter(
    (recipient) =>
      recipient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      recipient.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      recipient.category.toLowerCase().includes(searchTerm.toLowerCase()),
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
        amount_minor: Math.round(amount * 100), // Convert to minor units (cents)
        operation_type: "deposit",
        description: `Deposit to ${selectedRecipient.name}`,
        program_id: selectedRecipient.program_id,
      }

      const result = await apiClient.updateRecipientBalance(selectedRecipient.id, balanceOperation)

      // Update local state
      setRecipients((prev) =>
        prev.map((recipient) =>
          recipient.id === selectedRecipient.id
            ? { ...recipient, walletBalance: result.new_balance / 100 }
            : recipient,
        ),
      )

      toast({
        title: "Deposit Successful",
        description: `$${amount} has been deposited to ${selectedRecipient.name}'s wallet.`,
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
    if (!newRecipient.name.trim() || !newRecipient.location.trim() || !user) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)

      const recipientData: RecipientCreate = {
        name: newRecipient.name.trim(),
        location: newRecipient.location.trim(),
        category: newRecipient.category,
        phone: newRecipient.phone.trim() || undefined,
        email: newRecipient.email.trim() || undefined,
        program_id: user.default_program_id,
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

      setNewRecipient({ name: "", location: "", category: "Family Aid", phone: "", email: "" })
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800 border-green-200"
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "inactive":
        return "bg-gray-100 text-gray-800 border-gray-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  if (isLoading) {
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="phone" className="text-right text-foreground">
                  Phone
                </Label>
                <Input
                  id="phone"
                  placeholder="+1 234 567 8900"
                  value={newRecipient.phone}
                  onChange={(e) => setNewRecipient((prev) => ({ ...prev, phone: e.target.value }))}
                  className="col-span-3 bg-input border-border"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right text-foreground">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="recipient@example.com"
                  value={newRecipient.email}
                  onChange={(e) => setNewRecipient((prev) => ({ ...prev, email: e.target.value }))}
                  className="col-span-3 bg-input border-border"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="category" className="text-right text-foreground">
                  Category
                </Label>
                <select
                  id="category"
                  value={newRecipient.category}
                  onChange={(e) => setNewRecipient((prev) => ({ ...prev, category: e.target.value }))}
                  className="col-span-3 bg-input border-border rounded-md px-3 py-2 text-sm"
                >
                  <option value="Family Aid">Family Aid</option>
                  <option value="Medical Support">Medical Support</option>
                  <option value="Education">Education</option>
                  <option value="Emergency Relief">Emergency Relief</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false)
                  setNewRecipient({ name: "", location: "", category: "Family Aid", phone: "", email: "" })
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
                placeholder="Search recipients by name, location, or category..."
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
              <div className="flex items-start justify-between">
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
                <Badge className={getStatusColor(recipient.status)}>{recipient.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Category</div>
                  <div className="font-medium text-foreground">{recipient.category}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Wallet Balance</div>
                  <div className="font-bold text-lg text-foreground">${recipient.walletBalance}</div>
                </div>
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
                      Add funds to {recipient.name}'s wallet. Current balance: ${recipient.walletBalance}
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
