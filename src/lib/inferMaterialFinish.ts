export type MaterialPattern =
  | "marble" | "stone" | "concrete" | "microcement"
  | "wood" | "fluted_wood" | "zellige" | "subway_tile"
  | "brass" | "matte_black" | "chrome" | "solid";

export interface MaterialFinish {
  pattern: MaterialPattern;
  color: string; // base hex tint
}

const COLOR_HEX: Record<string, string> = {
  sage: "#B7C4A8", green: "#8FA37E", "off-white": "#F2EDE4", "off white": "#F2EDE4",
  cream: "#EFE6D6", beige: "#D8C7AD", warm: "#E3D4BC", greige: "#C9C0B2",
  grey: "#BFC1BE", gray: "#BFC1BE", white: "#F5F3EE", terracotta: "#C57B57",
  sand: "#E0D2B8", neutral: "#DDD6C8", black: "#2A2A2A", brass: "#C9A23F",
  gold: "#C9A23F", oak: "#C8A06A", walnut: "#6E4B2E", wood: "#C09A6B",
  marble: "#F0ECE4", stone: "#D8CBB2", concrete: "#B9B9B6", chrome: "#C7CDD2",
};

function pickColor(text: string, colorTags: string[]): string {
  for (const tag of colorTags) {
    const t = tag.toLowerCase();
    if (COLOR_HEX[t]) return COLOR_HEX[t];
  }
  for (const key of Object.keys(COLOR_HEX)) {
    if (text.includes(key)) return COLOR_HEX[key];
  }
  return "#D8C7AD";
}

/**
 * Derives a deterministic material pattern + base colour from a finish's
 * category, name, render description and colour tags. No AI — used by the
 * Safe Preview layer so cabinet matte film stays matte beige (never invented
 * dark wood) unless a wood pattern is explicitly indicated.
 */
export function inferMaterialFinish({
  category,
  name,
  renderDescription,
  colorTags = [],
}: {
  category: string;
  name: string;
  renderDescription?: string;
  colorTags?: string[];
}): MaterialFinish {
  const text = `${name} ${renderDescription || ""} ${category}`.toLowerCase();
  const color = pickColor(text, colorTags);

  let pattern: MaterialPattern = "solid";
  if (text.includes("fluted") || text.includes("reeded")) pattern = "fluted_wood";
  else if (text.includes("wood") || text.includes("oak") || text.includes("walnut")) pattern = "wood";
  else if (text.includes("marble")) pattern = "marble";
  else if (text.includes("microcement")) pattern = "microcement";
  else if (text.includes("concrete") || text.includes("cement")) pattern = "concrete";
  else if (text.includes("zellige")) pattern = "zellige";
  else if (text.includes("subway")) pattern = "subway_tile";
  else if (text.includes("brass") || colorTags.includes("brass") || colorTags.includes("gold")) pattern = "brass";
  else if (text.includes("chrome") || text.includes("steel")) pattern = "chrome";
  else if (text.includes("stone")) pattern = "stone";
  else if (category === "hardware_taps") pattern = text.includes("black") ? "matte_black" : "chrome";
  else if (category.startsWith("backsplash")) pattern = "subway_tile";
  // cabinet_paint / cabinet_wrap with no wood keyword stays "solid" (matte colour)

  return { pattern, color };
}
