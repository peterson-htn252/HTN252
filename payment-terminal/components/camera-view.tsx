"use client"

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Camera, CameraOff, CheckCircle } from "lucide-react"
import { API_BASE_URL } from "@/lib/config"

export interface VerificationResult {
  success: boolean
  recipientId?: string
  publicKey?: string
  error?: string
}

interface CameraViewProps {
  currentStep: string
  /**
   * Callback invoked once the server verifies (or rejects) the face.
   * Provides match status and wallet identifiers when available.
   */
  onVerificationComplete: (result: VerificationResult) => void
}

interface StartCameraOptions {
  userInitiated?: boolean
}

export interface CameraViewHandle {
  start: (options?: StartCameraOptions) => Promise<void>
  stop: () => void
}

export const CameraView = forwardRef<CameraViewHandle, CameraViewProps>(function CameraView(
  { currentStep, onVerificationComplete }: CameraViewProps,
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verificationProgress, setVerificationProgress] = useState(0)
  const streamRef = useRef<MediaStream | null>(null)
  const lastStartUserInitiatedRef = useRef(false)

  /**
   * Capture a burst of frames from the webcam and POST them to the
   * FastAPI server for biometric verification. The server endpoint is
   * implemented in `routers/face.py` and expects multiple images under
   * the `files` field.
   */
  const verifyFace = useCallback(async () => {
    if (!videoRef.current) return

    const waitForVideoReady = async () => {
      const maxAttempts = 20
      const delay = 150

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (!videoRef.current) break
        if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
          return true
        }
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
      return false
    }

    const hasDimensions = await waitForVideoReady()
    if (!hasDimensions || !videoRef.current) {
      onVerificationComplete({ success: false, error: "Camera feed unavailable" })
      setVerificationProgress(0)
      return
    }

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
      } else {
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8)
        const res = await fetch(dataUrl)
        const fallbackBlob = await res.blob().catch(() => null)
        if (fallbackBlob) {
          frames.push(fallbackBlob)
        }
      }

      // Update progress to show capture advancement (up to 50%)
      setVerificationProgress(((i + 1) / 5) * 50)
      await new Promise((r) => setTimeout(r, 200))
    }

    // Check if we captured any frames
    if (frames.length === 0) {
      setVerificationProgress(0)
      onVerificationComplete({ success: false, error: "No frames captured" })
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
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 100000)
      const resp = await fetch(`${API_BASE_URL}/face/identify_batch`, {
        method: "POST",
        body: fd,
        signal: controller.signal,
      })
      window.clearTimeout(timeoutId)
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
  }, [onVerificationComplete])

  const stopCamera = useCallback(() => {
    const activeStream = streamRef.current ?? stream
    if (activeStream) {
      activeStream.getTracks().forEach((track) => track.stop())
    }
    streamRef.current = null
    if (stream) {
      setStream(null)
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
      videoRef.current.load()
    }
    setCameraEnabled(false)
  }, [stream])

  const startCamera = useCallback(
    async ({ userInitiated = false }: StartCameraOptions = {}) => {
      try {
        lastStartUserInitiatedRef.current = userInitiated
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
        })
        setStream(mediaStream)
        streamRef.current = mediaStream
        setCameraEnabled(true)
        setError(null)
      } catch (err) {
        const error = err instanceof Error ? err : new Error("camera-error")
        console.error("Error accessing camera:", error)
        const errMessage =
          error.message === "autoplay-blocked"
            ? "Automatic camera start was blocked. Please click 'Enable Camera'."
            : "Camera access denied. Please enable camera permissions."
        setError(errMessage)
        stopCamera()
        throw error
      }
    },
    [stopCamera],
  )

  useImperativeHandle(
    ref,
    () => ({
      start: (options?: StartCameraOptions) => startCamera(options),
      stop: () => stopCamera(),
    }),
    [startCamera, stopCamera],
  )

  useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) {
      return
    }

    let cancelled = false
    const userInitiated = lastStartUserInitiatedRef.current

    const attachAndVerify = async () => {
      try {
        await video.play()
      } catch (playError) {
        const normalized =
          playError instanceof Error
            ? playError
            : new Error(typeof playError === "string" ? playError : "playback-failed")

        if (
          !userInitiated &&
          (normalized.name === "NotAllowedError" || normalized.message === "autoplay-blocked")
        ) {
          setError("Automatic camera start was blocked. Please click 'Enable Camera'.")
        } else {
          setError(normalized.message || "Unable to start camera.")
        }
        stopCamera()
        return
      }

      if (cancelled) {
        return
      }

      setVerificationProgress(0)
      try {
        await verifyFace()
      } catch (err) {
        if (!cancelled) {
          console.error("Face verification failed", err)
          setError(err instanceof Error ? err.message : "Face verification failed.")
        }
      }
    }

    video.srcObject = stream

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      attachAndVerify()
    } else {
      const handleLoaded = () => {
        video.removeEventListener("loadeddata", handleLoaded)
        if (!cancelled) {
          attachAndVerify()
        }
      }
      video.addEventListener("loadeddata", handleLoaded)
    }

    return () => {
      cancelled = true
      video.pause()
    }
  }, [stream, stopCamera, verifyFace])

  useEffect(() => {
    if (currentStep !== "verification" && cameraEnabled) {
      stopCamera()
      setVerificationProgress(0)
    }
  }, [cameraEnabled, currentStep, stopCamera])

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
            <Button
              onClick={() => {
                startCamera({ userInitiated: true }).catch(() => {})
              }}
              variant="outline"
              size="sm"
            >
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
})
