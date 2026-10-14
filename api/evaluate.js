export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
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
        return res.status(500).json({ error: 'Server configuration error: API key missing.' });
    }

    const systemInstruction = `
    You are the Kretz Forester Live Cross-Reference Engine. 
    You must rely strictly on official county assessment structures and 2026 WI DNR Stumpage Rates. Do not fabricate or invent data. If specific valuation fields are missing from the public record, indicate 'Data Pending County Update'.
    
    Output strictly in this format:
    PARCEL CROSS-REFERENCE: ${parcelId} | COUNTY: ${county || 'Northwoods Region'}
    - Owner of Record: ${ownerName || 'Private / Unlisted'}
    - Assessed Tax Value: [Pull from public record or indicate 'Pending']
    - CMA Bare Land Estimate: [Calculate based on regional comps]
    - Estimated Standing Timber (2026 DNR Rates): [Calculate based on soil/forest class]
    - TOTAL ESTIMATED FMV: [Sum]
    - Quick Insight: [Analysis based strictly on verified parameters]
    `;

    try {
        // Direct REST call to Gemini - requires zero npm packages!
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
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
                    temperature: 0.1
                }
            })
        });

        const data = await geminiRes.json();
        
        if (data.candidates && data.candidates[0].content.parts[0].text) {
            const aiText = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ result: aiText });
        } else {
            throw new Error(JSON.stringify(data));
        }

    } catch (error) {
        console.error("AI Generation Error:", error);
        return res.status(500).json({ error: 'Failed to query state assessment data.' });
    }
}
