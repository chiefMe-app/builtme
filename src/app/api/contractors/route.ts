import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { scope, designConcept, category, prompt } = await req.json();

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      messages: [{
        role: "user",
        content: `You are a Dubai renovation expert. Identify contractor types needed for this project. Be CONCISE.

Project: ${designConcept}
Category: ${category}
Vision: ${prompt}

Return ONLY valid JSON, max 2 contractor types, keep all text fields under 100 characters:
{
  "types": [
    {
      "type": "short name",
      "icon": "emoji",
      "required": true,
      "description": "max 80 chars",
      "relevantScope": "max 60 chars",
      "estimatedCost": "AED X,XXX–X,XXX",
      "duration": "X–X days",
      "checkList": ["item1", "item2", "item3"],
      "platforms": [
        {"name": "ServiceMarket", "url": "https://www.servicemarket.com/en/"},
        {"name": "Bayut Homes", "url": "https://homes.bayut.com/"}
      ]
    }
  ],
  "questionsToAsk": ["question1", "question2", "question3"]
}`
      }]
    });

    const text = response.content.find((b) => b.type === "text")?.text || "";
    console.log("Contractors raw response:", text.slice(0, 500));

    let clean = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    // Extract JSON object
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: "No JSON in response", raw: text.slice(0, 200) }, { status: 502 });
    }
    clean = clean.slice(start, end + 1);

    const contractors = JSON.parse(clean);

    return NextResponse.json({ contractors });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate contractors" }, { status: 500 });
  }
}
