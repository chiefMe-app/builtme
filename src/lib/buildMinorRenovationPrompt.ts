import { normalizeRenovationCategory } from "@/lib/normalizeRenovationCategory";

export type SelectedFinish = {
  category: string;
  itemName?: string;
  name: string;
  renderDescription: string;
  colorTags?: string[];
  materialTags?: string[];
  finishTags?: string[];
  supplier?: string;
  brand?: string;
};

interface SurfaceSpec {
  surfaceLabel: string;   // e.g. "COUNTERTOP"
  surfaceOnly: string;    // e.g. "countertop horizontal surfaces only"
  doNotAffect: string;
  negative?: string;
}

// Per-category surface mapping. Every selected finish becomes a precise,
// surface-locked instruction so the model edits the right surface only.
function surfaceSpec(category: string): SurfaceSpec {
  switch (normalizeRenovationCategory(category)) {
    case "countertop_wrap":
    case "countertop_slab":
      return {
        surfaceLabel: "COUNTERTOP",
        surfaceOnly: "countertop horizontal surfaces only — keep countertop shape, thickness, edges and position unchanged",
        doNotAffect: "cabinets, backsplash, appliances, sink, faucet, floor, layout",
      };
    case "cabinet_wrap":
    case "cabinet_paint":
      return {
        surfaceLabel: "CABINET DOORS",
        surfaceOnly: "cabinet door and drawer fronts only — keep cabinet layout, size, handle positions, appliances and structure unchanged",
        doNotAffect: "walls, backsplash, countertop, floor, appliances",
      };
    case "backsplash_tile":
    case "backsplash_sticker":
      return {
        surfaceLabel: "BACKSPLASH",
        surfaceOnly: "the backsplash wall area between the countertop and the upper cabinets only — tile must stay in the backsplash zone",
        doNotAffect: "cabinets, countertop, appliances, floor",
        negative: "no red brick, no exposed brick, no subway brick wall, no random masonry",
      };
    case "floor_tile":
    case "floor_sticker":
      return {
        surfaceLabel: "FLOOR",
        surfaceOnly: "the floor surface only",
        doNotAffect: "furniture, cabinets, counters, appliances, walls, backsplash",
      };
    case "hardware_taps":
      return {
        surfaceLabel: "HARDWARE/TAPS",
        surfaceOnly: "cabinet handles, drawer pulls, and the tap/faucet if visible — same drill positions",
        doNotAffect: "cabinet colour, cabinet doors, layout, and all other objects (do not turn other objects gold/metallic)",
      };
    case "lighting":
      return {
        surfaceLabel: "LIGHTING",
        surfaceOnly: "lighting fixtures or under-cabinet lighting only, in existing positions",
        doNotAffect: "furniture, layout, cabinets",
      };
    default:
      return {
        surfaceLabel: category.replace(/_/g, " ").toUpperCase(),
        surfaceOnly: "the matching surface only",
        doNotAffect: "all other surfaces and objects",
      };
  }
}

export function buildMinorRenovationPrompt({
  selectedFinishes,
  renderPromptExtra,
}: {
  selectedFinishes: SelectedFinish[];
  renderPromptExtra?: string;
}): string {
  const blocks = selectedFinishes.map((f, i) => {
    const spec = surfaceSpec(f.category);
    // renderDescription first, then name, then category
    const visual = f.renderDescription || f.name || f.category.replace(/_/g, " ");
    return `${i + 1}. ${spec.surfaceLabel}: ${f.name}
   Surface: ${spec.surfaceOnly}
   Visual: ${visual}
   Do not affect: ${spec.doNotAffect}${spec.negative ? `\n   Negative: ${spec.negative}` : ""}`;
  }).join("\n\n");

  const anyBacksplash = selectedFinishes.some(f => {
    const c = normalizeRenovationCategory(f.category);
    return c === "backsplash_tile" || c === "backsplash_sticker";
  });

  return `
This is a precise minor renovation visualization. Refinish only the specific surfaces listed below — this is NOT a redesign and NOT furniture replacement.

SELECTED FINISHES TO APPLY:

${blocks || "Refresh the surfaces using the selected finishes."}

ABSOLUTE RULES:
1. Preserve the same camera angle, crop, perspective, and room layout.
2. Preserve cabinet layout and appliance positions.
3. Preserve sink, stove, fridge, oven, hood, and plumbing positions.
4. Do not add or remove major objects.
5. Do not redesign the kitchen/bathroom.
6. Apply only the selected finish changes to their matching surfaces.
7. Do not substitute selected materials with a different style.
8. Do not invent red brick, exposed brick, or bold colours unless explicitly selected.
9. Keep the result realistic and renter-friendly where selected.
10. The image should look like the same room with only the selected surfaces refinished.
${anyBacksplash ? "11. The backsplash must use the selected tile look — never red brick or exposed brick.\n" : ""}
AVOID (negative): red brick backsplash, exposed brick, random masonry, changed layout, moved appliances, changed cabinet structure, removed cabinets, added furniture, changed camera angle, different room, oversized objects, unrelated decor, editing unselected surfaces.
${renderPromptExtra ? `\nAdditional instruction: ${renderPromptExtra}` : ""}
`.trim();
}
