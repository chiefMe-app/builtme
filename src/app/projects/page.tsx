"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

interface BuiltMeResult {
  designConcept?: { title?: string };
  costBreakdown?: { total?: number };
  [key: string]: unknown;
}

interface Project {
  id: string | number;
  category: string;
  budget: string;
  prompt: string;
  result: BuiltMeResult | null;
  title: string | null;
  renders: string[] | null;
  created_at: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (!currentUser) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("builtme_projects")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Failed to load projects:", error);
      } else {
        setProjects((data ?? []) as Project[]);
      }
      setLoading(false);
    };

    load();
  }, []);

  const openProject = (project: Project) => {
    try {
      localStorage.setItem("builtme_results", JSON.stringify(project.result ?? {}));
      localStorage.setItem("builtme_renders", JSON.stringify(project.renders ?? []));
      localStorage.setItem("builtme_load_project", "1");
    } catch (err) {
      console.error("Failed to store project:", err);
    }
    router.push("/");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F7F4EF", color: "#1A1A1A", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Playfair+Display:ital,wght@0,400;0,600;1,400;1,600&family=DM+Mono:wght@300;400&display=swap');

        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #C4A882; border-radius: 2px; }

        .serif { font-family: 'Playfair Display', serif; }
        .mono { font-family: 'DM Mono', monospace; }

        .btn-primary {
          background: #1A1A1A;
          color: #F7F4EF;
          border: none;
          padding: 10px 24px;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: all 0.2s;
          border-radius: 2px;
          text-decoration: none;
          display: inline-block;
        }
        .btn-primary:hover { background: #333; transform: translateY(-1px); }

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
          text-decoration: none;
          display: inline-block;
        }
        .btn-ghost:hover { border-color: #1A1A1A; }

        .project-card {
          background: #FFF;
          border: 1px solid #EAE4D9;
          border-radius: 4px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        .project-card:hover { border-color: #C4A882; transform: translateY(-2px); }
      `}</style>

      {/* Nav */}
      <nav style={{ padding: "20px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #EAE4D9", background: "#F7F4EF" }}>
        <a href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Built</span>
          <span className="serif" style={{ fontSize: 22, fontWeight: 400, fontStyle: "italic", color: "#C4A882" }}>Me</span>
        </a>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href="/" className="btn-primary">Start your renovation</a>
          {user && (
            <button className="btn-ghost" onClick={handleSignOut}>Sign out</button>
          )}
        </div>
      </nav>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "48px 32px" }}>
        <div className="mono" style={{ fontSize: 10, color: "#C4A882", letterSpacing: "0.2em", marginBottom: 8 }}>YOUR ACCOUNT</div>
        <h1 className="serif" style={{ fontSize: 32, fontWeight: 400, marginBottom: 32 }}>My Projects</h1>

        {loading && <p style={{ color: "#666" }}>Loading your projects...</p>}

        {!loading && !user && (
          <div className="project-card" style={{ padding: 32, cursor: "default" }}>
            <p style={{ marginBottom: 16 }}>Please sign in to view your saved projects.</p>
            <a href="/auth" className="btn-primary">Sign in</a>
          </div>
        )}

        {!loading && user && projects.length === 0 && (
          <div className="project-card" style={{ padding: 32, cursor: "default" }}>
            <p style={{ marginBottom: 16 }}>You haven&apos;t created any renovation packages yet.</p>
            <a href="/" className="btn-primary">Start your renovation</a>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 20 }}>
            {projects.map((project) => {
              const total = project.result?.costBreakdown?.total || 0;
              const title = project.title || project.result?.designConcept?.title || "Untitled project";
              const firstRender = Array.isArray(project.renders) && project.renders.length > 0 ? project.renders[0] : null;

              return (
                <button key={project.id} className="project-card" onClick={() => openProject(project)}>
                  {firstRender ? (
                    <img src={firstRender} alt={title} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                  ) : (
                    <div style={{ width: "100%", height: 160, background: "#FAF8F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span className="mono" style={{ fontSize: 10, color: "#D4C9B8", letterSpacing: "0.2em" }}>NO RENDER YET</span>
                    </div>
                  )}
                  <div style={{ padding: 16 }}>
                    <div className="serif" style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{title}</div>
                    <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>{project.category} · {project.budget}</div>
                    <div className="serif" style={{ fontSize: 14, color: "#C4A882", fontWeight: 600, marginBottom: 6 }}>
                      AED {total.toLocaleString()}
                    </div>
                    <div className="mono" style={{ fontSize: 10, color: "#AAA", letterSpacing: "0.1em" }}>
                      {new Date(project.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
