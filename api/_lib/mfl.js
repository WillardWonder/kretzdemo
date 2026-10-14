'use strict';

// Managed Forest Law / Forest Crop Law enrollment from the WI DNR
// "Wisconsin Tax Law Points" layer. Each point is one enrolled PLSS
// quarter-quarter (QQ), placed at the QQ center, not on the exact land.
// A QQ is ~400 m square, so any QQ touching the parcel has its point within
// ~285 m of the parcel; a 300 m search catches all of them.

const { fetchJson } = require('./http');
const { bbox, expandBbox, pointInGeometry, distanceMeters } = require('./geo');

const TAXLAW_SVC = 'https://services5.arcgis.com/Ul9AyFFeFTjf08DW/arcgis/rest/services/X13661_FR_GIS_TAXLAW_PT_SV/FeatureServer/0/query';
const SEARCH_M = 300;
const MATCH_RANK = { 'parcel number': 2, 'location': 1 };

const idNorm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function parcelIdsMatch(a, b) {
    a = idNorm(a); b = idNorm(b);
    if (!a || !b) return false;
    if (a === b) return true;
    const [short, long] = a.length < b.length ? [a, b] : [b, a];
    return short.length >= 7 && long.endsWith(short);
}
const expirationYear = (s) => { const m = String(s || '').match(/(\d{4})\s*$/); return m ? Number(m[1]) : null; };
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
const ACCESS = { O: 'Open to public', C: 'Closed to public' };

async function lookupTaxLaw(parcel, { now = new Date() } = {}) {
    const p = parcel.properties, g = parcel.geometry;
    const box = expandBbox(bbox(g), SEARCH_M);
    const params = new URLSearchParams({
        geometry: box.map(n => n.toFixed(7)).join(','), geometryType: 'esriGeometryEnvelope',
        inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects',
        outFields: '*', returnGeometry: 'true', resultRecordCount: '500', f: 'json'
    });
    const data = await fetchJson(`${TAXLAW_SVC}?${params}`, {}, { label: 'DNR tax-law service' });
    if (!Array.isArray(data.features)) throw new Error('DNR tax-law service returned an unexpected response.');

    const county = String(p.CONAME || '').toUpperCase();
    const year = now.getFullYear();
    const orders = new Map();

    for (const f of data.features) {
        const a = f.attributes || {}, x = f.geometry && f.geometry.x, y = f.geometry && f.geometry.y;
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const sameCounty = !county || !a.CNTY_NAME || String(a.CNTY_NAME).toUpperCase() === county;
        const idMatch = sameCounty && [p.PARCELID, p.TAXPARCELID].some(id => parcelIdsMatch(a.PARCEL_NO, id));
        const match = idMatch ? 'parcel number' : pointInGeometry(x, y, g) ? 'location' : null;
        const dist = Math.round(distanceMeters(x, y, g));

        const key = a.ORDER_NO || `FID-${a.FID}`;
        if (!orders.has(key)) {
            const expYear = expirationYear(a.ORDER_EXP);
            orders.set(key, {
                orderNo: a.ORDER_NO || null, program: a.TAX_TYPE || null, county: a.CNTY_NAME || null,
                entryYear: a.ENTRY_YEAR || null, expires: a.ORDER_EXP || null, expirationYear: expYear,
                yearsRemaining: expYear ? expYear - year : null, ownerType: a.OWNER_TEXT || null,
                orderAcres: { open: num(a.AC_OP_ORD), closed: num(a.AC_CL_ORD), total: num(a.AC_TOT_ORD) },
                match: null, nearestMeters: dist, tracts: []
            });
        }
        const o = orders.get(key);
        if (match && (!o.match || MATCH_RANK[match] > MATCH_RANK[o.match])) o.match = match;
        o.nearestMeters = Math.min(o.nearestMeters, dist);
        o.tracts.push({ description: a.DTRSLD_TXT || a.LEGAL_DESC || null, countyParcelNo: a.PARCEL_NO || null,
            acres: num(a.AC_TOT_PLS), access: ACCESS[a.ACCESS] || a.ACCESS || null, match, distanceMeters: dist });
    }

    const all = [...orders.values()];
    const matched = all.filter(o => o.match).sort((a, b) => MATCH_RANK[b.match] - MATCH_RANK[a.match]);
    const nearby = all.filter(o => !o.match).sort((a, b) => a.nearestMeters - b.nearestMeters).slice(0, 5);
    return {
        status: matched.length ? 'enrolled' : 'none_found',
        matched, nearby, searchRadiusMeters: SEARCH_M,
        truncated: Boolean(data.exceededTransferLimit),
        method: 'DNR tax-law points mark enrolled quarter-quarters at their center. Matched by county parcel number, or by the point falling inside this parcel.'
    };
}

module.exports = { lookupTaxLaw, parcelIdsMatch, expirationYear, TAXLAW_SVC };
