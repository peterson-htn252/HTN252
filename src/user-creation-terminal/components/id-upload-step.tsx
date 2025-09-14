"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Upload, FileText, X, AlertCircle } from "lucide-react"

interface IdUploadStepProps {
  onComplete: (idData: any) => void
}

export function IdUploadStep({ onComplete }: IdUploadStepProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleFile(files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      handleFile(files[0])
    }
  }

  const handleFile = (file: File) => {
    setError(null)

    // Validate file type
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    if (!validTypes.includes(file.type)) {
      setError("Please upload a valid image file (JPEG, PNG, or WebP)")
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB")
      return
    }

    setUploadedFile(file)
  }

  const processId = () => {
    if (!uploadedFile) return

    setIsProcessing(true)

    // Simulate ID processing and data extraction
    setTimeout(() => {
      const extractedData = {
        firstName: "John",
        lastName: "Doe",
        dateOfBirth: "1990-05-15",
        idNumber: "DL123456789",
        address: "123 Main St, Anytown, ST 12345",
        expirationDate: "2028-05-15",
        idType: "Driver's License",
        confidence: 0.98,
        timestamp: new Date().toISOString(),
      }

      setIsProcessing(false)
      onComplete(extractedData)
    }, 4000)
  }

  const removeFile = () => {
    setUploadedFile(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-balance">{"Government ID Upload"}</CardTitle>
        <CardDescription className="text-pretty">
          {
            "Upload a clear photo of your government-issued ID. Our system will automatically extract all necessary information."
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!uploadedFile && (
          <div
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
              ${dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{"Drop your ID here or click to browse"}</h3>
            <p className="text-muted-foreground mb-4 text-pretty">{"Supports JPEG, PNG, and WebP files up to 10MB"}</p>
            <Button variant="outline">{"Choose File"}</Button>
          </div>
        )}

        {uploadedFile && !isProcessing && (
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <FileText className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium">{uploadedFile.name}</p>
                  <p className="text-sm text-muted-foreground">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={removeFile}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="aspect-video bg-muted rounded-lg mb-4 overflow-hidden">
              <img
                src={URL.createObjectURL(uploadedFile) || "/placeholder.svg"}
                alt="Uploaded ID"
                className="w-full h-full object-contain"
              />
            </div>

            <Button onClick={processId} className="w-full" size="lg">
              {"Process ID and Extract Data"}
            </Button>
          </div>
        )}

        {isProcessing && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold mb-2">{"Processing Your ID..."}</h3>
            <p className="text-muted-foreground text-pretty">
              {"Our AI is extracting information from your government ID. This may take a few moments."}
            </p>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p>{"• Scanning document for text and data"}</p>
              <p>{"• Verifying document authenticity"}</p>
              <p>{"• Extracting personal information"}</p>
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInput} className="hidden" />

        <div className="text-center text-sm text-muted-foreground space-y-1">
          <p>{"• Ensure all text on your ID is clearly visible"}</p>
          <p>{"• Avoid glare and shadows"}</p>
          <p>{"• Accepted: Driver's License, Passport, State ID"}</p>
        </div>
      </CardContent>
    </Card>
  )
}
