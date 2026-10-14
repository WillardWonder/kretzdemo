# Kretz Parcel Scout

Mobile field app for Kretz Land Co. foresters. Tap **Use My GPS Location** (or tap the map, or search a Parcel ID) to pull the parcel record from the Wisconsin Statewide Parcel Database (V12, 2026).

## How it works

- `public/index.html`: map, GPS, and parcel lookup. Queries the statewide parcel FeatureServer directly from the browser and renders the card **straight from the county record**. No model is involved in any value on the card.
- `api/evaluate.js`: parcel intelligence, fetched and computed in code (no model):
  - **Ownership:** absentee check from mailing vs. site address and improvement value.
  - **MFL / Forest Crop:** WI DNR Tax Law Points. Each point marks an enrolled quarter-quarter at its center, so matching is by county parcel number or by the point falling inside the parcel. Enrollments within 300 m that don't match are listed separately as unconfirmed.
  - **Soils:** USDA NRCS Soil Data Access (SSURGO). Map units are clipped to the parcel for acres, and site index is area-weighted per species.
  - **Lead signals:** 40+ acres, absentee, not enrolled, plus MFL orders expiring within 5 years.
  - The server re-fetches the parcel by OBJECTID, so all lookups use the authoritative record. Each section fails independently and reports its error.
- `api/summary.js`: optional "AI field summary". Gemini rewrites the verified record as a few sentences. Any number in its output that isn't in the record causes the summary to be rejected.
- `api/_lib/`: shared helpers (HTTP, geometry, ownership, MFL, soils, origin check).

## Data rules

- Missing county values show `Data Pending County Update`.
- Timber volume and comparable sales are never in the public record and are labeled as such.
- A failed query shows an error, never "no parcel". A point outside any parcel says so. Nothing is ever substituted.
- If GPS error reaches neighboring parcels, the card says so and lets you switch.

## Roadmap

1. ~~Parcel record, ownership, MFL, soils~~ (done)
2. Versioned WI DNR stumpage rate table in the repo, with source and rate year
3. Indicative timber value as a labeled range, computed in code from acres, site index and stumpage, with every input shown; Gemini writes the narrative only

## Vercel environment variables

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | For AI summary only | Gemini API key |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.5-flash-lite` |
| `ALLOWED_ORIGINS` | No | Extra origins allowed to call `/api/evaluate` (same-origin always allowed) |
