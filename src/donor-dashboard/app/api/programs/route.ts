import { NextResponse } from "next/server"
import { ddb } from "@/lib/dynamo"
import { ScanCommand } from "@aws-sdk/lib-dynamodb"
import { z } from "zod"

const Program = z.object({
  programId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.string(),
  currency: z.string().default("USD"),
  goalAmount: z.number().optional(),
  raisedAmount: z.number().optional(),
  location: z.string().optional(),
  ngoId: z.string().optional(),
  xrplIssuer: z.string().optional(),
})

export type Program = z.infer<typeof Program>

export async function GET(req: Request) {
  const url = new URL(req.url)
  const status = url.searchParams.get("status") ?? "active"

  const res = await ddb.send(new ScanCommand({
    TableName: process.env.PROGRAMS_TABLE!,
    FilterExpression: "#s = :status",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":status": status },
    Limit: 100, // basic cap
  }))

  const items = (res.Items ?? []).map(i => Program.parse({
    programId: i.programId,
    name: i.name,
    description: i.description,
    status: i.status,
    currency: i.currency,
    goalAmount: typeof i.goalAmount === "number" ? i.goalAmount : Number(i.goalAmount ?? 0),
    raisedAmount: typeof i.raisedAmount === "number" ? i.raisedAmount : Number(i.raisedAmount ?? 0),
    location: i.location,
    ngoId: i.ngoId,
    xrplIssuer: i.xrplIssuer,
  }))

  return NextResponse.json({ programs: items })
}
