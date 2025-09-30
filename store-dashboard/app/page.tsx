"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ShoppingCart, Plus, Minus, Trash2, DollarSign, History, Clock, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { API_BASE_URL } from "@/lib/config"

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

const PAYMENT_TERMINAL_URL = process.env.NEXT_PUBLIC_PAYMENT_TERMINAL_URL || "http://localhost:3003"
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
  status: "pending" | "processing" | "completed" | "failed"
}

interface CheckoutRequestPayload {
  transactionId: string
  vendorName: string
  items: CartItem[]
  total: number
  storeId: string
  programId: string
}

interface PaymentAuthorizationPayload {
  voucherId: string
  transactionId: string
  storeId: string
  programId: string
  amountMinor: number
  currency: string
  recipientId: string
}

interface PaymentTerminalMessageBase {
  scope: "payment-terminal"
}

type TerminalOutboundMessage =
  | (PaymentTerminalMessageBase & { type: "checkout_request"; transaction: CheckoutRequestPayload })
  | (PaymentTerminalMessageBase & {
      type: "payment_processed"
      transactionId: string
      status: "success" | "error"
      result?: unknown
      error?: string
    })

type TerminalInboundMessage =
  | (PaymentTerminalMessageBase & { type: "terminal_ready" })
  | (PaymentTerminalMessageBase & { type: "payment_authorized"; payload: PaymentAuthorizationPayload })

export default function POSCheckout() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [customPrice, setCustomPrice] = useState("")
  const [customItem, setCustomItem] = useState("")
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [showTransactions, setShowTransactions] = useState(false)
  const [pendingTerminalRequest, setPendingTerminalRequest] = useState<CheckoutRequestPayload | null>(null)
  const [terminalReady, setTerminalReady] = useState(false)

  const terminalWindowRef = useRef<Window | null>(null)

  const terminalOrigin = useMemo(() => {
    try {
      return new URL(PAYMENT_TERMINAL_URL).origin
    } catch {
      return PAYMENT_TERMINAL_URL
    }
  }, [])

  const sendMessageToTerminal = useCallback(
    (message: TerminalOutboundMessage) => {
      const target = terminalWindowRef.current
      if (!target || target.closed) {
        console.warn("Payment terminal window is not available for messaging")
        return false
      }

      try {
        target.postMessage(message, terminalOrigin)
        return true
      } catch (error) {
        console.error("Failed to postMessage to payment terminal", error)
        return false
      }
    },
    [terminalOrigin],
  )

  const updateTransactionStatus = useCallback((transactionId: string, status: Transaction["status"], extra?: Partial<Transaction>) => {
    setTransactions((prev) =>
      prev.map((transaction) =>
        transaction.id === transactionId
          ? {
              ...transaction,
              ...extra,
              status,
            }
          : transaction,
      ),
    )
  }, [])

  const processAuthorizedPayment = useCallback(
    async (payload: PaymentAuthorizationPayload) => {
      updateTransactionStatus(payload.transactionId, "processing")

      try {
        const response = await fetch(`${API_BASE_URL}/redeem`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            voucher_id: payload.voucherId,
            store_id: payload.storeId,
            recipient_id: payload.recipientId,
            program_id: payload.programId,
            amount_minor: payload.amountMinor,
            currency: payload.currency,
          }),
        })

        const result = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(result.detail || `Payment failed (${response.status})`)
        }

        updateTransactionStatus(payload.transactionId, "completed")
        sendMessageToTerminal({
          scope: "payment-terminal",
          type: "payment_processed",
          transactionId: payload.transactionId,
          status: "success",
          result,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Payment failed. Please try again."
        updateTransactionStatus(payload.transactionId, "failed")
        sendMessageToTerminal({
          scope: "payment-terminal",
          type: "payment_processed",
          transactionId: payload.transactionId,
          status: "error",
          error: message,
        })
      }
    },
    [sendMessageToTerminal, updateTransactionStatus],
  )

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as TerminalInboundMessage | null
      if (!data || typeof data !== "object" || data.scope !== "payment-terminal") {
        return
      }

      const sameOrigin = event.origin === window.location.origin
      const fromTerminal = event.origin === terminalOrigin
      const nullOrigin = event.origin === "null"
      if (!fromTerminal && !sameOrigin && !nullOrigin) {
        return
      }

      if (event.source && "postMessage" in event.source) {
        terminalWindowRef.current = event.source as Window
      }

      if (data.type === "terminal_ready") {
        setTerminalReady(true)
        return
      }

      if (data.type === "payment_authorized") {
        setTerminalReady(true)
        processAuthorizedPayment(data.payload)
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [processAuthorizedPayment, terminalOrigin])

  useEffect(() => {
    if (!terminalReady || !pendingTerminalRequest) {
      return
    }

    const sent = sendMessageToTerminal({
      scope: "payment-terminal",
      type: "checkout_request",
      transaction: pendingTerminalRequest,
    })

    if (sent) {
      setPendingTerminalRequest(null)
    }
  }, [pendingTerminalRequest, sendMessageToTerminal, terminalReady])

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

  const handleCompleteSale = () => {
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    // Add transaction to local state as pending
    const newTransaction: Transaction = {
      id: transactionId,
      timestamp: new Date().toISOString(),
      items: [...cart],
      total,
      status: "pending",
    }
    setTransactions((prev) => [newTransaction, ...prev])

    const checkoutPayload: CheckoutRequestPayload = {
      transactionId,
      vendorName: VENDOR_NAME,
      items: [...cart],
      total,
      storeId: STORE_ID,
      programId: PROGRAM_ID,
    }

    setPendingTerminalRequest(checkoutPayload)

    const popup = window.open(PAYMENT_TERMINAL_URL, "payment-terminal", "width=480,height=800")
    if (popup) {
      terminalWindowRef.current = popup
      popup.focus()
      setTerminalReady(false)
      clearCart()
    } else {
      console.error("Failed to open payment terminal window")
      updateTransactionStatus(transactionId, "failed")
      setPendingTerminalRequest(null)
    }
  }


  const filteredProducts = products.filter(
    (product) => product.name.toLowerCase().includes(searchTerm.toLowerCase()) || product.id.includes(searchTerm),
  )

  const getStatusIcon = (status: Transaction["status"]) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />
      case "processing":
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
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
      case "processing":
        return "bg-blue-100 text-blue-800"
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
