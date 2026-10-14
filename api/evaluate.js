// Install this package via npm before deploying: npm install @google/genai
const { GoogleGenAI } = require('@google/genai');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { parcelId, county } = req.body;

    if (!parcelId) {
        return res.status(400).json({ error: 'Parcel ID is required' });
    }

    // Initialize Gemini API (Make sure to add GEMINI_API_KEY to your Vercel Environment Variables)
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Inject the skill instructions
    const systemInstruction = `
    You are the Kretz Forester Live Cross-Reference Engine.
    When given a Parcel ID and County, execute an instant cross-reference:
    1. Estimate Assessed Tax Value.
    2. Estimate CMA Bare Land Value (+15-25% over tax roll).
    3. Calculate Estimated Standing Timber (based on 2026 WI DNR Stumpage Rates & SSURGO soils).
    4. Calculate Total FMV.
    
    Output strictly in this format:
    PARCEL CROSS-REFERENCE: [Parcel ID] | COUNTY: [County]
    - Acreage: [Total Acres]
    - Assessed Tax Value: $[Value]
    - CMA Bare Land Estimate: $[Value]
    - Estimated Standing Timber (2026 DNR Rates): $[Value]
    - TOTAL ESTIMATED FMV: $[Total Value]
    - Quick Insight: [One sentence analysis]
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Run a cross-reference for Parcel ID: ${parcelId} in ${county} County.`,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.2, // Low temperature for consistent financial outputs
            }
        });

        res.status(200).json({ result: response.text });
    } catch (error) {
        console.error("AI Generation Error:", error);
        res.status(500).json({ error: 'Failed to generate valuation.' });
    }
}