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
  const [progress, setProgress] = useState<number>(0)

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

  // Attach stream
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
      } catch {}
    }

    video.addEventListener("loadedmetadata", onLoaded, { once: true })
    if ((video as any).readyState >= 1) {
      video.play().catch(() => {})
    }
    return () => video.removeEventListener("loadedmetadata", onLoaded)
  }, [stream])

  // Burst capture helper
  const captureBurst = async (
    video: HTMLVideoElement,
    frames = 20,
    maxWidth = 640,
    quality = 0.9
  ): Promise<File[]> => {
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("Camera not ready yet")
    }
    // Use a single offscreen canvas
    const canvas = canvasRef.current || document.createElement("canvas")
    const scale = Math.min(1, maxWidth / video.videoWidth)
    const w = Math.round(video.videoWidth * scale)
    const h = Math.round(video.videoHeight * scale)
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")!
    const files: File[] = []

    const dt = 1000 / Math.max(1, frames - 1) // spread across ~1s
    const t0 = performance.now()

    for (let i = 0; i < frames; i++) {
      const target = t0 + i * dt
      const wait = target - performance.now()
      if (wait > 0) {
        await new Promise((r) => setTimeout(r, wait))
      }

      ctx.drawImage(video, 0, 0, w, h)
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", quality))
      files.push(new File([blob], `frame_${String(i).padStart(2, "0")}.jpg`, { type: "image/jpeg" }))
      setProgress(Math.round(((i + 1) / frames) * 100))
    }

    return files
  }

  // Capture burst and finish
  const captureFrame = async () => {
    const video = videoRef.current
    if (!video) return

    try {
      setError(null)
      setIsScanning(true)
      setProgress(0)

      const files = await captureBurst(video, 20, 640, 0.9)

      // Stop camera once captured
      stopCamera()
      setScanComplete(true)
      setIsScanning(false)

      // Deliver frames to parent; parent can POST to /face/enroll_batch
      onComplete({
        framesUsed: files.length,
        files,
        timestamp: new Date().toISOString(),
      })

      // Example upload (uncomment if you want to upload here):
      // const fd = new FormData()
      // fd.append("ngo_id", "<ACCOUNT_ID>")
      // for (const f of files) fd.append("files", f) // must match FastAPI param name
      // await fetch("/face/enroll_batch", { method: "POST", body: fd })

    } catch (e: any) {
      setIsScanning(false)
      setError(e?.message || "Failed to capture frames.")
    }
  }

  const resetScan = () => {
    setScanComplete(false)
    setIsScanning(false)
    setProgress(0)
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
          {"Position your face within the frame and capture. We will record a short burst to build a stable face map."}
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
                  <p className="text-sm text-foreground font-medium">{"Face scan completed"}</p>
                </div>
              )}

              {isScanning && (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2" />
                    <p className="text-sm font-medium">
                      {"Capturing burst... "}
                      {progress > 0 ? `${progress}%` : ""}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="h-[90%] w-[80%] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              {stream && !isScanning && !scanComplete && (
                <div className="absolute inset-4 border-2 border-primary rounded-full opacity-50 pointer-events-none" />
              )}
            </div>
          </div>
        </div>

        {/* Offscreen canvas used for captures */}
        <canvas ref={canvasRef} className="hidden" />

        <div className="flex justify-center gap-4">
          {stream && !isScanning && !scanComplete && (
            <Button onClick={captureFrame} size="lg">
              {"Capture Face Scan"}
            </Button>
          )}
          {scanComplete && (
            <Button onClick={resetScan} variant="outline" size="lg">
              <RotateCcw className="w-4 h-4 mr-2" />
              {"Retake Scan"}
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
