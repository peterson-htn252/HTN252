"use client"

import { useState } from "react"
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
import { Search, Plus, DollarSign, User, MapPin, Calendar } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Recipient {
  id: string
  name: string
  location: string
  registrationDate: string
  walletBalance: number
  status: "active" | "pending" | "inactive"
  category: string
}

const mockRecipients: Recipient[] = [
  {
    id: "1",
    name: "Maria Santos",
    location: "Manila, Philippines",
    registrationDate: "2024-01-15",
    walletBalance: 250,
    status: "active",
    category: "Family Aid",
  },
  {
    id: "2",
    name: "Ahmed Hassan",
    location: "Cairo, Egypt",
    registrationDate: "2024-02-03",
    walletBalance: 180,
    status: "active",
    category: "Medical Support",
  },
  {
    id: "3",
    name: "Elena Rodriguez",
    location: "Guatemala City, Guatemala",
    registrationDate: "2024-01-28",
    walletBalance: 320,
    status: "active",
    category: "Education",
  },
  {
    id: "4",
    name: "David Okonkwo",
    location: "Lagos, Nigeria",
    registrationDate: "2024-02-10",
    walletBalance: 95,
    status: "pending",
    category: "Emergency Relief",
  },
  {
    id: "5",
    name: "Priya Sharma",
    location: "Mumbai, India",
    registrationDate: "2024-01-20",
    walletBalance: 410,
    status: "active",
    category: "Family Aid",
  },
  {
    id: "6",
    name: "Carlos Mendoza",
    location: "Lima, Peru",
    registrationDate: "2024-02-15",
    walletBalance: 75,
    status: "active",
    category: "Medical Support",
  },
]

export function AidRecipients() {
  const [recipients, setRecipients] = useState<Recipient[]>(mockRecipients)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null)
  const [depositAmount, setDepositAmount] = useState("")
  const [isDepositDialogOpen, setIsDepositDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newRecipient, setNewRecipient] = useState({
    name: "",
    location: "",
    category: "Family Aid",
  })
  const { toast } = useToast()

  const filteredRecipients = recipients.filter(
    (recipient) =>
      recipient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      recipient.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      recipient.category.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const handleDeposit = () => {
    if (!selectedRecipient || !depositAmount) return

    const amount = Number.parseFloat(depositAmount)
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid deposit amount.",
        variant: "destructive",
      })
      return
    }

    setRecipients((prev) =>
      prev.map((recipient) =>
        recipient.id === selectedRecipient.id
          ? { ...recipient, walletBalance: recipient.walletBalance + amount }
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
  }

  const handleAddRecipient = () => {
    if (!newRecipient.name.trim() || !newRecipient.location.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      })
      return
    }

    const recipient: Recipient = {
      id: (recipients.length + 1).toString(),
      name: newRecipient.name.trim(),
      location: newRecipient.location.trim(),
      category: newRecipient.category,
      registrationDate: new Date().toISOString().split("T")[0],
      walletBalance: 0,
      status: "pending",
    }

    setRecipients((prev) => [...prev, recipient])

    toast({
      title: "Recipient Added",
      description: `${recipient.name} has been successfully registered for aid.`,
    })

    setNewRecipient({ name: "", location: "", category: "Family Aid" })
    setIsAddDialogOpen(false)
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
                  setNewRecipient({ name: "", location: "", category: "Family Aid" })
                }}
                className="border-border text-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleAddRecipient}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Add Recipient
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
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Confirm Deposit
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
