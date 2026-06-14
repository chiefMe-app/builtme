import type { RenovationCatalogItem } from "@/data/uaeRenovationCatalog";

type SwatchPattern =
  | "marble" | "wood" | "terrazzo" | "zellige" | "subway_tile"
  | "stone" | "concrete" | "brass" | "matte_black" | "chrome";

type MaterialSwatchProps = {
  item: { category: string; name: string; colorTags?: string[] } &
    Partial<Pick<RenovationCatalogItem, "swatchType" | "swatchColor" | "swatchGradient" | "swatchPattern" | "swatchImageUrl">>;
  size?: "small" | "medium" | "large";
};

const SIZES = { small: 36, medium: 64, large: 96 };

// Infer a finish pattern/colour from the item's name, category and colour tags
// when no explicit swatch is provided, so every material has a meaningful preview.
function inferSwatch(item: MaterialSwatchProps["item"]): { pattern?: SwatchPattern; color?: string } {
  const text = `${item.name} ${item.category}`.toLowerCase();
  const colors = (item.colorTags || []).map(c => c.toLowerCase());

  if (text.includes("marble")) return { pattern: "marble" };
  if (text.includes("terrazzo")) return { pattern: "terrazzo" };
  if (text.includes("zellige")) return { pattern: "zellige" };
  if (text.includes("subway")) return { pattern: "subway_tile" };
  if (text.includes("microcement") || text.includes("concrete") || text.includes("cement")) return { pattern: "concrete" };
  if (text.includes("wood") || text.includes("oak") || text.includes("fluted") || text.includes("reeded")) return { pattern: "wood" };
  if (text.includes("brass") || colors.includes("brass") || colors.includes("gold")) return { pattern: "brass" };
  if (text.includes("chrome") || text.includes("steel")) return { pattern: "chrome" };
  if ((text.includes("black") || colors.includes("black")) && (item.category === "hardware_taps")) return { pattern: "matte_black" };
  if (text.includes("stone")) return { pattern: "stone" };

  // Tile / floor without a named pattern → grid tile look
  if (item.category === "backsplash_tile" || item.category === "backsplash_sticker") return { pattern: "subway_tile" };
  if (item.category === "floor_tile" || item.category === "floor_sticker") return { pattern: "stone" };
  if (item.category === "hardware_taps") return colors.includes("black") ? { pattern: "matte_black" } : { pattern: "chrome" };

  // Cabinet paint / solid colours → use the first colour tag
  const COLOR_HEX: Record<string, string> = {
    sage: "#B7C4A8", green: "#8FA37E", "off-white": "#F2EDE4", cream: "#EFE6D6", beige: "#D8C7AD",
    warm: "#E3D4BC", greige: "#C9C0B2", grey: "#BFC1BE", white: "#F5F3EE", terracotta: "#C57B57",
    sand: "#E0D2B8", neutral: "#DDD6C8", black: "#2A2A2A",
  };
  for (const c of colors) if (COLOR_HEX[c]) return { color: COLOR_HEX[c] };
  return { color: "#DDD6C8" };
}

function patternStyle(pattern: SwatchPattern): React.CSSProperties {
  switch (pattern) {
    case "marble":
      return {
        background: "#F4F1EB",
        backgroundImage:
          "linear-gradient(115deg, transparent 40%, rgba(160,160,160,0.45) 42%, transparent 44%)," +
          "linear-gradient(75deg, transparent 60%, rgba(190,170,120,0.4) 62%, transparent 64%)," +
          "radial-gradient(circle at 70% 30%, rgba(150,150,150,0.3), transparent 40%)",
      };
    case "wood":
      return {
        background: "#C89B6B",
        backgroundImage: "repeating-linear-gradient(90deg, #C89B6B 0px, #B98A5A 6px, #C89B6B 12px, #BD9163 18px)",
      };
    case "terrazzo":
      return {
        background: "#EFEBE2",
        backgroundImage:
          "radial-gradient(circle at 20% 30%, #C57B57 0 3px, transparent 4px)," +
          "radial-gradient(circle at 60% 60%, #8FA37E 0 3px, transparent 4px)," +
          "radial-gradient(circle at 80% 25%, #6B8CA3 0 2px, transparent 3px)," +
          "radial-gradient(circle at 40% 80%, #2A2A2A 0 2px, transparent 3px)",
      };
    case "zellige":
      return {
        background: "#B7C4A8",
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(255,255,255,0.25) 1px, transparent 1px)",
        backgroundSize: "14px 14px",
      };
    case "subway_tile":
      return {
        background: "#F0EEE8",
        backgroundImage:
          "linear-gradient(#D6D2C8 2px, transparent 2px)," +
          "linear-gradient(90deg, #D6D2C8 2px, transparent 2px)",
        backgroundSize: "26px 14px",
      };
    case "stone":
      return {
        background: "#D8CBB2",
        backgroundImage: "radial-gradient(circle at 30% 40%, rgba(150,135,110,0.4), transparent 35%), radial-gradient(circle at 70% 65%, rgba(120,110,95,0.35), transparent 40%)",
      };
    case "concrete":
      return {
        background: "#B9B9B6",
        backgroundImage: "radial-gradient(circle at 40% 30%, rgba(140,140,138,0.5), transparent 45%), radial-gradient(circle at 65% 70%, rgba(160,160,158,0.4), transparent 40%)",
      };
    case "brass":
      return { background: "linear-gradient(135deg, #C9A23F 0%, #E8CE84 45%, #B8902F 100%)" };
    case "matte_black":
      return { background: "#2A2A2A" };
    case "chrome":
      return { background: "linear-gradient(135deg, #9AA0A6 0%, #E6E9EC 45%, #8A9097 100%)" };
  }
}

export default function MaterialSwatch({ item, size = "large" }: MaterialSwatchProps) {
  const dim = SIZES[size];
  const base: React.CSSProperties = {
    width: "100%",
    height: dim,
    borderRadius: 4,
    border: "1px solid #EAE4D9",
    display: "block",
  };

  if (item.swatchImageUrl) {
    return <img src={item.swatchImageUrl} alt={item.name} style={{ ...base, objectFit: "cover" }} />;
  }
  if (item.swatchColor) {
    return <div style={{ ...base, background: item.swatchColor }} aria-label={item.name} />;
  }
  if (item.swatchGradient) {
    return <div style={{ ...base, background: item.swatchGradient }} aria-label={item.name} />;
  }

  const pattern = item.swatchPattern || inferSwatch(item).pattern;
  const color = inferSwatch(item).color;
  if (pattern) {
    return <div style={{ ...base, ...patternStyle(pattern) }} aria-label={item.name} />;
  }
  if (color) {
    return <div style={{ ...base, background: color }} aria-label={item.name} />;
  }
  return (
    <div style={{ ...base, background: "#F2EFEA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#AAA" }}>
      Finish preview unavailable
    </div>
  );
}
