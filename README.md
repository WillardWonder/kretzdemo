# Kretz Parcel Scout

Mobile field app for Kretz Land Co. foresters. Tap **Use My GPS Location** (or tap the map, or search a Parcel ID) to pull the parcel record from the Wisconsin Statewide Parcel Database (V12, 2026).

## How it works

- `public/index.html`: map, GPS, and parcel lookup. Queries the statewide parcel FeatureServer directly from the browser and renders the card **straight from the county record**. No model is involved in any value on the card.
- `api/evaluate.js`: optional "AI field summary". Gemini rewrites the verified record as a few sentences. Any number in its output that isn't in the record causes the summary to be rejected.

## Data rules

- Missing county values show `Data Pending County Update`.
- Timber volume and comparable sales are never in the public record and are labeled as such.
- A failed query shows an error, never "no parcel". A point outside any parcel says so. Nothing is ever substituted.
- If GPS error reaches neighboring parcels, the card says so and lets you switch.

## Vercel environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | For AI summary only | Gemini API key |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.5-flash-lite` |
| `ALLOWED_ORIGINS` | No | Extra origins allowed to call `/api/evaluate` (same-origin always allowed) |
