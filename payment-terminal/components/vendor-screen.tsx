"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Plus, Minus, ShoppingCart, Store } from "lucide-react"
import type { CheckoutItem, TransactionData } from "./payment-terminal"

interface VendorScreenProps {
  vendorName: string
  onCheckoutRequest: (data: TransactionData) => void
}

export function VendorScreen({ vendorName, onCheckoutRequest }: VendorScreenProps) {
  const [items, setItems] = useState<CheckoutItem[]>([])
  const [newItemName, setNewItemName] = useState("")
  const [newItemPrice, setNewItemPrice] = useState("")

  const addItem = () => {
    if (newItemName && newItemPrice) {
      const newItem: CheckoutItem = {
        id: `item_${Date.now()}`,
        name: newItemName,
        price: Number.parseFloat(newItemPrice),
        quantity: 1,
      }
      setItems([...items, newItem])
      setNewItemName("")
      setNewItemPrice("")
    }
  }

  const updateQuantity = (id: string, change: number) => {
    setItems(
      items
        .map((item) => (item.id === id ? { ...item, quantity: Math.max(0, item.quantity + change) } : item))
        .filter((item) => item.quantity > 0),
    )
  }

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const handleSendToTerminal = async () => {
    if (items.length === 0) return

    const transactionData: TransactionData = {
      vendorName,
      items,
      total,
    }

    // Send to terminal
    onCheckoutRequest(transactionData)
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center">
              <Store className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">{vendorName}</h1>
              <p className="text-muted-foreground">Vendor Terminal</p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add Items */}
          <Card>
            <CardHeader>
              <CardTitle>Add Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="itemName">Item Name</Label>
                <Input
                  id="itemName"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Enter item name"
                />
              </div>
              <div>
                <Label htmlFor="itemPrice">Price ($)</Label>
                <Input
                  id="itemPrice"
                  type="number"
                  step="0.01"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <Button onClick={addItem} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </CardContent>
          </Card>

          {/* Current Order */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Current Order
                <Badge variant="secondary">{items.length} items</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground">${item.price.toFixed(2)} each</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => updateQuantity(item.id, -1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <Button size="sm" variant="outline" onClick={() => updateQuantity(item.id, 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {items.length === 0 && <p className="text-center text-muted-foreground py-8">No items added yet</p>}
              </div>

              {items.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-lg font-semibold">Total:</span>
                    <span className="text-2xl font-bold">${total.toFixed(2)}</span>
                  </div>
                  <Button onClick={handleSendToTerminal} className="w-full" size="lg">
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Send to Terminal
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
