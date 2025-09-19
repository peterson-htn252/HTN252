"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ShoppingCart, Plus, Minus, Trash2, DollarSign, History, Clock, CheckCircle, XCircle } from "lucide-react"
import { resolveEnvironmentUrl } from "@shared/env"

const products = [
  { id: "001", name: "Apple", price: 1.5, category: "Produce" },
  { id: "002", name: "Banana", price: 0.75, category: "Produce" },
  { id: "003", name: "Milk", price: 3.99, category: "Dairy" },
  { id: "004", name: "Bread", price: 2.49, category: "Bakery" },
  { id: "005", name: "Eggs", price: 4.99, category: "Dairy" },
  { id: "006", name: "Chicken Breast", price: 8.99, category: "Meat" },
  { id: "007", name: "Rice", price: 5.99, category: "Pantry" },
  { id: "008", name: "Orange Juice", price: 4.49, category: "Beverages" },
]

const PAYMENT_TERMINAL_URL = resolveEnvironmentUrl({
  devKey: "NEXT_PUBLIC_PAYMENT_TERMINAL_URL_DEV",
  prodKey: "NEXT_PUBLIC_PAYMENT_TERMINAL_URL_PROD",
  baseKey: "NEXT_PUBLIC_PAYMENT_TERMINAL_URL",
  fallbackDev: "http://localhost:3003",
})
const VENDOR_NAME = "Store Checkout"
const STORE_ID = process.env.NEXT_PUBLIC_STORE_ID || "store_001"
const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || "general_aid"

interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
}

interface Transaction {
  id: string
  timestamp: string
  items: CartItem[]
  total: number
  status: "pending" | "completed" | "failed"
}

export default function POSCheckout() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [customPrice, setCustomPrice] = useState("")
  const [customItem, setCustomItem] = useState("")
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showTransactions, setShowTransactions] = useState(false)

  const addItemById = (productId: string) => {
    const product = products.find((p) => p.id === productId)
    if (!product) return

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === productId)
      if (existingItem) {
        return prevCart.map((item) => (item.id === productId ? { ...item, quantity: item.quantity + 1 } : item))
      }
      return [...prevCart, { ...product, quantity: 1 }]
    })
  }

  const addCustomItem = () => {
    if (!customItem || !customPrice) return

    const price = Number.parseFloat(customPrice)
    if (isNaN(price)) return

    const customId = `custom-${Date.now()}`
    setCart((prevCart) => [
      ...prevCart,
      {
        id: customId,
        name: customItem,
        price: price,
        quantity: 1,
      },
    ])

    setCustomItem("")
    setCustomPrice("")
  }

  const updateQuantity = (id: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeItem(id)
      return
    }

    setCart((prevCart) => prevCart.map((item) => (item.id === id ? { ...item, quantity: newQuantity } : item)))
  }

  const removeItem = (id: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id))
  }

  const clearCart = () => {
    setCart([])
  }

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const handleCompleteSale = async () => {
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    
    // Add transaction to local state as pending
    const newTransaction: Transaction = {
      id: transactionId,
      timestamp: new Date().toISOString(),
      items: [...cart],
      total,
      status: "pending"
    }
    setTransactions(prev => [newTransaction, ...prev])

    try {
      await fetch(`${PAYMENT_TERMINAL_URL}/api/checkout/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          vendorName: VENDOR_NAME,
          items: cart,
          total,
          storeId: STORE_ID,
          programId: PROGRAM_ID,
        }),
      })

      window.open(PAYMENT_TERMINAL_URL, "_blank")
      clearCart()
      
      // Simulate transaction completion after some time
      setTimeout(() => {
        setTransactions(prev => 
          prev.map(t => 
            t.id === transactionId 
              ? { ...t, status: "completed" as const }
              : t
          )
        )
      }, 30000) // Mark as completed after 30 seconds

    } catch (error) {
      console.error("Failed to send transaction to payment terminal", error)
      // Mark transaction as failed
      setTransactions(prev => 
        prev.map(t => 
          t.id === transactionId 
            ? { ...t, status: "failed" as const }
            : t
        )
      )
    }
  }


  const filteredProducts = products.filter(
    (product) => product.name.toLowerCase().includes(searchTerm.toLowerCase()) || product.id.includes(searchTerm),
  )

  const getStatusIcon = (status: Transaction["status"]) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "failed":
        return <XCircle className="h-4 w-4 text-red-600" />
    }
  }

  const getStatusColor = (status: Transaction["status"]) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800"
      case "completed":
        return "bg-green-100 text-green-800"
      case "failed":
        return "bg-red-100 text-red-800"
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm">
        <div className="px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Store Checkout System</h1>
          <Button 
            variant="outline" 
            onClick={() => setShowTransactions(!showTransactions)}
            className="flex items-center gap-2"
          >
            <History className="h-4 w-4" />
            {showTransactions ? "Hide" : "Show"} Transactions ({transactions.length})
          </Button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-80px)]">
        {showTransactions && (
          <div className="w-96 bg-white border-r shadow-lg">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <History className="h-5 w-5" />
                Transaction History
              </h2>
            </div>
            <div className="p-6 overflow-y-auto max-h-full">
              {transactions.length === 0 ? (
                <div className="text-center text-gray-500 py-8">No transactions yet</div>
              ) : (
                <div className="space-y-3">
                  {transactions.map((transaction) => (
                    <Card key={transaction.id} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(transaction.status)}
                          <span className="text-sm font-medium">
                            {new Date(transaction.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <Badge className={getStatusColor(transaction.status)}>
                          {transaction.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        {transaction.items.length} items
                      </div>
                      <div className="text-lg font-bold">
                        ${transaction.total.toFixed(2)}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="mb-6">
            <Input
              placeholder="Search products or scan barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-lg p-4"
            />
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Add Custom Item</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input placeholder="Item name" value={customItem} onChange={(e) => setCustomItem(e.target.value)} />
                <Input
                  placeholder="Price"
                  type="number"
                  step="0.01"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="w-24"
                />
                <Button onClick={addCustomItem}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <Card
                key={product.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => addItemById(product.id)}
              >
                <CardContent className="p-4">
                  <div className="text-sm text-gray-500 mb-1">#{product.id}</div>
                  <div className="font-semibold mb-1">{product.name}</div>
                  <div className="text-lg font-bold text-green-600">${product.price.toFixed(2)}</div>
                  <Badge variant="secondary" className="text-xs">
                    {product.category}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="w-96 bg-white border-l shadow-lg">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Current Sale
              </h2>
              <Button variant="outline" size="sm" onClick={clearCart}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex-1 p-6 overflow-y-auto max-h-96">
            {cart.length === 0 ? (
              <div className="text-center text-gray-500 py-8">No items in cart</div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex-1">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-gray-500">${item.price.toFixed(2)} each</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <Button variant="outline" size="sm" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <div className="w-16 text-right font-semibold">${(item.price * item.quantity).toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 border-t bg-gray-50">
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-xl font-bold">
                <span>Total:</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>

            <Button
              className="w-full text-lg py-6"
              size="lg"
              disabled={cart.length === 0}
              onClick={handleCompleteSale}
            >
              <DollarSign className="h-5 w-5 mr-2" />
              Complete Sale
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
