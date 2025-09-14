"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Camera, CheckCircle, RotateCcw, AlertCircle } from "lucide-react"

interface FaceScanStepProps {
  onComplete: (faceData: any) => void
}

export function FaceScanStep({ onComplete }: FaceScanStepProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [scanComplete, setScanComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const startCamera = async () => {
    try {
      setError(null)
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera API not available in this browser.")
        return
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      })

      // Always set the stream first. The <video> will render after this state change.
      setStream(mediaStream)
    } catch (err: any) {
      if (location.protocol !== "https:" && location.hostname !== "localhost") {
        setError("Camera requires HTTPS or localhost.")
      } else if (err?.name === "NotAllowedError") {
        setError("Camera access denied. Please enable camera permissions.")
      } else if (err?.name === "NotFoundError") {
        setError("No camera found on this device.")
      } else {
        setError("Unable to access camera.")
      }
    }
  }

  const stopCamera = () => {
    stream?.getTracks().forEach((track) => track.stop())
    setStream(null)
  }

  // When stream changes, attach to the <video> and play after metadata loads
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!stream) {
      video.srcObject = null
      return
    }

    video.srcObject = stream

    const onLoaded = async () => {
      try {
        await video.play()
      } catch {
        // Some browsers require a user gesture. The Start button click usually satisfies it.
      }
    }

    video.addEventListener("loadedmetadata", onLoaded, { once: true })

    // If metadata is already available
    if ((video as any).readyState >= 1) {
      video.play().catch(() => {})
    }

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded)
    }
  }, [stream])

  const captureFrame = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    // Guard against zero dimensions if metadata did not load yet
    if (!video.videoWidth || !video.videoHeight) {
      setError("Camera not ready yet. Please wait a moment and try again.")
      return
    }

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx.drawImage(video, 0, 0)

    setIsScanning(true)

    // Simulate processing
    setTimeout(() => {
      setIsScanning(false)
      setScanComplete(true)
      stopCamera()

      const faceData = {
        faceMap: "simulated_face_map_data",
        confidence: 0.95,
        timestamp: new Date().toISOString(),
      }

      setTimeout(() => onComplete(faceData), 1500)
    }, 3000)
  }

  const resetScan = () => {
    setScanComplete(false)
    setIsScanning(false)
    startCamera()
  }

  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [])

  return (
    <Card className="border-border">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl text-balance">{"Face Scan Verification"}</CardTitle>
        <CardDescription className="text-pretty">
          {"Position your face within the frame and click capture when ready. Our system will create a secure face map for verification."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-center">
          <div className="relative">
            <div className="w-50 h-60 bg-muted rounded-lg overflow-hidden border-2 border-dashed border-border flex items-center justify-center">
              {!stream && !scanComplete && (
                <div className="text-center">
                  <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">{"Camera preview will appear here"}</p>
                </div>
              )}

              {stream && (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}

              {scanComplete && (
                <div className="text-center">
                  <CheckCircle className="w-12 h-12 text-primary mx-auto mb-2" />
                  <p className="text-sm text-foreground font-medium">{"Face scan completed!"}</p>
                </div>
              )}

              {isScanning && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                    <p className="text-sm font-medium">{"Processing face scan..."}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="h-[90%] w-[80%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              {/* Face detection overlay */}
              {stream && !isScanning && !scanComplete && (
                <div className="absolute inset-4 border-2 border-primary rounded-full opacity-50 pointer-events-none" />
              )}
            </div>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />

        <div className="flex justify-center gap-4">
          {stream && !isScanning && !scanComplete && (
            <Button onClick={captureFrame} size="lg">
              {"Capture Face Scan"}
            </Button>
          )}
        </div>

        <div className="text-center text-sm text-muted-foreground space-y-1">
          <p>{"• Position your face within the circular guide"}</p>
          <p>{"• Ensure good lighting and remove any obstructions"}</p>
          <p>{"• Look directly at the camera"}</p>
        </div>
      </CardContent>
    </Card>
  )
}
