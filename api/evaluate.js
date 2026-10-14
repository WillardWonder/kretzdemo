export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { parcelId, county, ownerName } = req.body;

    if (!parcelId || parcelId.startsWith("NO_PARCEL")) {
        return res.status(200).json({ 
            result: "NOTICE: Selected location is outside private tax parcels (Institutional, Public Land, or Unmapped Right-of-Way). No active forest inventory or timber assessment available for this coordinate." 
        });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is missing in Vercel settings.' });
    }

    const systemInstruction = `
    You are the Kretz Forester Live Cross-Reference Engine. 
    You must rely strictly on official county assessment structures and 2026 WI DNR Stumpage Rates. Never fabricate, estimate, or invent data. If specific valuation fields or assessment values are missing from the public record, explicitly state 'Data Pending County Update'.
    
    Output strictly in this format:
    PARCEL CROSS-REFERENCE: ${parcelId} | COUNTY: ${county || 'Northwoods Region'}
    - Owner of Record: ${ownerName || 'Private / Unlisted'}
    - Assessed Tax Value: [Official Record or 'Pending County Update']
    - CMA Bare Land Estimate: [Open Market Comp or 'Pending County Update']
    - Estimated Standing Timber (2026 DNR Rates): [Verified Timber Class or 'Pending County Update']
    - TOTAL ESTIMATED FMV: [Calculated from verified data or 'Pending County Update']
    - Quick Insight: [Strict factual assessment based on public attributes]
    `;

    try {
        // Configured to use gemini-3.5-flash-lite
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: {
                    parts: [{ text: systemInstruction }]
                },
                contents: [{
                    parts: [{ text: `Cross-reference Parcel ID: ${parcelId} in ${county} County, Owner: ${ownerName}` }]
                }],
                generationConfig: {
                    temperature: 0.0 // Zero temperature to ensure strict factual fidelity
                }
            })
        });

        const data = await geminiRes.json();
        
        if (data.error) {
            console.error("Gemini API Error Detail:", data.error);
            if (data.error.code === 429) {
                return res.status(429).json({ error: 'Free tier rate limit reached. Please wait a moment for your quota window to reset.' });
            }
            return res.status(500).json({ error: `API Error (${data.error.code}): ${data.error.message}` });
        }

        if (data.candidates && data.candidates[0].content.parts[0].text) {
            return res.status(200).json({ result: data.candidates[0].content.parts[0].text });
        } else {
            return res.status(500).json({ error: 'Unexpected response structure returned from Gemini API.' });
        }

    } catch (error) {
        console.error("Serverless Function Error:", error);
        return res.status(500).json({ error: 'Server error during cross-reference lookup: ' + error.message });
    }
}
