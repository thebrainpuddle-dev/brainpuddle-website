import { Handler } from '@netlify/functions';
import axios from 'axios';

export const handler: Handler = async (event, context) => {
    // Handle GET - Return a hardcoded mock count since we don't have a live DB anymore.
    // The true count will just be however many rows are in the Google Sheet!
    if (event.httpMethod === 'GET') {
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: 'Tracking automatically', max: 100 })
        };
    }

    // Handle POST - claim a card
    if (event.httpMethod === 'POST') {
        try {
            const payload = JSON.parse(event.body || '{}');
            const { name, linkedinUrl, address, score, tier, pokemonName, imageUrl } = payload;

            if (!name || !linkedinUrl || !address) {
                return { statusCode: 400, body: JSON.stringify({ error: "Missing required fields" }) };
            }

            const webhookUrl = process.env.BrainPuddle;

            // If the user hasn't set up the webhook yet, we still return a success so the UI works
            // and we log it so they can see it in Netlify logs.
            if (!webhookUrl) {
                console.log('--- NEW CARD CLAIM RECEIVED (Setup Pending) ---');
                console.log(`Name: ${name}\nLinkedIn: ${linkedinUrl}\nAddress: ${address}\nScore: ${score}\nStage: ${pokemonName}\nImage URL: ${imageUrl}`);
                console.log('Please add BrainPuddle to your Netlify Environment Variables to send this to Google Sheets automatically.');

                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ success: true, count: "?", message: "Card claimed successfully! (Webhook setup pending)" })
                };
            }

            // Forward the payload to Make.com / Zapier or FormSubmit
            await axios.post(webhookUrl, {
                timestamp: new Date().toISOString(),
                name,
                linkedinUrl,
                address,
                score,
                tier,
                pokemonName,
                imageUrl
            });

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: true, message: "Card claimed successfully and sent to Google Sheets!" })
            };

        } catch (error: any) {
            console.error("Webhook forwarding error:", error.message);
            return { statusCode: 500, body: JSON.stringify({ error: "Failed to process claim via webhook" }) };
        }
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
};
