import { Handler } from '@netlify/functions';
import { d1Query, isD1Configured } from './_lib/d1';
import { resolveSiteOrigin } from './_lib/env';
import { localStore } from './_lib/local-store';
import { escapeHtml } from './_lib/utils';

const fallbackImage = (origin: string) => `${origin}/consultation-hero.png`;

const buildHtml = ({
    origin,
    shareId,
    name,
    title,
    score,
    tier,
    imageUrl
}: {
    origin: string;
    shareId: string;
    name: string;
    title: string;
    score: number;
    tier: string;
    imageUrl: string;
}) => {
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

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // Netlify redirects can pass the id either as a query param (?id=...)
        // or as a path segment: /.netlify/functions/share-resolve/<id>
        const fromQuery = String(event.queryStringParameters?.id || '').trim();
        const fromPath = (() => {
            const p = String(event.path || '');
            const marker = '/.netlify/functions/share-resolve/';
            const idx = p.indexOf(marker);
            if (idx === -1) return '';
            return decodeURIComponent(p.slice(idx + marker.length)).trim();
        })();
        const shareId = fromQuery || fromPath;
        const origin = resolveSiteOrigin(event.headers as Record<string, string | undefined>);
        if (!shareId) {
            return {
                statusCode: 302,
                headers: { Location: `${origin}/ai-score/shared` },
                body: ''
            };
        }

        if (!isD1Configured()) {
            const entry = localStore.sharedCards.get(shareId);
            if (!entry) {
                return {
                    statusCode: 302,
                    headers: { Location: `${origin}/ai-score/shared` },
                    body: ''
                };
            }
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'public, max-age=300, s-maxage=300'
                },
                body: buildHtml({
                    origin,
                    shareId: entry.id,
                    name: entry.name,
                    title: entry.title,
                    score: entry.score,
                    tier: entry.tier,
                    imageUrl: entry.imageUrl || fallbackImage(origin)
                })
            };
        }

        const { rows } = await d1Query(
            `SELECT id, name, title, score, tier, public_image_url
             FROM shared_cards WHERE id = ? LIMIT 1`,
            [shareId]
        );
        const row = rows[0];
        if (!row) {
            return {
                statusCode: 302,
                headers: { Location: `${origin}/ai-score/shared` },
                body: ''
            };
        }

        const html = buildHtml({
            origin,
            shareId: String(row.id),
            name: String(row.name || 'Professional User'),
            title: String(row.title || 'Digital Professional'),
            score: Number(row.score || 50),
            tier: String(row.tier || '⚔️ AI-Resistant'),
            imageUrl: String(row.public_image_url || fallbackImage(origin))
        });

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'public, max-age=300, s-maxage=300'
            },
            body: html
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'unknown';
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to resolve share', details: message })
        };
    }
};
