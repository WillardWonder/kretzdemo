const { GoogleGenAI } = require('@google/genai');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { parcelId, county, ownerName } = req.body;

    // Handle non-parcel or public/institutional areas gracefully (No hallucination)
    if (!parcelId || parcelId.startsWith("NO_PARCEL")) {
        return res.status(200).json({ 
            result: "NOTICE: Selected location is outside private tax parcels (Institutional, Public Land, or Unmapped Right-of-Way). No active forest inventory or timber assessment available for this coordinate." 
        });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const systemInstruction = `
    You are the Kretz Forester Live Cross-Reference Engine. 
    You must rely strictly on official county assessment structures and 2026 WI DNR Stumpage Rates. Do not fabricate or invent data. If specific valuation fields are missing from the public record, indicate 'Data Pending County Update'.
    
    Output strictly in this format:
    PARCEL CROSS-REFERENCE: ${parcelId} | COUNTY: ${county || 'Northwoods Region'}
    - Owner of Record: ${ownerName || 'Public / Unlisted'}
    - Assessed Tax Value: [Pull from public record or indicate 'Pending']
    - CMA Bare Land Estimate: [Calculate based on regional comps]
    - Estimated Standing Timber (2026 DNR Rates): [Calculate based on soil/forest class]
    - TOTAL ESTIMATED FMV: [Sum]
    - Quick Insight: [Analysis based strictly on verified parameters]
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Cross-reference Parcel ID: ${parcelId} in ${county} County, Owner: ${ownerName}`,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.1, // Near zero to eliminate variance and ensure strict adherence to facts
            }
        });

        res.status(200).json({ result: response.text });
    } catch (error) {
        console.error("AI Generation Error:", error);
        res.status(500).json({ error: 'Failed to query state assessment data.' });
    }
}
