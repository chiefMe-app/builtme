import type { SurfaceFinishEdit } from "@/lib/mapFinishesToSurfaces";

const GLOBAL = "Everything outside the mask must remain identical to the input image.";

/** Strict, surface-specific prompt for a single masked finish edit. */
export function buildSurfaceEditPrompt(edit: SurfaceFinishEdit): string {
  const apply = `Apply: ${edit.renderDescription}.`;
  const head = "This is a precise local surface renovation edit.";

  switch (edit.surfaceCategory) {
    case "countertop":
      return `${head}
Edit only the selected countertop mask.
${apply}
Keep countertop shape, thickness, edges, sink cutout, faucet position, appliances, cabinets, backsplash, floor, and layout unchanged.
Do not edit anything outside the mask.
The result should look like the same kitchen with only the countertop surface refinished.
${GLOBAL}`;
    case "cabinet_doors":
      return `${head}
Edit only the selected cabinet door/drawer front mask.
${apply}
Keep cabinet layout, size, structure, handle positions, appliances, countertop, backsplash, floor, and walls unchanged.
Do not edit anything outside the mask.
${GLOBAL}`;
    case "backsplash":
      return `${head}
Edit only the selected backsplash mask.
${apply}
Keep cabinets, countertop, appliances, sink, faucet, walls, floor, and layout unchanged.
Do not generate red brick, exposed brick, random masonry, or unrelated tile unless explicitly selected.
Do not edit anything outside the mask.
${GLOBAL}`;
    case "floor":
      return `${head}
Edit only the selected floor mask.
${apply}
Keep cabinets, countertop, appliances, walls, backsplash, furniture, and layout unchanged.
Do not edit anything outside the mask.
${GLOBAL}`;
    case "hardware_taps":
      return `${head}
Edit only the selected handles/taps mask.
${apply}
Keep cabinet colour, cabinet layout, countertop, backsplash, appliances, and all other objects unchanged.
Do not turn other objects gold/black/chrome.
Do not edit anything outside the mask.
${GLOBAL}`;
    case "lighting":
      return `${head}
Edit only the selected lighting mask and keep the fixture position unchanged.
${apply}
Do not edit anything outside the mask.
${GLOBAL}`;
    default:
      return `${head}
Edit only the selected mask.
${apply}
Do not edit anything outside the mask.
${GLOBAL}`;
  }
}
