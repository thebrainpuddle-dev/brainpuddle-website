import { Handler } from '@netlify/functions';
import axios from 'axios';

const getInitials = (name: string) =>
    String(name || "BrainPuddle User")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("") || "BP";

const buildInitialsFallbackImage = (name: string) => {
    const initials = getInitials(name).replace(/[^A-Z0-9]/g, "").slice(0, 2) || "BP";
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1024" viewBox="0 0 768 1024" role="img" aria-label="Fallback profile image">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffe8d6"/>
      <stop offset="50%" stop-color="#ffd3b3"/>
      <stop offset="100%" stop-color="#ffb07c"/>
    </linearGradient>
  </defs>
  <rect width="768" height="1024" fill="url(#bg)"/>
  <g fill="none" stroke="rgba(255,255,255,0.35)">
    <circle cx="130" cy="150" r="92"/>
    <circle cx="650" cy="900" r="110"/>
  </g>
  <rect x="64" y="128" width="640" height="768" rx="40" fill="rgba(255,255,255,0.6)" stroke="rgba(255,255,255,0.8)" stroke-width="4"/>
  <text x="384" y="565" text-anchor="middle" font-size="230" font-family="Inter, Arial, sans-serif" font-weight="800" fill="#2f1607" letter-spacing="8">${initials}</text>
  <text x="384" y="645" text-anchor="middle" font-size="36" font-family="Inter, Arial, sans-serif" fill="#4f2c17" opacity="0.85">BrainPuddle Profile Card</text>
</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

export const handler: Handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { name, imagePromptBase64 } = JSON.parse(event.body || '{}');
        const BFL_API_KEY = process.env.VITE_BFL_API_KEY || process.env.BFL_API_KEY;

        if (imagePromptBase64) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: imagePromptBase64 })
            };
        }

        if (!BFL_API_KEY) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageUrl: buildInitialsFallbackImage(name),
                    fallback: true
                })
            };
        }

        let prompt;
        const reqBody: any = {
            width: 768,
            height: 1024,
            prompt_upsampling: false,
            seed: Math.floor(Math.random() * 1000000),
            safety_tolerance: 2,
            output_format: "jpeg"
        };

        const initials = name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();
        prompt = `3D typography initials '${initials}'. The letters MUST be scaled down and placed in the exact dead center of the image, surrounded by massive amounts of empty negative space on all sides (top, bottom, left, and right). It is absolutely critical that the letters are small enough to have wide borders and do not touch or get cut off by the canvas edges. Studio Ghibli inspired magical aesthetic, clean smooth gradient background suitable for a trading card. Cinematic lighting, highly realistic minimal 3D render.`;
        reqBody.prompt = prompt;

        const createResponse = await axios.post('https://api.bfl.ai/v1/flux-pro-1.1', reqBody, {
            headers: {
                'x-key': BFL_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        const taskId = createResponse.data.id;
        const pollingUrl = createResponse.data.polling_url || `https://api.bfl.ai/v1/get_result?id=${taskId}`;

        let resultUrl = null;
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const pollResponse = await axios.get(pollingUrl);

            if (pollResponse.data.status === 'Ready') {
                resultUrl = pollResponse.data.result.sample;
                break;
            } else if (pollResponse.data.status === 'Failed') {
                throw new Error("Flux API generation failed.");
            }
        }

        if (resultUrl) {
            const imageBufferResponse = await axios.get(resultUrl, { responseType: 'arraybuffer' });
            const b64 = Buffer.from(imageBufferResponse.data, 'binary').toString('base64');
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: `data:image/jpeg;base64,${b64}` })
            };
        } else {
            return {
                statusCode: 504,
                body: JSON.stringify({ error: "Image generation timed out." })
            };
        }

    } catch (error: any) {
        console.error("Flux Error:", error?.response?.data || error.message);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                imageUrl: buildInitialsFallbackImage("BrainPuddle User"),
                fallback: true
            })
        };
    }
};
