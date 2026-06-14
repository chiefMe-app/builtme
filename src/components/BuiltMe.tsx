"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isValidProductImageUrl, isValidProductUrl } from "@/lib/validateProductImage";
import { isBboxTooSmallForCategory } from "@/lib/expandFurnitureBbox";
import { normalizeFurnitureCategory, getCategoryPlacementRule } from "@/lib/normalizeFurnitureCategory";
import { normalizeRenovationCategory } from "@/lib/normalizeRenovationCategory";
import { validateRestyleRenderMetadata } from "@/lib/renderValidation";
import { UAE_FURNITURE_CATALOG, CatalogProduct } from "@/data/uaeFurnitureCatalog";
import { getSupplierOptionsForObject } from "@/lib/getSupplierOptionsForObject";
import { isCompatibleReplacement } from "@/lib/isCompatibleReplacement";
import { runSequentialStrictReplacements, StrictReplacementStep } from "@/lib/runSequentialStrictReplacements";
import MaterialSwatch from "@/components/MaterialSwatch";
import type { User } from "@supabase/supabase-js";

interface ColorSwatch {
  name: string;
  hex: string;
  usage: string;
}

interface StyleProfile {
  dominantStyle: string;
  colorPalette: ColorSwatch[];
  moodKeywords: string[];
  designDirection: string;
}

interface RoomAnalysis {
  room: string;
  observation: string;
  opportunity: string;
}

interface SpaceAnalysis {
  estimatedArea: string;
  roomType?: string;
  rooms: RoomAnalysis[];
  keyConstraints: string[];
}

interface DesignConcept {
  projectTitle: string;
  description: string;
  beforeAfterNarrative: string;
}

interface MaterialItem {
  zone: string;
  item: string;
  specification: string;
  supplier: string;
  supplierArea: string;
  priceRange: string;
  quantity: string;
  totalCost: string;
}

interface FurnitureItem {
  item: string;
  brand: string;
  model: string;
  quantity?: number;
  priceAED: number;
  totalPriceAED?: number;
  buyLink: string;
  imageSearchTerm?: string;
  alternative: string;
  altPriceAED: number;
}

interface CostBreakdown {
  materials: number;
  furniture: number;
  labour: number;
  contingency: number;
  total: number;
  currency: string;
}

interface TimelinePhase {
  week: string;
  tasks: string[];
}

interface Supplier {
  name: string;
  category: string;
  area: string;
  website: string;
}

interface ScopeWorkCategory {
  category: string;
  items: string[];
}

interface ScopeOfWork {
  summary: string;
  workItems: ScopeWorkCategory[];
}

interface ExtractedProductOption {
  id?: string;
  name: string;
  brand: string;
  price: string;
  tier: string;
  unit?: string;
  productUrl?: string;
  imageUrl?: string;
  renderDescription?: string;
}

interface ObjectBbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SelectedReplacementProduct {
  category?: string;
  itemName?: string;
  renderDescription?: string;
  name?: string;
  brand?: string;
  price?: string;
  tier?: string;
  imageUrl?: string;
  productUrl?: string;
}

interface RenderHistoryEntry {
  id: string;
  createdAt: string;
  mode: "restyle" | "strict_replace";
  beforeImage: string;
  afterImage: string;
  angleLabel?: string;
  selectedCategory?: string;
  selectedProduct?: SelectedReplacementProduct | null;
  appliedReplacements?: SelectedReplacement[];
  promptExtra?: string;
}

// A real product returned by the online product-search API (SerpApi)
interface OnlineProduct {
  id: string;
  category: string;
  name: string;
  supplier: string;
  brand: string;
  price: number | null;
  imageUrl: string;
  productUrl: string;
  tier: string;
  renderDescription: string;
}

// A furniture object the user has tapped/segmented in the room photo
interface SelectedObject {
  id: string;
  category: string;
  label: string;
  bbox: ObjectBbox;
  maskUrl: string;
  originalBbox?: ObjectBbox;
  wasExpanded?: boolean;
  usedFallbackMask?: boolean;
  imageWidth?: number;
  imageHeight?: number;
}

// The catalog product chosen to replace a specific selected object
interface SelectedReplacement {
  selectedObjectId: string;
  objectCategory: string;
  objectLabel: string;
  productId: string;
  productName: string;
  supplier: string;
  brand: string;
  category: string;
  price: number | string;
  imageUrl?: string;
  productUrl?: string;
  renderDescription: string;
}

interface ExtractedProduct {
  category: string;
  itemName: string;
  renderDescription?: string;
  options: ExtractedProductOption[];
}

interface BuiltMeResult {
  styleProfile?: StyleProfile;
  spaceAnalysis?: SpaceAnalysis;
  designConcept?: DesignConcept;
  scope?: ScopeOfWork;
  materials?: MaterialItem[];
  furniture?: FurnitureItem[];
  costBreakdown?: CostBreakdown;
  timeline?: TimelinePhase[];
  supplierMap?: Supplier[];
  nextSteps?: string[];
  error?: boolean;
}

type Screen = "landing" | "configure" | "processing" | "results";

const BUDGET_OPTIONS = [
  { id: "10-30", label: "AED 10K–30K", desc: "Cosmetic refresh" },
  { id: "30-80", label: "AED 30K–80K", desc: "Room makeover" },
  { id: "80-200", label: "AED 80K–200K", desc: "Full renovation" },
  { id: "200+", label: "AED 200K+", desc: "Premium transformation" },
];

const DUBAI_AREAS = [
  "Downtown Dubai", "Dubai Marina", "JBR", "Palm Jumeirah", "JLT",
  "Business Bay", "DIFC", "Jumeirah", "Mirdif", "Al Barsha",
  "Dubai Hills", "Arabian Ranches", "The Springs", "JVC", "Al Quoz",
  "Deira", "Bur Dubai", "Al Nahda", "Silicon Oasis", "Other",
];

const PROPERTY_TYPES = [
  { id: "apartment", label: "Apartment", icon: "🏢" },
  { id: "villa", label: "Villa", icon: "🏡" },
  { id: "townhouse", label: "Townhouse", icon: "🏘️" },
  { id: "penthouse", label: "Penthouse", icon: "🌆" },
  { id: "studio", label: "Studio", icon: "🏠" },
  { id: "office", label: "Office", icon: "🏬" },
];

const STYLE_OPTIONS = [
  { id: "modern", label: "Modern", icon: "◻️" },
  { id: "minimalist", label: "Minimalist", icon: "⬜" },
  { id: "scandinavian", label: "Scandinavian", icon: "🌿" },
  { id: "boho", label: "Modern Boho", icon: "🪴" },
  { id: "luxury", label: "Luxury / Glam", icon: "✨" },
  { id: "industrial", label: "Industrial", icon: "🏭" },
];

const USER_TYPES = [
  {
    id: "styling",
    title: "I want to restyle my room",
    subtitle: "Change furniture, lighting, decor — no construction",
    icon: "🛋️",
    example: "My living room feels dated. I want a fresh look without breaking walls.",
    color: "#C4A882",
  },
  {
    id: "minor_reno",
    title: "Minor renovation",
    subtitle: "Kitchen or bathroom refresh — no demolition",
    icon: "🔧",
    example: "Change countertops, tiles, cabinet wrap, flooring.",
    color: "#7EB8C9",
  },
  {
    id: "empty_flat",
    title: "Empty flat — full styling",
    subtitle: "Newly moved in, need furniture and styling from scratch",
    icon: "🏠",
    example: "Just got keys. Need to furnish and style the whole apartment.",
    color: "#A9C97E",
  },
  {
    id: "full_reno",
    title: "Full renovation",
    subtitle: "Demolition and rebuild — need a contractor",
    icon: "🏗️",
    example: "I want to knock down walls, redo plumbing, full fit-out.",
    color: "#C97E7E",
  },
];

const STYLING_ITEMS = [
  "Sofa / seating",
  "Coffee table",
  "Lighting / pendants",
  "Curtains / blinds",
  "Rugs",
  "Wall decor / art",
  "Shelving / storage",
  "Plants / accessories",
  "TV unit / media console",
  "Dining table & chairs",
];

const KITCHEN_OPTIONS = [
  { id: "countertop_replace", label: "Replace countertop", sub: "New quartz or marble slab" },
  { id: "countertop_wrap", label: "Wrap countertop", sub: "Vinyl wrap — budget-friendly" },
  { id: "cabinet_repaint", label: "Repaint cabinets", sub: "New colour, same structure" },
  { id: "cabinet_wrap", label: "Wrap cabinet doors", sub: "Vinyl wrap — quick refresh" },
  { id: "backsplash_tile", label: "New backsplash tiles", sub: "Real ceramic or porcelain" },
  { id: "backsplash_sticker", label: "Tile sticker", sub: "Peel & stick — removable" },
  { id: "floor_real", label: "New floor tiles", sub: "Permanent ceramic/vinyl" },
  { id: "floor_sticker", label: "Floor sticker tile", sub: "Peel & stick — renter-friendly" },
  { id: "lighting", label: "New lighting", sub: "Under-cabinet or overhead" },
  { id: "handles", label: "New handles & taps", sub: "Quick hardware upgrade" },
];

const BATHROOM_OPTIONS = [
  { id: "wall_tile_replace", label: "Replace wall tiles", sub: "New ceramic or porcelain" },
  { id: "wall_tile_paint", label: "Tile paint", sub: "Paint over existing tiles" },
  { id: "floor_tile_replace", label: "Replace floor tiles", sub: "New tiles" },
  { id: "floor_sticker", label: "Floor sticker", sub: "Peel & stick" },
  { id: "vanity", label: "New vanity unit", sub: "Sink + cabinet" },
  { id: "mirror", label: "New mirror", sub: "Framed or backlit" },
  { id: "shower_screen", label: "Shower screen", sub: "Glass partition" },
  { id: "lighting", label: "New lighting", sub: "LED or backlit mirror" },
  { id: "accessories", label: "New accessories", sub: "Towel rail, hooks, shelves" },
];

const ROOMS_LIST = ["Living room", "Master bedroom", "Guest bedroom", "Kitchen", "Dining area", "Home office", "Bathrooms"];

const AGENT_STEPS = [
  { id: "upload", label: "Processing uploads", icon: "📁" },
  { id: "vision", label: "Analysing your style references", icon: "🎨" },
  { id: "space", label: "Reading your floor plan", icon: "📐" },
  { id: "design", label: "Building design concept", icon: "✨" },
  { id: "materials", label: "Sourcing materials & costs", icon: "🏪" },
  { id: "package", label: "Compiling your renovation package", icon: "📦" },
];

const CHANGE_OPTIONS = [
  { id: "sofa", label: "Sofa & seating", icon: "🛋️" },
  { id: "dining", label: "Dining table & chairs", icon: "🍽️" },
  { id: "lighting", label: "Lighting", icon: "💡" },
  { id: "wall_colour", label: "Wall colour", icon: "🎨" },
  { id: "wallpaper", label: "Wallpaper / wall texture", icon: "🖼️" },
  { id: "rug", label: "Rug", icon: "🟫" },
  { id: "curtains", label: "Curtains / blinds", icon: "🪟" },
  { id: "coffee_table", label: "Coffee table", icon: "☕" },
  { id: "tv_unit", label: "TV unit", icon: "📺" },
  { id: "decor", label: "Decor & accessories", icon: "🌿" },
  { id: "layout", label: "Furniture layout / positions", icon: "📐" },
  { id: "existing_only", label: "Rearrange existing only", icon: "↔️" },
];

// Maps a "what to change" pill id to the catalog product categories it implies.
// Pills that aren't replaceable products (paint, curtains, layout) map to none.
const CHANGE_OPTION_TO_CATEGORIES: Record<string, { label: string; category: string }[]> = {
  sofa: [{ label: "Sofa", category: "sofa" }],
  dining: [{ label: "Dining Table", category: "dining_table" }, { label: "Dining Chairs", category: "dining_chair" }],
  lighting: [{ label: "Lighting", category: "lighting" }],
  rug: [{ label: "Rug", category: "rug" }],
  coffee_table: [{ label: "Coffee Table", category: "coffee_table" }],
  tv_unit: [{ label: "TV Unit", category: "tv_unit" }],
  decor: [{ label: "Decor", category: "decor" }],
  // wall_colour, wallpaper, curtains, layout, existing_only → no catalog products
};

// Safe local category fallback images — every image visually verified.
// Used whenever a product has no validated real product image.
const FALLBACK_PRODUCT_IMAGES: Record<string, string> = {
  sofa: "/images/fallbacks/sofa.jpg",
  "coffee table": "/images/fallbacks/coffee-table.jpg",
  rug: "/images/fallbacks/rug.jpg",
  lighting: "/images/fallbacks/lighting.jpg",
  decor: "/images/fallbacks/decor.jpg",
  chair: "/images/fallbacks/chair.jpg",
  "dining table": "/images/fallbacks/dining-table.jpg",
};

const getFurnitureImage = (item: string) => {
  const term = item.toLowerCase();
  if (term.includes("sofa") || term.includes("couch") || term.includes("sectional") || term.includes("bed") || term.includes("headboard") || term.includes("cushion") || term.includes("pillow") || term.includes("throw"))
    return FALLBACK_PRODUCT_IMAGES.sofa;
  if (term.includes("dining table") || term.includes("dining"))
    return FALLBACK_PRODUCT_IMAGES["dining table"];
  if (term.includes("coffee table") || term.includes("side table") || term.includes("console") || term.includes("tv unit") || term.includes("media") || term.includes("shelf") || term.includes("bookcase") || term.includes("table"))
    return FALLBACK_PRODUCT_IMAGES["coffee table"];
  if (term.includes("chair") || term.includes("stool") || term.includes("armchair") || term.includes("seat"))
    return FALLBACK_PRODUCT_IMAGES.chair;
  if (term.includes("rug") || term.includes("carpet"))
    return FALLBACK_PRODUCT_IMAGES.rug;
  if (term.includes("light") || term.includes("lamp") || term.includes("pendant") || term.includes("chandelier") || term.includes("led"))
    return FALLBACK_PRODUCT_IMAGES.lighting;
  return FALLBACK_PRODUCT_IMAGES.decor;
};

const getMaterialImage = (item: string, specification: string) => {
  const term = (item + " " + specification).toLowerCase();
  if (term.includes("calacatta") || term.includes("statuario"))
    return "https://images.unsplash.com/photo-1615873968403-89e068629265?w=80&q=80";
  if (term.includes("quartz") || term.includes("engineered stone"))
    return "https://images.unsplash.com/photo-1600607687939-ce8a6d349a58?w=80&q=80";
  if (term.includes("marble"))
    return "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=80&q=80";
  if (term.includes("zellige") || term.includes("terracotta") || term.includes("handmade tile"))
    return "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=80&q=80";
  if (term.includes("porcelain") || term.includes("ceramic") || term.includes("subway tile"))
    return "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=80&q=80";
  if (term.includes("mosaic"))
    return "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=80&q=80";
  if (term.includes("vinyl") || term.includes("sticker") || term.includes("peel"))
    return "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=80&q=80";
  if (term.includes("oak") || term.includes("walnut") || term.includes("teak"))
    return "https://images.unsplash.com/photo-1541123437800-1bb1317badc2?w=80&q=80";
  if (term.includes("wood") || term.includes("timber") || term.includes("mdf"))
    return "https://images.unsplash.com/photo-1541123437800-1bb1317badc2?w=80&q=80";
  if (term.includes("brass") || term.includes("gold") || term.includes("handle") || term.includes("tap"))
    return "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=80&q=80";
  if (term.includes("paint") || term.includes("emulsion"))
    return "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=80&q=80";
  if (term.includes("glass") || term.includes("splashback"))
    return "https://images.unsplash.com/photo-1615873968403-89e068629265?w=80&q=80";
  if (term.includes("laminate") || term.includes("cabinet"))
    return "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=80&q=80";
  if (term.includes("parquet") || term.includes("herringbone") || term.includes("plank"))
    return "https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=80&q=80";
  return "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=80&q=80";
};

export default function BuiltMe() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("landing");
  const [budget, setBudget] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [references, setReferences] = useState<File[]>([]);
  const [roomPhotos, setRoomPhotos] = useState<File[]>([]);
  const [userType, setUserType] = useState<string | null>(null);
  const [configStep, setConfigStep] = useState(1);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [selectedMinorItems, setSelectedMinorItems] = useState<string[]>([]);
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [stylePreference, setStylePreference] = useState<string | null>(null);
  const [hasDemolition, setHasDemolition] = useState<boolean | null>(null);
  const [hasDrawings, setHasDrawings] = useState<boolean | null>(null);
  const [location, setLocation] = useState({ area: "", propertyType: "", size: "" });
  const [roomPhotoUrls, setRoomPhotoUrls] = useState<string[]>([]);
  const [agentStep, setAgentStep] = useState(0);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  const [results, setResults] = useState<BuiltMeResult | null>(null);
  const [activeTab, setActiveTab] = useState("concept");
  const [savedUserType, setSavedUserType] = useState<string>("styling");
  const [furnitureBudget, setFurnitureBudget] = useState<"all" | "budget" | "mid" | "premium">("all");
  const [isLoading, setIsLoading] = useState(false);
  const [renders, setRenders] = useState<string[]>([]);
  const [renderLoading, setRenderLoading] = useState(false);
  const [roomPhoto, setRoomPhoto] = useState<File | null>(null);
  const [roomPhotoUrl, setRoomPhotoUrl] = useState<string>("");
  const [renderPromptExtra, setRenderPromptExtra] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [savedRoomPhotos, setSavedRoomPhotos] = useState<File[]>([]);
  const [selectedRenderPhoto, setSelectedRenderPhoto] = useState(0);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [referencePhotos, setReferencePhotos] = useState<File[]>([]);
  const [savedReferencePhotos, setSavedReferencePhotos] = useState<File[]>([]);
  const [renderStep, setRenderStep] = useState<"references" | "products" | "render">("references");
  const [extractedProducts, setExtractedProducts] = useState<ExtractedProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [extractingProducts, setExtractingProducts] = useState(false);
  const [allRenders, setAllRenders] = useState<{ photoIndex: number; url: string }[]>([]);
  const [whatToChange, setWhatToChange] = useState<string[]>([]);
  // Strict object replacement mode — multi-object selection
  const [renderMode, setRenderMode] = useState<"restyle" | "strict_replace">("restyle");
  const [selectedObjects, setSelectedObjects] = useState<SelectedObject[]>([]);
  const [activeSelectedObjectId, setActiveSelectedObjectId] = useState<string | null>(null);
  const [selectedReplacements, setSelectedReplacements] = useState<SelectedReplacement[]>([]);
  const [activeSupplier, setActiveSupplier] = useState<string | null>(null);
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);
  const [isExpandingSelection, setIsExpandingSelection] = useState(false);
  // Live online product search (SerpApi) results, keyed by normalized category
  const [onlineByCategory, setOnlineByCategory] = useState<Record<string, OnlineProduct[]>>({});
  const [onlineSearchState, setOnlineSearchState] = useState<"idle" | "loading" | "done" | "unconfigured">("idle");
  const [isSegmentingObject, setIsSegmentingObject] = useState(false);
  const [segmentError, setSegmentError] = useState<string | null>(null);
  const [strictImageUrl, setStrictImageUrl] = useState<string | null>(null);
  const [strictImageDims, setStrictImageDims] = useState<{ w: number; h: number } | null>(null);
  const [strictValidationMsg, setStrictValidationMsg] = useState<string | null>(null);
  const [renderHistory, setRenderHistory] = useState<RenderHistoryEntry[]>([]);
  const [activeRenderId, setActiveRenderId] = useState<string | null>(null);
  const refImagesRef = useRef<HTMLInputElement>(null);
  const roomPhotosRef = useRef<HTMLInputElement>(null);
  const renderPhotoRef = useRef<HTMLInputElement>(null);
  const referencePhotosRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const startNewProject = () => {
    setConfigStep(1);
    setLocation({ area: "", propertyType: "", size: "" });
    setUserType(null);
    setRoomPhotos([]);
    setSelectedItems([]);
    setSelectedRoom(null);
    setSelectedMinorItems([]);
    setSelectedRooms([]);
    setStylePreference(null);
    setHasDemolition(null);
    setHasDrawings(null);
    setBudget(null);
    setPrompt("");
    setReferences([]);
    setSavedProjectId(null);
    setReferencePhotos([]);
    setSavedReferencePhotos([]);
    setRenderStep("references");
    setExtractedProducts([]);
    setSelectedProducts([]);
    setScreen("configure");
  };

  const handleStart = () => {
    if (!user) {
      router.push("/auth");
      return;
    }
    startNewProject();
  };

  // If a project was opened from "My Projects", load it straight into the results screen
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedProject = localStorage.getItem("builtme_load_project");
    if (!savedProject) return;

    try {
      localStorage.removeItem("builtme_load_project");
      setResults(JSON.parse(savedProject));
      const savedRenders = localStorage.getItem("builtme_renders");
      if (savedRenders) setRenders(JSON.parse(savedRenders));
      setScreen("results");
    } catch (err) {
      console.error("Failed to load project:", err);
    }
  }, []);

  const handleReferences = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 5);
    setReferences(files);
  };

  const getTabsForUserType = (type: string) => {
    switch (type) {
      case "styling":
        return [
          { id: "concept", label: "Design Concept" },
          { id: "furniture", label: "Furniture & Shopping" },
          { id: "suppliers", label: "Dubai Suppliers" },
          { id: "renders", label: "AI Renders" },
        ];
      case "minor_reno":
        return [
          { id: "concept", label: "Design Concept" },
          { id: "materials", label: "Materials & Cost" },
          { id: "accessories", label: "Accessories" },
          { id: "suppliers", label: "Dubai Suppliers" },
          { id: "timeline", label: "Timeline" },
          { id: "renders", label: "AI Renders" },
        ];
      case "empty_flat":
        return [
          { id: "concept", label: "Design Concept" },
          { id: "roombyroom", label: "Room by Room" },
          { id: "furniture", label: "Furniture & Shopping" },
          { id: "suppliers", label: "Dubai Suppliers" },
          { id: "renders", label: "AI Renders" },
        ];
      case "full_reno":
        return [
          { id: "concept", label: "Design Concept" },
          { id: "materials", label: "Materials & Cost" },
          { id: "contractors", label: "Contractors" },
          { id: "suppliers", label: "Dubai Suppliers" },
          { id: "timeline", label: "Timeline" },
          { id: "renders", label: "AI Renders" },
        ];
      default:
        return [
          { id: "concept", label: "Design Concept" },
          { id: "materials", label: "Materials & Cost" },
          { id: "furniture", label: "Furniture" },
          { id: "suppliers", label: "Dubai Suppliers" },
          { id: "timeline", label: "Timeline" },
          { id: "renders", label: "AI Renders" },
        ];
    }
  };

  const getCategoryLabel = () => {
    if (userType === "styling") return "Room Restyling";
    if (userType === "minor_reno") {
      if (selectedRoom === "both") return "Kitchen & Bathroom";
      if (selectedRoom === "bathroom") return "Bathroom";
      return "Kitchen";
    }
    if (userType === "empty_flat") return "Full Apartment (Empty)";
    if (userType === "full_reno") return "Full Renovation";
    return "";
  };

  const toggleInArray = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  const canAnalyse = () => {
    if (roomPhotos.length === 0 || !budget) return false;
    if (userType === "styling") return selectedItems.length > 0;
    if (userType === "minor_reno") return selectedMinorItems.length > 0;
    if (userType === "empty_flat") return selectedRooms.length > 0;
    if (userType === "full_reno") return prompt.trim().length > 0;
    return false;
  };

  const runAgents = async () => {
    setScreen("processing");
    setDoneSteps([]);
    setAgentStep(0);

    for (let i = 0; i < AGENT_STEPS.length; i++) {
      setAgentStep(i);
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
      setDoneSteps((prev) => [...prev, i]);
    }

    setIsLoading(true);
    setSavedUserType(userType || "styling");
    setSavedRoomPhotos(roomPhotos);
    setSavedReferencePhotos(referencePhotos);
    try {
      const categoryLabel = getCategoryLabel();
      const budgetLabel = BUDGET_OPTIONS.find((b) => b.id === budget)?.label ?? budget ?? "";

      const formData = new FormData();
      formData.append("category", categoryLabel);
      formData.append("budget", budgetLabel);
      formData.append("prompt", prompt);
      formData.append("userType", userType || "");
      formData.append("selectedItems", JSON.stringify(selectedItems));
      formData.append("selectedMinorItems", JSON.stringify(selectedMinorItems));
      formData.append("selectedRooms", JSON.stringify(selectedRooms));
      formData.append("locationArea", location.area);
      formData.append("propertyType", location.propertyType);
      formData.append("propertySize", location.size);
      if (user?.id) formData.append("userId", user.id);
      if (roomPhotos.length > 0) {
        formData.append("floorPlan", roomPhotos[0]);
        roomPhotos.slice(1, 3).forEach(photo => {
          formData.append("referenceImages", photo);
        });
      }
      references.slice(0, 2).forEach(ref => {
        formData.append("referenceImages", ref);
      });
      if (referencePhotos.length > 0) {
        referencePhotos.slice(0, 3).forEach((ref) => {
          formData.append("referenceImages", ref);
        });
      }

      const response = await fetch("/api/analyse", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      const parsed = data.result as BuiltMeResult;
      setResults(parsed);
      setActiveTab("concept");
      localStorage.setItem("builtme_results", JSON.stringify(parsed));

      try {
        const { data: newProject } = await supabase
          .from("builtme_projects")
          .insert({
            user_id: user?.id,
            category: categoryLabel,
            budget: budgetLabel,
            prompt,
            result: parsed,
            title: parsed?.designConcept?.projectTitle || "My Project",
            renders: [],
            room_photo_url: roomPhotoUrl,
            created_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (newProject) setSavedProjectId(newProject.id);
      } catch (dbErr) {
        console.error("Failed to save project:", dbErr);
      }
    } catch (err) {
      console.error(err);
      setResults({ error: true });
    }

    setIsLoading(false);
    setScreen("results");
  };

  // The user's selected "items to change" → the catalog categories that drive
  // AI Render product options (reference images only affect style, not category)
  const selectedChangeItems = whatToChange.flatMap(id => CHANGE_OPTION_TO_CATEGORIES[id] || [])
    .map(c => ({ label: c.label, category: c.category, normalizedCategory: c.category }));

  // Minor renovation: AI Render is driven by renovation actions (selectedMinorItems),
  // not furniture categories.
  const isMinorRenovation = savedUserType === "minor_reno";
  const selectedRenovationActions = selectedMinorItems.map(id => {
    const opt = [...KITCHEN_OPTIONS, ...BATHROOM_OPTIONS].find(o => o.id === id);
    const label = opt?.label || id.replace(/_/g, " ");
    const category = normalizeRenovationCategory(label);
    return { id, label, category, normalizedCategory: category };
  });

  const extractProductsFromReferences = async () => {
    if (savedReferencePhotos.length === 0) return;
    setExtractingProducts(true);

    try {
      const formData = new FormData();
      savedReferencePhotos.forEach((photo, i) => {
        formData.append(`reference_${i}`, photo);
      });
      formData.append("category", savedUserType || "styling");
      formData.append("budget", budget || "");
      formData.append("existingAnalysis", JSON.stringify({
        style: results?.styleProfile?.dominantStyle,
        colors: results?.styleProfile?.colorPalette,
        room: results?.spaceAnalysis?.roomType,
      }));
      // Source of truth: the user's selected change items drive the product
      // categories. Reference images only influence style/colour.
      formData.append("selectedChangeItems", JSON.stringify(selectedChangeItems));
      formData.append("isMinorRenovation", String(isMinorRenovation));
      formData.append("selectedRenovationActions", JSON.stringify(selectedRenovationActions));

      const res = await fetch("/api/extract-products", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.products) {
        setExtractedProducts(data.products);
        setRenderStep("products");
      }
    } catch (err) {
      console.error(err);
    }
    setExtractingProducts(false);
  };

  const activeSelectedObject = selectedObjects.find(o => o.id === activeSelectedObjectId) || null;
  const activeObjectCategory = activeSelectedObject ? normalizeFurnitureCategory(activeSelectedObject.category) : null;

  // Fetch live online products for the active object's category (cached per category)
  useEffect(() => {
    if (!activeObjectCategory || activeObjectCategory === "unknown") return;
    if (onlineByCategory[activeObjectCategory]) { setOnlineSearchState("done"); return; }
    let alive = true;
    setOnlineSearchState("loading");
    fetch("/api/search-products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: activeObjectCategory,
        styleTags: results?.styleProfile?.dominantStyle ? [results.styleProfile.dominantStyle] : [],
        budget: parseInt((budget || "").replace(/[^\d]/g, ""), 10) || undefined,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (!alive) return;
        if (data.configured === false) { setOnlineSearchState("unconfigured"); return; }
        setOnlineByCategory(prev => ({ ...prev, [activeObjectCategory]: data.products || [] }));
        setOnlineSearchState("done");
      })
      .catch(() => { if (alive) setOnlineSearchState("done"); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeObjectCategory]);

  // Human label for a category, numbered when the same category repeats
  // (e.g. "Chair 1", "Chair 2")
  const labelForCategory = (category: string, existing: SelectedObject[]): string => {
    const base = category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const sameCat = existing.filter(o => o.category === category).length;
    return sameCat > 0 ? `${base} ${sameCat + 1}` : base;
  };

  const updateSelectedObject = (id: string, patch: Partial<SelectedObject>) => {
    setSelectedObjects(prev => prev.map(o => (o.id === id ? { ...o, ...patch } : o)));
  };

  const removeSelectedObject = (id: string) => {
    setSelectedObjects(prev => prev.filter(o => o.id !== id));
    setSelectedReplacements(prev => prev.filter(r => r.selectedObjectId !== id));
    setActiveSelectedObjectId(prev => {
      if (prev !== id) return prev;
      const remaining = selectedObjects.filter(o => o.id !== id);
      return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
    });
  };

  const clearObjectSelection = () => {
    setSelectedObjects([]);
    setActiveSelectedObjectId(null);
    setSelectedReplacements([]);
    setActiveSupplier(null);
    setSelectionWarning(null);
    setSegmentError(null);
    setStrictValidationMsg(null);
  };

  // Choose / change the replacement product for one selected object
  const setReplacementForObject = (obj: SelectedObject, product: CatalogProduct) => {
    // Never store an incompatible pairing (e.g. a dining table → sofa)
    if (!isCompatibleReplacement(obj.category, product.category)) {
      setStrictValidationMsg(`${product.name} can't replace a ${obj.category.replace(/_/g, " ")}. Please pick a matching product.`);
      return;
    }
    setStrictValidationMsg(null);
    setSelectedReplacements(prev => {
      const withoutCurrent = prev.filter(r => r.selectedObjectId !== obj.id);
      return [...withoutCurrent, {
        selectedObjectId: obj.id,
        objectCategory: obj.category,
        objectLabel: obj.label,
        productId: product.id,
        productName: product.name,
        supplier: product.supplier,
        brand: product.brand,
        category: product.category,
        price: product.price,
        imageUrl: product.imageUrl,
        productUrl: product.productUrl,
        renderDescription: product.renderDescription,
      }];
    });
  };

  // Expand a selected object's bbox to cover the full furniture item and
  // regenerate its mask from the expanded bbox
  const expandSelection = async (objId: string, categoryOverride?: string | null) => {
    const obj = selectedObjects.find(o => o.id === objId);
    if (!obj || !strictImageDims || isExpandingSelection) return;
    setIsExpandingSelection(true);
    try {
      const res = await fetch("/api/expand-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bbox: obj.bbox,
          category: categoryOverride ?? obj.category,
          imageWidth: strictImageDims.w,
          imageHeight: strictImageDims.h,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error || !data.maskUrl) {
        setSegmentError(data.error || "Could not expand the selection. Please try selecting again.");
        return;
      }
      updateSelectedObject(objId, { bbox: data.bbox, maskUrl: data.maskUrl, wasExpanded: true, usedFallbackMask: true });
      setStrictValidationMsg(null);
    } catch (err) {
      console.error("Expand selection failed:", err);
      setSegmentError("Could not expand the selection. Please try selecting again.");
    } finally {
      setIsExpandingSelection(false);
    }
  };

  const handleImageObjectClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (renderMode !== "strict_replace" || isSegmentingObject) return;
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    if (!naturalW || !naturalH) return;

    // Convert displayed coordinates to original image coordinates
    const clickX = ((e.clientX - rect.left) / rect.width) * naturalW;
    const clickY = ((e.clientY - rect.top) / rect.height) * naturalH;

    setIsSegmentingObject(true);
    setSegmentError(null);
    setSelectionWarning(null);

    try {
      // Upload the photo once so segmentation and rendering share the same URL
      let imageUrl = strictImageUrl;
      if (!imageUrl) {
        const photo = savedRoomPhotos[selectedRenderPhoto] || savedRoomPhotos[0];
        if (!photo) throw new Error("No room photo");
        const fd = new FormData();
        fd.append("image", photo);
        const upRes = await fetch("/api/upload-photo", { method: "POST", body: fd });
        const upData = await upRes.json();
        if (!upData.url) throw new Error(upData.error || "Photo upload failed");
        imageUrl = upData.url as string;
        setStrictImageUrl(imageUrl);
      }
      setStrictImageDims({ w: naturalW, h: naturalH });

      const res = await fetch("/api/segment-object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, clickX, clickY, imageWidth: naturalW, imageHeight: naturalH }),
      });
      const data = await res.json();
      if (!res.ok || data.error || !data.maskUrl) {
        setSegmentError(data.error || "We couldn't detect the object clearly. Please tap the center of the item again.");
        return;
      }

      // Append as a new selected object (don't lose previous selections)
      const category = data.category || "unknown";
      const newObj: SelectedObject = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        category,
        label: labelForCategory(category, selectedObjects),
        bbox: data.bbox,
        maskUrl: data.maskUrl,
        originalBbox: data.originalBbox || data.bbox,
        wasExpanded: Boolean(data.wasExpanded),
        usedFallbackMask: Boolean(data.usedFallbackMask),
        imageWidth: naturalW,
        imageHeight: naturalH,
      };
      setSelectedObjects(prev => [...prev, newObj]);
      setActiveSelectedObjectId(newObj.id);
      setActiveSupplier(null);
      setSelectionWarning(data.warning || null);
    } catch (err) {
      console.error("Object selection failed:", err);
      setSegmentError("We couldn't detect the object clearly. Please tap the center of the item again.");
    } finally {
      setIsSegmentingObject(false);
    }
  };

  // Resolve the currently selected replacement product (strict mode MVP = one)
  // into displayable details, with a safe fallback image
  const getSelectedReplacementProduct = (): SelectedReplacementProduct | null => {
    if (!selectedProducts?.length || !extractedProducts?.length) return null;

    const key = selectedProducts[0];
    const [itemName, optionName] = key.split("__");
    const product = extractedProducts.find(p => p.itemName === itemName);
    const option = product?.options?.find(o => o.name === optionName);

    if (!product || !option) return null;

    const validImage = isValidProductImageUrl({
      imageUrl: option.imageUrl,
      productName: option.name,
      category: product.category,
      brand: option.brand,
    });

    return {
      category: product.category,
      itemName: product.itemName,
      renderDescription: option.renderDescription || product.renderDescription,
      name: option.name,
      brand: option.brand,
      price: option.price,
      tier: option.tier,
      imageUrl: validImage ? option.imageUrl : getFurnitureImage(product.category || product.itemName),
      productUrl: option.productUrl || "",
    };
  };

  // Append a completed render to the version history and make it active.
  // Regenerating must never erase previous renders.
  const appendRenderToHistory = (entry: Omit<RenderHistoryEntry, "id" | "createdAt">) => {
    const newEntry: RenderHistoryEntry = {
      ...entry,
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      createdAt: new Date().toISOString(),
    };
    setRenderHistory(prev => [...prev, newEntry]);
    setActiveRenderId(newEntry.id);
  };

  // Strict mode: replace each selected object with its chosen catalog product,
  // applied sequentially (each edit composited onto the running result) so
  // multiple objects can be replaced while preserving earlier edits.
  const generateStrictRender = async () => {
    if (!strictImageUrl || selectedObjects.length === 0) {
      setStrictValidationMsg("Please select the object you want to replace and choose one replacement product.");
      return;
    }

    // Build a step per object that has a chosen, category-compatible replacement
    const steps: StrictReplacementStep[] = [];
    for (const obj of selectedObjects) {
      const repl = selectedReplacements.find(r => r.selectedObjectId === obj.id);
      if (!repl || !isCompatibleReplacement(obj.category, repl.category)) continue;

      // Block implausibly small masks (e.g. one sofa cushion)
      if (
        strictImageDims &&
        isBboxTooSmallForCategory({ bbox: obj.bbox, category: obj.category, imageWidth: strictImageDims.w, imageHeight: strictImageDims.h })
      ) {
        setStrictValidationMsg(
          `${obj.label} selection is too small. Please expand it or tap the center of the full ${obj.category.replace(/_/g, " ")}.`
        );
        return;
      }

      steps.push({
        selectedObjectId: obj.id,
        maskUrl: obj.maskUrl,
        bbox: obj.bbox,
        category: obj.category,
        renderDescription: `${repl.renderDescription} (${repl.productName})`,
        productName: repl.productName,
      });
    }

    if (steps.length === 0) {
      setStrictValidationMsg("Please choose one replacement product for at least one selected object.");
      return;
    }

    setStrictValidationMsg(null);
    setRenderLoading(true);
    setRenders([]);
    setAllRenders([]);

    const runStep = async (step: StrictReplacementStep, inputImageUrl: string): Promise<string | null> => {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strictMode: true,
          renderMode: "strict_replace",
          imageUrl: inputImageUrl,
          selectedObjectMaskUrl: step.maskUrl,
          selectedObjectBbox: step.bbox,
          selectedObjectCategory: step.category,
          replacementRenderDescription: step.renderDescription,
          replacementProductName: step.productName,
          renderPromptExtra: renderPromptExtra || "",
        }),
      });
      const data = await res.json();
      if (data.error || !data.predictionId) return null;
      for (let attempts = 0; attempts < 60; attempts++) {
        await new Promise(r => setTimeout(r, 3000));
        const sRes = await fetch(`/api/render-status?id=${data.predictionId}&provider=fal-fill`);
        const sData = await sRes.json();
        if (sData.status === "succeeded" && sData.images?.length > 0) return sData.images[0];
        if (sData.status === "failed") return null;
      }
      return null;
    };

    try {
      const { finalImageUrl, appliedSteps } = await runSequentialStrictReplacements({
        baseImageUrl: strictImageUrl,
        steps,
        runStep,
      });

      if (appliedSteps.length > 0 && finalImageUrl !== strictImageUrl) {
        setAllRenders([{ photoIndex: selectedRenderPhoto, url: finalImageUrl }]);
        setRenders([finalImageUrl]);
        const appliedReplacements = appliedSteps
          .map(s => selectedReplacements.find(r => r.selectedObjectId === s.selectedObjectId))
          .filter((r): r is SelectedReplacement => Boolean(r));
        appendRenderToHistory({
          mode: "strict_replace",
          beforeImage: strictImageUrl,
          afterImage: finalImageUrl,
          angleLabel: `Angle ${selectedRenderPhoto + 1}`,
          selectedCategory: appliedReplacements[0]?.objectCategory,
          selectedProduct: appliedReplacements[0]
            ? {
                category: appliedReplacements[0].category,
                name: appliedReplacements[0].productName,
                brand: appliedReplacements[0].brand,
                price: String(appliedReplacements[0].price),
                imageUrl: appliedReplacements[0].imageUrl,
                productUrl: appliedReplacements[0].productUrl,
              }
            : null,
          appliedReplacements,
          promptExtra: renderPromptExtra || "",
        });
        localStorage.setItem("builtme_renders", JSON.stringify([finalImageUrl]));
        if (savedProjectId) {
          try {
            await supabase.from("builtme_projects").update({ renders: [finalImageUrl] }).eq("id", savedProjectId);
          } catch (dbErr) {
            console.error("Failed to update project renders:", dbErr);
          }
        }
      } else {
        setStrictValidationMsg("The render failed. Please try again — or reselect the object and try once more.");
      }
    } finally {
      setRenderLoading(false);
    }
  };

  // Submit one guided restyle render (structured category mappings) and poll
  // until it finishes. Returns the result image URL.
  const runRestyleRender = async (photo: File, productsPrompt: string, minorRenovation = false): Promise<string | null> => {
    const formData = new FormData();
    formData.append("image", photo);
    formData.append("productsPrompt", productsPrompt);
    formData.append("renderPromptExtra", renderPromptExtra || "");
    if (minorRenovation) formData.append("isMinorRenovation", "true");

    const renderRes = await fetch("/api/render", { method: "POST", body: formData });
    const renderData = await renderRes.json();
    if (renderData.error || !renderData.predictionId) return null;

    const provider = renderData.provider || "fal";
    for (let attempts = 0; attempts < 60; attempts++) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes = await fetch(`/api/render-status?id=${renderData.predictionId}&provider=${provider}`);
      const statusData = await statusRes.json();
      if (statusData.status === "succeeded" && statusData.images?.length > 0) return statusData.images[0];
      if (statusData.status === "failed") return null;
    }
    return null;
  };

  const generateRenders = async () => {
    if (savedRoomPhotos.length === 0) {
      alert("No room photos found.");
      return;
    }
    if (renderMode === "strict_replace") {
      await generateStrictRender();
      return;
    }
    setRenderLoading(true);
    setRenders([]);
    setAllRenders([]);

    // Minor renovation: build a materials prompt (surface/finish changes only)
    // from the selected material options, and render with the renovation prompt.
    if (isMinorRenovation) {
      const materialLines = selectedProducts.map(key => {
        const [itemName, optionName] = key.split("__");
        const product = extractedProducts.find(p => p.itemName === itemName);
        const option = product?.options?.find(o => o.name === optionName);
        const desc = option?.renderDescription || product?.renderDescription || optionName || itemName;
        return `- ${product?.itemName || itemName}: ${desc}`;
      });
      const materialsPrompt = materialLines.join("\n");
      const photos = savedRoomPhotos.slice(0, 4);
      const collectedMaterials: { photoIndex: number; url: string }[] = [];
      for (let i = 0; i < photos.length; i++) {
        const rendered = await runRestyleRender(photos[i], materialsPrompt, true)
          || await runRestyleRender(photos[i], materialsPrompt, true);
        if (!rendered) continue;
        let url: string = rendered;
        try {
          const saveRes = await fetch("/api/save-render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
          const saveData = await saveRes.json();
          if (saveData.permanentUrl) url = saveData.permanentUrl;
        } catch { /* keep transient url */ }
        collectedMaterials.push({ photoIndex: i, url });
        setAllRenders([...collectedMaterials]);
        if (i === 0) setRenders([url]);
        appendRenderToHistory({ mode: "restyle", beforeImage: URL.createObjectURL(photos[i]), afterImage: url, angleLabel: `Angle ${i + 1}`, selectedProduct: getSelectedReplacementProduct(), promptExtra: renderPromptExtra || "" });
      }
      localStorage.setItem("builtme_renders", JSON.stringify(collectedMaterials.map(r => r.url)));
      if (savedProjectId && collectedMaterials.length > 0) {
        try { await supabase.from("builtme_projects").update({ renders: collectedMaterials.map(r => r.url) }).eq("id", savedProjectId); } catch (e) { console.error(e); }
      }
      setRenderLoading(false);
      return;
    }

    // Structured category mappings: each selected product is locked to its
    // normalized furniture category with an explicit placement rule, so the
    // model can't apply a dining product to a TV wall or invent new furniture
    const productMappings = selectedProducts.map(key => {
      const [itemName, optionName] = key.split("__");
      const product = extractedProducts.find(p => p.itemName === itemName);
      const option = product?.options?.find(o => o.name === optionName);
      const normalizedCategory = normalizeFurnitureCategory(product?.category || product?.itemName || itemName);
      return {
        category: normalizedCategory,
        originalCategory: product?.category || itemName,
        optionName: option?.name || optionName || itemName,
        brand: option?.brand || "",
        renderDescription: option?.renderDescription || product?.renderDescription || option?.name || itemName,
        placementRule: getCategoryPlacementRule(normalizedCategory),
      };
    });

    // "What to change" pills without a selected product become style-direction
    // mappings under the same category placement rules
    whatToChange.forEach(id => {
      if (id === "existing_only" || id === "layout") return;
      const normalized = normalizeFurnitureCategory(id.replace(/_/g, " "));
      if (productMappings.some(m => m.category === normalized)) return;
      productMappings.push({
        category: normalized,
        originalCategory: id.replace(/_/g, " "),
        optionName: "",
        brand: "",
        renderDescription: `Update in a ${results?.styleProfile?.dominantStyle || "modern"} style`,
        placementRule: getCategoryPlacementRule(normalized),
      });
    });

    const productsPrompt = productMappings.length > 0
      ? productMappings.map((p) =>
          `Category: ${p.category}
Selected product: ${p.optionName || "style direction only"}${p.brand ? ` by ${p.brand}` : ""}
Render description: ${p.renderDescription}
Placement rule: ${p.placementRule}`
        ).join("\n\n")
      : "";

    const restyleValidation = validateRestyleRenderMetadata({
      selectedCategories: productMappings.map(m => m.category),
    });
    if (restyleValidation.warnings.length > 0) {
      console.log("[restyle-validation]", restyleValidation.warnings);
    }

    // Generate one guided restyle render per uploaded photo (max 4)
    const photosToRender = savedRoomPhotos.slice(0, 4);
    const collected: { photoIndex: number; url: string }[] = [];

    for (let i = 0; i < photosToRender.length; i++) {
      try {
        let currentUrl = await runRestyleRender(photosToRender[i], productsPrompt);
        if (!currentUrl) {
          currentUrl = await runRestyleRender(photosToRender[i], productsPrompt); // retry once
        }
        if (!currentUrl) {
          console.error(`Restyle render failed for photo ${i}`);
          continue;
        }

        // Save final result to Supabase Storage
        try {
          const saveRes = await fetch("/api/save-render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: currentUrl }),
          });
          const saveData = await saveRes.json();
          const permanentUrl = saveData.permanentUrl || currentUrl;

          collected.push({ photoIndex: i, url: permanentUrl });
          setAllRenders([...collected]);
          appendRenderToHistory({
            mode: "restyle",
            beforeImage: URL.createObjectURL(photosToRender[i]),
            afterImage: permanentUrl,
            angleLabel: `Angle ${i + 1}`,
            selectedProduct: getSelectedReplacementProduct(),
            promptExtra: renderPromptExtra || "",
          });
          // Also keep renders array updated with first render
          if (i === 0) setRenders([permanentUrl]);
        } catch {
          collected.push({ photoIndex: i, url: currentUrl });
          setAllRenders([...collected]);
          appendRenderToHistory({
            mode: "restyle",
            beforeImage: URL.createObjectURL(photosToRender[i]),
            afterImage: currentUrl,
            angleLabel: `Angle ${i + 1}`,
            selectedProduct: getSelectedReplacementProduct(),
            promptExtra: renderPromptExtra || "",
          });
        }
      } catch (err) {
        console.error(`Render ${i} failed:`, err);
      }
    }

    localStorage.setItem("builtme_renders", JSON.stringify(collected.map(r => r.url)));

    // Save all renders to Supabase
    if (savedProjectId && collected.length > 0) {
      try {
        await supabase.from("builtme_projects").update({ renders: collected.map(r => r.url) }).eq("id", savedProjectId);
      } catch (dbErr) {
        console.error("Failed to update project renders:", dbErr);
      }
    }

    setRenderLoading(false);
  };

  const reAnalyseWithPrompt = async () => {
    if (!renderPromptExtra.trim()) return;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("category", getCategoryLabel());
      formData.append("budget", budget || "");
      formData.append("prompt", prompt + ". IMPORTANT UPDATES: " + renderPromptExtra);
      formData.append("userType", userType || "");
      formData.append("selectedItems", JSON.stringify(selectedItems));
      formData.append("selectedMinorItems", JSON.stringify(selectedMinorItems));
      formData.append("selectedRooms", JSON.stringify(selectedRooms));
      if (roomPhotos.length > 0) formData.append("floorPlan", roomPhotos[0]);

      const response = await fetch("/api/analyse", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setResults(data.result);

      // Save updated result to Supabase
      if (savedProjectId) {
        await supabase.from("builtme_projects")
          .update({ result: data.result })
          .eq("id", savedProjectId);
      }

      // Regenerate render with new analysis
      await generateRenders();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to update design");
    }
    setIsLoading(false);
  };

  const totalCost = results?.costBreakdown?.total || 0;

  return (
    <div style={{ minHeight: "100vh", background: "#F7F4EF", color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600&family=DM+Mono:wght@300;400&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #C4A882; border-radius: 2px; }

        .serif { font-family: 'Playfair Display', serif; }
        .mono { font-family: 'DM Mono', monospace; }

        .btn-primary {
          background: #1A1A1A;
          color: #F7F4EF;
          border: none;
          padding: 14px 36px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 2px;
        }
        .btn-primary:hover { background: #333; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.3; cursor: not-allowed; transform: none; }

        .btn-ghost {
          background: transparent;
          color: #1A1A1A;
          border: 1px solid #D4C9B8;
          padding: 10px 24px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 2px;
        }
        .btn-ghost:hover { border-color: #1A1A1A; }

        .card {
          background: #FFFFFF;
          border: 1px solid #EAE4D9;
          padding: 24px;
          border-radius: 4px;
        }

        .select-card {
          background: #FFF;
          border: 1.5px solid #EAE4D9;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 4px;
        }
        .select-card:hover { border-color: #C4A882; }
        .select-card.selected { border-color: #1A1A1A; background: #FAF8F5; }

        .input-field {
          background: #FFF;
          border: 1.5px solid #EAE4D9;
          color: #1A1A1A;
          padding: 12px 16px;
          width: 100%;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          outline: none;
          transition: border 0.2s;
          border-radius: 4px;
        }
        .input-field:focus { border-color: #C4A882; }
        .input-field::placeholder { color: #AAA; }

        .upload-zone {
          border: 2px dashed #D4C9B8;
          border-radius: 4px;
          padding: 32px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: #FFF;
        }
        .upload-zone:hover { border-color: #C4A882; background: #FAF8F5; }
        .upload-zone.has-file { border-color: #1A1A1A; border-style: solid; background: #FAF8F5; }

        .tab {
          padding: 10px 20px;
          background: transparent;
          border: none;
          border-bottom: 2px solid transparent;
          color: #999;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.02em;
        }
        .tab.active { color: #1A1A1A; border-bottom-color: #C4A882; }
        .tab:hover:not(.active) { color: #555; }

        .agent-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 0;
          border-bottom: 1px solid #EAE4D9;
          opacity: 0.3;
          transition: all 0.4s;
        }
        .agent-row.active { opacity: 1; }
        .agent-row.done { opacity: 0.6; }
        .agent-dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: #D4C9B8;
          flex-shrink: 0;
          transition: all 0.3s;
        }
        .agent-row.active .agent-dot {
          background: #C4A882;
          box-shadow: 0 0 10px #C4A88266;
          animation: pulse 1.2s infinite;
        }
        .agent-row.done .agent-dot { background: #1A1A1A; }

        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.5); }
        }

        .color-swatch {
          width: 40px; height: 40px;
          border-radius: 50%;
          border: 2px solid #EAE4D9;
          flex-shrink: 0;
          transition: transform 0.2s;
        }
        .color-swatch:hover { transform: scale(1.1); }

        .cost-bar {
          height: 8px;
          background: #EAE4D9;
          border-radius: 4px;
          overflow: hidden;
          margin-top: 6px;
        }
        .cost-fill {
          height: 100%;
          background: linear-gradient(90deg, #C4A882, #A08050);
          border-radius: 4px;
          transition: width 0.8s ease;
        }

        .material-row { border-bottom: 1px solid #EAE4D9; }
        .material-row:hover { background: #FAF8F5; }

        .tag {
          display: inline-block;
          background: #F0EBE2;
          color: #7A6A55;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.04em;
        }

        .divider { height: 1px; background: #EAE4D9; margin: 24px 0; }

        .fade-in { animation: fadeIn 0.4s ease forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        .hero-img {
          position: absolute;
          inset: 0;
          background: url('https://images.unsplash.com/photo-1618219908412-a29a1bb7b86e?w=1200&q=80') center/cover;
          opacity: 0.12;
        }
      `}</style>

      {/* LANDING */}
      {screen === "landing" && (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          {/* Nav */}
          <nav style={{ padding: "20px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #EAE4D9", background: "#F7F4EF" }}>
            <div>
              <span className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Built</span>
              <span className="serif" style={{ fontSize: 22, fontWeight: 400, fontStyle: "italic", color: "#C4A882" }}>Me</span>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div className="mono" style={{ fontSize: 10, color: "#AAA", letterSpacing: "0.15em" }}>DUBAI</div>
              <a href="/projects" style={{ fontSize: 13, color: "#666", textDecoration: "none", fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em" }}>MY PROJECTS</a>
              <button className="btn-primary" onClick={handleStart} style={{ padding: "10px 24px", fontSize: 13 }}>Start your renovation</button>
              {user && (
                <button
                  className="btn-ghost"
                  style={{ padding: "10px 24px", fontSize: 13 }}
                  onClick={async () => {
                    await supabase.auth.signOut();
                    window.location.href = "/auth";
                  }}
                >
                  Sign out
                </button>
              )}
            </div>
          </nav>

          {/* Hero */}
          <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 40px", textAlign: "center", overflow: "hidden" }}>
            <div className="hero-img" />
            <div style={{ position: "relative", zIndex: 1, maxWidth: 680 }}>
              <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.25em", marginBottom: 20 }}>AI-POWERED HOME RENOVATION · DUBAI</div>
              <h1 className="serif" style={{ fontSize: "clamp(40px, 6vw, 72px)", fontWeight: 400, lineHeight: 1.15, marginBottom: 20 }}>
                Your home,<br />
                <em style={{ color: "#C4A882" }}>reimagined</em> — by you.
              </h1>
              <p style={{ fontSize: 17, fontWeight: 300, color: "#666", lineHeight: 1.8, marginBottom: 40, maxWidth: 500, margin: "0 auto 40px" }}>
                Upload your floor plan and inspiration images. Tell us what you want. Our AI builds your complete renovation package — materials, costs, suppliers, and furniture links.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn-primary" onClick={handleStart} style={{ fontSize: 14, padding: "16px 40px" }}>
                  Start for free →
                </button>
                <button className="btn-ghost" style={{ fontSize: 14, padding: "16px 24px" }}>
                  See example
                </button>
              </div>
            </div>
          </div>

          {/* How it works */}
          <div style={{ background: "#1A1A1A", padding: "48px 40px" }}>
            <div style={{ maxWidth: 800, margin: "0 auto" }}>
              <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em", marginBottom: 24, textAlign: "center" }}>HOW IT WORKS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
                {[
                  { step: "01", title: "Upload & describe", desc: "Share your floor plan, style references, and what you want to change." },
                  { step: "02", title: "AI analyses", desc: "6 agents read your space, style, and budget — building your personal renovation plan." },
                  { step: "03", title: "Get your package", desc: "Materials, costs, Dubai suppliers, furniture links, and a project timeline — ready to act on." },
                ].map(s => (
                  <div key={s.step}>
                    <div className="mono" style={{ fontSize: 11, color: "#C4A882", marginBottom: 10 }}>{s.step}</div>
                    <div className="serif" style={{ fontSize: 18, color: "#F7F4EF", marginBottom: 8, fontWeight: 400 }}>{s.title}</div>
                    <div style={{ fontSize: 13, color: "#888", lineHeight: 1.7, fontWeight: 300 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ padding: "28px 40px", borderTop: "1px solid #EAE4D9", display: "flex", gap: 40, justifyContent: "center" }}>
            {[["Dubai", "Market"], ["6", "AI Agents"], ["Minor", "Renovation"], ["Free", "To Start"]].map(([num, label]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div className="serif" style={{ fontSize: 20, fontWeight: 600, color: "#C4A882" }}>{num}</div>
                <div className="mono" style={{ fontSize: 10, color: "#AAA", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CONFIGURE */}
      {screen === "configure" && (
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }} className="fade-in">
          <button
            className="btn-ghost"
            onClick={() => {
              if (configStep > 1) setConfigStep(configStep - 1);
              else setScreen("landing");
            }}
            style={{ marginBottom: 28 }}
          >
            ← Back
          </button>

          {/* Step indicator */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
            {[1, 2, 3, 4].map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center" }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: configStep >= s ? "#1A1A1A" : "#FFF",
                    color: configStep >= s ? "#F7F4EF" : "#AAA",
                    border: `1.5px solid ${configStep >= s ? "#1A1A1A" : "#EAE4D9"}`,
                    fontSize: 12,
                    fontFamily: "'DM Mono', monospace",
                  }}
                >
                  {s}
                </div>
                {s < 4 && <div style={{ width: 28, height: 1, background: configStep > s ? "#1A1A1A" : "#EAE4D9" }} />}
              </div>
            ))}
            <div className="mono" style={{ fontSize: 10, color: "#AAA", letterSpacing: "0.2em", marginLeft: 12 }}>STEP {configStep} OF 4</div>
          </div>

          {/* STEP 1: LOCATION */}
          {configStep === 1 && (
            <div>
              <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em", marginBottom: 8 }}>NEW PROJECT</div>
              <h2 className="serif" style={{ fontSize: 36, fontWeight: 400, marginBottom: 28 }}>Where is your <em>property</em>?</h2>

              <div style={{ marginBottom: 32 }}>
                <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>AREA <span style={{ color: "#C4A882" }}>*</span></div>
                <select
                  className="input-field"
                  value={location.area}
                  onChange={(e) => setLocation({ ...location, area: e.target.value })}
                  style={{ cursor: "pointer" }}
                >
                  <option value="">Select an area</option>
                  {DUBAI_AREAS.map((area) => (
                    <option key={area} value={area}>{area}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: 32 }}>
                <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>PROPERTY TYPE <span style={{ color: "#C4A882" }}>*</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {PROPERTY_TYPES.map((p) => (
                    <div
                      key={p.id}
                      className={`select-card ${location.propertyType === p.id ? "selected" : ""}`}
                      onClick={() => setLocation({ ...location, propertyType: p.id })}
                      style={{ textAlign: "center" }}
                    >
                      <div style={{ fontSize: 22, marginBottom: 6 }}>{p.icon}</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 32 }}>
                <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>APPROXIMATE SIZE (SQFT) <span style={{ color: "#CCC" }}>(optional)</span></div>
                <input
                  type="number"
                  className="input-field"
                  value={location.size}
                  onChange={(e) => setLocation({ ...location, size: e.target.value })}
                  placeholder="e.g. 1200"
                />
              </div>

              <button
                className="btn-primary"
                disabled={!location.area || !location.propertyType}
                onClick={() => setConfigStep(2)}
                style={{ width: "100%", fontSize: 15, padding: "16px" }}
              >
                Continue →
              </button>
            </div>
          )}

          {/* STEP 2: USER TYPE */}
          {configStep === 2 && (
            <div>
              <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em", marginBottom: 8 }}>NEW PROJECT</div>
              <h2 className="serif" style={{ fontSize: 36, fontWeight: 400, marginBottom: 28 }}>What would you like to <em>do</em>?</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 32 }}>
                {USER_TYPES.map((t) => (
                  <div
                    key={t.id}
                    className="select-card"
                    onClick={() => setUserType(t.id)}
                    style={{
                      padding: 22,
                      borderColor: userType === t.id ? "#C4A882" : undefined,
                      borderWidth: userType === t.id ? 2 : undefined,
                      background: userType === t.id ? "#FAF8F5" : undefined,
                    }}
                  >
                    <div style={{ fontSize: 30, marginBottom: 10 }}>{t.icon}</div>
                    <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 6 }}>{t.title}</div>
                    <div style={{ fontSize: 12, color: "#999", marginBottom: 10, lineHeight: 1.6 }}>{t.subtitle}</div>
                    <div style={{ fontSize: 11, color: "#BBB", fontStyle: "italic", lineHeight: 1.6 }}>&ldquo;{t.example}&rdquo;</div>
                  </div>
                ))}
              </div>
              <button
                className="btn-primary"
                disabled={!userType}
                onClick={() => setConfigStep(3)}
                style={{ width: "100%", fontSize: 15, padding: "16px" }}
              >
                Continue →
              </button>
            </div>
          )}

          {/* STEP 3: ROOM PHOTOS */}
          {configStep === 3 && (
            <div>
              <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em", marginBottom: 8 }}>NEW PROJECT</div>
              <h2 className="serif" style={{ fontSize: 36, fontWeight: 400, marginBottom: 28 }}>Show us your <em>space</em></h2>

              <div style={{ marginBottom: 32 }}>
                <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 6 }}>UPLOAD PHOTOS OF YOUR CURRENT SPACE <span style={{ color: "#C4A882" }}>*</span></div>
                <div style={{ fontSize: 12, color: "#AAA", marginBottom: 12 }}>Different angles help the AI understand your room better.</div>
                <div
                  className={`upload-zone ${roomPhotos.length > 0 ? "has-file" : ""}`}
                  onClick={() => roomPhotosRef.current?.click()}
                >
                  <input
                    ref={roomPhotosRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []).slice(0, 5);
                      setRoomPhotos(files);
                    }}
                    style={{ display: "none" }}
                  />
                  {roomPhotos.length > 0 ? (
                    <div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 8 }}>
                        {roomPhotos.map((f, i) => (
                          <img key={i} src={URL.createObjectURL(f)} alt="" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 4 }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{roomPhotos.length} photo{roomPhotos.length > 1 ? "s" : ""} selected</div>
                      <div style={{ fontSize: 12, color: "#AAA", marginTop: 4 }}>Click to change</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>📷</div>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Upload 1-5 room photos</div>
                      <div style={{ fontSize: 12, color: "#AAA" }}>Different angles: entrance view, corners, windows</div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 24 }}>
                <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 6 }}>
                  STYLE REFERENCES <span style={{ color: "#888", fontWeight: 300 }}>(optional)</span>
                </div>
                <div style={{ fontSize: 12, color: "#AAA", marginBottom: 10 }}>
                  Upload Pinterest screenshots, magazine pages, or rooms you love. AI will match this style.
                </div>
                <div
                  className={`upload-zone ${referencePhotos.length > 0 ? "has-file" : ""}`}
                  onClick={() => referencePhotosRef.current?.click()}
                  style={{ padding: 16 }}
                >
                  <input
                    ref={referencePhotosRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []).slice(0, 5);
                      setReferencePhotos(files);
                    }}
                    style={{ display: "none" }}
                  />
                  {referencePhotos.length > 0 ? (
                    <div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 8 }}>
                        {referencePhotos.map((f, i) => (
                          <img key={i} src={URL.createObjectURL(f)} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 4 }} />
                        ))}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, textAlign: "center" }}>{referencePhotos.length} reference{referencePhotos.length > 1 ? "s" : ""} added</div>
                    </div>
                  ) : (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🎨</div>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Add style references</div>
                      <div style={{ fontSize: 12, color: "#AAA" }}>Pinterest, Instagram, magazine — any inspiration</div>
                    </div>
                  )}
                </div>
              </div>

              <button
                className="btn-primary"
                disabled={roomPhotos.length === 0}
                onClick={() => setConfigStep(4)}
                style={{ width: "100%", fontSize: 15, padding: "16px", marginTop: 32 }}
              >
                Continue →
              </button>
            </div>
          )}

          {/* STEP 4: TYPE-SPECIFIC QUESTIONS */}
          {configStep === 4 && (
            <div>
              <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em", marginBottom: 8 }}>NEW PROJECT</div>
              <h2 className="serif" style={{ fontSize: 36, fontWeight: 400, marginBottom: 28 }}>A few more <em>details</em></h2>

              {/* STYLING */}
              {userType === "styling" && (
                <>
                  <div style={{ marginBottom: 32 }}>
                    <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>WHAT DO YOU WANT TO CHANGE?</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                      {STYLING_ITEMS.map((item) => (
                        <div
                          key={item}
                          className={`select-card ${selectedItems.includes(item) ? "selected" : ""}`}
                          onClick={() => toggleInArray(selectedItems, item, setSelectedItems)}
                          style={{ display: "flex", alignItems: "center", gap: 10 }}
                        >
                          <input type="checkbox" readOnly checked={selectedItems.includes(item)} style={{ accentColor: "#C4A882", width: 14, height: 14 }} />
                          <span style={{ fontSize: 13 }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 32 }}>
                    <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>STYLE PREFERENCE</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                      {STYLE_OPTIONS.map((s) => (
                        <div
                          key={s.id}
                          className={`select-card ${stylePreference === s.id ? "selected" : ""}`}
                          onClick={() => setStylePreference(s.id)}
                          style={{ textAlign: "center" }}
                        >
                          <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* MINOR RENO */}
              {userType === "minor_reno" && (
                <>
                  <div style={{ marginBottom: 32 }}>
                    <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>WHICH ROOM?</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                      {[
                        { id: "kitchen", label: "Kitchen", icon: "🍳" },
                        { id: "bathroom", label: "Bathroom", icon: "🚿" },
                        { id: "both", label: "Both", icon: "🏠" },
                      ].map((r) => (
                        <div
                          key={r.id}
                          className={`select-card ${selectedRoom === r.id ? "selected" : ""}`}
                          onClick={() => {
                            setSelectedRoom(r.id);
                            setSelectedMinorItems([]);
                          }}
                          style={{ textAlign: "center" }}
                        >
                          <div style={{ fontSize: 22, marginBottom: 6 }}>{r.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{r.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedRoom && (
                    <div style={{ marginBottom: 32 }}>
                      <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>WHAT DO YOU WANT TO CHANGE?</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                        {(selectedRoom === "kitchen" ? KITCHEN_OPTIONS : selectedRoom === "bathroom" ? BATHROOM_OPTIONS : [...KITCHEN_OPTIONS, ...BATHROOM_OPTIONS]).map((opt) => (
                          <div
                            key={opt.id}
                            className={`select-card ${selectedMinorItems.includes(opt.id) ? "selected" : ""}`}
                            onClick={() => toggleInArray(selectedMinorItems, opt.id, setSelectedMinorItems)}
                          >
                            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{opt.label}</div>
                            <div style={{ fontSize: 11, color: "#AAA" }}>{opt.sub}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* EMPTY FLAT */}
              {userType === "empty_flat" && (
                <>
                  <div style={{ marginBottom: 32 }}>
                    <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>WHICH ROOMS NEED STYLING?</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                      {ROOMS_LIST.map((room) => (
                        <div
                          key={room}
                          className={`select-card ${selectedRooms.includes(room) ? "selected" : ""}`}
                          onClick={() => toggleInArray(selectedRooms, room, setSelectedRooms)}
                          style={{ display: "flex", alignItems: "center", gap: 10 }}
                        >
                          <input type="checkbox" readOnly checked={selectedRooms.includes(room)} style={{ accentColor: "#C4A882", width: 14, height: 14 }} />
                          <span style={{ fontSize: 13 }}>{room}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 32 }}>
                    <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>STYLE PREFERENCE</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                      {STYLE_OPTIONS.map((s) => (
                        <div
                          key={s.id}
                          className={`select-card ${stylePreference === s.id ? "selected" : ""}`}
                          onClick={() => setStylePreference(s.id)}
                          style={{ textAlign: "center" }}
                        >
                          <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* FULL RENO */}
              {userType === "full_reno" && (
                <>
                  <div style={{ marginBottom: 32 }}>
                    <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>DESCRIBE WHAT YOU WANT TO CHANGE</div>
                    <textarea
                      className="input-field"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g. Knock down the wall between kitchen and living room, redo all plumbing and electrical, full new layout."
                      style={{ minHeight: 100, resize: "vertical", lineHeight: 1.7 }}
                    />
                  </div>

                  <div style={{ marginBottom: 32 }}>
                    <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>DOES THIS INVOLVE DEMOLITION?</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                      {[{ label: "Yes", val: true }, { label: "No", val: false }].map((opt) => (
                        <div
                          key={opt.label}
                          className={`select-card ${hasDemolition === opt.val ? "selected" : ""}`}
                          onClick={() => setHasDemolition(opt.val)}
                          style={{ textAlign: "center" }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 32 }}>
                    <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>DO YOU HAVE EXISTING DRAWINGS?</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                      {[{ label: "Yes", val: true }, { label: "No", val: false }].map((opt) => (
                        <div
                          key={opt.label}
                          className={`select-card ${hasDrawings === opt.val ? "selected" : ""}`}
                          onClick={() => setHasDrawings(opt.val)}
                          style={{ textAlign: "center" }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {hasDrawings && (
                    <div style={{ marginBottom: 32 }}>
                      <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>UPLOAD FLOOR PLANS / DRAWINGS</div>
                      <div className={`upload-zone ${references.length > 0 ? "has-file" : ""}`} onClick={() => refImagesRef.current?.click()}>
                        <input ref={refImagesRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" multiple onChange={handleReferences} style={{ display: "none" }} />
                        {references.length > 0 ? (
                          <div>
                            <div style={{ fontSize: 24, marginBottom: 8 }}>📐</div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{references.length} file{references.length > 1 ? "s" : ""} selected</div>
                            <div style={{ fontSize: 12, color: "#AAA", marginTop: 4 }}>Click to change</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: 32, marginBottom: 10 }}>📐</div>
                            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Upload your drawings</div>
                            <div style={{ fontSize: 12, color: "#AAA" }}>Floor plans, sketches, or PDFs</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: "#AAA", marginBottom: 32, lineHeight: 1.7 }}>
                    Our AI will match you with licensed Dubai contractors based on your scope.
                  </div>
                </>
              )}

              {/* BUDGET (all types) */}
              <div style={{ marginBottom: 32 }}>
                <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>BUDGET RANGE</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {BUDGET_OPTIONS.map((b) => (
                    <div key={b.id} className={`select-card ${budget === b.id ? "selected" : ""}`} onClick={() => setBudget(b.id)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 500 }}>{b.label}</div>
                        <div style={{ fontSize: 12, color: "#AAA", marginTop: 2 }}>{b.desc}</div>
                      </div>
                      {budget === b.id && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1A1A1A" }} />}
                    </div>
                  ))}
                </div>
              </div>

              {/* VISION PROMPT (not for full_reno, which has its own scope textarea above) */}
              {userType !== "full_reno" && (
                <div style={{ marginBottom: 40 }}>
                  <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>DESCRIBE YOUR VISION</div>
                  <textarea
                    className="input-field"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="e.g. I want a warm, minimal look with white tones and wood accents. Natural light is important. I like Japanese and Scandinavian style."
                    style={{ minHeight: 100, resize: "vertical", lineHeight: 1.7 }}
                  />
                  <div style={{ fontSize: 11, color: "#BBB", marginTop: 6 }}>Be specific — the more detail, the better your package.</div>
                </div>
              )}

              <button
                className="btn-primary"
                disabled={!canAnalyse()}
                onClick={runAgents}
                style={{ width: "100%", fontSize: 15, padding: "16px" }}
              >
                Analyse my space →
              </button>
            </div>
          )}
        </div>
      )}

      {/* PROCESSING */}
      {screen === "processing" && (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }} className="fade-in">
          <div style={{ maxWidth: 480, width: "100%" }}>
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em", marginBottom: 12 }}>AGENTS WORKING</div>
              <h2 className="serif" style={{ fontSize: 32, fontWeight: 400 }}>Building your<br /><em style={{ color: "#C4A882" }}>renovation package</em></h2>
            </div>
            <div className="card">
              {AGENT_STEPS.map((agent, i) => (
                <div key={agent.id} className={`agent-row ${i === agentStep ? "active" : ""} ${doneSteps.includes(i) ? "done" : ""}`}>
                  <div className="agent-dot" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 400 }}>{agent.icon} {agent.label}</div>
                  </div>
                  {doneSteps.includes(i) && <div className="mono" style={{ fontSize: 10, color: "#1A1A1A" }}>✓</div>}
                  {i === agentStep && !doneSteps.includes(i) && (
                    <div className="mono" style={{ fontSize: 10, color: "#C4A882" }}>running</div>
                  )}
                </div>
              ))}
            </div>
            {isLoading && (
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <div className="mono" style={{ fontSize: 11, color: "#AAA" }}>Claude AI generating your package...</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESULTS */}
      {screen === "results" && results && !results.error && (
        <div className="fade-in">
          {/* Header */}
          <div style={{ padding: "20px 32px", borderBottom: "1px solid #EAE4D9", background: "#FFF", position: "sticky", top: 0, zIndex: 100, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div style={{ minWidth: 0, marginRight: 24 }}>
              <div className="mono" style={{ fontSize: 10, color: "#C4A882", marginBottom: 4 }}>YOUR RENOVATION PACKAGE</div>
              <div className="serif" style={{ fontSize: 20, fontWeight: 400 }}>{results.designConcept?.projectTitle || "Your Design Concept"}</div>
            </div>
            <div style={{ display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                <a href="/" style={{ fontSize: 13, color: "#666", textDecoration: "none", fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em" }}>HOME</a>
                <a href="/projects" style={{ fontSize: 13, color: "#666", textDecoration: "none", fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em" }}>MY PROJECTS</a>
              </div>
              <div className="serif" style={{ fontSize: 18, color: "#C4A882", fontWeight: 600 }}>
                AED {(results.costBreakdown?.total || 0).toLocaleString()}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button className="btn-ghost" onClick={startNewProject}>New project</button>
                <button className="btn-primary" onClick={() => window.open("/pdf", "_blank")} style={{ padding: "10px 20px", fontSize: 13 }}>Download PDF</button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ borderBottom: "1px solid #EAE4D9", background: "#FFF", padding: "0 32px", display: "flex", gap: 4, overflowX: "auto" }}>
            {getTabsForUserType(savedUserType).map(t => (
              <button key={t.id} className={`tab ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>

          <div id="results-container" style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>

            {/* CONCEPT TAB */}
            {activeTab === "concept" && (
              <div className="fade-in">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  {/* Style profile */}
                  <div className="card">
                    <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.15em", marginBottom: 16 }}>STYLE PROFILE</div>
                    <div className="serif" style={{ fontSize: 22, fontWeight: 400, marginBottom: 8 }}>{results.styleProfile?.dominantStyle}</div>
                    <p style={{ fontSize: 13, color: "#666", lineHeight: 1.8, fontWeight: 300, marginBottom: 16 }}>{results.styleProfile?.designDirection}</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                      {results.styleProfile?.moodKeywords?.map((kw, i) => (
                        <span key={i} className="tag">{kw}</span>
                      ))}
                    </div>
                    {/* Color palette */}
                    <div className="mono" style={{ fontSize: 10, color: "#AAA", marginBottom: 10 }}>COLOUR PALETTE</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {results.styleProfile?.colorPalette?.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div className="color-swatch" style={{ background: c.hex }} title={c.name} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500 }}>{c.name}</div>
                            <div className="mono" style={{ fontSize: 10, color: "#AAA" }}>{c.usage}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Design concept */}
                  <div className="card">
                    <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.15em", marginBottom: 16 }}>DESIGN CONCEPT</div>
                    <p style={{ fontSize: 15, color: "#444", lineHeight: 1.8, fontWeight: 300, marginBottom: 16 }}>{results.designConcept?.description}</p>
                    <div style={{ background: "#FAF8F5", border: "1px solid #EAE4D9", borderRadius: 4, padding: 16 }}>
                      <div className="mono" style={{ fontSize: 10, color: "#AAA", marginBottom: 8 }}>BEFORE → AFTER</div>
                      <p style={{ fontSize: 13, color: "#666", lineHeight: 1.7, fontStyle: "italic", fontWeight: 300 }}>
                        &ldquo;{results.designConcept?.beforeAfterNarrative}&rdquo;
                      </p>
                    </div>
                  </div>
                </div>

                {/* Space analysis */}
                {results.spaceAnalysis && (
                  <div className="card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.15em" }}>SPACE ANALYSIS</div>
                      <div className="tag">~{results.spaceAnalysis.estimatedArea}</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                      {results.spaceAnalysis.rooms?.map((room, i) => (
                        <div key={i} style={{ padding: "14px", background: "#FAF8F5", borderRadius: 4, border: "1px solid #EAE4D9" }}>
                          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{room.room}</div>
                          <div style={{ fontSize: 12, color: "#888", marginBottom: 6, fontWeight: 300 }}>{room.observation}</div>
                          <div style={{ fontSize: 12, color: "#C4A882", fontWeight: 400 }}>→ {room.opportunity}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cost summary */}
                {results.costBreakdown && (
                  <div className="card" style={{ marginTop: 16 }}>
                    <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.15em", marginBottom: 16 }}>COST SUMMARY</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
                      {(
                        [
                          ["Materials", results.costBreakdown.materials],
                          ["Furniture", results.costBreakdown.furniture],
                          ["Labour", results.costBreakdown.labour],
                          ["Contingency", results.costBreakdown.contingency],
                        ] as [string, number][]
                      ).map(([label, val]) => (
                        <div key={label}>
                          <div className="mono" style={{ fontSize: 10, color: "#AAA", marginBottom: 4 }}>{label.toUpperCase()}</div>
                          <div className="serif" style={{ fontSize: 18, fontWeight: 400 }}>AED {(val || 0).toLocaleString()}</div>
                          <div className="cost-bar">
                            <div className="cost-fill" style={{ width: `${Math.min(100, ((val || 0) / totalCost) * 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderTop: "2px solid #1A1A1A", paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span className="mono" style={{ fontSize: 12, letterSpacing: "0.1em" }}>TOTAL ESTIMATE</span>
                      <span className="serif" style={{ fontSize: 28, fontWeight: 600, color: "#C4A882" }}>AED {totalCost.toLocaleString()}</span>
                    </div>
                  </div>
                )}

                {/* Scope of work */}
                {(savedUserType === "minor_reno" || savedUserType === "styling" || savedUserType === "full_reno") && results?.scope?.workItems && results.scope.workItems.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em" }}>SCOPE OF WORK</div>
                      <div className="mono" style={{ fontSize: 10, color: "#AAA" }}>
                        {results.scope.workItems.reduce((acc, cat) => acc + (cat.items?.length || 0), 0)} tasks
                      </div>
                    </div>

                    {/* Work items — timeline style */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {results.scope.workItems.map((cat, i) => {
                        const colors = ["#C4A882", "#7EB8C9", "#A9C97E", "#C97E7E", "#9B7EC4"];
                        const color = colors[i % colors.length];
                        return (
                          <div key={i} style={{
                            background: "#FFF",
                            border: "1px solid #EAE4D9",
                            borderRadius: 4,
                            overflow: "hidden"
                          }}>
                            {/* Category header */}
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "12px 20px",
                              borderBottom: "1px solid #EAE4D9",
                              background: "#FAF8F5"
                            }}>
                              <div style={{
                                width: 32, height: 32,
                                borderRadius: "50%",
                                background: color + "22",
                                border: `1.5px solid ${color}`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                flexShrink: 0
                              }}>
                                <span className="mono" style={{ fontSize: 11, color: color, fontWeight: 500 }}>{i + 1}</span>
                              </div>
                              <span className="serif" style={{ fontSize: 16, fontWeight: 400, color: "#1A1A1A" }}>{cat.category}</span>
                            </div>
                            {/* Tasks */}
                            <div style={{ padding: "8px 0" }}>
                              {cat.items?.map((item, j) => (
                                <div key={j} style={{
                                  display: "flex",
                                  gap: 14,
                                  padding: "10px 20px",
                                  borderBottom: j < cat.items.length - 1 ? "1px solid #F5F2EE" : "none",
                                  alignItems: "flex-start"
                                }}>
                                  <div style={{
                                    width: 20, height: 20,
                                    borderRadius: "50%",
                                    background: color + "18",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    flexShrink: 0, marginTop: 1
                                  }}>
                                    <span style={{ color: color, fontSize: 11 }}>✓</span>
                                  </div>
                                  <span style={{ fontSize: 13, color: "#444", fontWeight: 300, lineHeight: 1.7 }}>{item}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary */}
                    {results?.scope?.summary && (
                      <div style={{
                        marginTop: 12,
                        background: "#1A1A1A",
                        borderRadius: 4,
                        padding: "14px 20px",
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start"
                      }}>
                        <span className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.1em", flexShrink: 0, marginTop: 2 }}>SUMMARY</span>
                        <span style={{ fontSize: 13, color: "#D0C8B8", fontWeight: 300, lineHeight: 1.7 }}>{results.scope.summary}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* MATERIALS TAB */}
            {activeTab === "materials" && (
              <div className="fade-in">
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ padding: "18px 20px", borderBottom: "1px solid #EAE4D9", display: "flex", justifyContent: "space-between" }}>
                    <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.15em" }}>MATERIALS & SPECIFICATIONS</div>
                    <div style={{ fontSize: 12, color: "#AAA" }}>Dubai market pricing</div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#FAF8F5" }}>
                        {["Zone", "Item", "Specification", "Supplier", "Price Range", "Total"].map(h => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontFamily: "'DM Mono', monospace", color: "#AAA", fontWeight: 400, letterSpacing: "0.08em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.materials?.map((m, i) => (
                        <tr key={i} className="material-row">
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              <img
                                src={getMaterialImage(m.item, m.specification)}
                                alt={m.item}
                                style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                              />
                              <span className="tag">{m.zone}</span>
                            </div>
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 500 }}>{m.item}</td>
                          <td style={{ padding: "12px 16px", fontSize: 12, color: "#666", fontWeight: 300, maxWidth: 180 }}>{m.specification}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{m.supplier}</div>
                            <div style={{ fontSize: 11, color: "#AAA", marginBottom: 6 }}>{m.supplierArea}</div>
                            <a
                              href={`https://www.google.com/search?q=${encodeURIComponent(m.supplier + ' Dubai ' + m.item)}&tbm=isch`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ fontSize: 11, color: "#C4A882", textDecoration: "none", display: "block" }}
                            >
                              See product photos →
                            </a>
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 12, color: "#888", fontFamily: "monospace" }}>{m.priceRange}</td>
                          <td style={{ padding: "12px 16px", fontSize: 14, fontWeight: 600, color: "#C4A882", fontFamily: "monospace" }}>{m.totalCost}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#FAF8F5", borderTop: "2px solid #EAE4D9" }}>
                        <td colSpan={5} style={{ padding: "14px 16px", fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#C4A882", letterSpacing: "0.1em" }}>TOTAL MATERIALS</td>
                        <td style={{ padding: "14px 16px", fontSize: 18, fontWeight: 600, color: "#C4A882", fontFamily: "monospace" }}>
                          AED {(results.costBreakdown?.materials || 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* FURNITURE TAB */}
            {activeTab === "furniture" && (
              <div className="fade-in">
                {/* Budget filter */}
                <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
                  {[
                    { id: "all", label: "All" },
                    { id: "budget", label: "Under AED 500" },
                    { id: "mid", label: "AED 500–2,000" },
                    { id: "premium", label: "AED 2,000+" },
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setFurnitureBudget(f.id as "all" | "budget" | "mid" | "premium")}
                      style={{
                        padding: "8px 18px",
                        background: furnitureBudget === f.id ? "#1A1A1A" : "#FFF",
                        color: furnitureBudget === f.id ? "#F7F4EF" : "#666",
                        border: "1px solid #EAE4D9",
                        borderRadius: 20,
                        fontSize: 12,
                        fontFamily: "'DM Sans', sans-serif",
                        cursor: "pointer",
                        transition: "all 0.2s",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Total furniture cost */}
                <div style={{ background: "#FAF8F5", border: "1px solid #EAE4D9", borderRadius: 4, padding: "14px 20px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 10, color: "#AAA", letterSpacing: "0.1em" }}>TOTAL FURNITURE ESTIMATE</span>
                  <span className="serif" style={{ fontSize: 20, color: "#C4A882", fontWeight: 600 }}>
                    AED {(results?.furniture?.reduce((sum, item) => sum + ((item.quantity || 1) * (item.priceAED || 0)), 0) || 0).toLocaleString()}
                  </span>
                </div>

                {/* Furniture items */}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {results.furniture
                    ?.filter((item) => {
                      if (furnitureBudget === "all") return true;
                      if (furnitureBudget === "budget") return (item.priceAED || 0) < 500;
                      if (furnitureBudget === "mid") return (item.priceAED || 0) >= 500 && (item.priceAED || 0) <= 2000;
                      if (furnitureBudget === "premium") return (item.priceAED || 0) > 2000;
                      return true;
                    })
                    ?.map((item, i) => (
                      <div key={i} className="card" style={{ padding: 20 }}>
                        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 12 }}>
                          <img
                            src={getFurnitureImage(item.item)}
                            alt={item.item}
                            style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>{item.item}</div>
                            <div style={{ fontSize: 13, color: "#888", fontWeight: 300 }}>{item.brand} — {item.model}</div>
                            <div style={{ fontSize: 12, color: "#AAA", marginTop: 4 }}>
                              Qty: {item.quantity || 1} × AED {(item.priceAED || 0).toLocaleString()} =
                              <span style={{ color: "#C4A882", fontWeight: 600 }}> AED {((item.quantity || 1) * (item.priceAED || 0)).toLocaleString()}</span>
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div className="serif" style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A" }}>
                              AED {(item.priceAED || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: 11, color: "#AAA" }}>per unit</div>
                            <div style={{ fontSize: 13, color: "#C4A882", fontWeight: 600, marginTop: 4 }}>
                              × {item.quantity || 1} = AED {((item.quantity || 1) * (item.priceAED || 0)).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        {/* Buy buttons */}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                          {item.buyLink && item.buyLink.startsWith("http") && (
                            <a
                              href={item.buyLink}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                padding: "8px 16px",
                                background: "#1A1A1A", color: "#F7F4EF",
                                textDecoration: "none", fontSize: 12,
                                fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                                borderRadius: 2,
                              }}
                            >
                              Buy now →
                            </a>
                          )}
                          {/* Search links */}
                          <a
                            href={`https://www.noon.com/uae-en/search/?q=${encodeURIComponent(item.item)}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              padding: "8px 16px",
                              background: "#FFF", color: "#666",
                              border: "1px solid #EAE4D9",
                              textDecoration: "none", fontSize: 12,
                              fontFamily: "'DM Sans', sans-serif",
                              borderRadius: 2,
                            }}
                          >
                            Search Noon
                          </a>
                          <a
                            href={`https://www.amazon.ae/s?k=${encodeURIComponent(item.item)}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              padding: "8px 16px",
                              background: "#FFF", color: "#666",
                              border: "1px solid #EAE4D9",
                              textDecoration: "none", fontSize: 12,
                              fontFamily: "'DM Sans', sans-serif",
                              borderRadius: 2,
                            }}
                          >
                            Search Amazon AE
                          </a>
                          <a
                            href={`https://www.ikea.com/ae/en/search/?q=${encodeURIComponent(item.item)}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              padding: "8px 16px",
                              background: "#FFF", color: "#0058A3",
                              border: "1px solid #0058A333",
                              textDecoration: "none", fontSize: 12,
                              fontFamily: "'DM Sans', sans-serif",
                              borderRadius: 2,
                            }}
                          >
                            Search IKEA UAE
                          </a>
                          <a
                            href={`https://www.google.com/search?q=${encodeURIComponent(item.brand + " " + item.model + " UAE")}&tbm=isch`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              padding: "8px 16px",
                              background: "#FFF",
                              border: "1px solid #EAE4D9",
                              borderRadius: 2,
                              fontSize: 12,
                              color: "#444",
                              textDecoration: "none",
                              fontFamily: "'DM Sans', sans-serif",
                            }}
                          >
                            See photos →
                          </a>
                        </div>

                        {/* Budget alternative */}
                        {item.alternative && (
                          <div style={{ background: "#FAF8F5", border: "1px solid #EAE4D9", borderRadius: 4, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div className="mono" style={{ fontSize: 10, color: "#C4A882", marginBottom: 4 }}>BUDGET ALTERNATIVE</div>
                              <div style={{ fontSize: 13, fontWeight: 400 }}>{item.alternative}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 15, fontWeight: 600, color: "#888" }}>AED {(item.altPriceAED || 0).toLocaleString()}</div>
                              <a
                                href={`https://www.noon.com/uae-en/search/?q=${encodeURIComponent(item.alternative)}`}
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: 11, color: "#C4A882", textDecoration: "none" }}
                              >
                                Search →
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>

                {/* Shopping checklist summary */}
                <div style={{ marginTop: 24, background: "#1A1A1A", borderRadius: 4, padding: 24 }}>
                  <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.15em", marginBottom: 16 }}>SHOPPING CHECKLIST</div>
                  {results.furniture?.map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #2A2A2A" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <input type="checkbox" style={{ accentColor: "#C4A882", width: 14, height: 14 }} />
                        <span style={{ fontSize: 13, color: "#D0C8B8", fontWeight: 300 }}>{item.item} {(item.quantity || 1) > 1 ? `(×${item.quantity})` : ""}</span>
                      </div>
                      <span className="mono" style={{ fontSize: 12, color: "#C4A882" }}>AED {((item.quantity || 1) * (item.priceAED || 0)).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ACCESSORIES TAB */}
            {activeTab === "accessories" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em", marginBottom: 8 }}>
                  ACCESSORIES & FINISHING TOUCHES
                </div>
                {results?.furniture && results.furniture.length > 0 ? (
                  results.furniture.map((item, i) => (
                    <div key={i} className="card" style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: 20 }}>
                      <img
                        src={getFurnitureImage(item.item)}
                        alt={item.item}
                        style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 4, flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{item.item}</div>
                        <div style={{ fontSize: 13, color: "#888", fontWeight: 300, marginBottom: 8 }}>{item.brand} — {item.model}</div>
                        <div style={{ fontSize: 12, color: "#AAA", marginBottom: 10 }}>Qty: {item.quantity || 1} × AED {(item.priceAED || 0).toLocaleString()} = <span style={{ color: "#C4A882", fontWeight: 600 }}>AED {((item.quantity || 1) * (item.priceAED || 0)).toLocaleString()}</span></div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {item.buyLink && item.buyLink.startsWith("http") && (
                            <a href={item.buyLink} target="_blank" rel="noreferrer" style={{ padding: "6px 14px", background: "#1A1A1A", color: "#F7F4EF", textDecoration: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", borderRadius: 2 }}>
                              Buy now →
                            </a>
                          )}
                          <a href={`https://www.noon.com/uae-en/search/?q=${encodeURIComponent(item.item)}`} target="_blank" rel="noreferrer" style={{ padding: "6px 14px", background: "#FFF", border: "1px solid #EAE4D9", color: "#666", textDecoration: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", borderRadius: 2 }}>
                            Noon
                          </a>
                          <a href={`https://www.amazon.ae/s?k=${encodeURIComponent(item.item)}`} target="_blank" rel="noreferrer" style={{ padding: "6px 14px", background: "#FFF", border: "1px solid #EAE4D9", color: "#666", textDecoration: "none", fontSize: 12, fontFamily: "'DM Sans', sans-serif", borderRadius: 2 }}>
                            Amazon AE
                          </a>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div className="serif" style={{ fontSize: 18, fontWeight: 600 }}>AED {(item.priceAED || 0).toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: "#AAA" }}>per unit</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "#AAA" }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🛒</div>
                    <div>No accessories recommended for this project</div>
                  </div>
                )}
              </div>
            )}

            {/* ROOM BY ROOM TAB */}
            {activeTab === "roombyroom" && (
              <div className="fade-in">
                <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em", marginBottom: 20 }}>
                  ROOM BY ROOM BREAKDOWN
                </div>
                {results?.spaceAnalysis?.rooms && results.spaceAnalysis.rooms.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {results.spaceAnalysis.rooms.map((room, i) => (
                      <div key={i} className="card">
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                          <div className="serif" style={{ fontSize: 20, fontWeight: 400 }}>{room.room}</div>
                          <span style={{ background: "#C4A88222", color: "#C4A882", fontSize: 11, padding: "4px 12px", borderRadius: 20, fontFamily: "monospace" }}>
                            {room.observation}
                          </span>
                        </div>
                        <div style={{ fontSize: 14, color: "#C4A882", marginBottom: 12, fontStyle: "italic" }}>
                          → {room.opportunity}
                        </div>
                        {results?.materials
                          ?.filter((m) => m.zone?.toLowerCase().includes(room.room?.toLowerCase().split(" ")[0]?.toLowerCase()))
                          .map((m, j) => (
                            <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EAE4D9", fontSize: 13 }}>
                              <span style={{ color: "#666" }}>{m.item}</span>
                              <span style={{ color: "#C4A882", fontWeight: 500 }}>{m.totalCost}</span>
                            </div>
                          ))}
                        <div style={{ marginTop: 12 }}>
                          <a
                            href={`https://www.noon.com/uae-en/search/?q=${encodeURIComponent(room.room + " furniture Dubai")}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 12, color: "#C4A882", textDecoration: "none" }}
                          >
                            Shop {room.room} furniture on Noon →
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "#AAA" }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🏠</div>
                    <div>Run analysis to see room by room breakdown</div>
                  </div>
                )}
              </div>
            )}

            {/* CONTRACTORS TAB */}
            {activeTab === "contractors" && (
              <div className="fade-in">
                <div style={{ marginBottom: 24 }}>
                  <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em", marginBottom: 8 }}>AGENT 4 — CONTRACTOR MATCHING</div>
                  <h3 className="serif" style={{ fontSize: 24, fontWeight: 400, marginBottom: 8 }}>Find Your Contractor</h3>
                  <p style={{ fontSize: 14, color: "#888", fontWeight: 300, lineHeight: 1.7 }}>
                    Based on your project scope, here are the contractor types you need and what to look for in Dubai.
                  </p>
                </div>

                {/* Contractor types needed */}
                <ContractorSection results={results} prompt={prompt} category={getCategoryLabel()} user={user} budget={budget} />
              </div>
            )}

            {/* SUPPLIERS TAB */}
            {activeTab === "suppliers" && (
              <div className="fade-in" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {results.supplierMap?.map((s, i) => (
                  <div key={i} className="card">
                    <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{s.name}</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <span className="tag">{s.category}</span>
                      <span className="tag">{s.area}</span>
                    </div>
                    {s.website && s.website.startsWith("http") ? (
                      <a href={s.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#C4A882", textDecoration: "none" }}>Visit website →</a>
                    ) : (
                      <div style={{ fontSize: 12, color: "#AAA" }}>{s.website}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* TIMELINE TAB */}
            {activeTab === "timeline" && (
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {results.timeline?.map((phase, i) => (
                  <div key={i} className="card" style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 80 }}>
                      <div className="serif" style={{ fontSize: 16, fontWeight: 600, color: "#C4A882" }}>{phase.week}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {phase.tasks?.map((task, j) => (
                          <span key={j} style={{ fontSize: 13, color: "#444", background: "#FAF8F5", border: "1px solid #EAE4D9", padding: "6px 12px", borderRadius: 4 }}>{task}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                {results.nextSteps && (
                  <div className="card" style={{ marginTop: 8, background: "#1A1A1A", border: "none" }}>
                    <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.15em", marginBottom: 12 }}>YOUR NEXT STEPS</div>
                    {results.nextSteps.map((step, i) => (
                      <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #333", alignItems: "center" }}>
                        <div className="mono" style={{ fontSize: 11, color: "#C4A882", minWidth: 24 }}>0{i + 1}</div>
                        <div style={{ fontSize: 14, color: "#E8E0D0", fontWeight: 300 }}>{step}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* RENDERS TAB */}
            {activeTab === "renders" && (
              <div className="fade-in">

                {/* Step indicator */}
                <div style={{ display: "flex", gap: 0, marginBottom: 24, background: "#FAF8F5", borderRadius: 4, padding: 4 }}>
                  {[
                    { id: "references", label: "1. Style References" },
                    { id: "products", label: isMinorRenovation ? "2. Materials & Finishes" : "2. Real Products" },
                    { id: "render", label: "3. AI Render" },
                  ].map((step) => (
                    <button
                      key={step.id}
                      onClick={() => setRenderStep(step.id as "references" | "products" | "render")}
                      style={{
                        flex: 1, padding: "10px 8px",
                        background: renderStep === step.id ? "#1A1A1A" : "transparent",
                        color: renderStep === step.id ? "#F7F4EF" : "#888",
                        border: "none", borderRadius: 4, cursor: "pointer",
                        fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                        fontWeight: renderStep === step.id ? 500 : 300,
                        transition: "all 0.2s",
                      }}
                    >
                      {step.label}
                    </button>
                  ))}
                </div>

                {/* Step 1: References */}
                {renderStep === "references" && (
                  <div>
                    <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.15em", marginBottom: 16 }}>
                      YOUR STYLE REFERENCES
                    </div>

                    {savedReferencePhotos.length > 0 ? (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                          {savedReferencePhotos.map((photo, i) => (
                            <div key={i} style={{ position: "relative", borderRadius: 4, overflow: "hidden", aspectRatio: "1" }}>
                              <img
                                src={URL.createObjectURL(photo)}
                                alt={`Reference ${i + 1}`}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, #00000066)", padding: "12px 8px 6px" }}>
                                <span style={{ fontSize: 10, color: "#FFF", fontFamily: "monospace" }}>REF {i + 1}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Items to change — drives which product/material categories appear */}
                        {isMinorRenovation ? (
                          <div style={{ marginBottom: 20 }}>
                            <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.1em", marginBottom: 10 }}>
                              SELECTED RENOVATION CHANGES
                            </div>
                            {selectedRenovationActions.length > 0 ? (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {selectedRenovationActions.map(a => (
                                  <span key={a.id} style={{ fontSize: 12, background: "#F0EBE2", color: "#7A6A55", padding: "5px 12px", borderRadius: 20 }}>{a.label}</span>
                                ))}
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: "#AAA" }}>
                                Select renovation changes from the project setup first.
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ marginBottom: 20 }}>
                            <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.1em", marginBottom: 10 }}>
                              WHAT DO YOU WANT TO CHANGE?
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {CHANGE_OPTIONS.filter(o => (CHANGE_OPTION_TO_CATEGORIES[o.id] || []).length > 0).map(opt => (
                                <button
                                  key={opt.id}
                                  onClick={() => setWhatToChange(prev => prev.includes(opt.id) ? prev.filter(x => x !== opt.id) : [...prev, opt.id])}
                                  style={{
                                    padding: "8px 14px",
                                    background: whatToChange.includes(opt.id) ? "#1A1A1A" : "#FFF",
                                    color: whatToChange.includes(opt.id) ? "#F7F4EF" : "#666",
                                    border: `1px solid ${whatToChange.includes(opt.id) ? "#1A1A1A" : "#EAE4D9"}`,
                                    borderRadius: 20, cursor: "pointer",
                                    fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                                  }}
                                >
                                  {opt.icon} {opt.label}
                                </button>
                              ))}
                            </div>
                            {selectedChangeItems.length > 0 && (
                              <div style={{ fontSize: 12, color: "#AAA", marginTop: 8 }}>
                                Products will be shown for: {selectedChangeItems.map(c => c.label).join(", ")}
                              </div>
                            )}
                          </div>
                        )}

                        {(() => {
                          const ready = isMinorRenovation ? selectedRenovationActions.length > 0 : selectedChangeItems.length > 0;
                          return (
                            <button
                              onClick={extractProductsFromReferences}
                              disabled={extractingProducts || !ready}
                              style={{
                                width: "100%", padding: "14px 0",
                                background: !ready ? "#EEE" : "#1A1A1A",
                                color: !ready ? "#AAA" : "#F7F4EF",
                                border: "none", borderRadius: 4,
                                cursor: extractingProducts || !ready ? "not-allowed" : "pointer",
                                fontSize: 14, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                              }}
                            >
                              {extractingProducts
                                ? (isMinorRenovation ? "Finding materials for your renovation..." : "Finding products for your selected changes...")
                                : !ready
                                  ? (isMinorRenovation ? "Select renovation changes from setup first" : "Select what you want to change first")
                                  : (isMinorRenovation ? "Find materials & finishes →" : "Find products for my selected changes →")}
                            </button>
                          );
                        })()}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "40px 0" }}>
                        <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
                        <div className="serif" style={{ fontSize: 20, marginBottom: 8 }}>No style references added</div>
                        <p style={{ fontSize: 13, color: "#888", marginBottom: 20, fontWeight: 300 }}>
                          You can still generate a render based on your AI analysis, or go back and add reference photos.
                        </p>
                        <button
                          onClick={() => setRenderStep("render")}
                          style={{
                            padding: "12px 28px",
                            background: "#FFF", color: "#1A1A1A",
                            border: "1px solid #1A1A1A", borderRadius: 4, cursor: "pointer",
                            fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          Skip — generate render from analysis →
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: Real Products */}
                {renderStep === "products" && (
                  <div>
                    <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.15em", marginBottom: 16 }}>
                      {isMinorRenovation ? "MATERIALS FOR YOUR SELECTED RENOVATION CHANGES" : "PRODUCTS FOR YOUR SELECTED CHANGES"}
                    </div>

                    {(isMinorRenovation ? selectedRenovationActions.length > 0 : selectedChangeItems.length > 0) && (
                      <div style={{ marginBottom: 16, padding: "10px 14px", background: "#FAF8F5", border: "1px solid #EAE4D9", borderRadius: 4 }}>
                        <div className="mono" style={{ fontSize: 9, color: "#C4A882", letterSpacing: "0.1em", marginBottom: 6 }}>SELECTED CHANGES</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(isMinorRenovation ? selectedRenovationActions.map(a => a.label) : selectedChangeItems.map(c => c.label)).map((label, i) => (
                            <span key={i} style={{ fontSize: 12, background: "#F0EBE2", color: "#7A6A55", padding: "4px 10px", borderRadius: 20 }}>{label}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {extractedProducts.length > 0 ? (
                      <div>
                        <p style={{ fontSize: 13, color: "#888", marginBottom: 16, fontWeight: 300 }}>
                          {isMinorRenovation
                            ? "Choose the finishes you want to preview. These will be applied to the selected surfaces in your render."
                            : "Select which products to include in your render. These will be placed in your room."}
                        </p>
                        <div style={{ marginBottom: 20 }}>
                          {extractedProducts.map((product, i) => (
                            <div key={i} style={{ marginBottom: 20 }}>
                              <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.1em", marginBottom: 10 }}>
                                {(product.itemName || product.category)?.toUpperCase()} — {product.options?.length ? "CHOOSE ONE" : ""}
                              </div>
                              {(!product.options || product.options.length === 0) && (
                                <div style={{ fontSize: 12, color: "#AAA", padding: "10px 0" }}>
                                  No curated products available yet for this category.
                                </div>
                              )}
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                                {product.options?.map((opt, j) => {
                                  const optionKey = `${product.itemName}__${opt.name}`;
                                  const isSelected = selectedProducts.includes(optionKey);
                                  // Curated catalog image is the source of truth; if missing
                                  // or invalid, show a clearly-labelled category reference image
                                  const hasCatalogImage = isValidProductImageUrl({
                                    imageUrl: opt.imageUrl,
                                    productName: opt.name,
                                    category: product.category,
                                    brand: opt.brand,
                                  });
                                  const imageSrc = hasCatalogImage
                                    ? opt.imageUrl!
                                    : getFurnitureImage(product.category || product.itemName);
                                  return (
                                    <div
                                      key={j}
                                      onClick={() => {
                                        const categoryPrefix = `${product.itemName}__`;
                                        setSelectedProducts(prev => {
                                          const withoutCategory = prev.filter(p => !p.startsWith(categoryPrefix));
                                          return isSelected ? withoutCategory : [...withoutCategory, optionKey];
                                        });
                                      }}
                                      style={{
                                        padding: 12, borderRadius: 4, cursor: "pointer",
                                        border: `1px solid ${isSelected ? "#C4A882" : "#EAE4D9"}`,
                                        background: isSelected ? "#FBF8F4" : "#FFF",
                                        transition: "all 0.2s",
                                      }}
                                    >
                                      <div style={{ marginBottom: 8 }}>
                                        {isMinorRenovation ? (
                                          // Material finish swatch — never a generic room photo
                                          <div style={{ height: 90 }}>
                                            <MaterialSwatch item={{ category: product.category, name: opt.name, colorTags: [] }} size="large" />
                                          </div>
                                        ) : (
                                          <div style={{ position: "relative" }}>
                                            <img
                                              src={imageSrc}
                                              alt={opt.name}
                                              onError={(e) => {
                                                e.currentTarget.src = getFurnitureImage(product.category || product.itemName);
                                              }}
                                              style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 4, display: "block", background: "#F7F3EC" }}
                                            />
                                            {!hasCatalogImage && (
                                              <span style={{ position: "absolute", bottom: 4, left: 4, fontSize: 8, fontFamily: "monospace", letterSpacing: "0.05em", color: "#FFF", background: "rgba(0,0,0,0.45)", padding: "2px 6px", borderRadius: 3 }}>
                                                REFERENCE IMAGE
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{opt.name}</div>
                                      <div style={{ fontSize: 11, color: "#888" }}>{opt.brand}</div>
                                      <div style={{ fontSize: 12, color: "#C4A882", fontWeight: 600, marginTop: 4 }}>
                                        {opt.price === "Price unavailable" ? "Price unavailable" : `AED ${opt.price}`}{isMinorRenovation && opt.unit ? ` / ${opt.unit.replace("per ", "")}` : ""}
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                                        <span style={{ fontSize: 9, fontFamily: "monospace", color: "#AAA", textTransform: "uppercase" }}>{opt.tier}</span>
                                        {isValidProductUrl(opt.productUrl) && (
                                          <a
                                            href={opt.productUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            style={{ fontSize: 10, color: "#C4A882", textDecoration: "none" }}
                                          >
                                            View product →
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={() => setRenderStep("render")}
                          disabled={selectedProducts.length === 0}
                          style={{
                            width: "100%", padding: "14px 0",
                            background: selectedProducts.length > 0 ? "#1A1A1A" : "#EEE",
                            color: selectedProducts.length > 0 ? "#F7F4EF" : "#AAA",
                            border: "none", borderRadius: 4, cursor: selectedProducts.length > 0 ? "pointer" : "not-allowed",
                            fontSize: 14, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
                          }}
                        >
                          {isMinorRenovation
                            ? `Apply finishes to render →`
                            : `Apply ${selectedProducts.length} product${selectedProducts.length !== 1 ? "s" : ""} to render →`}
                        </button>
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: "40px 0", color: "#AAA" }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                        <div>Analysing references and finding products...</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Render */}
                {renderStep === "render" && (
                  <div>
                    {/* Render mode toggle — hidden for minor renovation (surfaces only) */}
                    {!isMinorRenovation && (
                    <div style={{ marginBottom: 20 }}>
                      <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.1em", marginBottom: 10 }}>
                        RENDER MODE
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {([
                          { id: "restyle" as const, label: "🎨 Restyle Room", hint: "Creative full-room restyle" },
                          { id: "strict_replace" as const, label: "🎯 Replace Item Precisely", hint: "Only the selected object changes" },
                        ]).map(mode => (
                          <button
                            key={mode.id}
                            onClick={() => { setRenderMode(mode.id); setStrictValidationMsg(null); }}
                            style={{
                              flex: 1, padding: "12px 14px", textAlign: "left",
                              background: renderMode === mode.id ? "#1A1A1A" : "#FFF",
                              color: renderMode === mode.id ? "#F7F4EF" : "#666",
                              border: `1px solid ${renderMode === mode.id ? "#1A1A1A" : "#EAE4D9"}`,
                              borderRadius: 4, cursor: "pointer",
                              fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                              transition: "all 0.2s",
                            }}
                          >
                            <div style={{ fontWeight: 500 }}>{mode.label}</div>
                            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{mode.hint}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    )}

                    {/* What to change (restyle, furniture projects only) */}
                    {renderMode === "restyle" && !isMinorRenovation && (
                    <div style={{ marginBottom: 20 }}>
                      <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.1em", marginBottom: 10 }}>
                        WHAT DO YOU WANT TO CHANGE?
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {CHANGE_OPTIONS.map(opt => (
                          <button
                            key={opt.id}
                            onClick={() => setWhatToChange(prev =>
                              prev.includes(opt.id) ? prev.filter(x => x !== opt.id) : [...prev, opt.id]
                            )}
                            style={{
                              padding: "8px 14px",
                              background: whatToChange.includes(opt.id) ? "#1A1A1A" : "#FFF",
                              color: whatToChange.includes(opt.id) ? "#F7F4EF" : "#666",
                              border: `1px solid ${whatToChange.includes(opt.id) ? "#1A1A1A" : "#EAE4D9"}`,
                              borderRadius: 20, cursor: "pointer",
                              fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                              transition: "all 0.2s",
                            }}
                          >
                            {opt.icon} {opt.label}
                          </button>
                        ))}
                      </div>
                      {whatToChange.length > 0 && (
                        <div style={{ fontSize: 12, color: "#AAA", marginTop: 8 }}>
                          {whatToChange.length} item{whatToChange.length > 1 ? "s" : ""} selected — only these will change in the render
                        </div>
                      )}
                    </div>
                    )}

                    {/* Room photos strip */}
                    {savedRoomPhotos.length > 0 ? (
                      <div style={{ marginBottom: 20 }}>
                        <div className="mono" style={{ fontSize: 10, color: "#AAA", letterSpacing: "0.1em", marginBottom: 10 }}>
                          SELECT PHOTO TO RENDER — {savedRoomPhotos.length} available
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {savedRoomPhotos.map((photo, i) => (
                            <div key={i} style={{ position: "relative", cursor: "pointer" }} onClick={() => { setSelectedRenderPhoto(i); setStrictImageUrl(null); clearObjectSelection(); }}>
                              <img
                                src={URL.createObjectURL(photo)}
                                alt={`Room ${i + 1}`}
                                style={{
                                  width: 80, height: 80, objectFit: "cover", borderRadius: 4,
                                  border: selectedRenderPhoto === i ? "2px solid #C4A882" : "2px solid #EAE4D9",
                                }}
                              />
                              {selectedRenderPhoto === i && (
                                <div style={{ position: "absolute", top: 4, right: 4, background: "#C4A882", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <span style={{ color: "#FFF", fontSize: 9 }}>✓</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
                          No photos found for this project.
                        </div>
                        <div
                          className="upload-zone"
                          onClick={() => renderPhotoRef.current?.click()}
                          style={{ padding: "16px", textAlign: "center", cursor: "pointer" }}
                        >
                          <input
                            ref={renderPhotoRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setSavedRoomPhotos([file]);
                                setSelectedRenderPhoto(0);
                                setStrictImageUrl(null);
                                clearObjectSelection();
                              }
                            }}
                            style={{ display: "none" }}
                          />
                          <div style={{ fontSize: 13, color: "#AAA" }}>Upload a room photo to generate render</div>
                        </div>
                      </div>
                    )}

                    {/* Strict mode: multi-object click-to-select */}
                    {renderMode === "strict_replace" && savedRoomPhotos.length > 0 && (
                      <div style={{ marginBottom: 20 }}>
                        <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.1em", marginBottom: 10 }}>
                          TAP EACH ITEM YOU WANT TO REPLACE
                        </div>
                        <div style={{ position: "relative", borderRadius: 4, overflow: "hidden", border: "1px solid #EAE4D9" }}>
                          <img
                            src={URL.createObjectURL(savedRoomPhotos[selectedRenderPhoto] || savedRoomPhotos[0])}
                            alt="Tap an object to select it"
                            onClick={handleImageObjectClick}
                            style={{ width: "100%", display: "block", cursor: isSegmentingObject ? "wait" : "crosshair" }}
                          />
                          {/* Overlay every selected object's bbox; highlight the active one */}
                          {strictImageDims && selectedObjects.map(obj => {
                            const isActive = obj.id === activeSelectedObjectId;
                            return (
                              <div
                                key={obj.id}
                                style={{
                                  position: "absolute",
                                  left: `${(obj.bbox.x / strictImageDims.w) * 100}%`,
                                  top: `${(obj.bbox.y / strictImageDims.h) * 100}%`,
                                  width: `${(obj.bbox.width / strictImageDims.w) * 100}%`,
                                  height: `${(obj.bbox.height / strictImageDims.h) * 100}%`,
                                  border: `2px solid ${isActive ? "#C4A882" : "#9C8B70"}`,
                                  background: isActive ? "rgba(196, 168, 130, 0.22)" : "rgba(156, 139, 112, 0.10)",
                                  borderRadius: 2,
                                  pointerEvents: "none",
                                }}
                              >
                                <span style={{ position: "absolute", top: -1, left: -1, fontSize: 9, background: isActive ? "#C4A882" : "#9C8B70", color: "#FFF", padding: "1px 5px", borderRadius: "2px 0 4px 0" }}>
                                  {obj.label}
                                </span>
                              </div>
                            );
                          })}
                          {isSegmentingObject && (
                            <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#555" }}>
                              Detecting object...
                            </div>
                          )}
                        </div>

                        {segmentError && (
                          <div style={{ marginTop: 8, fontSize: 12, color: "#B0533C" }}>{segmentError}</div>
                        )}
                        {selectionWarning && (
                          <div style={{ marginTop: 8, fontSize: 12, color: "#8A6D3B", background: "#FCF8E3", border: "1px solid #F0E6C8", borderRadius: 4, padding: "8px 12px" }}>
                            {selectionWarning}
                          </div>
                        )}

                        {/* Selected object chips */}
                        {selectedObjects.length > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                            {selectedObjects.map(obj => {
                              const isActive = obj.id === activeSelectedObjectId;
                              const hasRepl = selectedReplacements.some(r => r.selectedObjectId === obj.id);
                              return (
                                <span
                                  key={obj.id}
                                  onClick={() => { setActiveSelectedObjectId(obj.id); setActiveSupplier(null); }}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
                                    fontSize: 12, padding: "5px 10px", borderRadius: 20,
                                    background: isActive ? "#1A1A1A" : "#FFF",
                                    color: isActive ? "#F7F4EF" : "#666",
                                    border: `1px solid ${isActive ? "#1A1A1A" : "#EAE4D9"}`,
                                  }}
                                >
                                  {hasRepl ? "✓ " : ""}{obj.label}
                                  <span
                                    onClick={(e) => { e.stopPropagation(); removeSelectedObject(obj.id); }}
                                    style={{ marginLeft: 2, opacity: 0.7 }}
                                  >×</span>
                                </span>
                              );
                            })}
                            <button
                              onClick={clearObjectSelection}
                              style={{ fontSize: 12, color: "#888", background: "none", border: "1px solid #EAE4D9", borderRadius: 20, padding: "5px 12px", cursor: "pointer" }}
                            >
                              Clear all
                            </button>
                          </div>
                        )}

                        {/* Active object: category fix, expand, replacement browsing */}
                        {activeSelectedObject && (() => {
                          const obj = activeSelectedObject;
                          const activeRepl = selectedReplacements.find(r => r.selectedObjectId === obj.id);
                          const activeCategory = normalizeFurnitureCategory(obj.category);
                          const catalogGroups = activeCategory === "unknown"
                            ? []
                            : getSupplierOptionsForObject({ selectedObjectCategory: activeCategory, catalog: UAE_FURNITURE_CATALOG });

                          // Merge live online products (real images + links) into the
                          // supplier groups for this category
                          const groupMap = new Map<string, CatalogProduct[]>();
                          for (const g of catalogGroups) groupMap.set(g.supplier, [...g.options]);
                          for (const op of (onlineByCategory[activeCategory] || [])) {
                            const asCatalog = {
                              id: op.id,
                              category: activeCategory as CatalogProduct["category"],
                              name: op.name,
                              brand: op.brand,
                              supplier: op.supplier,
                              price: op.price ?? 0,
                              currency: "AED" as const,
                              tier: (op.tier as CatalogProduct["tier"]) || "mid",
                              imageUrl: op.imageUrl,
                              productUrl: op.productUrl,
                              renderDescription: op.renderDescription,
                              styleTags: [],
                              colorTags: [],
                            };
                            const list = groupMap.get(op.supplier) || [];
                            if (!list.some(p => p.id === op.id)) list.push(asCatalog);
                            groupMap.set(op.supplier, list);
                          }
                          const groups = Array.from(groupMap.entries()).map(([supplier, options]) => ({ supplier, options }));
                          const supplier = activeSupplier && groups.some(g => g.supplier === activeSupplier)
                            ? activeSupplier
                            : groups[0]?.supplier;
                          const supplierOptions = groups.find(g => g.supplier === supplier)?.options || [];

                          return (
                            <div style={{ marginTop: 16, padding: 14, background: "#FAF8F5", border: "1px solid #EAE4D9", borderRadius: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                                <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.1em" }}>
                                  SELECT REPLACEMENT FOR: {obj.label.toUpperCase()}
                                </div>
                                <button
                                  onClick={() => expandSelection(obj.id)}
                                  disabled={isExpandingSelection}
                                  style={{ fontSize: 11, color: "#7A6A55", background: "none", border: "1px solid #C4A882", borderRadius: 20, padding: "3px 10px", cursor: isExpandingSelection ? "wait" : "pointer" }}
                                >
                                  {isExpandingSelection ? "Expanding..." : "Expand selection"}
                                </button>
                              </div>
                              {obj.category !== "unknown" && (
                                <div style={{ fontSize: 10, color: "#AAA", marginBottom: 10 }}>
                                  {onlineSearchState === "loading" ? "Finding real products online…"
                                    : onlineSearchState === "unconfigured" ? "Using curated catalog only"
                                    : (onlineByCategory[activeCategory]?.length ? "🟢 Live product search" : "Using curated catalog only")}
                                </div>
                              )}

                              {/* Unknown category — pick manually first */}
                              {obj.category === "unknown" ? (
                                <div>
                                  <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>What is this item?</div>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                    {["sofa", "coffee_table", "rug", "lighting", "chair", "dining_table", "dining_chair", "armchair", "wall_art", "decor"].map(cat => (
                                      <button
                                        key={cat}
                                        onClick={() => {
                                          updateSelectedObject(obj.id, { category: cat, label: labelForCategory(cat, selectedObjects.filter(o => o.id !== obj.id)) });
                                          if (strictImageDims && isBboxTooSmallForCategory({ bbox: obj.bbox, category: cat, imageWidth: strictImageDims.w, imageHeight: strictImageDims.h })) {
                                            expandSelection(obj.id, cat);
                                            setSelectionWarning(`Selected area looked too small for a ${cat.replace(/_/g, " ")}, so we expanded it.`);
                                          }
                                        }}
                                        style={{ padding: "6px 12px", fontSize: 12, borderRadius: 20, cursor: "pointer", background: "#FFF", color: "#666", border: "1px solid #EAE4D9" }}
                                      >
                                        {cat.replace(/_/g, " ")}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {/* Supplier tabs */}
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                                    {groups.map(g => (
                                      <button
                                        key={g.supplier}
                                        onClick={() => setActiveSupplier(g.supplier)}
                                        style={{
                                          padding: "6px 12px", fontSize: 12, borderRadius: 4, cursor: "pointer",
                                          background: g.supplier === supplier ? "#1A1A1A" : "#FFF",
                                          color: g.supplier === supplier ? "#F7F4EF" : "#666",
                                          border: `1px solid ${g.supplier === supplier ? "#1A1A1A" : "#EAE4D9"}`,
                                        }}
                                      >
                                        {g.supplier}
                                      </button>
                                    ))}
                                  </div>

                                  {/* Empty states — never fall back to another category */}
                                  {groups.length === 0 && (
                                    <div style={{ fontSize: 12, color: "#AAA", padding: "8px 0" }}>
                                      No curated products available for {obj.label} yet.
                                    </div>
                                  )}
                                  {groups.length > 0 && supplierOptions.length === 0 && (
                                    <div style={{ fontSize: 12, color: "#AAA", padding: "8px 0" }}>
                                      No {obj.label.toLowerCase()} products available for this supplier yet.
                                    </div>
                                  )}

                                  {/* Product options for active supplier */}
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                                    {supplierOptions.map(product => {
                                      const isSelected = activeRepl?.productId === product.id;
                                      const hasCatalogImage = isValidProductImageUrl({ imageUrl: product.imageUrl, productName: product.name, category: product.category, brand: product.brand });
                                      const imgSrc = hasCatalogImage ? product.imageUrl : getFurnitureImage(product.category);
                                      return (
                                        <div
                                          key={product.id}
                                          onClick={() => setReplacementForObject(obj, product)}
                                          style={{
                                            padding: 10, borderRadius: 4, cursor: "pointer",
                                            border: `1px solid ${isSelected ? "#C4A882" : "#EAE4D9"}`,
                                            background: isSelected ? "#FBF8F4" : "#FFF",
                                          }}
                                        >
                                          <div style={{ position: "relative", marginBottom: 6 }}>
                                            <img
                                              src={imgSrc}
                                              alt={product.name}
                                              onError={(e) => { e.currentTarget.src = getFurnitureImage(product.category); }}
                                              style={{ width: "100%", height: 84, objectFit: "cover", borderRadius: 4, display: "block", background: "#F7F3EC" }}
                                            />
                                            {!hasCatalogImage && (
                                              <span style={{ position: "absolute", bottom: 4, left: 4, fontSize: 8, fontFamily: "monospace", color: "#FFF", background: "rgba(0,0,0,0.45)", padding: "2px 5px", borderRadius: 3 }}>
                                                REFERENCE IMAGE
                                              </span>
                                            )}
                                          </div>
                                          <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.3 }}>{product.name}</div>
                                          <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>{product.brand}</div>
                                          <div style={{ fontSize: 11, color: "#C4A882", fontWeight: 600, marginTop: 3 }}>AED {product.price}</div>
                                          {isValidProductUrl(product.productUrl) && (
                                            <a href={product.productUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: "#C4A882", textDecoration: "none" }}>
                                              View product →
                                            </a>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Selected replacement card for active object */}
                                  {activeRepl && (
                                    <div style={{ marginTop: 12, background: "#FFF", border: "1px solid #EAE4D9", borderRadius: 4, padding: 12 }}>
                                      <div className="mono" style={{ fontSize: 9, color: "#C4A882", letterSpacing: "0.1em", marginBottom: 8 }}>SELECTED REPLACEMENT</div>
                                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                        <img
                                          src={isValidProductImageUrl({ imageUrl: activeRepl.imageUrl, productName: activeRepl.productName, category: activeRepl.category, brand: activeRepl.brand }) ? activeRepl.imageUrl : getFurnitureImage(activeRepl.category)}
                                          alt={activeRepl.productName}
                                          onError={(e) => { e.currentTarget.src = getFurnitureImage(activeRepl.category); }}
                                          style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 4, flexShrink: 0, background: "#F7F3EC" }}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: 12, fontWeight: 500 }}>{activeRepl.productName}</div>
                                          <div style={{ fontSize: 11, color: "#888" }}>{activeRepl.category.replace(/_/g, " ")} · {activeRepl.supplier}</div>
                                          <div style={{ fontSize: 12, color: "#C4A882", fontWeight: 600, marginTop: 2 }}>AED {activeRepl.price}</div>
                                        </div>
                                        {isValidProductUrl(activeRepl.productUrl) && (
                                          <a href={activeRepl.productUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#C4A882", textDecoration: "none", flexShrink: 0 }}>View product →</a>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })()}

                        {/* Bottom: all selected replacements */}
                        {selectedObjects.length > 0 && (
                          <div style={{ marginTop: 16 }}>
                            <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.1em", marginBottom: 10 }}>
                              YOUR SELECTED REPLACEMENTS
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {selectedObjects.map((obj, idx) => {
                                const repl = selectedReplacements.find(r => r.selectedObjectId === obj.id);
                                return (
                                  <div key={obj.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", background: "#FFF", border: "1px solid #EAE4D9", borderRadius: 4 }}>
                                    <span style={{ fontSize: 12, color: "#999", width: 16 }}>{idx + 1}.</span>
                                    {repl ? (
                                      <>
                                        <img
                                          src={isValidProductImageUrl({ imageUrl: repl.imageUrl, productName: repl.productName, category: repl.category, brand: repl.brand }) ? repl.imageUrl : getFurnitureImage(repl.category)}
                                          alt={repl.productName}
                                          onError={(e) => { e.currentTarget.src = getFurnitureImage(repl.category); }}
                                          style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, flexShrink: 0, background: "#F7F3EC" }}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: 12, color: "#555" }}>
                                            <strong>{obj.label}</strong> → {repl.productName}
                                          </div>
                                          <div style={{ fontSize: 11, color: "#999" }}>{repl.supplier} · AED {repl.price}</div>
                                        </div>
                                      </>
                                    ) : (
                                      <div style={{ flex: 1, fontSize: 12, color: "#AAA" }}>
                                        <strong style={{ color: "#777" }}>{obj.label}</strong> → No replacement selected yet
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Selected products summary */}
                    {/* Minor renovation: selected finishes with mini swatches */}
                    {isMinorRenovation && selectedProducts.length > 0 && (
                      <div style={{ background: "#FAF8F5", border: "1px solid #EAE4D9", borderRadius: 4, padding: "12px 16px", marginBottom: 16 }}>
                        <div className="mono" style={{ fontSize: 10, color: "#C4A882", marginBottom: 8 }}>YOUR SELECTED FINISHES</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {selectedProducts.map((key, i) => {
                            const [itemName, optionName] = key.split("__");
                            const product = extractedProducts.find(p => p.itemName === itemName);
                            const option = product?.options?.find(o => o.name === optionName);
                            if (!product || !option) return null;
                            return (
                              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                <span style={{ fontSize: 12, color: "#999", width: 14 }}>{i + 1}.</span>
                                <div style={{ width: 36, flexShrink: 0 }}>
                                  <MaterialSwatch item={{ category: product.category, name: option.name, colorTags: [] }} size="small" />
                                </div>
                                <div style={{ fontSize: 12, color: "#7A6A55" }}>
                                  <strong>{product.itemName}</strong> → {option.name}
                                  <div style={{ fontSize: 11, color: "#999" }}>
                                    {option.brand}{option.price === "Price unavailable" ? "" : ` · AED ${option.price}`}{option.unit ? ` / ${option.unit.replace("per ", "")}` : ""}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {renderMode === "restyle" && !isMinorRenovation && selectedProducts.length > 0 && (
                      <div style={{ background: "#FAF8F5", border: "1px solid #EAE4D9", borderRadius: 4, padding: "12px 16px", marginBottom: 16 }}>
                        <div className="mono" style={{ fontSize: 10, color: "#C4A882", marginBottom: 8 }}>PRODUCTS TO RENDER</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {selectedProducts.map((p, i) => (
                            <span key={i} style={{ fontSize: 12, background: "#F0EBE2", color: "#7A6A55", padding: "4px 10px", borderRadius: 20 }}>{p.split("__")[1] || p}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Extra prompt */}
                    <div style={{ marginBottom: 16 }}>
                      <input
                        className="input-field"
                        value={renderPromptExtra}
                        onChange={e => setRenderPromptExtra(e.target.value)}
                        placeholder="Any specific instructions? e.g. keep walls the same colour, lighter sofa..."
                      />
                    </div>

                    {strictValidationMsg && (
                      <div style={{ marginBottom: 12, padding: "10px 14px", background: "#FBF3F0", border: "1px solid #E8CFC5", borderRadius: 4, fontSize: 12, color: "#B0533C" }}>
                        {strictValidationMsg}
                      </div>
                    )}

                    {renderMode === "restyle" && (
                      <div style={{ marginBottom: 10, fontSize: 12, color: "#AAA" }}>
                        Restyle Room keeps your layout and applies selected products to matching furniture types.
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                      <button
                        className="btn-primary"
                        onClick={() => generateRenders()}
                        disabled={renderLoading || (savedRoomPhotos.length === 0 && !roomPhoto)}
                        style={{ flex: 1, fontSize: 14, padding: "14px 0" }}
                      >
                        {renderLoading ? "Generating render..." : renders.length === 0 ? "Generate AI render →" : "Regenerate render →"}
                      </button>
                      {renderPromptExtra.trim() && (
                        <button
                          className="btn-ghost"
                          onClick={reAnalyseWithPrompt}
                          disabled={renderLoading || isLoading}
                          style={{ fontSize: 13, padding: "14px 20px" }}
                        >
                          {renderLoading || isLoading ? "Updating design..." : "Update design & render →"}
                        </button>
                      )}
                    </div>

                    {/* Loading states */}
                    {renderLoading && allRenders.length === 0 && (
                      <div style={{ textAlign: "center", padding: "40px 0" }}>
                        <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>Generating renders for {savedRoomPhotos.slice(0, 4).length} photos...</div>
                        <div style={{ fontSize: 12, color: "#AAA" }}>This may take 1-2 minutes</div>
                      </div>
                    )}
                    {renderLoading && allRenders.length > 0 && (
                      <div style={{ padding: "12px 16px", background: "#FAF8F5", borderRadius: 4, marginBottom: 16, fontSize: 13, color: "#888" }}>
                        ✓ {allRenders.length} render{allRenders.length > 1 ? "s" : ""} done — generating more...
                      </div>
                    )}

                    {/* Active render + version history */}
                    {renderHistory.length > 0 && (() => {
                      const activeRender = renderHistory.find(e => e.id === activeRenderId) || renderHistory[renderHistory.length - 1];
                      return (
                        <div className="fade-in">
                          {/* Per-version result summary — all applied replacements */}
                          {activeRender.mode === "strict_replace" && (
                            <div style={{ marginBottom: 16, padding: "12px 16px", background: "#FAF8F5", border: "1px solid #EAE4D9", borderRadius: 4 }}>
                              <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.1em", marginBottom: 8 }}>
                                STRICT REPLACEMENTS APPLIED{activeRender.appliedReplacements?.length ? ` — ${activeRender.appliedReplacements.length}` : ""}
                              </div>
                              {(activeRender.appliedReplacements && activeRender.appliedReplacements.length > 0
                                ? activeRender.appliedReplacements
                                : []).map((r, i) => (
                                <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                                  <img
                                    src={isValidProductImageUrl({ imageUrl: r.imageUrl, productName: r.productName, category: r.category, brand: r.brand }) ? r.imageUrl : getFurnitureImage(r.category)}
                                    alt={r.productName}
                                    onError={(e) => { e.currentTarget.src = getFurnitureImage(r.category); }}
                                    style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, flexShrink: 0, background: "#F7F3EC" }}
                                  />
                                  <div style={{ fontSize: 12, color: "#7A6A55" }}>
                                    <strong>{r.objectLabel}</strong> → {r.productName}
                                    <div style={{ fontSize: 11, color: "#999" }}>{r.supplier} · AED {r.price}</div>
                                  </div>
                                </div>
                              ))}
                              {(!activeRender.appliedReplacements || activeRender.appliedReplacements.length === 0) && activeRender.selectedProduct?.name && (
                                <div style={{ fontSize: 12, color: "#7A6A55" }}>{activeRender.selectedProduct.name}</div>
                              )}
                              <div style={{ fontSize: 11, color: "#AAA", marginTop: 4 }}>
                                Precision mode preserves the original room outside the selected objects.
                              </div>
                            </div>
                          )}

                          {/* Before/After for the active version */}
                          <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.15em", marginBottom: 16 }}>
                            BEFORE → AFTER — VERSION {renderHistory.findIndex(e => e.id === activeRender.id) + 1}{activeRender.angleLabel ? ` · ${activeRender.angleLabel.toUpperCase()}` : ""}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                            <div style={{ overflow: "hidden", borderRadius: 4, border: "1px solid #EAE4D9" }}>
                              <img
                                src={activeRender.beforeImage}
                                alt="Before"
                                style={{ width: "100%", height: 240, objectFit: "cover", display: "block" }}
                              />
                              <div style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", background: "#FFF" }}>
                                <span className="mono" style={{ fontSize: 10, color: "#AAA" }}>BEFORE</span>
                                <span style={{ fontSize: 11, color: "#999" }}>{activeRender.angleLabel || "Current space"}</span>
                              </div>
                            </div>
                            <div style={{ overflow: "hidden", borderRadius: 4, border: "1px solid #EAE4D9" }}>
                              <img
                                src={activeRender.afterImage}
                                alt="After"
                                style={{ width: "100%", height: 240, objectFit: "cover", display: "block" }}
                              />
                              <div style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", background: "#FFF" }}>
                                <span className="mono" style={{ fontSize: 10, color: "#C4A882" }}>AFTER</span>
                                <a href={activeRender.afterImage} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#C4A882", textDecoration: "none" }}>View full →</a>
                              </div>
                            </div>
                          </div>

                          {/* Render versions */}
                          {renderHistory.length > 1 && (
                            <div style={{ marginBottom: 20 }}>
                              <div className="mono" style={{ fontSize: 10, color: "#AAA", letterSpacing: "0.15em", marginBottom: 10 }}>
                                RENDER VERSIONS — {renderHistory.length}
                              </div>
                              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                                {renderHistory.map((entry, idx) => {
                                  const isActive = entry.id === activeRender.id;
                                  return (
                                    <div
                                      key={entry.id}
                                      onClick={() => setActiveRenderId(entry.id)}
                                      style={{
                                        width: 150, cursor: "pointer", borderRadius: 4, overflow: "hidden",
                                        border: `2px solid ${isActive ? "#C4A882" : "#EAE4D9"}`,
                                        background: isActive ? "#FBF8F4" : "#FFF",
                                        transition: "all 0.2s",
                                      }}
                                    >
                                      <img src={entry.afterImage} alt={`Version ${idx + 1}`} style={{ width: "100%", height: 84, objectFit: "cover", display: "block" }} />
                                      <div style={{ padding: "8px 10px" }}>
                                        <div style={{ fontSize: 11, fontWeight: 500, color: "#555" }}>
                                          Version {idx + 1}{isActive ? " · current" : ""}
                                        </div>
                                        <div style={{ fontSize: 10, color: "#999", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {entry.selectedProduct?.name || (entry.mode === "strict_replace" ? "Strict replacement" : "Restyle")}
                                        </div>
                                        <div style={{ fontSize: 9, color: "#BBB", marginTop: 2 }}>
                                          {entry.angleLabel || ""} {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                        </div>
                                        {!isActive && (
                                          <div style={{ fontSize: 10, color: "#C4A882", marginTop: 4 }}>View this version →</div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ERROR */}
      {screen === "results" && results?.error && (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <p style={{ color: "#888" }}>Something went wrong. Please try again.</p>
          <button className="btn-primary" onClick={() => setScreen("configure")}>Try again</button>
        </div>
      )}
    </div>
  );
}

interface ContractorPlatform {
  name: string;
  url: string;
}

interface ContractorType {
  type: string;
  icon: string;
  required: boolean;
  description: string;
  relevantScope: string;
  estimatedCost: string;
  duration: string;
  checkList: string[];
  platforms?: ContractorPlatform[];
}

interface RecommendedContractor {
  name: string;
  specialty: string;
  budget: string;
  website: string;
  whatsapp: string;
  rating: number;
  tag: string;
}

interface ContractorsData {
  types: ContractorType[];
  questionsToAsk: string[];
  recommended?: RecommendedContractor[];
  budgetTier?: string;
}

function ContractorSection({ results, prompt, category, user, budget }: { results: BuiltMeResult | null; prompt: string; category: string | null; user: User | null; budget: string | null }) {
  const [contractors, setContractors] = useState<ContractorsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState<string[]>([]);

  const generateContractors = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: results?.spaceAnalysis || {},
          materials: results?.materials || [],
          designConcept: results?.designConcept?.projectTitle || "",
          category: category,
          prompt: prompt,
          budget: budget,
        }),
      });
      const data = await response.json();
      setContractors(data.contractors);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const sendWhatsAppBrief = (contractor: Pick<ContractorType, "type" | "relevantScope" | "estimatedCost">) => {
    const brief = `Hi, I found your profile on BuiltMe. I'm looking for a ${contractor.type} contractor in Dubai for my renovation project.

Project: ${results?.designConcept?.projectTitle || "Home Renovation"}
Scope: ${contractor.relevantScope}
Budget: ${contractor.estimatedCost}
Location: Dubai

Could you please provide a quote? Thank you.`;

    const url = `https://wa.me/?text=${encodeURIComponent(brief)}`;
    window.open(url, "_blank");
    setWhatsappSent(prev => [...prev, contractor.type]);
  };

  if (!contractors) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔨</div>
        <div className="serif" style={{ fontSize: 22, marginBottom: 8 }}>Match Contractors to Your Project</div>
        <p style={{ fontSize: 14, color: "#888", marginBottom: 24, fontWeight: 300 }}>
          AI will identify what contractor types you need and generate a ready-to-send brief
        </p>
        <button
          onClick={generateContractors}
          disabled={loading}
          style={{
            background: "#1A1A1A", color: "#F7F4EF", border: "none",
            padding: "14px 36px", fontSize: 14, fontFamily: "'DM Sans', sans-serif",
            fontWeight: 500, cursor: "pointer", borderRadius: 2,
          }}
        >
          {loading ? "Analysing your project..." : "Find contractors →"}
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Contractor types */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
        {contractors?.types?.map((contractor, i) => (
          <div key={i} style={{ background: "#FFF", border: "1px solid #EAE4D9", borderRadius: 4, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 24 }}>{contractor.icon}</span>
                  <span style={{ fontSize: 18, fontWeight: 500 }}>{contractor.type}</span>
                  {contractor.required && (
                    <span style={{ background: "#C4A88222", color: "#C4A882", fontSize: 10, padding: "3px 10px", borderRadius: 20, fontFamily: "monospace" }}>REQUIRED</span>
                  )}
                </div>
                <p style={{ fontSize: 13, color: "#888", fontWeight: 300, lineHeight: 1.7 }}>{contractor.description}</p>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#C4A882" }}>{contractor.estimatedCost}</div>
                <div style={{ fontSize: 11, color: "#AAA", marginTop: 2 }}>{contractor.duration}</div>
              </div>
            </div>

            {/* What to check */}
            <div style={{ background: "#FAF8F5", borderRadius: 4, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "#AAA", letterSpacing: "0.1em", marginBottom: 8 }}>WHAT TO CHECK WHEN HIRING</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {contractor.checkList?.map((check, j) => (
                  <span key={j} style={{ fontSize: 12, background: "#F0EBE2", color: "#7A6A55", padding: "4px 10px", borderRadius: 20 }}>{check}</span>
                ))}
              </div>
            </div>

            {/* Where to find */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontFamily: "monospace", color: "#AAA", letterSpacing: "0.1em", marginBottom: 8 }}>WHERE TO FIND IN DUBAI</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {contractor.platforms?.map((platform, j) => (
                  <a
                    key={j}
                    href={platform.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: 12, padding: "6px 14px",
                      background: "#FFF", border: "1px solid #EAE4D9",
                      borderRadius: 2, textDecoration: "none", color: "#444",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {platform.name} →
                  </a>
                ))}
              </div>
            </div>

            {/* WhatsApp brief */}
            <button
              onClick={() => sendWhatsAppBrief(contractor)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                background: whatsappSent.includes(contractor.type) ? "#4CAF5011" : "#25D36611",
                border: `1px solid ${whatsappSent.includes(contractor.type) ? "#4CAF50" : "#25D366"}`,
                color: whatsappSent.includes(contractor.type) ? "#4CAF50" : "#25D366",
                padding: "10px 20px", borderRadius: 2, cursor: "pointer",
                fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
              }}
            >
              {whatsappSent.includes(contractor.type) ? "✓ Brief sent" : "📱 Send WhatsApp Brief"}
            </button>
          </div>
        ))}
      </div>

      {/* Questions to ask contractor */}
      {contractors?.questionsToAsk && (
        <div style={{ background: "#1A1A1A", borderRadius: 4, padding: 24 }}>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: "#C4A882", letterSpacing: "0.15em", marginBottom: 16 }}>QUESTIONS TO ASK ANY CONTRACTOR</div>
          {contractors.questionsToAsk.map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid #2A2A2A", alignItems: "flex-start" }}>
              <span style={{ color: "#C4A882", fontFamily: "monospace", fontSize: 12, flexShrink: 0 }}>0{i + 1}</span>
              <span style={{ fontSize: 13, color: "#D0C8B8", fontWeight: 300 }}>{q}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recommended contractors */}
      {contractors?.recommended && (
        <div style={{ marginTop: 24 }}>
          <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.15em", marginBottom: 16 }}>
            RECOMMENDED FOR YOUR BUDGET — {contractors.budgetTier?.toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {contractors.recommended.map((c, i) => (
              <div key={i} style={{ background: "#FFF", border: "1px solid #EAE4D9", borderRadius: 4, padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>{c.name}</span>
                    <span style={{ background: "#C4A88222", color: "#C4A882", fontSize: 10, padding: "2px 8px", borderRadius: 20, fontFamily: "monospace" }}>{c.tag}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#888", fontWeight: 300, marginBottom: 4 }}>{c.specialty}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#C4A882" }}>{"★".repeat(Math.floor(c.rating))}</span>
                    <span style={{ fontSize: 11, color: "#AAA" }}>{c.rating}</span>
                    <span style={{ fontSize: 11, color: "#CCC", margin: "0 4px" }}>·</span>
                    <span style={{ fontSize: 11, color: "#AAA" }}>{c.budget}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <a
                    href={c.website}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "8px 16px", background: "#FFF",
                      border: "1px solid #EAE4D9", borderRadius: 2,
                      fontSize: 12, color: "#444", textDecoration: "none",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Website →
                  </a>
                  <button
                    onClick={() => sendWhatsAppBrief({ type: c.name, relevantScope: c.specialty, estimatedCost: c.budget })}
                    style={{
                      padding: "8px 16px",
                      background: "#25D36611", border: "1px solid #25D366",
                      color: "#25D366", borderRadius: 2, cursor: "pointer",
                      fontSize: 12, fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    📱 WhatsApp
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
