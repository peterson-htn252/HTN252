import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { text } = await req.json()
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 })
    }
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that summarizes NGO descriptions for donors.",
          },
          {
            role: "user",
            content: `Summarize the following NGO description in two sentences:\n${text}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      }),
    })
    if (!resp.ok) {
      const errText = await resp.text()
      console.error("OpenAI error", errText)
      return NextResponse.json({ error: "AI request failed" }, { status: 500 })
    }
    const data = await resp.json()
    const summary = data.choices?.[0]?.message?.content?.trim() || ""
    return NextResponse.json({ summary })
  } catch (err) {
    console.error("Summary generation failed", err)
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 })
  }
}
