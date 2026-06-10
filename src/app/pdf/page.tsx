"use client";

import { useEffect, useState } from "react";

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

interface BuiltMeResult {
  styleProfile?: StyleProfile;
  designConcept?: DesignConcept;
  materials?: MaterialItem[];
  furniture?: FurnitureItem[];
  costBreakdown?: CostBreakdown;
  timeline?: TimelinePhase[];
  nextSteps?: string[];
  error?: boolean;
}

const GOLD = "#C4A882";

export default function PDFPage() {
  const [results, setResults] = useState<BuiltMeResult | null>(null);
  const [renders, setRenders] = useState<string[]>([]);

  useEffect(() => {
    try {
      const storedResults = localStorage.getItem("builtme_results");
      if (storedResults) {
        setResults(JSON.parse(storedResults));
      }
      const storedRenders = localStorage.getItem("builtme_renders");
      if (storedRenders) {
        const parsed = JSON.parse(storedRenders);
        if (Array.isArray(parsed)) setRenders(parsed);
      }
    } catch (err) {
      console.error("Failed to load BuiltMe data from localStorage:", err);
    }
  }, []);

  if (!results) {
    return (
      <div style={{ fontFamily: "'DM Sans', Arial, sans-serif", padding: 40, color: "#1A1A1A", background: "#FFF" }}>
        <p>No renovation package found. Please generate a package first.</p>
      </div>
    );
  }

  const totalCost = results.costBreakdown?.total || 0;

  return (
    <div style={{ fontFamily: "'DM Sans', Arial, sans-serif", background: "#FFF", color: "#1A1A1A", maxWidth: 800, margin: "0 auto", padding: "40px 32px" }}>
      <style>{`
        @media print {
          button { display: none !important; }
          body { background: #FFF; }
        }
        table { border-collapse: collapse; width: 100%; }
        th, td { text-align: left; padding: 8px 10px; font-size: 12px; border-bottom: 1px solid #EAE4D9; }
        th { color: #AAA; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; font-size: 10px; }
      `}</style>

      {/* Print button */}
      <div style={{ textAlign: "right", marginBottom: 24 }}>
        <button
          onClick={() => window.print()}
          style={{
            background: GOLD,
            color: "#FFF",
            border: "none",
            borderRadius: 4,
            padding: "10px 24px",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Print / Save as PDF
        </button>
      </div>

      {/* Header */}
      <div style={{ borderBottom: `2px solid ${GOLD}`, paddingBottom: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: GOLD, letterSpacing: "0.2em", marginBottom: 8, textTransform: "uppercase" }}>
          BuiltMe — Renovation Package
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, marginBottom: 8 }}>
          {results.designConcept?.title || "Your Design Concept"}
        </h1>
        <div style={{ fontSize: 16, fontWeight: 600, color: GOLD }}>
          Total Estimate: AED {totalCost.toLocaleString()}
        </div>
      </div>

      {/* Render image */}
      {renders.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <img
            src={renders[0]}
            alt="AI Render"
            style={{ width: "100%", maxHeight: 400, objectFit: "cover", borderRadius: 4, border: "1px solid #EAE4D9" }}
          />
        </div>
      )}

      {/* Design Concept */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: GOLD, borderBottom: "1px solid #EAE4D9", paddingBottom: 6, marginBottom: 10 }}>
          Design Concept
        </h2>
        <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 8 }}>{results.designConcept?.description}</p>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: "#666", fontStyle: "italic" }}>
          {results.designConcept?.beforeAfterNarrative}
        </p>
      </section>

      {/* Style Profile */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: GOLD, borderBottom: "1px solid #EAE4D9", paddingBottom: 6, marginBottom: 10 }}>
          Style Profile
        </h2>
        <p style={{ fontSize: 13, marginBottom: 8 }}>
          <strong>Style:</strong> {results.styleProfile?.dominantStyle}
        </p>
        <p style={{ fontSize: 13, marginBottom: 12 }}>
          <strong>Mood:</strong> {results.styleProfile?.moodKeywords?.join(", ")}
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>{results.styleProfile?.designDirection}</p>

        {/* Color palette */}
        {results.styleProfile?.colorPalette && results.styleProfile.colorPalette.length > 0 && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {results.styleProfile.colorPalette.map((c, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 4, background: c.hex, border: "1px solid #EAE4D9", marginBottom: 4 }} />
                <div style={{ fontSize: 10, fontWeight: 500 }}>{c.name}</div>
                <div style={{ fontSize: 9, color: "#AAA" }}>{c.hex}</div>
                <div style={{ fontSize: 9, color: "#AAA" }}>{c.usage}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Materials */}
      {results.materials && results.materials.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: GOLD, borderBottom: "1px solid #EAE4D9", paddingBottom: 6, marginBottom: 10 }}>
            Materials & Cost
          </h2>
          <table>
            <thead>
              <tr>
                <th>Zone</th>
                <th>Item</th>
                <th>Specification</th>
                <th>Supplier</th>
                <th>Area</th>
                <th>Price Range</th>
                <th>Qty</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {results.materials.map((m, i) => (
                <tr key={i}>
                  <td>{m.zone}</td>
                  <td>{m.item}</td>
                  <td>{m.specification}</td>
                  <td>{m.supplier}</td>
                  <td>{m.supplierArea}</td>
                  <td>{m.priceRange}</td>
                  <td>{m.quantity}</td>
                  <td>{m.totalCost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Furniture */}
      {results.furniture && results.furniture.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: GOLD, borderBottom: "1px solid #EAE4D9", paddingBottom: 6, marginBottom: 10 }}>
            Furniture
          </h2>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Brand</th>
                <th>Model</th>
                <th>Price (AED)</th>
                <th>Alternative</th>
                <th>Alt. Price (AED)</th>
              </tr>
            </thead>
            <tbody>
              {results.furniture.map((f, i) => (
                <tr key={i}>
                  <td>{f.item}</td>
                  <td>{f.brand}</td>
                  <td>{f.model}</td>
                  <td>{(f.priceAED || 0).toLocaleString()}</td>
                  <td>{f.alternative}</td>
                  <td>{(f.altPriceAED || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Cost Breakdown */}
      {results.costBreakdown && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: GOLD, borderBottom: "1px solid #EAE4D9", paddingBottom: 6, marginBottom: 10 }}>
            Cost Breakdown
          </h2>
          <table>
            <tbody>
              <tr>
                <td>Materials</td>
                <td>AED {(results.costBreakdown.materials || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td>Furniture</td>
                <td>AED {(results.costBreakdown.furniture || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td>Labour</td>
                <td>AED {(results.costBreakdown.labour || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td>Contingency</td>
                <td>AED {(results.costBreakdown.contingency || 0).toLocaleString()}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>TOTAL</td>
                <td style={{ fontWeight: 700, color: GOLD }}>AED {(results.costBreakdown.total || 0).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {/* Timeline */}
      {results.timeline && results.timeline.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: GOLD, borderBottom: "1px solid #EAE4D9", paddingBottom: 6, marginBottom: 10 }}>
            Timeline
          </h2>
          {results.timeline.map((phase, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{phase.week}</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {phase.tasks.map((task, j) => (
                  <li key={j} style={{ fontSize: 12, lineHeight: 1.6 }}>{task}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {/* Next Steps */}
      {results.nextSteps && results.nextSteps.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: GOLD, borderBottom: "1px solid #EAE4D9", paddingBottom: 6, marginBottom: 10 }}>
            Next Steps
          </h2>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {results.nextSteps.map((step, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.8 }}>{step}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
