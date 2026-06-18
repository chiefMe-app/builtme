# BuiltMe 🏠

**AI-powered home renovation configurator for the Dubai market.**  
Upload your room photo, pick a style, get a photorealistic render — in seconds.

🔗 **[Live Demo](https://builtme.vercel.app)**

---

## What It Does

Homeowners and renters in Dubai describe their renovation vision in a guided flow. BuiltMe uses AI to generate a photorealistic render of the renovated space — no architect, no site visit, no waiting.

1. **Upload** your room photo
2. **Select** renovation style + elements to change
3. **Generate** a photorealistic AI render (FLUX Kontext via fal.ai)
4. **Review** scope of work, timeline, and contractor recommendations
5. **Connect** with Dubai contractors matched to your budget

---

## Tech Stack

![Next.js](https://img.shields.io/badge/Next.js_14-black?style=flat&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-black?style=flat&logo=vercel)

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 App Router + TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (auth + project storage) |
| AI Renders | fal.ai — FLUX Kontext Pro/Max (img2img) |
| AI Vision | Anthropic Claude API (product extraction from reference images) |
| Deployment | Vercel |

---

## AI Architecture

The render pipeline uses **img2img with structure preservation**:

```
User room photo (reference)
↓
FLUX Kontext Pro/Max via fal.ai
↓
Style prompt: selected elements + materials + colors
↓
Photorealistic render — preserves room structure, replaces only selected elements
```

Claude Vision API extracts real product suggestions from 
inspiration images the user uploads — matching furniture, 
materials, and finishes to actual Dubai suppliers.

---

## Key Features

- **Multi-step configure flow** — user type, location, room upload, style selection
- **AI Renders tab** — style references → Claude Vision product extraction → fal.ai render
- **Scope of Work** — auto-generated timeline format from selected changes
- **Dubai contractor database** — matched by budget tier (economy / mid / luxury)
- **Prompt engineering** — structure-preserving prompts that change only selected elements

---

## Project Structure

```
app/
  configure/        → main flow (room upload → style → render)
  api/render/       → fal.ai FLUX Kontext call (server-side)
  api/extract/      → Claude Vision product extraction
components/
  RoomUploader      → drag & drop + preview
  StyleConfigurator → element selection UI
  RenderPreview     → AI image display with loading states
  ScopeOfWork       → timeline view
lib/
  prompts.ts        → prompt engineering logic
  supabase.ts       → database client
```

---

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

| Variable | Usage |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `FAL_KEY` | fal.ai API key (server-side only) |
| `ANTHROPIC_API_KEY` | Claude Vision API (server-side only) |

---

## Context

Built as part of a portfolio of AI products targeting the Dubai market.  
Demonstrates: prompt engineering, multi-modal AI APIs, 
img2img pipelines, full-stack Next.js, and domain-specific UX design.

> *"AI-first, user in control, all budgets, fast — no on-site visit required."*
