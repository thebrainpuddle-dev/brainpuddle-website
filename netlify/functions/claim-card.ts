import { Handler } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

export const handler: Handler = async (event, context) => {
    // Initialize the store
    const store = getStore("brainpuddle_claims");

    const getClaimsFromStore = async () => {
        try {
            const data = await store.get("claims_data", { type: "json" });
            if (data) return data as any;
        } catch (e) {
            console.error("No existing store found or error reading", e);
        }
        return { count: 0, claims: [] };
    };

    const saveClaimsToStore = async (data: any) => {
        await store.setJSON("claims_data", data);
    };

    // Handle GET - just return the current count
    if (event.httpMethod === 'GET') {
        const db = await getClaimsFromStore();
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: db.count || 0, max: 100 })
        };
    }

    // Handle POST - claim a card
    if (event.httpMethod === 'POST') {
        try {
            const payload = JSON.parse(event.body || '{}');
            const { name, linkedinUrl, address } = payload;

            if (!name || !linkedinUrl || !address) {
                return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
            }

            const db = await getClaimsFromStore();
            db.count = db.count || 0;
            db.claims = db.claims || [];

            if (db.count >= 100) {
                return { statusCode: 400, body: JSON.stringify({ error: "All 100 physical cards have been claimed!" }) };
            }

            // Check if already claimed
            const alreadyClaimed = db.claims.find((c: any) => c.linkedinUrl === linkedinUrl);
            if (alreadyClaimed) {
                return { statusCode: 400, body: JSON.stringify({ error: "A card has already been claimed for this LinkedIn profile." }) };
            }

            // Create claim
            const claim = {
                id: Date.now().toString(),
                name,
                linkedinUrl,
                address,
                timestamp: new Date().toISOString()
            };

            db.claims.push(claim);
            db.count = db.claims.length;

            await saveClaimsToStore(db);

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, count: db.count, message: "Card claimed successfully!" })
            };

        } catch (error) {
            console.error(error);
            return { statusCode: 500, body: JSON.stringify({ error: "Failed to process claim" }) };
        }
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
