import { NextResponse } from "next/server"

let lastResult: any = null

export async function GET() {
  if (lastResult) {
    const res = lastResult
    lastResult = null
    return NextResponse.json({ result: res })
  }
  return NextResponse.json({ result: null })
}

export async function POST(request: Request) {
  try {
    const data = await request.json()
    lastResult = { ...data, timestamp: new Date().toISOString() }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: "invalid" }, { status: 400 })
  }
}
