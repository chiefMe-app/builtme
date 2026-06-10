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
  room_photo_url: string | null;
  created_at: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageErrors, setImageErrors] = useState<Set<string | number>>(new Set());

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
      localStorage.setItem("builtme_load_project", JSON.stringify(project.result));
      localStorage.setItem("builtme_renders", JSON.stringify(project.renders || []));
      localStorage.setItem("builtme_room_photo", project.room_photo_url || "");
    } catch (err) {
      console.error("Failed to store project:", err);
    }
    router.push("/");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth");
  };

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string | number) => {
    e.stopPropagation();
    if (!confirm("Delete this project? This cannot be undone.")) return;

    try {
      const { error } = await supabase.from("builtme_projects").delete().eq("id", projectId);
      if (error) throw error;
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (err) {
      console.error("Failed to delete project:", err);
      alert("Failed to delete project");
    }
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

        .badge {
          display: inline-block;
          font-family: 'DM Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.08em;
          color: #666;
          background: #FAF8F5;
          border: 1px solid #EAE4D9;
          border-radius: 999px;
          padding: 4px 10px;
          margin-right: 6px;
        }

        .project-card {
          background: #FFF;
          border: 1px solid #EAE4D9;
          border-radius: 4px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          position: relative;
        }
        .project-card:hover { border-color: #C4A882; transform: translateY(-2px); }

        .project-delete {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1px solid #EAE4D9;
          background: rgba(255, 255, 255, 0.9);
          color: #B45757;
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
          z-index: 2;
        }
        .project-delete:hover { background: #B45757; color: #FFF; border-color: #B45757; }
      `}</style>

      {/* Nav */}
      <nav style={{ padding: "20px 40px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #EAE4D9", background: "#F7F4EF" }}>
        <a href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Built</span>
          <span className="serif" style={{ fontSize: 22, fontWeight: 400, fontStyle: "italic", color: "#C4A882" }}>Me</span>
        </a>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a href="/" className="btn-primary">New Project</a>
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
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <p style={{ color: "#666", marginBottom: 20, fontSize: 15 }}>No projects yet.</p>
            <a href="/" className="btn-primary">Start your first renovation →</a>
          </div>
        )}

        {!loading && projects.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {projects.map((project) => {
              const total = project.result?.costBreakdown?.total || 0;
              const title = project.title || project.result?.designConcept?.title || "Untitled project";
              const firstRender = Array.isArray(project.renders) && project.renders.length > 0 && !imageErrors.has(project.id) ? project.renders[0] : null;
              const formattedDate = new Date(project.created_at).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });

              return (
                <div
                  key={project.id}
                  className="project-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => openProject(project)}
                  onKeyDown={(e) => { if (e.key === "Enter") openProject(project); }}
                >
                  <button
                    className="project-delete"
                    onClick={(e) => handleDeleteProject(e, project.id)}
                    title="Delete project"
                    aria-label="Delete project"
                  >
                    ✕
                  </button>
                  {firstRender ? (
                    <img
                      src={firstRender}
                      alt={title}
                      style={{ width: "100%", height: 200, objectFit: "cover", display: "block" }}
                      onError={() => setImageErrors((prev) => new Set(prev).add(project.id))}
                    />
                  ) : (
                    <div style={{ width: "100%", height: 200, background: "#FAF8F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span className="mono" style={{ fontSize: 10, color: "#D4C9B8", letterSpacing: "0.2em" }}>NO RENDER YET</span>
                    </div>
                  )}
                  <div style={{ padding: 20 }}>
                    <div className="serif" style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>{title}</div>
                    <div style={{ marginBottom: 10 }}>
                      <span className="badge">{project.category}</span>
                      <span className="badge">{project.budget}</span>
                    </div>
                    <div className="serif" style={{ fontSize: 16, color: "#C4A882", fontWeight: 600, marginBottom: 10 }}>
                      AED {total.toLocaleString()}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div className="mono" style={{ fontSize: 10, color: "#AAA", letterSpacing: "0.1em" }}>
                        {formattedDate}
                      </div>
                      <span className="btn-ghost" style={{ fontSize: 12, padding: "8px 18px" }}>View project</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
