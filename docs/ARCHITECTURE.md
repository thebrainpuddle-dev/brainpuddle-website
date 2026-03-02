# BrainPuddle Website — Chief Architect Document

> **Scope:** Complete system understanding. Every layer. Every file. Every decision.
> **Audience:** Engineers, technical leads, architects joining or reviewing the codebase.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Repository Layout](#2-repository-layout)
3. [Technology Stack](#3-technology-stack)
4. [Architecture Layers](#4-architecture-layers)
   - 4.1 [Frontend — React SPA](#41-frontend--react-spa)
   - 4.2 [Edge / Routing Layer — Netlify](#42-edge--routing-layer--netlify)
   - 4.3 [Serverless Backend — Netlify Functions](#43-serverless-backend--netlify-functions)
   - 4.4 [Local Dev Backend — Express](#44-local-dev-backend--express)
   - 4.5 [Data Layer — D1 + R2 + local-store](#45-data-layer--d1--r2--local-store)
5. [Feature Deep Dives](#5-feature-deep-dives)
   - 5.1 [AI Score — Full End-to-End Flow](#51-ai-score--full-end-to-end-flow)
   - 5.2 [Share Card System](#52-share-card-system)
   - 5.3 [Physical Card Claim System](#53-physical-card-claim-system)
   - 5.4 [Remotion Video Pipeline](#54-remotion-video-pipeline)
6. [Data Models](#6-data-models)
7. [Security Architecture](#7-security-architecture)
8. [SEO Architecture](#8-seo-architecture)
9. [Analytics & Observability](#9-analytics--observability)
10. [Feature Flag System](#10-feature-flag-system)
11. [Shared Backend Library — `_lib/`](#11-shared-backend-library--_lib)
12. [Component Catalogue](#12-component-catalogue)
13. [Environment Variables Reference](#13-environment-variables-reference)
14. [Dev / Build / Deploy Workflow](#14-dev--build--deploy-workflow)
15. [Architectural Observations & Known Gaps](#15-architectural-observations--known-gaps)
16. [System Diagram](#16-system-diagram)

---

## 1. Executive Summary

**BrainPuddle** is an applied AI studio web presence and SaaS product built on a **React 19 + TypeScript SPA** deployed via **Netlify**, backed by **Netlify Functions** (TypeScript serverless) in production and a local **Express 5** server in development.

The product flagship is the **AI Resilience Score** — a gamified professional profile analyzer that:
- Accepts LinkedIn URLs, PDF resumes, or raw text bios
- Scrapes LinkedIn via Relevance AI webhooks
- Runs GPT-4o structured analysis to produce a "Pokémon card" style replaceability report
- Generates card artwork via Black Forest Labs Flux Pro 1.1 image generation
- Captures the physical card via `html2canvas` dual-side render
- Persists share links to Cloudflare R2 + D1, with OG-tag-rich social previews
- Offers a limited-edition physical holographic card mail delivery (100 total)
- Tracks all operations through PostHog analytics

Supporting pages market four services: Voice Agents, AI Consultation, Content Creation, and LearnPuddle.

The architecture prioritizes **zero-infrastructure hosting** (Netlify + Cloudflare edge), **developer velocity**, and **graceful degradation** (every cloud integration has a working local fallback).

---

## 2. Repository Layout

```
Website/
├── index.html                    # Root HTML shell for Vite SPA
├── package.json                  # Node deps (React 19, Vite 7, Remotion, Three.js, etc.)
├── vite.config.ts                # Vite bundler + dev proxy rules
├── tsconfig.json                 # Project-reference root
├── tsconfig.app.json             # App compilation (ES2022, strict)
├── tsconfig.node.json            # Config file compilation (vite.config.ts)
├── eslint.config.js              # Flat ESLint config (TS + React Hooks + React Refresh)
├── netlify.toml                  # Netlify build, redirects, Node version
├── remotion.config.ts            # Remotion video codec settings
├── server.js                     # Local Express dev server (1,027 lines)
├── bfl.json                      # BFL API OpenAPI spec (reference)
├── bfl_schemas.json              # BFL schema definitions
├── check-bfl.js                  # Script to list BFL API endpoints
│
├── src/
│   ├── main.tsx                  # React 19 entry — StrictMode + BrowserRouter
│   ├── App.tsx                   # Route tree + global state (theme, modal)
│   ├── index.css                 # Global CSS custom properties + base styles
│   ├── App.css                   # App-scoped styles
│   ├── assets/
│   │   └── react.svg
│   ├── lib/
│   │   ├── analytics.ts          # PostHog init + trackEvent + trackPageView
│   │   ├── features.ts           # Feature flags (claimForm, persistentShare, opsDash)
│   │   └── seo.ts                # Per-route SEO config + DOM mutation helpers
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── VoiceAgentsPage.tsx
│   │   ├── ConsultationPage.tsx
│   │   ├── ContentCreationPage.tsx
│   │   ├── AiScorePage.tsx       # Primary product page — full wizard
│   │   ├── AiScoreSharedPage.tsx # Shared result view
│   │   └── OpsDashboardPage.tsx  # Internal admin (feature-flagged)
│   └── components/
│       ├── Navigation.tsx
│       ├── HeroSection.tsx
│       ├── AboutSection.tsx
│       ├── ClientsSection.tsx
│       ├── FloatingCards.tsx
│       ├── BubbleCursor.tsx
│       ├── Footer.tsx
│       ├── TalkToUsButton.tsx    # Floating rotating CTA button
│       ├── ContactModal.tsx      # Contact form → formsubmit.co
│       ├── FullScreenMenu.tsx
│       ├── TurnstileWidget.tsx   # Cloudflare Turnstile CAPTCHA wrapper
│       └── ai-score/
│           ├── ScoreReport.tsx   # Animated gauge + category bars
│           ├── PokemonCard.tsx   # 3D flip card with color extraction
│           └── ClaimPhysicalCard.tsx  # Physical card delivery form
│
├── netlify/functions/
│   ├── _lib/                     # Shared serverless utilities
│   │   ├── env.ts                # getEnv, getRequiredEnv, resolveSiteOrigin
│   │   ├── utils.ts              # nowIso, makeId, getClientIp, clampScore, etc.
│   │   ├── hash.ts               # sha256, getLinkedInSlug, maskLinkedIn
│   │   ├── crypto.ts             # AES-256-GCM encrypt/decrypt
│   │   ├── r2.ts                 # Cloudflare R2 (S3-compat) upload/download
│   │   ├── d1.ts                 # Cloudflare D1 SQL over HTTP API
│   │   ├── local-store.ts        # In-memory fallback store (globalThis)
│   │   ├── ratelimit.ts          # Window-based rate limiting (D1 + local)
│   │   └── turnstile.ts          # Cloudflare Turnstile verification
│   ├── analyze.ts                # POST /api/analyze — GPT-4o profile analysis
│   ├── generate-card.ts          # POST /api/generate-card — Flux image gen
│   ├── ai-run.ts                 # POST /api/ai-run — persist run metadata
│   ├── share-card-create.ts      # POST /api/share-card/create
│   ├── share-card.ts             # GET /api/share-card (legacy)
│   ├── share-resolve.ts          # GET /s/:id — OG tag + redirect HTML
│   ├── shared-card.ts            # GET /api/shared-card?id=
│   ├── share-image.ts            # GET /api/share-image?id= — R2 proxy
│   ├── upload-image.ts           # POST /api/upload-image — freeimage.host
│   ├── claim-card.ts             # POST /api/claim-card
│   ├── claim-counter.ts          # GET /api/claim-counter
│   └── ops-metrics.ts            # GET /api/ops-metrics (admin)
│
├── remotion/
│   ├── index.ts                  # Remotion registerRoot
│   ├── Root.tsx                  # 5 video compositions (30fps, 1920×1080)
│   ├── Trailer.tsx
│   ├── LaunchFilm.tsx
│   ├── BrandFilm.tsx
│   ├── TechIntro.tsx
│   ├── ChaosFilm.tsx
│   ├── styles/typography.css
│   └── components/
│       ├── FadeInText.tsx
│       ├── LetterRiseFade.tsx
│       ├── CharacterStagger.tsx
│       ├── TypewriterText.tsx
│       ├── MultiLineReveal.tsx
│       ├── ZoomGrowText.tsx
│       ├── VideoScene.tsx
│       └── EndFrame.tsx
│
├── docs/                         # Runbooks and this document
├── public/                       # Static assets served at root
├── infra/                        # Infrastructure-as-code (unversioned details)
├── out/                          # Remotion render output
└── videos/                       # Produced video files
```

---

## 3. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Frontend framework | React | 19.2.0 | UI rendering |
| Language | TypeScript | ~5.9.3 | Type safety (strict mode) |
| Routing | React Router DOM | 7.13.1 | SPA navigation |
| Build tool | Vite | 7.2.4 | Bundler + HMR |
| Animations | Framer Motion | 12.29.2 | Declarative motion |
| 3D graphics | Three.js | 0.182.0 | 3D scene rendering |
| Analytics | PostHog JS | 1.269.1 | Product telemetry |
| CAPTCHA | Cloudflare Turnstile | (widget) | Bot protection |
| Canvas capture | html2canvas | (latest) | Card image export |
| HTTP client | Axios | 1.13.6 | API calls in functions |
| Server (local) | Express | 5.2.1 | Local dev API |
| Serverless | Netlify Functions | (Netlify) | Production API |
| Database | Cloudflare D1 | (CF API) | Persistent SQLite at edge |
| Object storage | Cloudflare R2 | (S3 SDK) | Card image hosting |
| AI analysis | OpenAI GPT-4o | (API) | Profile analysis |
| Image generation | BFL Flux Pro 1.1 | (API) | Card artwork |
| LinkedIn scraping | Relevance AI | (webhook) | Profile extraction |
| Video rendering | Remotion | 4.0.414 | Programmatic videos |
| Deployment | Netlify | (CI/CD) | Hosting + functions |
| CDN / Security | Cloudflare | (proxied) | DDoS, Turnstile |

---

## 4. Architecture Layers

### 4.1 Frontend — React SPA

**Entry point chain:**
```
index.html
  └── /src/main.tsx          StrictMode + BrowserRouter
        └── App.tsx           Routes + global state
              ├── Navigation
              ├── TalkToUsButton (floating)
              ├── ContactModal
              ├── ScrollToTop (side-effect: SEO + analytics per route)
              ├── <Routes>
              │     ├── /                → HomePage
              │     ├── /voice-agents    → VoiceAgentsPage
              │     ├── /consultation    → ConsultationPage
              │     ├── /content-creation → ContentCreationPage
              │     ├── /ai-score        → AiScorePage
              │     ├── /ai-score/shared → AiScoreSharedPage
              │     ├── /ai-score/shared/:payload → AiScoreSharedPage
              │     └── /internal/ops   → OpsDashboardPage (feature-flagged)
              └── Footer
```

**Global state in App.tsx** (shallow, no external store needed):
- `dark: boolean` — theme mode, persisted via `data-theme` attribute on `<html>`
- `contactOpen: boolean` — contact modal visibility

**ScrollToTop** is a null-rendering side-effect component that fires on every `pathname` change:
1. `window.scrollTo(0, 0)` — scroll reset
2. `trackPageView(pathname)` — PostHog custom event
3. `applySeoForPath(pathname)` — DOM meta tag update

**Theme system:** CSS custom properties (`--text-primary`, `--bg-dark`, `--accent-color`, `--glass-border`) toggled by `data-theme="dark|light"` on `document.documentElement`. No runtime CSS-in-JS overhead.

**Design language:** Glass morphism — `backdrop-filter: blur()`, translucent backgrounds, thin borders, responsive grids with `clamp()` for fluid typography/spacing.

---

### 4.2 Edge / Routing Layer — Netlify

`netlify.toml` defines all redirect rules evaluated before the SPA hits:

```toml
# Serverless function mounts
/api/share-card/create  →  /.netlify/functions/share-card-create  [200]
/api/*                  →  /.netlify/functions/:splat              [200]
/s/*                    →  /.netlify/functions/share-resolve?id=:splat [200]

# PostHog adblock bypass (reverse proxy)
/ingest/static/*        →  https://us-assets.i.posthog.com/static/:splat [200]
/ingest/*               →  https://us.i.posthog.com/:splat              [200]

# SPA catch-all (must be last)
/*                      →  /index.html                                   [200]
```

**Key architectural decisions:**
- `/s/:shareId` is handled at the edge, not the SPA — the function generates OG-tag-rich HTML (for social crawlers) then redirects browsers to `/ai-score/shared/:shareId`
- PostHog is reverse-proxied through `/ingest/*` to survive ad blockers
- The SPA catch-all ensures deep-link refreshes work without 404s
- `bun run build` is the build command (Bun-compatible despite npm lockfile)

---

### 4.3 Serverless Backend — Netlify Functions

Each function in `netlify/functions/` is an independent Lambda-style handler with signature:
```typescript
export const handler: Handler = async (event, context) => { ... }
```

**Function registry:**

| Function file | Route (via netlify.toml) | Method | Purpose |
|---|---|---|---|
| `analyze.ts` | `POST /api/analyze` | POST | GPT-4o profile analysis |
| `generate-card.ts` | `POST /api/generate-card` | POST | Flux image generation |
| `ai-run.ts` | `POST /api/ai-run` | POST | Persist analysis run metadata |
| `share-card-create.ts` | `POST /api/share-card/create` | POST | Create persistent share |
| `share-resolve.ts` | `GET /s/:id` | GET | OG-tag HTML + redirect |
| `shared-card.ts` | `GET /api/shared-card` | GET | Retrieve card by ID |
| `share-image.ts` | `GET /api/share-image` | GET | Proxy R2 image |
| `share-card.ts` | `GET /api/share-card` | GET | Legacy share endpoint |
| `upload-image.ts` | `POST /api/upload-image` | POST | Upload to freeimage.host |
| `claim-card.ts` | `POST /api/claim-card` | POST | Physical card claim |
| `claim-counter.ts` | `GET /api/claim-counter` | GET | Inventory status |
| `ops-metrics.ts` | `GET /api/ops-metrics` | GET | Admin dashboard data |

**Graceful degradation pattern** (used in every function):
```typescript
if (!isD1Configured()) {
    // Use in-memory localStore (works locally, resets on cold start)
    return localStoreFallback();
}
// Use Cloudflare D1 (persistent, distributed)
return d1Production();
```

---

### 4.4 Local Dev Backend — Express

`server.js` (1,027 lines) mirrors all Netlify function behavior in a single Express server running on `:3001`. Vite proxies `/api/*` and `/s/*` to it during development.

**Why a separate local server?** Netlify Functions can't be run locally without `netlify dev`. The Express server provides identical API surface without CLI dependency. This is the main architectural trade-off: **logic duplication** between `server.js` and `netlify/functions/`.

The server includes:
- **PDF parsing** via `pdf-parse`
- **LinkedIn scraping** via Relevance AI webhook
- **OpenAI GPT-4o** analysis with JSON mode
- **Flux polling loop** (20 attempts × 2s)
- **Freeimage.host** upload fallback
- **Cloudflare R2** image upload
- **Turnstile** verification
- **AES-256-GCM** encryption for claims
- **In-memory rate limiting** and ops store

---

### 4.5 Data Layer — D1 + R2 + local-store

**Cloudflare D1** (SQLite at edge, accessed via HTTP REST API):

Tables (inferred from SQL in functions):
```sql
-- AI analysis runs
CREATE TABLE ai_runs (
    id TEXT PRIMARY KEY,
    created_at TEXT,
    input_type TEXT,
    linkedin_slug TEXT,
    linkedin_hash TEXT,
    input_char_count INTEGER,
    score INTEGER,
    tier TEXT,
    analysis_latency_ms INTEGER,
    image_source TEXT,
    share_clicked INTEGER DEFAULT 0
);

-- Persistent share cards
CREATE TABLE shared_cards (
    id TEXT PRIMARY KEY,
    created_at TEXT,
    ai_run_id TEXT,
    name TEXT,
    title TEXT,
    score INTEGER,
    tier TEXT,
    r2_object_key TEXT,
    public_image_url TEXT,
    expires_at TEXT
);

-- Physical card claim submissions
CREATE TABLE claim_submissions (
    id TEXT PRIMARY KEY,
    created_at TEXT,
    full_name_enc TEXT,       -- AES-256-GCM encrypted
    delivery_address_enc TEXT, -- AES-256-GCM encrypted
    linkedin_slug TEXT,
    linkedin_hash TEXT,        -- SHA256 of slug
    ai_run_id TEXT,
    ip_hash TEXT,              -- SHA256 of IP
    ua_hash TEXT,              -- SHA256 of user-agent
    status TEXT                -- 'accepted' | 'sold_out'
);

-- Physical card inventory (singleton row)
CREATE TABLE inventory (
    key TEXT PRIMARY KEY,      -- 'physical_card'
    total INTEGER,
    claimed INTEGER,
    remaining INTEGER,
    updated_at TEXT
);

-- Rate limit sliding windows
CREATE TABLE rate_limits (
    key TEXT PRIMARY KEY,      -- 'endpoint:ipHash:windowStart'
    count INTEGER,
    window_start TEXT,
    updated_at TEXT
);
```

**Cloudflare R2** (S3-compatible object storage):
- Client: `@aws-sdk/client-s3` with `forcePathStyle: true` and `region: 'auto'`
- Objects stored at path: `ai-cards/{shareId}.{png|jpg|webp}`
- Cache-Control: `public, max-age=31536000, immutable`
- Falls back to returning the raw data URL if R2 not configured

**local-store.ts** (development fallback):
```typescript
// Singleton pattern via globalThis to survive hot reload
const g = globalThis as typeof globalThis & { __brainPuddleLocalStore?: LocalStoreState };
if (!g.__brainPuddleLocalStore) {
    g.__brainPuddleLocalStore = {
        inventory: { total: 100, claimed: 0, remaining: 100 },
        sharedCards: new Map(),
        claims: [],
        aiRuns: [],
        rateLimits: new Map()
    };
}
export const localStore = g.__brainPuddleLocalStore;
```

---

## 5. Feature Deep Dives

### 5.1 AI Score — Full End-to-End Flow

**State machine** (AiScorePage.tsx):
```
'input' → 'analyzing' → 'results'
      ↑___(on error, 3s delay)_____|
```

**Step 1: Input capture**

Three mutually exclusive inputs (selecting one grays out others):
- **LinkedIn URL** — `type="url"`, `inputUrl` state
- **Raw text/bio** — `<textarea>`, `rawText` state
- **PDF upload** — drag-drop zone OR `<input type="file">`, `resumeFile` state
- Optional: **profile photo** for gamified card art, stored as `imagePreview` (base64)

**Step 2: Analysis request** (`handleScan`)

```typescript
// PDF → base64 via FileReader
const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(resumeFile);
});

// POST /api/analyze
const response = await fetch('/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ type: 'pdf' | 'url' | 'text', data })
});
```

Race condition guard: `scanRequestIdRef` (monotonic counter) ensures stale responses from abandoned requests are discarded.

**Step 3: Backend analysis** (`netlify/functions/analyze.ts`)

```
type='url'
  → RELEVANCE_WEBHOOK_URL configured?
    YES → POST to Relevance AI → LinkedIn profile text (25s timeout)
    NO  → buildLinkedInFallbackText() (slug-based inference)
  → text truncated to 15,000 chars

type='pdf'
  → [PDF decoded server-side in server.js via pdf-parse]
  → text extracted

type='text'
  → raw text used directly

OPENAI_API_KEY configured?
  YES → GPT-4o with JSON mode, structured prompt → AnalysisResult JSON
  NO  → generateAnalysis() mock (special case: 'karthik-guduru' slug → Irreplaceable tier)
```

**GPT-4o prompt design:**
- System prompt only (no user message)
- `response_format: { type: "json_object" }` for guaranteed valid JSON
- Explicit schema with field-level instructions
- Anti-hallucination note for URL-only inputs
- Gender-neutral pronoun requirement for pokedex entries

**Step 4: Image generation** (parallel, non-blocking)

```typescript
// Runs in background after analysis returns, updates card when ready
generateCardImage(apiData, imagePreview, requestId, trackedRunId);
```

```
imagePromptBase64 provided (user uploaded)?
  → Return it directly

BFL_API_KEY configured?
  → POST to https://api.bfl.ai/v1/flux-pro-1.1
     prompt: "Typography art, bold cool initials '{XX}'. Studio Ghibli inspired..."
     width: 768, height: 1024, output_format: "jpeg"
  → Poll pollingUrl (20 attempts × 2s = 40s max)
  → Fetch result as arraybuffer → base64 encode
  → Return data:image/jpeg;base64,...

No BFL key?
  → buildInitialsFallbackImage() → SVG with initials, base64 encoded
```

**Step 5: PokemonCard rendering**

`PokemonCard.tsx` uses `forwardRef` (ref needed by parent for canvas capture).

Color extraction algorithm:
```typescript
// Sample 4 quadrant pixels from loaded photoUrl
// Convert RGB → HSL
// Force vibrant: saturation ≥ 0.75, lightness ≥ 0.65
// Apply to stat bars per quadrant
setStatColors([q1Color, q2Color, q3Color, q4Color]);
```

Card flip: Framer Motion `rotateY: 0 → 180`, `transformStyle: 'preserve-3d'`

**Step 6: Dual-side capture** (`captureBothSides`)

```typescript
// Temporarily set transform: 'none' on both faces
const frontCanvas = await html2canvas(frontEl, { useCORS: true, scale: 2 });
const backCanvas  = await html2canvas(backEl,  { useCORS: true, scale: 2 });

// Composite: [padding][front][40px gap][back][padding]
const canvas = document.createElement('canvas');
canvas.width  = front.width + back.width + 40 + 80;
canvas.height = Math.max(front.height, back.height) + 80;
ctx.fillStyle = '#F9F9F9';
ctx.drawImage(frontCanvas, 40, 40);
ctx.drawImage(backCanvas,  40 + frontCanvas.width + 40, 40);
```

**Step 7: AI Run persistence** (`POST /api/ai-run`)

Fires after analysis, before showing results. Stores:
- inputType, linkedinSlug (hashed), inputCharCount
- score, tier, analysisLatencyMs, imageSource
- Returns `aiRunId` for downstream linking (shares, claims)

---

### 5.2 Share Card System

**Trigger:** User clicks "Share on LinkedIn" button.

**Full flow:**
```
1. captureBothSides() → composite PNG canvas
2. canvas.toBlob() → File object (for native share API)
3. featureFlags.persistentShare?
   YES →
     POST /api/share-card/create {
       aiRunId, name, title, score, tier,
       cardImageBase64 (data URL)
     }
     → Rate limit: 20/10min per IP (D1 or local)
     → Turnstile verification
     → uploadCardImage() to R2 → objectKey + publicUrl
     → INSERT INTO shared_cards → returns shareId
     → shareUrl = origin + '/s/' + shareId
   NO → shareUrl = window.location.origin + '/ai-score'

4. Build shareText:
   "I just checked my AI Resilience Score on BrainPuddle.
    Replaceability Index: {score}/100
    Tier: {tier}
    Check yours: {shareUrl}"

5. Copy to clipboard (optional, silent fail)

6. navigator.share available + canShare files?
   YES → native share sheet with file + text + url
   NO  → window.open(linkedInShareUrl, '_blank')
       where linkedInShareUrl = linkedin.com/feed/?shareActive=true&text=...
```

**Social preview chain** (for crawlers):
```
/s/{shareId}
  → share-resolve.ts function
  → Look up shared_cards in D1 (or localStore)
  → Return HTML with:
      <meta property="og:title" content="{name} | BrainPuddle AI Score" />
      <meta property="og:image" content="{origin}/api/share-image?id={shareId}" />
      <meta http-equiv="refresh" content="0; url=/ai-score/shared/{shareId}" />
      <script> window.location.replace('/ai-score/shared/{shareId}') </script>
  → Crawlers see OG tags → browsers redirect instantly

/api/share-image?id={shareId}
  → share-image.ts function
  → downloadCardImage(objectKey) from R2
  → Returns binary image with Content-Type + Cache-Control headers
```

**AiScoreSharedPage resolution priority:**
1. URL param `:payload` → base64 decode (legacy)
2. `GET /api/shared-card?id=` → full card data from D1
3. Search params fallback

---

### 5.3 Physical Card Claim System

**Inventory model:** 100 physical holographic cards. First-come, first-served.

**Component:** `ClaimPhysicalCard.tsx`

**Mount behavior:**
- Fetches `GET /api/claim-counter` immediately to show "X Available" badge
- Tracks `claim_form_viewed` PostHog event

**Submission flow:**
```
POST /api/claim-card {
  fullName, linkedinUrl, deliveryAddress,
  aiRunId, turnstileToken
}

Backend (claim-card.ts):
  1. Extract + validate required fields
  2. Extract clientIp from x-forwarded-for header
  3. getLinkedInSlug(linkedinUrl) → slug (lowercase)
  4. sha256(slug) → linkedinHash (stored, not slug)
  5. sha256(clientIp) → ipHash
  6. sha256(userAgent) → uaHash
  7. checkRateLimit('claim-card:{ipHash}', 6, 600) → max 6 per 10 min
  8. verifyTurnstileToken(token, clientIp)
  9. D1 configured?
     YES:
       ensureInventoryRow() — INSERT OR IGNORE singleton
       UPDATE inventory SET remaining = remaining - 1
         WHERE remaining > 0
         RETURNING remaining
       → 0 rows returned = SOLD_OUT (409)
       INSERT INTO claim_submissions (... status='accepted|sold_out')
       → AES-256-GCM encrypt fullName + deliveryAddress before INSERT
     NO:
       Check localStore.inventory.remaining
       Decrement in memory
  10. Return { claimId, remainingCount }
```

**Privacy design:**
- PII (name, address) encrypted with AES-256-GCM before DB storage
- LinkedIn URL stored only as lowercase slug + SHA256 hash
- IP stored only as SHA256 hash
- User-agent stored only as SHA256 hash
- Admin ops-metrics shows masked LinkedIn: `jo***hn` pattern

---

### 5.4 Remotion Video Pipeline

**5 compositions** registered in `remotion/Root.tsx`:

| Composition | Duration | FPS | Resolution |
|---|---|---|---|
| Trailer | 600 frames (20s) | 30 | 1920×1080 |
| LaunchFilm | 600 frames (20s) | 30 | 1920×1080 |
| BrandFilm | 600 frames (20s) | 30 | 1920×1080 |
| ChaosFilm | 600 frames (20s) | 30 | 1920×1080 |
| TechIntro | 480 frames (16s) | 30 | 1920×1080 |

**Reusable animation components:**

| Component | Effect |
|---|---|
| `FadeInText` | Opacity 0→1 with configurable delay/duration |
| `LetterRiseFade` | Each letter rises and fades individually |
| `CharacterStagger` | Character-by-character stagger entrance |
| `TypewriterText` | Classic terminal typewriter reveal |
| `MultiLineReveal` | Masked multi-line reveal |
| `ZoomGrowText` | Scale + opacity entrance |
| `VideoScene` | Scene container with timing |
| `EndFrame` | End screen with branding |

**Codec config** (`remotion.config.ts`):
```typescript
Config.setImageFormat("jpeg");
Config.setCodec("h264");
Config.setOverwriteOutput(true);
```

**Scripts:**
- `npm run remotion:studio` — visual editor at localhost:3000
- `npm run remotion:render` — headless H.264 MP4 render to `out/`

---

## 6. Data Models

### AnalysisResult (frontend TypeScript interface)
```typescript
interface AnalysisResult {
    score: number;           // 0-100, HIGHER = more replaceable
    tier: string;            // e.g. "🛡️ AI-Resistant"
    tierColor: string;       // hex color for tier badge
    categories: {
        name: string;        // "Creative Strategy" | "Technical Depth" | etc.
        score: number;       // 0-100
        max: number;         // always 100
    }[];
    xp: number;              // evolution progress 0-100
    levelUpSuggestions?: string[];
    pokemon: {
        name: string;        // real name extracted from profile
        title: string;       // catchy professional title (max 4 words)
        photoUrl: string;    // Flux-generated or user-uploaded, base64
        type: string;        // "Creative" | "Engineering" | "Strategy" | "Visionary"
        stage: string;       // "Basic Level" | "Master Level"
        hp: number;          // 100-300
        skills: string[];    // top 4 skills (shown on card front)
        stats: {
            cognitiveDepth: number;      // 0-100
            decisionAutonomy: number;    // 0-100
            adaptability: number;        // 0-100
            systemLeverage: number;      // 0-100
        };
        primaryDomain: string;
        operatingMode: string;
        humanLeverage: "High" | "Medium" | "Low";
        powerUps: { name: string; desc: string }[];  // 2 power-up moves
        pokedexEntry: string;   // 2-3 sentence fun description
    };
}
```

### ScoreReport Props
```typescript
interface ScoreReportProps {
    score: number;      // replaceability index
    tier: string;
    tierColor: string;
    categories: { name: string; score: number; max: number }[];
    xp: number;         // 0-100, progress to next tier
}
```

Score color thresholds:
- `< 40` → `#4caf50` (green) "Safe"
- `< 70` → `#ffeb3b` (yellow) "At Risk"
- `≥ 70` → `#f44336` (red) "Replaceable"

### SharedCard (D1 + local-store)
```typescript
type SharedCard = {
    id: string;           // sh_XXXXXXXXX
    createdAt: string;    // ISO timestamp
    aiRunId: string | null;
    name: string;
    title: string;
    score: number;        // clamped 0-100
    tier: string;
    imageUrl: string;     // R2 public URL or data URL fallback
    expiresAt: string;    // createdAt + RETENTION_DAYS (default 180)
};
```

### ClaimSubmission (D1 + local-store)
```typescript
type ClaimSubmission = {
    id: string;               // claim_XXXXXXXXX
    createdAt: string;
    linkedinSlug: string;     // lowercase slug only
    linkedinHash: string;     // SHA256
    aiRunId: string | null;
    status: 'accepted' | 'sold_out';
    // In D1 only (encrypted):
    // full_name_enc, delivery_address_enc, ip_hash, ua_hash
};
```

### AiRun (D1 + local-store)
```typescript
type AiRun = {
    id: string;               // run_XXXXXXXXX
    createdAt: string;
    inputType: string;        // 'url' | 'pdf' | 'text'
    linkedinSlug: string;
    linkedinHash: string;
    inputCharCount: number;
    score: number;
    tier: string;
    analysisLatencyMs: number;
    imageSource: string;      // 'user_upload' | 'generated' | 'unknown'
    shareClicked: number;     // 0 | 1 (boolean in SQLite)
};
```

---

## 7. Security Architecture

### CAPTCHA — Cloudflare Turnstile
Applied to: `POST /api/share-card/create` and `POST /api/claim-card`

**Frontend:** `TurnstileWidget.tsx` — creates a `<div>`, injects Cloudflare JS SDK script if not present, calls `window.turnstile.render()`, exposes token via `onTokenChange` callback.

**Backend:** `_lib/turnstile.ts` — POST to `challenges.cloudflare.com/turnstile/v0/siteverify` with secret key + token + remoteIp. Returns `{ success, skipped, errors }`. **Graceful degradation:** if `TURNSTILE_SECRET_KEY` is not set, `skipped: true` is returned and the request proceeds (useful in local dev).

### Rate Limiting
Two endpoints protected:
- `share-card-create`: 20 requests per 10-minute window per IP
- `claim-card`: 6 requests per 10-minute window per IP (SHA256 of IP)

Rate limit key format: `{endpoint}:{ipOrHash}:{windowStartTimestamp}`

Storage: Cloudflare D1 with `ON CONFLICT DO UPDATE SET count = count + 1` (atomic), or in-memory Map for local dev.

### Encryption — AES-256-GCM
Applied to: `fullName` and `deliveryAddress` in claim submissions.

```
Key normalization:
  If hex string (64 chars) → Buffer.from(hex)
  If base64 (32 bytes)     → Buffer.from(base64)
  Else                     → SHA256 hash (deterministic 32-byte key from string)

Encryption output format: {iv_base64url}.{authTag_base64url}.{ciphertext_base64url}
IV: 12 bytes (crypto.randomBytes)
Auth tag: 16 bytes (GCM default)
```

### Privacy Hashing
All identifiers stored in hashed form:
- LinkedIn slugs → SHA256 hex
- IP addresses → SHA256 hex
- User agents → SHA256 hex

No raw PII stored in analytics tables. Only encrypted in claim submissions (accessible only with `CLAIMS_ENCRYPTION_KEY`).

### Input Validation
- `clampScore()` — enforces 0-100 range for all score fields
- `escapeHtml()` — XSS prevention in OG tag HTML generation
- JSON body parsing wrapped in try/catch (`parseJsonBody<T>`)
- Required fields validated with explicit error responses

### Admin Protection
`ops-metrics.ts` checks `ADMIN_DASH_TOKEN` environment variable against:
- `x-admin-token` header
- `authorization: Bearer {token}` header
- `?token=` query parameter

If `ADMIN_DASH_TOKEN` not set → auth bypassed (open access in dev).

---

## 8. SEO Architecture

### Static SEO (index.html)
Base metadata in HTML for crawler cold-start:
- `<title>`, `<meta name="description">`, `<meta name="robots">`
- OG tags: `og:type`, `og:title`, `og:description`, `og:url`, `og:image`
- Twitter card: `summary_large_image`
- `<link rel="canonical">`

### Dynamic SEO (src/lib/seo.ts)
`applySeoForPath(pathname)` is called by `ScrollToTop` on every route change:

```typescript
// For each page, upserts (creates or updates) all meta tags:
upsertMetaTag('name', 'description', config.description);
upsertMetaTag('property', 'og:title', config.title);
upsertCanonical(config.canonical);
replaceStructuredData(config.schema || []);
```

**Route → SEO mapping:**

| Route | Title suffix | Robots | Schema |
|---|---|---|---|
| `/` | "Applied AI Studio..." | index,follow | Organization + WebSite |
| `/voice-agents` | "AI Voice Agents..." | index,follow | Organization + Service |
| `/consultation` | "AI Consultation..." | index,follow | Organization + Service |
| `/content-creation` | "AI Content Engine..." | index,follow | Organization + Service |
| `/ai-score` | "AI Resilience Score..." | index,follow | Organization + FAQPage |
| `/ai-score/shared*` | "Shared AI Score..." | index,follow | Organization |
| `/internal/*` | "Internal Ops Dashboard" | noindex,nofollow | Organization |

### Structured Data (JSON-LD)
- **Organization** — always present on all pages
- **WebSite** — home page
- **Service** — service pages (Voice Agents, Consultation, Content)
- **FAQPage** — AI Score page with 3 Q&A pairs

Scripts injected with `data-brainpuddle-seo-schema="true"` attribute for clean replacement on route change (avoids duplicates).

### Social Share OG (share-resolve.ts)
Per-share OG tags generated server-side:
```
og:title       → "{name} | BrainPuddle AI Score"
og:description → "{name} ({title}) scored {score}/100 Replaceability Index..."
og:image       → "{origin}/api/share-image?id={shareId}"  ← proxied from R2
```

---

## 9. Analytics & Observability

### PostHog Integration (src/lib/analytics.ts)

**Init:** Lazy singleton — `initAnalytics()` only runs once, skips if `VITE_POSTHOG_KEY` is not set.

**Configuration:**
```typescript
posthog.init(key, {
    api_host: isLocal ? directPostHogHost : '/ingest',  // adblock bypass in prod
    defaults: '2025-05-24',           // preset bundle
    capture_pageview: 'history_change', // SPA-aware
    capture_pageleave: true,
    autocapture: true,                // button clicks, form submissions
    capture_performance: true,        // LCP, CLS, INP
    person_profiles: 'identified_only'
});
```

**Custom events tracked:**

| Event | Triggered by | Properties |
|---|---|---|
| `page_view` | ScrollToTop (every route) | `path` |
| `nav_click` | Navigation links | `tab`, `mobile` |
| `ai_scan_submitted` | handleScan | `inputType`, `hasImage` |
| `ai_scan_succeeded` | After analysis | `inputType`, `score`, `tier`, `aiRunId` |
| `ai_scan_failed` | On error | `reason` |
| `ai_card_generated` | Image gen success | `aiRunId`, `source` |
| `ai_card_generation_failed` | Image gen error | `aiRunId`, `reason` |
| `ai_card_downloaded` | Download button | `aiRunId` |
| `ai_card_download_failed` | Download error | `aiRunId`, `reason` |
| `ai_share_clicked` | Share button | `aiRunId` |
| `ai_share_created` | Persistent share created | `aiRunId`, `shareUrl` |
| `ai_share_failed` | Share error | `aiRunId`, `error` |
| `claim_form_viewed` | ClaimPhysicalCard mount | `aiRunId` |
| `claim_form_submitted` | Form submit | `aiRunId` |
| `claim_form_success` | Successful claim | `aiRunId` |
| `claim_form_failed` | Claim error | `aiRunId`, `reason` |
| `claim_form_sold_out` | SOLD_OUT response | `aiRunId` |

### Ops Dashboard (OpsDashboardPage + ops-metrics.ts)
Token-authenticated internal view showing:
- Counters: AI Runs, Shares Created, Claims Accepted, Cards Remaining
- Recent 20 claims (masked LinkedIn)
- Recent 20 shares (name, score, tier)
- External links to Google Search Console, Bing Webmaster Tools, PostHog

---

## 10. Feature Flag System

`src/lib/features.ts` — build-time flags read from Vite env variables:

```typescript
export const featureFlags = {
    claimForm: parseFlag(VITE_FEATURE_CLAIM_FORM, true),
    persistentShare: parseFlag(VITE_FEATURE_PERSISTENT_SHARE, true),
    opsDash: parseFlag(VITE_FEATURE_OPS_DASH, true)
};
```

`parseFlag` accepts: `'1'|'true'|'yes'|'on'` → true, `'0'|'false'|'no'|'off'` → false.

All three default to `true` (features on by default).

**Usage:**
- `featureFlags.claimForm` — controls `ClaimPhysicalCard` rendering in results
- `featureFlags.persistentShare` — controls whether share links are persisted to D1/R2 vs. just opening LinkedIn
- `featureFlags.opsDash` — controls `/internal/ops` route availability

---

## 11. Shared Backend Library — `_lib/`

The `netlify/functions/_lib/` directory contains 8 TypeScript modules that are imported by all function handlers. All are pure functions with no shared mutable state (except `local-store.ts` which deliberately uses globalThis for dev persistence).

### env.ts
```typescript
getEnv(key: string): string          // process.env[key]?.trim() || ''
getRequiredEnv(key: string): string  // throws if missing
resolveSiteOrigin(headers?): string  // PUBLIC_SITE_URL || x-forwarded-proto+host
```

### utils.ts
```typescript
nowIso(): string          // new Date().toISOString()
makeId(prefix): string    // `${prefix}_${crypto.randomBytes(9).toString('base64url')}`
getClientIp(headers): string  // x-forwarded-for first IP || client-ip
clampScore(value): number     // NaN→50, else clamp(0, 100, round)
parseJsonBody<T>(raw): T      // safe JSON.parse with {} fallback
escapeHtml(value): string     // &<>"' entities
```

### hash.ts
```typescript
sha256(value: string): string          // hex digest
getLinkedInSlug(url: string): string   // extracts /in/{slug} (case-insensitive, lowercase)
maskLinkedIn(slug: string): string     // jo***hn pattern
```

### crypto.ts
```typescript
encryptText(value: string): string   // AES-256-GCM, returns iv.tag.cipher (base64url)
decryptText(payload: string): string // reverse
```

Key normalization: hex-64 → hex Buffer, base64-32 → base64 Buffer, else SHA256 hash.

### r2.ts
```typescript
isR2Configured(): boolean              // all 5 CF_R2_* env vars present
uploadCardImage(dataUrl, shareId): { objectKey, publicUrl }
downloadCardImage(objectKey): { body: Buffer, contentType, cacheControl }
```

Falls back to returning the data URL as `publicUrl` if R2 not configured.

### d1.ts
```typescript
isD1Configured(): boolean                          // CF_ACCOUNT_ID + CF_D1_DATABASE_ID + CF_D1_API_TOKEN
d1Query(sql, params): Promise<{ rows, meta }>     // POST to CF D1 REST API
d1Execute(sql, params): Promise<{ changes, lastRowId, rows }>
```

Endpoint: `https://api.cloudflare.com/client/v4/accounts/{accountId}/d1/database/{databaseId}/query`

### ratelimit.ts
```typescript
checkRateLimit(key, maxPerWindow, windowSec): Promise<RateLimitResult>
// RateLimitResult: { allowed, remaining, retryAfterSec }
```

Window key format: `{key}:{windowStartMs}` (floor to window boundary).

### turnstile.ts
```typescript
verifyTurnstileToken(token, remoteIp?): Promise<{ success, skipped, errors }>
```

Skips verification (returns `success: true, skipped: true`) if `TURNSTILE_SECRET_KEY` not set.

---

## 12. Component Catalogue

### Layout Components

**Navigation.tsx**
- Glass-morphism nav bar with slide-down entrance animation
- Desktop: text links + theme toggle (sun/moon icon)
- Mobile: hamburger → AnimatePresence overlay menu
- Props: `dark`, `onToggleTheme`, `onContactOpen`
- Tracks `nav_click` events with tab identifier

**Footer.tsx**
- 3-column layout: Brand, Products, Connect
- Dynamic year `© {currentYear}`
- SVG social icons (X, LinkedIn, Instagram)
- External links: `rel="noopener noreferrer"`

**TalkToUsButton.tsx**
- Fixed-position floating button (bottom-right)
- CSS animation: circular text path rotating 360° in 20s
- Center arrow icon with hover scale
- 1s appear delay via Framer Motion

**ContactModal.tsx**
- Glass-morphism modal with scale(0.95→1) entrance
- Form fields: Name*, Email*, Company, Service (select), Message*
- Submission: `fetch` to `formsubmit.co/ajax/thebrainpuddle@gmail.com`
- States: idle → sending → success/error
- Service options: General, Voice Agents, Consultation, Content, LearnPuddle, Partnership

### Page Components

**HeroSection.tsx**
- Staggered Framer Motion container (0.15s between children)
- "NEW" announcement banner → `/ai-score`
- CTA scrolls to `#what-we-do`

**AboutSection.tsx**
- 4 service cards with custom SVG icons
- Links: external (LearnPuddle), internal (other pages)

**ClientsSection.tsx**
- Client logos / social proof section

**FloatingCards.tsx**
- Decorative floating card elements

**BubbleCursor.tsx**
- Custom cursor with bubble trail effect

**TurnstileWidget.tsx**
- Declares `window.turnstile` TypeScript interface
- Script injection with `explicit` render mode
- Cleanup on unmount via `window.turnstile.remove()`

### AI Score Components

**ScoreReport.tsx**
- `useInView` from Framer Motion — animations trigger on viewport entry
- Circular SVG gauge with animated `strokeDashoffset`
- Score counter animation using Framer `animate(0, score, { duration: 2 })`
- Category bars with staggered 0.1s delay per bar
- XP evolution progress bar

**PokemonCard.tsx** (forwardRef)
- `forwardRef` because parent needs DOM ref for html2canvas
- `useEffect` on `photoUrl` → canvas pixel sampling for 4 vibrant stat colors
- HSL manipulation: force saturation ≥ 0.75, lightness ≥ 0.65
- Framer Motion 3D flip: `rotateY: 0↔180`, `spring(stiffness: 260, damping: 20)`
- Front: gradient based on type (Creative/Engineering/Strategy/default)
- Back: dark gradient, logo watermark, base stats with colored bars

**ClaimPhysicalCard.tsx**
- Mount: GET /api/claim-counter → live availability badge
- Turnstile integration conditional on `VITE_TURNSTILE_SITE_KEY`
- useMemo for badge text (loading / sold-out / count)
- Local state update on successful claim (no refetch needed)

---

## 13. Environment Variables Reference

### Frontend (Vite — `VITE_*` prefix required)
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VITE_POSTHOG_KEY` | No | — | PostHog project key |
| `VITE_POSTHOG_HOST` | No | `https://us.i.posthog.com` | PostHog ingest host |
| `VITE_POSTHOG_UI_HOST` | No | auto-derived | PostHog UI host |
| `VITE_TURNSTILE_SITE_KEY` | No | — | Cloudflare Turnstile public key |
| `VITE_BFL_API_KEY` | No | — | Black Forest Labs API key |
| `VITE_FEATURE_CLAIM_FORM` | No | `true` | Enable physical card claim form |
| `VITE_FEATURE_PERSISTENT_SHARE` | No | `true` | Enable persistent share links |
| `VITE_FEATURE_OPS_DASH` | No | `true` | Enable /internal/ops route |

### Backend (Netlify Functions + Express)
| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENAI_API_KEY` | No | mock data | GPT-4o analysis |
| `BFL_API_KEY` | No | SVG fallback | Black Forest Labs Flux API |
| `RELEVANCE_WEBHOOK_URL` | No | URL fallback | LinkedIn scraper webhook |
| `RELEVANCE_API_KEY` | No | — | Relevance AI auth |
| `TURNSTILE_SECRET_KEY` | No | skipped | Cloudflare Turnstile server secret |
| `CLAIMS_ENCRYPTION_KEY` | Yes* | throws | AES-256-GCM key for PII (*required in prod) |
| `CF_ACCOUNT_ID` | No | local-store | Cloudflare account ID |
| `CF_D1_DATABASE_ID` | No | local-store | D1 database ID |
| `CF_D1_API_TOKEN` | No | local-store | D1 API token |
| `CF_R2_ENDPOINT` | No | data URL | R2 S3-compatible endpoint |
| `CF_R2_BUCKET` | No | data URL | R2 bucket name |
| `CF_R2_ACCESS_KEY_ID` | No | data URL | R2 access key |
| `CF_R2_SECRET_ACCESS_KEY` | No | data URL | R2 secret key |
| `CF_R2_PUBLIC_BASE_URL` | No | data URL | R2 public CDN URL |
| `PUBLIC_SITE_URL` | No | from headers | Canonical origin for share URLs |
| `RETENTION_DAYS` | No | `180` | Share card expiry in days |
| `ADMIN_DASH_TOKEN` | No | open | Ops dashboard auth token |
| `PORT` | No | `3001` | Local Express server port |

---

## 14. Dev / Build / Deploy Workflow

### Local Development
```bash
# Terminal 1: Express API server
node server.js

# Terminal 2: Vite dev server (proxies /api/* → :3001)
npm run dev    # or: bun run dev

# Terminal 3 (optional): Remotion Studio
npm run remotion:studio
```

Vite proxy config (`vite.config.ts`):
```typescript
server: {
    proxy: {
        '/api': 'http://localhost:3001',
        '/s': 'http://localhost:3001'
    }
}
```

### Build
```bash
bun run build    # tsc + vite build → dist/
```

### Production Deployment
Push to GitHub → Netlify CI:
1. `bun run build` → `dist/`
2. Publish `dist/` to Netlify CDN
3. Deploy `netlify/functions/` as Lambda functions
4. Apply `netlify.toml` redirect rules

### Remotion Render
```bash
npm run remotion:render    # renders all compositions to out/
```

---

## 15. Architectural Observations & Known Gaps

### Dual Codebase Problem
`server.js` and `netlify/functions/` implement the **same business logic in two places**. Any change to analysis, card generation, or claiming must be applied in both locations. Risk: drift between environments.

**Recommendation:** Migrate to `netlify dev` for local development to eliminate `server.js` entirely, or extract shared logic into a `packages/api-core/` module imported by both.

### In-Memory Rate Limiting in Production
If D1 is not configured, rate limits use `globalThis.__brainPuddleLocalStore`. Netlify Functions are stateless Lambda — the store is wiped on every cold start and doesn't shared state across concurrent instances. **Rate limiting is effectively disabled without D1.**

**Recommendation:** Ensure D1 is configured in all production deployments.

### Missing PDF Parsing in Netlify Functions
`netlify/functions/analyze.ts` handles `type='pdf'` by treating the base64 data as text (`extractedText = data || fallbackInput`). PDF parsing via `pdf-parse` only exists in `server.js`. In production (Netlify Functions), PDF analysis sends raw base64 to GPT-4o.

**Recommendation:** Add `pdf-parse` to Netlify function or move PDF parsing to the frontend before upload (using PDF.js WebAssembly).

### Karthik Hardcode in Mock Data
`analyze.ts` (Netlify) and `server.js` both contain `isKarthik = input.toLowerCase().includes('karthik-guduru')` which returns an "Irreplaceable" result. This is a demo/founder easter egg that should be documented as intentional.

### No Input Sanitization on LinkedIn URL
The LinkedIn URL is stored as a raw slug without validation that it's actually a LinkedIn domain. `getLinkedInSlug` does regex matching but a malicious `?url=notlinkedin.com/in/payload` would still compute a hash and be stored.

### Share Card Expiry Not Enforced
The `expires_at` field is stored in D1 but no cleanup job or query filter checks expiry on retrieval. Expired cards will continue to be served.

**Recommendation:** Add `AND expires_at > datetime('now')` to share retrieval queries.

### Analytics Privacy
PostHog `person_profiles: 'identified_only'` means no anonymous profiles are created. Events fire but aren't linked to identities unless `posthog.identify()` is called (which it isn't in current code). This is privacy-friendly but limits funnel analysis.

### No TypeScript in server.js
The local dev server is plain JavaScript while all Netlify Functions are TypeScript. Inconsistent developer experience and no compile-time safety on the dev server.

---

## 16. System Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                             │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  React 19 SPA  (src/)                                          │  │
│  │                                                                │  │
│  │  App.tsx ──── Routes                                           │  │
│  │               ├── HomePage                                     │  │
│  │               ├── VoiceAgentsPage                              │  │
│  │               ├── ConsultationPage                             │  │
│  │               ├── ContentCreationPage                          │  │
│  │               ├── AiScorePage ─────────────────────────────── │  │
│  │               │    ├── ScoreReport (gauge + category bars)    │  │
│  │               │    ├── PokemonCard (3D flip, color extract)   │  │
│  │               │    └── ClaimPhysicalCard (Turnstile form)     │  │
│  │               ├── AiScoreSharedPage                           │  │
│  │               └── OpsDashboardPage (feature-flagged)          │  │
│  │                                                                │  │
│  │  lib/seo.ts ──────── Per-route meta/OG/JSON-LD DOM injection  │  │
│  │  lib/analytics.ts ── PostHog (autocapture, perf, events)      │  │
│  │  lib/features.ts ─── Build-time feature flags                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                         │ HTTP fetch                                  │
└─────────────────────────┼────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  NETLIFY EDGE                                                         │
│                                                                       │
│  Redirect rules (netlify.toml):                                       │
│  /api/share-card/create → /.netlify/functions/share-card-create       │
│  /api/*                 → /.netlify/functions/:splat                  │
│  /s/*                   → /.netlify/functions/share-resolve           │
│  /ingest/*              → PostHog reverse proxy                       │
│  /*                     → /index.html (SPA catch-all)                 │
└──────────────────┬────────────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│  NETLIFY FUNCTIONS (Serverless TypeScript)                            │
│                                                                       │
│  analyze.ts ──────────── POST /api/analyze                           │
│  generate-card.ts ──────  POST /api/generate-card                    │
│  ai-run.ts ─────────────  POST /api/ai-run                          │
│  share-card-create.ts ──  POST /api/share-card/create               │
│  share-resolve.ts ──────  GET /s/:shareId → OG HTML + redirect      │
│  shared-card.ts ────────  GET /api/shared-card?id=                  │
│  share-image.ts ────────  GET /api/share-image?id= (R2 proxy)       │
│  claim-card.ts ─────────  POST /api/claim-card                      │
│  claim-counter.ts ──────  GET /api/claim-counter                    │
│  ops-metrics.ts ────────  GET /api/ops-metrics (admin)              │
│                                                                       │
│  _lib/ shared:                                                        │
│    env · utils · hash · crypto · r2 · d1 · ratelimit · turnstile    │
│    local-store (fallback)                                             │
└────────────┬─────────────────┬────────────────────┬──────────────────┘
             │                 │                    │
             ▼                 ▼                    ▼
  ┌─────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐
  │  External APIs  │ │  Cloudflare      │ │  In-Memory Fallback      │
  │                 │ │                  │ │  (local-store.ts)        │
  │  OpenAI GPT-4o  │ │  R2 Storage      │ │                          │
  │  BFL Flux Pro   │ │  D1 SQLite       │ │  sharedCards: Map        │
  │  Relevance AI   │ │  Turnstile       │ │  claims: []              │
  │  Turnstile CDN  │ │                  │ │  aiRuns: []              │
  │  freeimage.host │ │  Tables:         │ │  inventory: {}           │
  │  PostHog        │ │  ai_runs         │ │  rateLimits: Map         │
  │  formsubmit.co  │ │  shared_cards    │ │                          │
  └─────────────────┘ │  claim_submissions│ └──────────────────────────┘
                      │  inventory       │
                      │  rate_limits     │
                      └──────────────────┘
```

---

*Document generated from full codebase ingestion. Last updated: 2026-03-02.*
*Every file in the repository was read to produce this document.*
