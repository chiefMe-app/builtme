"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
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
  rooms: RoomAnalysis[];
  keyConstraints: string[];
}

interface DesignConcept {
  title: string;
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
  priceAED: number;
  buyLink: string;
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

interface BuiltMeResult {
  styleProfile?: StyleProfile;
  spaceAnalysis?: SpaceAnalysis;
  designConcept?: DesignConcept;
  materials?: MaterialItem[];
  furniture?: FurnitureItem[];
  costBreakdown?: CostBreakdown;
  timeline?: TimelinePhase[];
  supplierMap?: Supplier[];
  nextSteps?: string[];
  error?: boolean;
}

type Screen = "landing" | "configure" | "processing" | "results";

const RENOVATION_CATEGORIES = [
  { id: "full", label: "Full Apartment", icon: "🏠", desc: "All rooms" },
  { id: "kitchen", label: "Kitchen", icon: "🍳", desc: "Kitchen refresh" },
  { id: "bathroom", label: "Bathroom", icon: "🚿", desc: "Bathroom update" },
  { id: "living", label: "Living Room", icon: "🛋️", desc: "Living & dining" },
  { id: "bedroom", label: "Bedroom", icon: "🛏️", desc: "Master or guest" },
  { id: "painting", label: "Painting", icon: "🎨", desc: "Walls & ceilings" },
];

const BUDGET_OPTIONS = [
  { id: "10-30", label: "AED 10K–30K", desc: "Cosmetic refresh" },
  { id: "30-80", label: "AED 30K–80K", desc: "Room makeover" },
  { id: "80-200", label: "AED 80K–200K", desc: "Full renovation" },
  { id: "200+", label: "AED 200K+", desc: "Premium transformation" },
];

const AGENT_STEPS = [
  { id: "upload", label: "Processing uploads", icon: "📁" },
  { id: "vision", label: "Analysing your style references", icon: "🎨" },
  { id: "space", label: "Reading your floor plan", icon: "📐" },
  { id: "design", label: "Building design concept", icon: "✨" },
  { id: "materials", label: "Sourcing materials & costs", icon: "🏪" },
  { id: "package", label: "Compiling your renovation package", icon: "📦" },
];

export default function BuiltMe() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("landing");
  const [category, setCategory] = useState<string | null>(null);
  const [budget, setBudget] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [references, setReferences] = useState<File[]>([]);
  const [roomPhotos, setRoomPhotos] = useState<File[]>([]);
  const [roomPhotoUrls, setRoomPhotoUrls] = useState<string[]>([]);
  const [agentStep, setAgentStep] = useState(0);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  const [results, setResults] = useState<BuiltMeResult | null>(null);
  const [activeTab, setActiveTab] = useState("concept");
  const [isLoading, setIsLoading] = useState(false);
  const [renders, setRenders] = useState<string[]>([]);
  const [renderLoading, setRenderLoading] = useState(false);
  const [roomPhoto, setRoomPhoto] = useState<File | null>(null);
  const [roomPhotoUrl, setRoomPhotoUrl] = useState<string>("");
  const [renderPromptExtra, setRenderPromptExtra] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const refImagesRef = useRef<HTMLInputElement>(null);
  const roomPhotosRef = useRef<HTMLInputElement>(null);
  const roomPhotoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleStart = () => {
    if (!user) {
      router.push("/auth");
      return;
    }
    setScreen("configure");
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

  const handleRoomPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRoomPhoto(file);

    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/upload-photo", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
        setRoomPhotoUrl(data.url);
        localStorage.setItem("builtme_room_photo", data.url);
      }
    } catch (err) {
      console.error("Photo upload error:", err);
    }
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
    try {
      const categoryLabel = RENOVATION_CATEGORIES.find((c) => c.id === category)?.label ?? category ?? "";
      const budgetLabel = BUDGET_OPTIONS.find((b) => b.id === budget)?.label ?? budget ?? "";

      const formData = new FormData();
      formData.append("category", categoryLabel);
      formData.append("budget", budgetLabel);
      formData.append("prompt", prompt);
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

      const response = await fetch("/api/analyse", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      const parsed = data.result as BuiltMeResult;
      setResults(parsed);
      localStorage.setItem("builtme_results", JSON.stringify(parsed));

      try {
        await supabase.from("builtme_projects").insert({
          user_id: user?.id,
          category: categoryLabel,
          budget: budgetLabel,
          prompt,
          result: parsed,
          title: parsed?.designConcept?.title,
          renders: [],
          room_photo_url: roomPhotoUrl,
          created_at: new Date().toISOString(),
        });
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

  const generateRenders = async (updatedResults?: typeof results) => {
    const photoToUse = roomPhoto || roomPhotos[0] || null;
    if (!photoToUse) {
      alert("Please upload a photo of your room first");
      return;
    }
    const activeResults = updatedResults || results;
    setRenderLoading(true);
    try {
      const formData = new FormData();
      formData.append("image", photoToUse);
      formData.append("prompt", prompt + (renderPromptExtra ? ". User instructions: " + renderPromptExtra : ""));
      formData.append("style", activeResults?.styleProfile?.dominantStyle || "modern");
      formData.append("room", RENOVATION_CATEGORIES.find(c => c.id === category)?.label || "room");
      formData.append("colorPalette", activeResults?.styleProfile?.colorPalette?.map((c: {name: string}) => c.name).join(", ") || "");

      const response = await fetch("/api/render", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const predictionId = data.predictionId;

      // Poll for result
      let attempts = 0;
      while (attempts < 60) {
        await new Promise(r => setTimeout(r, 3000));
        const statusRes = await fetch(`/api/render-status?id=${predictionId}`);
        const statusData = await statusRes.json();

        if (statusData.status === "succeeded") {
          const output = statusData.images;
          const imagesArray = Array.isArray(output) ? output :
            (output && typeof output === "object") ? Object.values(output) : [];
          setRenders(imagesArray as string[]);
          localStorage.setItem("builtme_renders", JSON.stringify(imagesArray));

          try {
            const { data: latestProject } = await supabase
              .from("builtme_projects")
              .select("id")
              .eq("user_id", user?.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            if (latestProject) {
              await supabase
                .from("builtme_projects")
                .update({ renders: imagesArray })
                .eq("id", latestProject.id);
            }
          } catch (dbErr) {
            console.error("Failed to update project renders:", dbErr);
          }

          break;
        } else if (statusData.status === "failed" || statusData.error) {
          throw new Error(statusData.error || "Render failed");
        }
        attempts++;
      }

      if (attempts >= 60) throw new Error("Render timed out");
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Render failed");
    }
    setRenderLoading(false);
  };

  const reAnalyseWithPrompt = async () => {
    if (!renderPromptExtra.trim()) return;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("category", category || "");
      formData.append("budget", budget || "");
      formData.append("prompt", prompt + ". IMPORTANT UPDATES: " + renderPromptExtra);
      if (roomPhotos.length > 0) formData.append("floorPlan", roomPhotos[0]);

      const response = await fetch("/api/analyse", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setResults(data.result);

      // Save updated result to Supabase
      if (user) {
        const { data: latestProject } = await supabase
          .from("builtme_projects")
          .select("id")
          .eq("user_id", user?.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (latestProject) {
          await supabase.from("builtme_projects")
            .update({ result: data.result })
            .eq("id", latestProject.id);
        }
      }

      // Regenerate render with new analysis
      await generateRenders(data.result);
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
          <button className="btn-ghost" onClick={() => setScreen("landing")} style={{ marginBottom: 28 }}>← Back</button>
          <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em", marginBottom: 8 }}>NEW PROJECT</div>
          <h2 className="serif" style={{ fontSize: 36, fontWeight: 400, marginBottom: 36 }}>Tell us about your <em>space</em></h2>

          {/* Category */}
          <div style={{ marginBottom: 32 }}>
            <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>WHAT ARE YOU RENOVATING?</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {RENOVATION_CATEGORIES.map(c => (
                <div key={c.id} className={`select-card ${category === c.id ? "selected" : ""}`} onClick={() => setCategory(c.id)}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>{c.icon}</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: "#AAA", marginTop: 2 }}>{c.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Budget */}
          <div style={{ marginBottom: 32 }}>
            <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>BUDGET RANGE</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {BUDGET_OPTIONS.map(b => (
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

          {/* Vision prompt */}
          <div style={{ marginBottom: 32 }}>
            <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>DESCRIBE YOUR VISION</div>
            <textarea
              className="input-field"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. I want a warm, minimal kitchen with white cabinets and wood accents. Natural light is important. I like Japanese and Scandinavian style. Currently it feels dark and dated."
              style={{ minHeight: 100, resize: "vertical", lineHeight: 1.7 }}
            />
            <div style={{ fontSize: 11, color: "#BBB", marginTop: 6 }}>Be specific — the more detail, the better your package.</div>
          </div>

          {/* Room photos upload */}
          <div style={{ marginBottom: 32 }}>
            <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 6 }}>CURRENT ROOM PHOTOS <span style={{ color: "#C4A882" }}>*</span></div>
            <div style={{ fontSize: 12, color: "#AAA", marginBottom: 12 }}>Upload 3-5 photos of your current space from different angles. The AI will preserve your exact room structure.</div>
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
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Upload 3-5 room photos</div>
                  <div style={{ fontSize: 12, color: "#AAA" }}>Different angles: entrance view, corners, windows</div>
                </div>
              )}
            </div>
          </div>

          {/* Reference images */}
          <div style={{ marginBottom: 40 }}>
            <div className="mono" style={{ fontSize: 11, color: "#AAA", letterSpacing: "0.12em", marginBottom: 14 }}>STYLE REFERENCES <span style={{ color: "#CCC" }}>(Pinterest, photos — up to 5)</span></div>
            <div className={`upload-zone ${references.length > 0 ? "has-file" : ""}`} onClick={() => refImagesRef.current?.click()}>
              <input ref={refImagesRef} type="file" accept=".jpg,.jpeg,.png,.webp" multiple onChange={handleReferences} style={{ display: "none" }} />
              {references.length > 0 ? (
                <div>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🖼️</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{references.length} image{references.length > 1 ? "s" : ""} selected</div>
                  <div style={{ fontSize: 12, color: "#AAA", marginTop: 4 }}>Click to change</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
                    {references.map((f, i) => (
                      <div key={i} style={{ width: 48, height: 48, background: "#EAE4D9", borderRadius: 4, overflow: "hidden" }}>
                        <img src={URL.createObjectURL(f)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🖼️</div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Upload style references</div>
                  <div style={{ fontSize: 12, color: "#AAA" }}>Screenshots from Pinterest, Instagram, or anywhere you love</div>
                </div>
              )}
            </div>
          </div>

          <button
            className="btn-primary"
            disabled={!category || !budget || !prompt.trim() || roomPhotos.length === 0}
            onClick={runAgents}
            style={{ width: "100%", fontSize: 15, padding: "16px" }}
          >
            Analyse my space →
          </button>
          {roomPhotos.length === 0 && category && budget && prompt.trim() && (
            <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: "#B45757" }}>
              Please upload at least 1 room photo to continue
            </div>
          )}
          <div style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: "#BBB" }}>
            Style references are optional — AI works from your photos and description
          </div>
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
              <div className="serif" style={{ fontSize: 20, fontWeight: 400 }}>{results.designConcept?.title || "Your Design Concept"}</div>
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
                <button className="btn-ghost" onClick={() => setScreen("configure")}>New project</button>
                <button className="btn-primary" onClick={() => window.open("/pdf", "_blank")} style={{ padding: "10px 20px", fontSize: 13 }}>Download PDF</button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ borderBottom: "1px solid #EAE4D9", background: "#FFF", padding: "0 32px", display: "flex", gap: 4, overflowX: "auto" }}>
            {[
              { id: "concept", label: "Design Concept" },
              { id: "materials", label: "Materials & Cost" },
              { id: "furniture", label: "Furniture" },
              { id: "suppliers", label: "Dubai Suppliers" },
              { id: "timeline", label: "Timeline" },
              { id: "renders", label: "AI Renders" },
            ].map(t => (
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
                          <td style={{ padding: "12px 16px" }}><span className="tag">{m.zone}</span></td>
                          <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 500 }}>{m.item}</td>
                          <td style={{ padding: "12px 16px", fontSize: 12, color: "#666", fontWeight: 300, maxWidth: 180 }}>{m.specification}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{m.supplier}</div>
                            <div style={{ fontSize: 11, color: "#AAA" }}>{m.supplierArea}</div>
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
              <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {results.furniture?.map((item, i) => (
                  <div key={i} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{item.item}</div>
                      <div style={{ fontSize: 13, color: "#888", fontWeight: 300 }}>{item.brand} — {item.model}</div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 120 }}>
                      <div className="serif" style={{ fontSize: 18, fontWeight: 600, color: "#1A1A1A" }}>AED {(item.priceAED || 0).toLocaleString()}</div>
                      {item.buyLink && item.buyLink.startsWith("http") && (
                        <a href={item.buyLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#C4A882", textDecoration: "none", fontWeight: 500 }}>Buy now →</a>
                      )}
                    </div>
                    <div style={{ borderLeft: "1px solid #EAE4D9", paddingLeft: 16, minWidth: 140 }}>
                      <div className="mono" style={{ fontSize: 10, color: "#AAA", marginBottom: 4 }}>BUDGET ALT</div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{item.alternative}</div>
                      <div style={{ fontSize: 13, color: "#888" }}>AED {(item.altPriceAED || 0).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
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
                {renders.length === 0 && (
                  <div style={{ textAlign: "center", padding: "60px 0 24px" }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🎨</div>
                    <div className="serif" style={{ fontSize: 24, marginBottom: 8 }}>Generate AI Renders</div>
                    <p style={{ color: "#888", marginBottom: 24, fontSize: 14 }}>Upload a photo of your current room to see the AI transformation</p>
                  </div>
                )}

                <div style={{ maxWidth: 400, margin: renders.length === 0 ? "0 auto 24px" : "0 0 28px" }}>
                  <div
                    style={{ border: "2px dashed #D4C9B8", borderRadius: 4, padding: 24, marginBottom: 16, cursor: "pointer", background: roomPhoto || roomPhotoUrl ? "#FAF8F5" : "#FFF" }}
                    onClick={() => roomPhotoRef.current?.click()}
                  >
                    <input ref={roomPhotoRef} type="file" accept="image/*" onChange={handleRoomPhotoChange} style={{ display: "none" }} />
                    {roomPhoto || roomPhotoUrl ? (
                      <div>
                        <img src={roomPhotoUrl || (roomPhoto ? URL.createObjectURL(roomPhoto) : "")} alt="Room" style={{ width: "100%", height: 200, objectFit: "cover", borderRadius: 4, marginBottom: 8 }} />
                        <div style={{ fontSize: 12, color: "#AAA" }}>Click to change photo</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Upload your current room photo</div>
                        <div style={{ fontSize: 12, color: "#AAA" }}>JPG, PNG — any angle</div>
                      </div>
                    )}
                  </div>

                  <input
                    className="input-field"
                    value={renderPromptExtra}
                    onChange={e => setRenderPromptExtra(e.target.value)}
                    placeholder="Any specific changes for this render?"
                    style={{ marginBottom: 12 }}
                  />

                  <div style={{ display: "flex", gap: 10, justifyContent: renders.length === 0 ? "center" : "flex-start", flexWrap: "wrap" }}>
                    <button
                      className="btn-primary"
                      onClick={() => generateRenders()}
                      disabled={renderLoading || !roomPhoto}
                      style={{ fontSize: 14, padding: "14px 36px" }}
                    >
                      {renderLoading ? "Generating renders..." : renders.length === 0 ? "Generate renders →" : "Regenerate renders"}
                    </button>
                    {renders.length > 0 && (
                      <button
                        className="btn-ghost"
                        onClick={reAnalyseWithPrompt}
                        disabled={renderLoading || isLoading || !renderPromptExtra.trim()}
                        style={{ fontSize: 14, padding: "14px 36px" }}
                      >
                        {renderLoading || isLoading ? "Updating design..." : "Update design & render →"}
                      </button>
                    )}
                  </div>
                </div>

                {renders.length > 0 && (
                  <div className="fade-in">
                    <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em", marginBottom: 20 }}>BEFORE → AFTER TRANSFORMATION</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                      {/* BEFORE */}
                      <div style={{ overflow: "hidden", borderRadius: 4, border: "1px solid #EAE4D9" }}>
                        {(roomPhotoUrl || roomPhoto) && (
                          <img src={roomPhotoUrl || (roomPhoto ? URL.createObjectURL(roomPhoto) : "")} alt="Before" style={{ width: "100%", height: 320, objectFit: "cover", display: "block" }} />
                        )}
                        <div style={{ padding: "12px 16px", background: "#FFF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="mono" style={{ fontSize: 10, color: "#AAA" }}>BEFORE</span>
                          <span style={{ fontSize: 11, color: "#999" }}>Current space</span>
                        </div>
                      </div>
                      {/* AFTER */}
                      <div style={{ overflow: "hidden", borderRadius: 4, border: "1px solid #EAE4D9" }}>
                        <img src={renders[0]} alt="After" style={{ width: "100%", height: 320, objectFit: "cover", display: "block" }} />
                        <div style={{ padding: "12px 16px", background: "#FFF", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span className="mono" style={{ fontSize: 10, color: "#C4A882" }}>AFTER</span>
                          <a href={renders[0]} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#C4A882", textDecoration: "none" }}>View full →</a>
                        </div>
                      </div>
                    </div>
                    {renders.length > 1 && (
                      <div>
                        <div className="mono" style={{ fontSize: 10, color: "#AAA", letterSpacing: "0.1em", marginBottom: 12 }}>MORE CONCEPTS</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                          {renders.slice(1).map((img, i) => (
                            <div key={i} style={{ overflow: "hidden", borderRadius: 4, border: "1px solid #EAE4D9" }}>
                              <img src={img} alt={`Concept ${i + 2}`} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                              <div style={{ padding: "8px 12px", background: "#FFF", display: "flex", justifyContent: "space-between" }}>
                                <span className="mono" style={{ fontSize: 10, color: "#AAA" }}>CONCEPT {i + 2}</span>
                                <a href={img} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#C4A882", textDecoration: "none" }}>View →</a>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
