import "@testing-library/jest-dom/vitest"
import type React from "react"
import { afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"

const originalFetch = global.fetch

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  if (originalFetch) {
    global.fetch = originalFetch
  }
})

if (!global.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = ResizeObserver as unknown as typeof global.ResizeObserver
}

if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

if (!global.requestAnimationFrame) {
  global.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number
}

if (!global.cancelAnimationFrame) {
  global.cancelAnimationFrame = (id: number) => clearTimeout(id)
}

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}))
