import { Handler } from '@netlify/functions';
import axios from 'axios';

const generateAnalysis = (input: string) => {
    let name = "Professional User";
    let isKarthik = input.toLowerCase().includes('karthik-guduru');

    if (isKarthik) {
        name = "Karthik";
    }

    return {
        score: isKarthik ? 35 : 75 + Math.floor(Math.random() * 20),
        tier: isKarthik ? "🛡️ AI-Resistant" : "⚠️ Automatable",
        tierColor: isKarthik ? "#2b5cff" : "#ff4d4d",
        categories: [
            { name: "Creative Strategy", score: isKarthik ? 95 : 40 + Math.floor(Math.random() * 30), max: 100 },
            { name: "Technical Depth", score: isKarthik ? 92 : 50 + Math.floor(Math.random() * 30), max: 100 },
            { name: "Human Empathy", score: isKarthik ? 88 : 70 + Math.floor(Math.random() * 30), max: 100 },
            { name: "Repetitive Tasks", score: isKarthik ? 15 : 85 + Math.floor(Math.random() * 10), max: 100 }
        ],
        xp: isKarthik ? 12500 : 2500 + Math.floor(Math.random() * 2000),
        levelUpSuggestions: [
            isKarthik ? "Scale your architectural vision across more teams." : "Automate your repetitive workflows immediately.",
            isKarthik ? "Publish your proprietary AI integration frameworks." : "Develop cross-functional strategic skills.",
            isKarthik ? "Build empathetic client networks." : "Focus on complex edge-case problem solving."
        ],
        pokemon: {
            name: name,
            title: isKarthik ? "The Architect" : "Operations Specialist",
            photoUrl: "",
            type: isKarthik ? "Visionary" : "Execution",
            stage: isKarthik ? "Master Level" : "Basic Level",
            hp: isKarthik ? 290 : 120 + Math.floor(Math.random() * 50),
            skills: isKarthik ? ["Systems Thinking", "AI Integration", "Product Strategy", "Client Empathy"] : ["Data Entry", "Basic Reporting", "Schedule Management", "Email Triage"],
            stats: {
                cognitiveDepth: isKarthik ? 94 : 45,
                decisionAutonomy: isKarthik ? 96 : 30,
                adaptability: isKarthik ? 90 : 50,
                systemLeverage: isKarthik ? 98 : 20
            },
            primaryDomain: isKarthik ? "AI Solutions" : "Business Operations",
            operatingMode: isKarthik ? "Architectural" : "Execution",
            humanLeverage: isKarthik ? "High" : "Low",
            powerUps: [
                { name: "Domain Knowledge", desc: "Instantly solves business logic edge cases." },
                { name: "Client Empathy", desc: "Deflects scope creep and restores project health." }
            ],
            pokedexEntry: `A highly adaptable entity. When threatened by automation, it instinctively creates a new framework. Known to survive entirely on oat milk lattes during launch weeks.`
        }
    };
};

export const handler: Handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const payload = JSON.parse(event.body || '{}');
        const { type, data } = payload;
        const fallbackInput = payload.input || data;

        let extractedText = "";

        if (type === 'url') {
            console.log("LinkedIn URL provided - calling Relevance AI webhook.");
            try {
                if (!process.env.RELEVANCE_WEBHOOK_URL || !process.env.RELEVANCE_API_KEY) {
                    throw new Error("Missing Relevance API config");
                }
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
            } catch (err: any) {
                console.error("Relevance API Error:", err.response?.data || err.message);
                return { statusCode: 500, body: JSON.stringify({ error: "Failed to scrape LinkedIn profile. Please try uploading a PDF Resume or Paste your text instead." }) };
            }
        } else {
            console.log("Raw text/bio provided.");
            extractedText = data || fallbackInput;
        }

        if (!process.env.OPENAI_API_KEY) {
            console.log("No OPENAI key found, returning mock data.");
            const analysis = generateAnalysis(extractedText || fallbackInput || "user");
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(analysis)
            };
        }

        const prompt = `You are an expert AI workforce analyst and gamification expert. The user has provided the following profile text, bio, or background context: \n\n"""\nEXTRACTED TEXT:\n${extractedText}\n\nRAW INPUT STRING (MIGHT BE A URL):\n${data}\n"""\n 
Analyze their skills and determine how easily they could be replaced by AI. 
Provide a brutal but fun gamified report card in the style of a Pokémon card. 
Return ONLY a valid JSON object matching this exact structure:

{
  "score": <number 0-100, where lower means harder to replace, higher means easily replacable>,
  "tier": "<Emoji and Tier Name, e.g. 🛡️ AI-Resistant or ⚠️ Automatable>",
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
      "<Suggestion 2: Short actionable sentence...>"
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

NOTE ON HALLUCINATIONS: If the input is just a URL without deep body text, DO NOT hallucinate heavily specific skills like "E-commerce solutions" or "Medical routing". Infer generic but highly professional traits based on the URL slug or job title.`;

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
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(analysis)
        };

    } catch (error: any) {
        console.error("Analysis error:", error?.response?.data || error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to analyze profile via OpenAI" })
        };
    }
};
