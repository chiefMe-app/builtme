import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { scope, materials, designConcept, category, prompt } = await req.json();

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `You are a Dubai construction and renovation expert. Based on this renovation project, identify what contractor types are needed and provide Dubai-specific guidance.

Project: ${designConcept}
Category: ${category}
Vision: ${prompt}
Materials: ${JSON.stringify(materials?.slice(0, 3))}

Return ONLY valid JSON (no markdown):
{
  "types": [
    {
      "type": "contractor type name",
      "icon": "emoji",
      "required": true/false,
      "description": "what this contractor will do on this specific project",
      "relevantScope": "specific tasks for this project in one line",
      "estimatedCost": "AED X,XXX – X,XXX",
      "duration": "X–X days",
      "checkList": ["Dubai trade license", "Insurance", "Portfolio", "Fixed price quote", "Payment terms"],
      "platforms": [
        {"name": "ServiceMarket", "url": "https://www.servicemarket.com/en/"},
        {"name": "Bayut Home Services", "url": "https://homes.bayut.com/"},
        {"name": "Justmop", "url": "https://www.justmop.com/"}
      ]
    }
  ],
  "questionsToAsk": [
    "Do you have a valid Dubai Municipality trade license?",
    "Can you provide a fixed-price quote before starting?",
    "What is your payment schedule?",
    "Do you have liability insurance?",
    "Can you share 3 recent similar projects in Dubai?"
  ]
}`
      }]
    });

    const text = response.content.find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const contractors = JSON.parse(clean);

    return NextResponse.json({ contractors });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to generate contractors" }, { status: 500 });
  }
}
