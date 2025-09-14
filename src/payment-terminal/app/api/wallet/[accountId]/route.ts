import { NextResponse } from "next/server"

interface Params { accountId: string }

export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const resp = await fetch(`http://localhost:8000/accounts/${params.accountId}`)
    if (resp.ok) {
      const data = await resp.json()
      return NextResponse.json(data)
    }
  } catch (e) {
    // fall through to mock response
  }
  return NextResponse.json({ accountId: params.accountId, balance: 0 })
}
