import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import crypto from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as pdfParseLib from 'pdf-parse';
const pdfParse = typeof pdfParseLib === 'function' ? pdfParseLib : pdfParseLib.default || pdfParseLib;

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

const BFL_API_KEY = process.env.VITE_BFL_API_KEY || process.env.BFL_API_KEY;

const getLinkedInSlug = (url) => {
    try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split('/').filter(Boolean);
        const inIndex = segments.indexOf('in');
        const slug = inIndex >= 0 ? segments[inIndex + 1] : segments[segments.length - 1];
        return slug || "";
    } catch {
        const match = String(url || "").match(/linkedin\.com\/in\/([^/?#]+)/i);
        return match?.[1] || "";
    }
};

const formatLinkedInSlugName = (slug) =>
    String(slug || "")
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .trim();

const getInitials = (name) =>
    String(name || "BrainPuddle User")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("") || "BP";

const buildInitialsFallbackImage = (name) => {
    const initials = getInitials(name).replace(/[^A-Z0-9]/g, "").slice(0, 2) || "BP";

    // Deterministic colour palette based on the name
    const palettes = [
        { bg1: '#667eea', bg2: '#764ba2', accent: '#a78bfa', text: '#ffffff', shadow: 'rgba(102,126,234,0.6)' },
        { bg1: '#f093fb', bg2: '#f5576c', accent: '#fda4af', text: '#ffffff', shadow: 'rgba(240,147,251,0.6)' },
        { bg1: '#4facfe', bg2: '#00f2fe', accent: '#7dd3fc', text: '#ffffff', shadow: 'rgba(79,172,254,0.6)' },
        { bg1: '#43e97b', bg2: '#38f9d7', accent: '#6ee7b7', text: '#ffffff', shadow: 'rgba(67,233,123,0.6)' },
        { bg1: '#fa709a', bg2: '#fee140', accent: '#fbbf24', text: '#ffffff', shadow: 'rgba(250,112,154,0.6)' },
        { bg1: '#a18cd1', bg2: '#fbc2eb', accent: '#c4b5fd', text: '#ffffff', shadow: 'rgba(161,140,209,0.6)' },
        { bg1: '#ffecd2', bg2: '#fcb69f', accent: '#fdba74', text: '#7c2d12', shadow: 'rgba(252,182,159,0.6)' },
        { bg1: '#89f7fe', bg2: '#66a6ff', accent: '#93c5fd', text: '#ffffff', shadow: 'rgba(137,247,254,0.6)' },
    ];
    const hash = (name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const p = palettes[hash % palettes.length];

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${p.bg1}"/>
      <stop offset="100%" stop-color="${p.bg2}"/>
    </linearGradient>
    <linearGradient id="shine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.35)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="${p.shadow}" flood-opacity="0.8"/>
    </filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="25" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <circle cx="100" cy="80" r="90" fill="rgba(255,255,255,0.08)"/>
  <circle cx="700" cy="520" r="110" fill="rgba(255,255,255,0.06)"/>
  <circle cx="680" cy="100" r="60" fill="rgba(255,255,255,0.05)"/>
  <circle cx="120" cy="480" r="70" fill="rgba(255,255,255,0.04)"/>
  <rect x="150" y="60" width="500" height="480" rx="40" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.3)" stroke-width="2"/>
  <rect x="150" y="60" width="500" height="240" rx="40" fill="url(#shine)"/>
  <text x="400" y="280" text-anchor="middle" dominant-baseline="central" font-size="200" font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-weight="900" fill="${p.accent}" opacity="0.3" filter="url(#glow)">${initials}</text>
  <text x="400" y="280" text-anchor="middle" dominant-baseline="central" font-size="200" font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-weight="900" fill="${p.text}" letter-spacing="10" filter="url(#shadow)">${initials}</text>
  <text x="400" y="265" text-anchor="middle" dominant-baseline="central" font-size="200" font-family="'Inter','Helvetica Neue',Arial,sans-serif" font-weight="900" fill="rgba(255,255,255,0.15)" letter-spacing="10">${initials}</text>
</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

const buildLinkedInFallbackText = (url) => {
    const slug = getLinkedInSlug(url);
    const guessedName = formatLinkedInSlugName(slug) || "Unknown User";
    return `LinkedIn profile scraping was unavailable. Treat this as a URL-only profile. Probable name from slug: ${guessedName}. Infer broad professional capabilities without niche hallucinations.`;
};

const decodeSharePayload = (token) => {
    if (!token) return null;
    try {
        const normalized = String(token).trim();
        const base64 = normalized.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4);
        const jsonString = Buffer.from(padded, 'base64').toString('utf8');
        const parsed = JSON.parse(jsonString);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
};

const clampScore = (rawValue) => {
    const value = Number(rawValue);
    if (Number.isNaN(value)) return 50;
    return Math.max(0, Math.min(100, Math.round(value)));
};

const getPayloadValue = (payload, keys, fallback = '') => {
    if (!payload) return fallback;
    for (const key of keys) {
        const value = payload[key];
        if (value !== undefined && value !== null && String(value).trim()) {
            return String(value).trim();
        }
    }
    return fallback;
};

const escapeHtml = (value) =>
    String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const resolveSiteOrigin = (req) => {
    const configuredOrigin = (process.env.PUBLIC_SITE_URL || process.env.SITE_URL || process.env.URL || '').trim();
    if (configuredOrigin) {
        try {
            return new URL(configuredOrigin).origin;
        } catch {
            return configuredOrigin.replace(/\/+$/, '');
        }
    }
    const requestOrigin = String(req.get('origin') || '').trim();
    if (requestOrigin) {
        try {
            return new URL(requestOrigin).origin;
        } catch {
            // fallback to host-based origin below
        }
    }
    const forwardedProto = req.get('x-forwarded-proto');
    const forwardedHost = req.get('x-forwarded-host');
    const protocol = forwardedProto || req.protocol || 'https';
    return `${protocol}://${forwardedHost || req.get('host')}`;
};

const sanitizeOgImageUrl = (imageUrl, origin) => {
    const fallbackImage = `${origin}/consultation-hero.png`;
    if (!imageUrl) return fallbackImage;
    try {
        const parsed = new URL(String(imageUrl));
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString();
        }
    } catch {
        return fallbackImage;
    }
    return fallbackImage;
};

const buildShareCardHtml = ({ token, origin, payload }) => {
    const name = getPayloadValue(payload, ['n', 'name'], 'Professional User');
    const roleTitle = getPayloadValue(payload, ['t', 'title'], 'Digital Professional');
    const tier = getPayloadValue(payload, ['r', 'tier'], '⚔️ AI-Resistant');
    const replaceabilityScore = clampScore(getPayloadValue(payload, ['s', 'score'], 50));
    const resilienceScore = Math.max(0, 100 - replaceabilityScore);
    const imageUrl = sanitizeOgImageUrl(getPayloadValue(payload, ['i', 'image', 'imageUrl'], ''), origin);

    const encodedToken = encodeURIComponent(token);
    const destinationPath = `/ai-score/shared/${encodedToken}`;
    const shareUrl = `${origin}/api/share-card?d=${encodedToken}`;
    const ogTitle = `${name} | BrainPuddle AI Score`;
    const ogDescription = `${name} (${roleTitle}) scored ${replaceabilityScore}/100 Replaceability Index and ${resilienceScore}/100 AI Resilience (${tier}).`;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(ogTitle)}</title>
  <meta name="description" content="${escapeHtml(ogDescription)}" />
  <link rel="canonical" href="${escapeHtml(shareUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="BrainPuddle" />
  <meta property="og:title" content="${escapeHtml(ogTitle)}" />
  <meta property="og:description" content="${escapeHtml(ogDescription)}" />
  <meta property="og:url" content="${escapeHtml(shareUrl)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  <meta http-equiv="refresh" content="0; url=${escapeHtml(destinationPath)}" />
</head>
<body style="font-family: Inter, Arial, sans-serif; background: #f9f9f9; color: #111; padding: 2rem;">
  <h1 style="font-size: 1.3rem; margin-bottom: 0.6rem;">Opening shared AI Score...</h1>
  <p>If you are not redirected, <a href="${escapeHtml(destinationPath)}">open the exact shared result</a>.</p>
  <script>
    (function () {
      var destination = ${JSON.stringify(destinationPath)};
      window.location.replace(destination);
    })();
  </script>
</body>
</html>`;
};

const localOpsStore = {
    inventory: { total: 100, claimed: 0, remaining: 100, updatedAt: new Date().toISOString() },
    claims: [],
    sharedCards: new Map(),
    aiRuns: [],
    rateLimits: new Map()
};

const nowIso = () => new Date().toISOString();
const retentionDays = Math.max(1, Number(process.env.RETENTION_DAYS || 180));
const expiryFromNow = () => new Date(Date.now() + (retentionDays * 24 * 60 * 60 * 1000)).toISOString();
const makeId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
const sha256 = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');

const getClientIp = (req) => {
    const forwarded = req.get('x-forwarded-for') || '';
    const first = forwarded.split(',').map((item) => item.trim()).find(Boolean);
    return first || req.ip || '';
};

const maskLinkedIn = (slug) => {
    const normalized = String(slug || '').trim();
    if (!normalized) return '';
    if (normalized.length <= 4) return `${normalized[0] || ''}***`;
    return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
};

const normalizeEncryptionKey = (rawKey) => {
    const trimmed = String(rawKey || '').trim();
    if (!trimmed) return null;
    if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
        return Buffer.from(trimmed, 'hex');
    }
    try {
        const decoded = Buffer.from(trimmed, 'base64');
        if (decoded.length === 32) return decoded;
    } catch {
        // hashed fallback below
    }
    return crypto.createHash('sha256').update(trimmed).digest();
};

const encryptSensitiveText = (value) => {
    const key = normalizeEncryptionKey(process.env.CLAIMS_ENCRYPTION_KEY);
    if (!key) {
        return Buffer.from(String(value || ''), 'utf8').toString('base64');
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
        cipher.update(String(value || ''), 'utf8'),
        cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
};

const parseImageDataUrl = (dataUrl) => {
    const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
        throw new Error('cardImageBase64 must be a valid image data URL');
    }
    return {
        mimeType: match[1],
        buffer: Buffer.from(match[2], 'base64')
    };
};

const getR2Client = () => {
    const endpoint = process.env.CF_R2_ENDPOINT || '';
    const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY || '';

    if (!endpoint || !accessKeyId || !secretAccessKey) {
        return null;
    }

    return new S3Client({
        region: 'auto',
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey }
    });
};

const uploadCardImage = async (imageDataUrl, shareId) => {
    const mimeMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/webp': 'webp' };
    const { mimeType, buffer } = parseImageDataUrl(imageDataUrl);
    const extension = mimeMap[mimeType] || 'png';
    const objectKey = `ai-cards/${shareId}.${extension}`;
    const publicBase = String(process.env.CF_R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
    const bucket = process.env.CF_R2_BUCKET || '';
    const s3 = getR2Client();

    if (!s3 || !bucket || !publicBase) {
        return { objectKey, publicUrl: imageDataUrl };
    }

    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: 'public, max-age=31536000, immutable'
    }));

    return { objectKey, publicUrl: `${publicBase}/${objectKey}` };
};

const verifyTurnstileToken = async (token, req) => {
    const secret = String(process.env.TURNSTILE_SECRET_KEY || '').trim();
    if (!secret) return { success: true, skipped: true, errors: [] };
    if (!token) return { success: false, skipped: false, errors: ['missing-token'] };

    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token);
    const ip = getClientIp(req);
    if (ip) {
        body.set('remoteip', ip);
    }

    try {
        const response = await axios.post(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            body,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        return {
            success: Boolean(response.data?.success),
            skipped: false,
            errors: Array.isArray(response.data?.['error-codes']) ? response.data['error-codes'] : []
        };
    } catch (error) {
        return { success: false, skipped: false, errors: ['verification-failed', error.message] };
    }
};

const checkLocalRateLimit = (key, maxPerWindow, windowSec) => {
    const now = Date.now();
    const windowStartMs = Math.floor(now / (windowSec * 1000)) * windowSec * 1000;
    const compound = `${key}:${windowStartMs}`;
    const count = (localOpsStore.rateLimits.get(compound)?.count || 0) + 1;
    localOpsStore.rateLimits.set(compound, { count, windowStartMs });
    const allowed = count <= maxPerWindow;
    return {
        allowed,
        remaining: Math.max(0, maxPerWindow - count),
        retryAfterSec: allowed ? 0 : Math.ceil((windowStartMs + windowSec * 1000 - now) / 1000)
    };
};

const buildPersistentShareHtml = ({ origin, shareId, name, title, score, tier, imageUrl }) => {
    const resilienceScore = Math.max(0, 100 - score);
    const shareUrl = `${origin}/s/${encodeURIComponent(shareId)}`;
    const destinationPath = `/ai-score/shared/${encodeURIComponent(shareId)}`;
    const ogTitle = `${name} | BrainPuddle AI Score`;
    const ogDescription = `${name} (${title}) scored ${score}/100 Replaceability Index and ${resilienceScore}/100 AI Resilience (${tier}).`;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(ogTitle)}</title>
  <meta name="description" content="${escapeHtml(ogDescription)}" />
  <link rel="canonical" href="${escapeHtml(shareUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="BrainPuddle" />
  <meta property="og:title" content="${escapeHtml(ogTitle)}" />
  <meta property="og:description" content="${escapeHtml(ogDescription)}" />
  <meta property="og:url" content="${escapeHtml(shareUrl)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
  <meta http-equiv="refresh" content="0; url=${escapeHtml(destinationPath)}" />
</head>
<body style="font-family: Inter, Arial, sans-serif; background: #f9f9f9; color: #111; padding: 2rem;">
  <h1 style="font-size: 1.3rem; margin-bottom: 0.6rem;">Opening shared AI Score...</h1>
  <p>If you are not redirected, <a href="${escapeHtml(destinationPath)}">open the exact shared result</a>.</p>
  <script>
    (function () {
      var destination = ${JSON.stringify(destinationPath)};
      window.location.replace(destination);
    })();
  </script>
</body>
</html>`;
};

// Mock LLM Analysis logic (since we don't have an OpenAI key yet)
// In production, this would call OpenAI or Anthropic to extract details.
const generateAnalysis = (input) => {
    const linkedInSlug = getLinkedInSlug(input);
    const isMockUrl = Boolean(linkedInSlug);

    let name = "Professional User";
    let isKarthik = input.toLowerCase().includes('karthik-guduru');

    if (isKarthik) {
        name = "Karthik Guduru";
    } else if (isMockUrl) {
        name = formatLinkedInSlugName(linkedInSlug) || "Professional User";
    }

    if (isKarthik) {
        return {
            score: 12, // Very low replaceability
            tier: "🛡️ Irreplaceable",
            tierColor: "#00E676",
            categories: [
                { name: "Creative Strategy", score: 98, max: 100 },
                { name: "Technical Depth", score: 95, max: 100 },
                { name: "Human Empathy", score: 88, max: 100 },
            ],
            xp: 99,
            levelUpSuggestions: [
                "Automate reporting pipelines.",
                "Build empathetic client networks.",
                "Focus on high-level strategic architecture."
            ],
            pokemon: {
                name: "Karthik Guduru",
                title: "Founder & Creative Technologist",
                photoUrl: "",
                type: "Visionary",
                stage: "Master Level",
                hp: 250,
                skills: ["AI Architecture", "Creative Direction", "Systems Thinking", "Future Proofing"],
                stats: { cognitiveDepth: 95, decisionAutonomy: 80, adaptability: 90, systemLeverage: 100 },
                primaryDomain: "AI Solutions",
                operatingMode: "Architectural",
                humanLeverage: "High",
                powerUps: [
                    { name: "Brain Puddle Sync", desc: "Merges creative and technical domains instantly." },
                    { name: "Chaos Logic", desc: "Turns abstract chaos into structured cinematic intelligence." }
                ],
                pokedexEntry: `A rare visionary entity known to construct entire neural realities. Highly resistant to automation; in fact, it usually builds the automation. Feeds on complex design systems.`
            }
        };
    }

    return {
        score: Math.floor(Math.random() * 50) + 20, // 20-70 range
        tier: "⚔️ AI-Resistant",
        tierColor: "#ffeb3b",
        categories: [
            { name: "Creative Strategy", score: 80 + Math.floor(Math.random() * 20), max: 100 },
            { name: "Technical Depth", score: 50 + Math.floor(Math.random() * 40), max: 100 },
            { name: "Human Empathy", score: 70 + Math.floor(Math.random() * 30), max: 100 },
            { name: "Repetitive Tasks", score: 10 + Math.floor(Math.random() * 40), max: 100 },
        ],
        xp: 65,
        levelUpSuggestions: [
            "Leverage AI for boilerplate code generation.",
            "Strengthen cross-functional team leadership.",
            "Focus on complex system architecture."
        ],
        pokemon: {
            name: name,
            title: isMockUrl ? "Digital Architect" : "Strategic Consultant",
            photoUrl: "", // Will be filled by Flux
            type: "Creative",
            stage: "Basic Level",
            hp: 120 + Math.floor(Math.random() * 60),
            skills: ["Critical Thinking", "Adaptability", "Domain Expertise", "Client Relations"],
            stats: {
                cognitiveDepth: 60 + Math.floor(Math.random() * 40),
                decisionAutonomy: 50 + Math.floor(Math.random() * 40),
                adaptability: 70 + Math.floor(Math.random() * 30),
                systemLeverage: 80 + Math.floor(Math.random() * 20)
            },
            primaryDomain: "General Consulting",
            operatingMode: "Execution",
            humanLeverage: "Medium",
            powerUps: [
                { name: "Domain Knowledge", desc: "Instantly solves business logic edge cases." },
                { name: "Client Empathy", desc: "Deflects scope creep and restores project health." }
            ],
            pokedexEntry: `A highly adaptable entity. When threatened by automation, it instinctively creates a new framework. Known to survive entirely on oat milk lattes during launch weeks.`
        }
    };
};

app.post('/api/analyze', async (req, res) => {
    try {
        const { type, data } = req.body;
        // Backward compatibility for old "input" field
        const fallbackInput = req.body.input || data;

        let extractedText = "";

        if (type === 'pdf') {
            console.log("Analyzing uploaded PDF Document...");
            try {
                const buffer = Buffer.from(data, 'base64');
                const pdfData = await pdfParse(buffer);
                extractedText = pdfData.text.substring(0, 10000); // Prevent massive payloads
            } catch (err) {
                return res.status(400).json({ error: "Failed to parse PDF document." });
            }
        } else if (type === 'url') {
            console.log("LinkedIn URL provided - calling Relevance AI webhook.");
            if (!process.env.RELEVANCE_WEBHOOK_URL || !process.env.RELEVANCE_API_KEY) {
                console.warn("Relevance API config missing. Falling back to URL-only analysis.");
                extractedText = buildLinkedInFallbackText(data || fallbackInput || "");
            } else {
                try {
                    const relevanceRes = await axios.post(
                        process.env.RELEVANCE_WEBHOOK_URL,
                        { url: data, name: "" },
                        {
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": process.env.RELEVANCE_API_KEY
                            },
                            timeout: 25000 // 25s timeout for scraper
                        }
                    );
                    const output = relevanceRes.data?.output || relevanceRes.data || "";
                    extractedText = typeof output === 'string' ? output : JSON.stringify(output);

                    // Truncate to avoid exceeding OpenAI context limits
                    if (extractedText.length > 15000) {
                        extractedText = extractedText.substring(0, 15000) + '...';
                    }
                } catch (err) {
                    console.error("Relevance API Error:", err.response?.data || err.message);
                    extractedText = buildLinkedInFallbackText(data || fallbackInput || "");
                }
            }
        } else {
            console.log("Raw text/bio provided.");
            extractedText = data || fallbackInput;
        }

        // Log the input to a local file
        const logEntry = {
            timestamp: new Date().toISOString(),
            type,
            inputSnippet: extractedText.substring(0, 100) + "..."
        };
        const logFilePath = './uploads_log.json';

        fs.readFile(logFilePath, 'utf8', (err, logFile) => {
            let logs = [];
            if (!err && logFile) {
                try {
                    logs = JSON.parse(logFile);
                } catch (e) {
                    // Ignore parse errors, start fresh
                }
            }
            logs.push(logEntry);
            fs.writeFile(logFilePath, JSON.stringify(logs, null, 2), (err) => {
                if (err) console.error("Failed to save input log:", err);
            });
        });

        if (!process.env.OPENAI_API_KEY) {
            console.log("No OPENAI key found, returning mock data.");
            await new Promise(resolve => setTimeout(resolve, 1500));
            const analysisSeed = type === 'url'
                ? `${data || fallbackInput || ""}\n${extractedText || ""}`
                : extractedText;
            const analysis = generateAnalysis(analysisSeed);
            return res.json(analysis);
        }

        console.log(`Analyzing profile via OpenAI for input [${type}]`);

        const prompt = `You are an expert AI workforce analyst and gamification expert. The user has provided the following profile text, bio, or background context: \n\n"""\nEXTRACTED TEXT:\n${extractedText}\n\nRAW INPUT STRING (MIGHT BE A URL):\n${data}\n"""\n 
Analyze their skills and determine how easily they could be replaced by AI. 
Provide a brutal but fun gamified report card in the style of a Pokémon card. 
Return ONLY a valid JSON object matching this exact structure:

{
  "score": <number 0-100, where lower means harder to replace, higher means easily replacable>,
  "tier": "<Emoji and Tier Name, e.g. ⚔️ AI-Resistant or ⚠️ Automatable>",
  "tierColor": "<Hex color representing the tier>",
  "categories": [
      { "name": "Creative Strategy", "score": <0-100>, "max": 100 },
      { "name": "Technical Depth", "score": <0-100>, "max": 100 },
      { "name": "Human Empathy", "score": <0-100>, "max": 100 },
      { "name": "Repetitive Tasks", "score": <0-100, higher means more repetitive>, "max": 100 }
  ],
  "xp": <number>,
  "levelUpSuggestions": [
      "<Suggestion 1: Short actionable sentence to reduce replaceability>",
      "<Suggestion 2: Short actionable sentence...>",
      "<Suggestion 3: Short actionable sentence...>"
  ],
  "pokemon": {
      "name": "<CRITICAL: Extract and format their actual human Name. If a LinkedIn URL like 'linkedin.com/in/john-doe' is in the RAW INPUT, the name is 'John Doe'. Look deeply in the EXTRACTED TEXT for a name. If ABSOLUTELY no name can be guessed, use 'Unknown User'. MAX 2 WORDS. Capitalize names properly.>",
      "title": "<Catchy professional title, MAX 4 WORDS>",
      "photoUrl": "",
      "type": "<e.g., Creative, Engineering, Strategy, Visionary>",
      "stage": "<e.g., Basic Level, Master Level>",
      "hp": <number 100-300>,
      "skills": ["<Skill 1>", "<Skill 2>", "<Skill 3>", "<Skill 4>"],
      "stats": {
          "cognitiveDepth": <0-100>,
          "decisionAutonomy": <0-100>,
          "adaptability": <0-100>,
          "systemLeverage": <0-100>
      },
      "primaryDomain": "<e.g., AI Solutions, Generative Art, Finance>",
      "operatingMode": "<e.g., Architectural, Execution, Strategic>",
      "humanLeverage": "<High, Medium, or Low>",
      "powerUps": [
          { "name": "<Creative Power name>", "desc": "<Fun max 1 sentence description>" },
          { "name": "<Creative Power name 2>", "desc": "<Fun max 1 sentence description>" }
      ],
      "pokedexEntry": "<A 2-3 sentence fun description of their profile in the style of a rare collectible card, mentioning their defense against AI. DO NOT USE THE WORD POKÉMON OR POKEMON. Use terms like 'rare entity', 'anomaly', 'visionary', etc. IMPORTANT: USE STRICTLY GENDER-NEUTRAL PRONOUNS (they/them/their) OR REFER TO THEM BY NAME. DO NOT USE 'its', 'his', 'hers', or any gendered/objectifying terms.>"
  }
}

NOTE ON HALLUCINATIONS: It is highly likely the user is just providing a LinkedIn URL and you cannot scrape the page. If the input is just a URL without deep body text, DO NOT hallucinate heavily specific skills like "E-commerce solutions" or "Medical routing". Infer generic but highly professional traits based on the URL slug or job title (e.g. "Strategic Leadership", "Cross-functional Strategy", "Creative Vision"). Keep the stats and skills broadly applicable but punchy.`;

        const gptRes = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4o",
            response_format: { type: "json_object" },
            messages: [{ role: "system", content: prompt }]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const analysis = JSON.parse(gptRes.data.choices[0].message.content);
        res.json(analysis);

    } catch (error) {
        console.error("Analysis error:", error?.response?.data || error.message);
        res.status(500).json({ error: "Failed to analyze profile via OpenAI" });
    }
});

// The Flux endpoint is asynchronous. It returns a Task ID.
// We must poll to get the actual image link.
app.post('/api/generate-card', async (req, res) => {
    const { name, title, type, analysis, imagePromptBase64 } = req.body;
    try {
        if (imagePromptBase64) {
            // User provided their own image - bypass BFL Flux generation entirely.
            return res.json({ imageUrl: imagePromptBase64 });
        }

        if (!BFL_API_KEY) {
            return res.status(200).json({
                imageUrl: buildInitialsFallbackImage(name),
                fallback: true
            });
        }

        let prompt;
        const reqBody = {
            width: 768,
            height: 1024,
            prompt_upsampling: false,
            seed: Math.floor(Math.random() * 1000000),
            safety_tolerance: 2,
            output_format: "jpeg"
        };

        const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        prompt = `Typography art, bold cool initials '${initials}'. Ensure the letters are scaled down to fit perfectly within frame with generous margins. Lots of negative space around the letters. Abstract background, Studio Ghibli inspired magical aesthetic. Futuristic floating letters in the center. Clean gradient background suitable for a trading card. Cinematic lighting, highly realistic 3D render.`;
        reqBody.prompt = prompt;

        // 1. Submit task to Flux API
        const createResponse = await axios.post('https://api.bfl.ai/v1/flux-pro-1.1', reqBody, {
            headers: {
                'x-key': BFL_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        const taskId = createResponse.data.id;
        const pollingUrl = createResponse.data.polling_url || `https://api.bfl.ai/v1/get_result?id=${taskId}`;

        // 2. Poll for completion
        let resultUrl = null;
        for (let i = 0; i < 20; i++) { // Poll 20 times (approx 40 seconds max)
            await new Promise(resolve => setTimeout(resolve, 2000)); // wait 2 seconds

            const pollResponse = await axios.get(pollingUrl);

            if (pollResponse.data.status === 'Ready') {
                resultUrl = pollResponse.data.result.sample;
                break;
            } else if (pollResponse.data.status === 'Failed') {
                throw new Error("Flux API generation failed.");
            }
        }

        if (resultUrl) {
            // Fetch the image locally to bypass CORS when loaded dynamically in a canvas
            const imageBufferResponse = await axios.get(resultUrl, { responseType: 'arraybuffer' });
            const b64 = Buffer.from(imageBufferResponse.data, 'binary').toString('base64');
            res.json({ imageUrl: `data:image/jpeg;base64,${b64}` });
        } else {
            res.status(504).json({ error: "Image generation timed out." });
        }

    } catch (error) {
        console.error("Flux Error:", error?.response?.data || error.message);
        res.status(200).json({
            imageUrl: buildInitialsFallbackImage(name),
            fallback: true
        });
    }
});

// Endpoint to upload the card to Freeimage.host so it can be shared via URL on LinkedIn
app.post('/api/upload-image', async (req, res) => {
    try {
        const { imageBase64 } = req.body;
        if (!imageBase64) return res.status(400).json({ error: 'No image provided' });

        const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

        // Freeimage.host public API key (6d207e02198a847aa98d0a2a901485a5 works freely for anonymous uploads)
        const API_KEY = '6d207e02198a847aa98d0a2a901485a5';

        const formData = new URLSearchParams();
        formData.append('key', API_KEY);
        formData.append('action', 'upload');
        formData.append('source', base64Data);
        formData.append('format', 'json');

        const response = await axios.post('https://freeimage.host/api/1/upload', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (response.data && response.data.image && response.data.image.url) {
            res.json({ url: response.data.image.url });
        } else {
            throw new Error('Invalid response from image host');
        }

    } catch (error) {
        console.error("Image Upload Error:", error?.response?.data || error.message);
        res.status(500).json({ error: "Failed to upload image" });
    }
});

app.get('/api/claim-counter', (_req, res) => {
    res.json({
        total: localOpsStore.inventory.total,
        claimed: localOpsStore.inventory.claimed,
        remaining: localOpsStore.inventory.remaining,
        updatedAt: localOpsStore.inventory.updatedAt
    });
});

app.post('/api/claim-card', async (req, res) => {
    try {
        const fullName = String(req.body?.fullName || '').trim();
        const linkedinUrl = String(req.body?.linkedinUrl || '').trim();
        const deliveryAddress = String(req.body?.deliveryAddress || '').trim();
        const aiRunId = req.body?.aiRunId ? String(req.body.aiRunId) : null;
        const turnstileToken = String(req.body?.turnstileToken || '').trim();

        if (!fullName || !linkedinUrl || !deliveryAddress) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const clientIp = getClientIp(req);
        const ipHash = sha256(clientIp);
        const rateLimit = checkLocalRateLimit(`claim-card:${ipHash}`, 6, 60 * 10);
        if (!rateLimit.allowed) {
            return res.status(429).json({ error: 'RATE_LIMITED', retryAfterSec: rateLimit.retryAfterSec });
        }

        const turnstile = await verifyTurnstileToken(turnstileToken, req);
        if (!turnstile.success) {
            return res.status(400).json({ error: 'TURNSTILE_FAILED', details: turnstile.errors });
        }

        const claimId = makeId('claim');
        const createdAt = nowIso();
        const linkedinSlug = getLinkedInSlug(linkedinUrl);
        const linkedinHash = sha256(linkedinSlug || linkedinUrl);
        const userAgentHash = sha256(req.get('user-agent') || '');

        if (localOpsStore.inventory.remaining <= 0) {
            localOpsStore.claims.unshift({
                id: claimId,
                createdAt,
                fullNameEnc: encryptSensitiveText(fullName),
                deliveryAddressEnc: encryptSensitiveText(deliveryAddress),
                linkedinSlug,
                linkedinHash,
                aiRunId,
                ipHash,
                uaHash: userAgentHash,
                status: 'sold_out'
            });
            return res.status(409).json({ error: 'SOLD_OUT', remainingCount: 0 });
        }

        localOpsStore.inventory.claimed += 1;
        localOpsStore.inventory.remaining -= 1;
        localOpsStore.inventory.updatedAt = createdAt;

        localOpsStore.claims.unshift({
            id: claimId,
            createdAt,
            fullNameEnc: encryptSensitiveText(fullName),
            deliveryAddressEnc: encryptSensitiveText(deliveryAddress),
            linkedinSlug,
            linkedinHash,
            aiRunId,
            ipHash,
            uaHash: userAgentHash,
            status: 'accepted'
        });

        return res.json({ claimId, remainingCount: localOpsStore.inventory.remaining });
    } catch (error) {
        console.error('Claim submit error:', error?.message || error);
        return res.status(500).json({ error: 'Failed to submit claim' });
    }
});

app.post('/api/ai-run', (req, res) => {
    try {
        const aiRunId = makeId('run');
        const createdAt = nowIso();
        const inputType = String(req.body?.inputType || 'text');
        const linkedinUrl = String(req.body?.linkedinUrl || '');
        const linkedinSlug = getLinkedInSlug(linkedinUrl);
        const linkedinHash = sha256(linkedinSlug || linkedinUrl);
        const inputCharCount = Math.max(0, Number(req.body?.inputCharCount || 0));
        const score = clampScore(req.body?.score);
        const tier = String(req.body?.tier || '⚔️ AI-Resistant');
        const analysisLatencyMs = Math.max(0, Number(req.body?.analysisLatencyMs || 0));
        const imageSource = String(req.body?.imageSource || 'unknown');

        localOpsStore.aiRuns.unshift({
            id: aiRunId,
            createdAt,
            inputType,
            linkedinSlug,
            linkedinHash,
            inputCharCount,
            score,
            tier,
            analysisLatencyMs,
            imageSource,
            shareClicked: 0
        });

        return res.json({ aiRunId });
    } catch (error) {
        console.error('AI run tracking error:', error?.message || error);
        return res.status(500).json({ error: 'Failed to persist ai run' });
    }
});

app.post('/api/share-card/create', async (req, res) => {
    try {
        const aiRunId = req.body?.aiRunId ? String(req.body.aiRunId) : null;
        const name = String(req.body?.name || '').trim() || 'Professional User';
        const title = String(req.body?.title || '').trim() || 'Digital Professional';
        const score = clampScore(req.body?.score);
        const tier = String(req.body?.tier || '').trim() || '⚔️ AI-Resistant';
        const cardImageBase64 = String(req.body?.cardImageBase64 || '').trim();
        const turnstileToken = String(req.body?.turnstileToken || '').trim();

        if (!cardImageBase64) {
            return res.status(400).json({ error: 'cardImageBase64 is required' });
        }

        const clientIp = getClientIp(req);
        const limit = checkLocalRateLimit(`share-card-create:${sha256(clientIp)}`, 20, 60 * 10);
        if (!limit.allowed) {
            return res.status(429).json({ error: 'RATE_LIMITED', retryAfterSec: limit.retryAfterSec });
        }

        const turnstile = await verifyTurnstileToken(turnstileToken, req);
        if (!turnstile.success) {
            return res.status(400).json({ error: 'TURNSTILE_FAILED', details: turnstile.errors });
        }

        const shareId = makeId('sh').replace(/^sh_/, '');
        const createdAt = nowIso();
        const expiresAt = expiryFromNow();
        const { objectKey, publicUrl } = await uploadCardImage(cardImageBase64, shareId);
        const origin = resolveSiteOrigin(req);

        localOpsStore.sharedCards.set(shareId, {
            id: shareId,
            createdAt,
            aiRunId,
            name,
            title,
            score,
            tier,
            imageUrl: publicUrl,
            objectKey,
            expiresAt
        });

        if (aiRunId) {
            const run = localOpsStore.aiRuns.find((item) => item.id === aiRunId);
            if (run) {
                run.shareClicked = 1;
            }
        }

        return res.json({ shareId, shareUrl: `${origin}/s/${shareId}` });
    } catch (error) {
        console.error('Share create error:', error?.message || error);
        return res.status(500).json({ error: 'Failed to create share link' });
    }
});

app.get('/api/shared-card', (req, res) => {
    const shareId = String(req.query?.id || '').trim();
    if (!shareId) {
        return res.status(400).json({ error: 'Missing share id' });
    }

    const card = localOpsStore.sharedCards.get(shareId);
    if (!card) {
        return res.status(404).json({ error: 'Shared card not found' });
    }
    if (new Date(card.expiresAt).getTime() < Date.now()) {
        return res.status(410).json({ error: 'Shared card expired' });
    }

    return res.json({
        shareId: card.id,
        name: card.name,
        title: card.title,
        score: card.score,
        tier: card.tier,
        imageUrl: card.imageUrl,
        createdAt: card.createdAt
    });
});

app.get('/s/:shareId', (req, res) => {
    const shareId = String(req.params?.shareId || '').trim();
    const origin = resolveSiteOrigin(req);
    const card = localOpsStore.sharedCards.get(shareId);
    if (!card) {
        return res.redirect(302, `${origin}/ai-score/shared`);
    }

    const html = buildPersistentShareHtml({
        origin,
        shareId: card.id,
        name: card.name,
        title: card.title,
        score: card.score,
        tier: card.tier,
        imageUrl: card.imageUrl || `${origin}/consultation-hero.png`
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).send(html);
});

app.get('/api/ops-metrics', (req, res) => {
    const expected = String(process.env.ADMIN_DASH_TOKEN || '').trim();
    if (expected) {
        const supplied = String(
            req.get('x-admin-token') ||
            String(req.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
            req.query?.token ||
            ''
        );
        if (supplied !== expected) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    return res.json({
        counters: {
            visits: null,
            aiRuns: localOpsStore.aiRuns.length,
            shares: localOpsStore.sharedCards.size,
            claims: localOpsStore.claims.filter((item) => item.status === 'accepted').length,
            remaining: localOpsStore.inventory.remaining
        },
        recentClaims: localOpsStore.claims.slice(0, 20).map((claim) => ({
            id: claim.id,
            createdAt: claim.createdAt,
            linkedin: maskLinkedIn(claim.linkedinSlug),
            status: claim.status
        })),
        recentShares: Array.from(localOpsStore.sharedCards.values()).slice(0, 20).map((share) => ({
            id: share.id,
            createdAt: share.createdAt,
            name: share.name,
            score: share.score,
            tier: share.tier
        }))
    });
});

app.get('/api/share-card', (req, res) => {
    const token = String(req.query?.d || '').trim();
    const origin = resolveSiteOrigin(req);

    if (!token) {
        return res.redirect(302, `${origin}/ai-score/shared`);
    }

    const payload = decodeSharePayload(token) || {};
    const html = buildShareCardHtml({ token, origin, payload });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).send(html);
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
