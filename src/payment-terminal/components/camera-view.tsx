"use client"

import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Camera, CameraOff, CheckCircle } from "lucide-react"
import { apiFetch } from "@shared/http"

export interface VerificationResult {
  success: boolean
  recipientId?: string
  publicKey?: string
}

interface CameraViewProps {
  currentStep: string
  /**
   * Callback invoked once the server verifies (or rejects) the face.
   * Provides match status and wallet identifiers when available.
   */
  onVerificationComplete?: (result: VerificationResult) => void
}

export function CameraView({ currentStep, onVerificationComplete }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verificationProgress, setVerificationProgress] = useState(0)

  /**
   * Capture a burst of frames from the webcam and POST them to the
   * FastAPI server for biometric verification. The server endpoint is
   * implemented in `routers/face.py` and expects multiple images under
   * the `files` field.
   */
  const verifyFace = async () => {
    if (!videoRef.current) return

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    const frames: Blob[] = []

    // Capture 5 frames spaced ~200ms apart
    for (let i = 0; i < 5; i++) {
      if (!videoRef.current) break
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      ctx?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height)
      
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8)
      )
      
      if (blob) {
        frames.push(blob)
      }
      
      // Update progress to show capture advancement (up to 50%)
      setVerificationProgress(((i + 1) / 5) * 50)
      await new Promise((r) => setTimeout(r, 200))
    }

    // Check if we captured any frames
    if (frames.length === 0) {
      setVerificationProgress(0)
      setIsCapturing(false)
      setError("No frames captured")
      onVerificationComplete?.({ success: false })
      return
    }

    const fd = new FormData()
    frames.forEach((blob, idx) => {
      if (blob instanceof Blob) {
        fd.append("files", blob, `frame_${idx}.jpg`)
      } else {
        console.error("Frame is not a Blob:", blob)
      }
    })

    try {
      const resp = await apiFetch("/face/identify_batch", {
        method: "POST",
        body: fd,
      })
      const data = await resp.json().catch(() => ({}))
      const topMatch = Array.isArray(data.matches) && data.matches[0]
      const success = resp.ok && Boolean(topMatch)
      setVerificationProgress(100)
      onVerificationComplete?.({
        success,
        recipientId: success ? topMatch.recipient_id : undefined,
        publicKey: success ? topMatch.public_key : undefined,
      })
    } catch (err) {
      console.error("Face verification failed", err)
      setVerificationProgress(100)
      onVerificationComplete?.({ success: false })
    }
  }

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
      })
      setStream(mediaStream)
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      setCameraEnabled(true)
      setError(null)
    } catch (err) {
      setError("Camera access denied. Please enable camera permissions.")
      console.error("Error accessing camera:", err)
    }
  }

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop())
      setStream(null)
    }
    setCameraEnabled(false)
  }

  useEffect(() => {
    if (currentStep === "verification" && !cameraEnabled) {
      startCamera()
    }
  }, [currentStep, cameraEnabled])

  useEffect(() => {
    if (currentStep === "verification" && cameraEnabled) {
      // Reset progress and begin verification routine once
      setVerificationProgress(0)
      verifyFace()
    }
  }, [currentStep, cameraEnabled])

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [stream])

  const getStatusMessage = () => {
    switch (currentStep) {
      case "verification":
        return verificationProgress < 100
          ? `Verifying identity... ${Math.round(verificationProgress)}%`
          : "Verification complete!"
      case "processing":
        return "Processing payment..."
      case "complete":
        return "Transaction completed successfully"
      default:
        return "Ready to start verification"
    }
  }

  const getStatusIcon = () => {
    switch (currentStep) {
      case "verification":
        return verificationProgress < 100 ? (
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        ) : (
          <CheckCircle className="w-5 h-5 text-green-500" />
        )
      case "processing":
        return <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      case "complete":
        return <CheckCircle className="w-5 h-5 text-green-500" />
      default:
        return <Camera className="w-5 h-5 text-muted-foreground" />
    }
  }

  return (
    <div className="space-y-4">
      {/* Camera Display */}
      <Card className="relative overflow-hidden bg-card border-2 border-dashed border-border">
        <div className="aspect-video bg-muted/50 flex items-center justify-center relative">
          {cameraEnabled && !error ? (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover rounded-lg" />
              {currentStep === "verification" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-64 border-4 border-accent rounded-full border-dashed animate-pulse" />
                  <div className="absolute bottom-4 left-4 right-4 bg-black/50 rounded-lg p-3 text-white">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Analyzing face... {Math.round(verificationProgress)}%</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                {error ? (
                  <CameraOff className="w-8 h-8 text-muted-foreground" />
                ) : (
                  <Camera className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-lg font-medium text-foreground">{error ? "Camera Unavailable" : "Camera Ready"}</p>
                <p className="text-sm text-muted-foreground">{error || "Camera will start automatically"}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Status Bar */}
      <div className="flex items-center justify-between p-4 bg-card rounded-lg border">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <span className="font-medium text-foreground">{getStatusMessage()}</span>
        </div>

        <div className="flex gap-2">
          {!cameraEnabled ? (
            <Button onClick={startCamera} variant="outline" size="sm">
              <Camera className="w-4 h-4 mr-2" />
              Enable Camera
            </Button>
          ) : (
            <Button onClick={stopCamera} variant="outline" size="sm">
              <CameraOff className="w-4 h-4 mr-2" />
              Disable Camera
            </Button>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          For secure transactions, please position your face clearly within the camera view
        </p>
        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span>• Good lighting recommended</span>
          <span>• Remove sunglasses or hats</span>
          <span>• Look directly at camera</span>
        </div>
      </div>
    </div>
  )
}
