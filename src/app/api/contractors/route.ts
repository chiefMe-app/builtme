import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const DUBAI_CONTRACTORS = {
  budget: [
    {
      name: "Fixit Dubai",
      specialty: "Kitchen, bathroom, painting, tiling, MEP",
      budget: "AED 10K–30K",
      website: "https://fixitdubai.ae",
      whatsapp: "https://wa.me/971",
      rating: 4.5,
      tag: "Minor renovation specialist"
    },
    {
      name: "Al Safwan Service",
      specialty: "Modern finishing, residential & office",
      budget: "AED 10K–30K",
      website: "https://alsafwan.ae",
      whatsapp: "https://wa.me/971",
      rating: 4.3,
      tag: "Affordable pricing"
    },
    {
      name: "Fixperts Dubai",
      specialty: "Handyman, bathroom & kitchen refresh, painting",
      budget: "AED 5K–25K",
      website: "https://fixperts.ae",
      whatsapp: "https://wa.me/971",
      rating: 4.4,
      tag: "Fast turnaround"
    },
  ],
  mid: [
    {
      name: "Yalla Renovation",
      specialty: "Bathroom & kitchen, Danube & RAK Ceramics materials",
      budget: "AED 30K–80K",
      website: "https://yallarenovation.com",
      whatsapp: "https://wa.me/971",
      rating: 4.6,
      tag: "1 year warranty"
    },
    {
      name: "Stamp Technical Services LLC",
      specialty: "Dubai Municipality approved, full residential renovation",
      budget: "AED 25K–80K",
      website: "https://bathroomrenovationdubai.com",
      whatsapp: "https://wa.me/971",
      rating: 4.7,
      tag: "Licensed & insured · 15+ years"
    },
    {
      name: "DEEJOS",
      specialty: "Modular kitchen, bathroom, flooring — Kohler & Grohe",
      budget: "AED 30K–80K",
      website: "https://deejos.ae",
      whatsapp: "https://wa.me/971",
      rating: 4.5,
      tag: "Premium materials"
    },
  ],
  premium: [
    {
      name: "MD Design & Fit Out LLC",
      specialty: "Full kitchen renovation, custom design",
      budget: "AED 80K–200K",
      website: "https://mdfitout.com",
      whatsapp: "https://wa.me/971",
      rating: 4.8,
      tag: "Dubai Municipality certified"
    },
    {
      name: "A&T Group Interiors",
      specialty: "Turnkey villa & apartment renovation since 2009",
      budget: "AED 80K–200K",
      website: "https://atgroupuae.com",
      whatsapp: "https://wa.me/971",
      rating: 4.7,
      tag: "On-time delivery"
    },
    {
      name: "Smart Renovation LLC",
      specialty: "Villa & apartment full renovation, custom interiors",
      budget: "AED 60K–180K",
      website: "https://smartrenovation.ae",
      whatsapp: "https://wa.me/971",
      rating: 4.5,
      tag: "Full project management"
    },
  ],
  luxury: [
    {
      name: "Havelock One",
      specialty: "Ultra-luxury villa & apartment, Palm Jumeirah specialist",
      budget: "AED 200K+",
      website: "https://havelockone.com",
      whatsapp: "https://wa.me/971",
      rating: 4.9,
      tag: "25+ years · 8,000+ projects"
    },
    {
      name: "KCJ Exterior Interior LLC",
      specialty: "Bespoke villa fit-out, end-to-end design & build",
      budget: "AED 200K+",
      website: "https://kcjinteriors.ae",
      whatsapp: "https://wa.me/971",
      rating: 4.8,
      tag: "Luxury specialist"
    },
    {
      name: "Enzo Milano Interiors",
      specialty: "Luxury villa interiors, clean lines, bespoke design",
      budget: "AED 200K+",
      website: "https://enzointeriordesign.com",
      whatsapp: "https://wa.me/971",
      rating: 4.8,
      tag: "Milan-inspired luxury"
    },
  ]
};

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { designConcept, category, prompt, budget } = await req.json();

    // Determine budget tier
    let tier = "mid";
    if (budget?.includes("10-30")) tier = "budget";
    else if (budget?.includes("30-80")) tier = "mid";
    else if (budget?.includes("80-200")) tier = "premium";
    else if (budget?.includes("200")) tier = "luxury";

    const matchedContractors = DUBAI_CONTRACTORS[tier as keyof typeof DUBAI_CONTRACTORS] || DUBAI_CONTRACTORS.mid;

    // Get AI-generated contractor types
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Dubai renovation expert. For this project, identify 2 contractor types needed. Be very concise.

Project: ${designConcept}
Category: ${category}
Vision: ${prompt}

Return ONLY valid JSON:
{"types":[{"type":"name","icon":"emoji","required":true,"description":"max 60 chars","relevantScope":"max 50 chars","estimatedCost":"AED X–X","duration":"X days","checkList":["item1","item2","item3"]}],"questionsToAsk":["q1","q2","q3"]}`
      }]
    });

    const text = response.content.find((b) => b.type === "text")?.text || "";
    let aiData: { types: unknown[]; questionsToAsk: unknown[] } = { types: [], questionsToAsk: [] };

    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        aiData = JSON.parse(text.slice(start, end + 1));
      }
    } catch (e) {
      console.error("AI parse error:", e);
    }

    return NextResponse.json({
      contractors: {
        ...aiData,
        recommended: matchedContractors,
        budgetTier: tier
      }
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
