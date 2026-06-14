import type { SurfaceFinishEdit } from "@/lib/mapFinishesToSurfaces";

const GLOBAL =
  "Everything outside the mask must remain identical to the input image. " +
  "The edited area must keep the same perspective, shape, lighting, shadows, edges, and physical boundaries of the original surface. " +
  "Do not add any rectangle, sample board, texture sheet, poster, floating panel, overlay card, label, or material preview. " +
  "The finish must be integrated into the existing surface only.";

const AVOID =
  "AVOID: floating rectangles, material sample boards, texture sheets, swatch cards, posters, labels, " +
  "before/after cards, marble slabs floating in air, duplicated texture panels, flat overlays, UI elements, text labels.";

/** Strict, surface-specific prompt for a single masked finish edit. */
export function buildSurfaceEditPrompt(edit: SurfaceFinishEdit): string {
  // "Refinish ... in place" framing avoids sample-panel words (texture/swatch/sample/panel/preview)
  const apply = `Refinish the existing surface in place so it looks like: ${edit.renderDescription}.`;
  const head = "This is a precise in-place surface renovation of a real photo.";

  let specific: string;
  switch (edit.surfaceCategory) {
    case "countertop":
      specific =
        "Refinish the existing countertop surface in place. " +
        "Keep all objects sitting on the countertop unchanged. " +
        "Do not cover appliances, bottles, toaster, air fryer, sink, faucet, or items on the counter. " +
        "Keep countertop shape, thickness, edges, sink cutout, cabinets, backsplash, and floor unchanged.";
      break;
    case "cabinet_doors":
      specific =
        "Refinish only the existing cabinet door and drawer fronts. " +
        "Keep handles, gaps, edges, panel geometry, cabinet structure, appliances, countertop, backsplash, and floor unchanged.";
      break;
    case "backsplash":
      specific =
        "Refinish only the existing backsplash wall surface between the countertop and the upper cabinets. " +
        "Do not create a floating tile board or rectangular sample. " +
        "Keep cabinets, countertop, appliances, sink, faucet, and floor unchanged. " +
        "Do not create red brick, exposed brick, or random masonry unless explicitly selected.";
      break;
    case "floor":
      specific =
        "Refinish only the visible floor plane. Keep perspective and grout lines aligned to the floor. " +
        "Keep cabinets, appliances, walls, countertop, and backsplash unchanged.";
      break;
    case "hardware_taps":
      specific =
        "Recolor/replace only the existing handles, drawer pulls, and tap/faucet in place. " +
        "Do not recolor cabinet doors or any other object. Keep cabinet colour, layout, countertop, backsplash, and appliances unchanged.";
      break;
    case "lighting":
      specific =
        "Update only the selected lighting fixture in place, keeping its position unchanged.";
      break;
    default:
      specific = "Refinish only the existing surface inside the mask in place.";
  }

  return `${head}
Edit only the selected ${edit.surfaceLabel.toLowerCase()} mask region.
${apply}
${specific}
Keep camera angle, layout, appliances, sink, faucet, cabinet structure, walls, and floor unchanged unless this exact surface is the one being refinished.
${GLOBAL}
${AVOID}`;
}
