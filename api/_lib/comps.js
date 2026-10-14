'use strict';

// Comparable land sales from data/comps.json (built from WI DOR RETR files
// by scripts/build-comps.js). Market evidence, not an appraisal: the card
// shows each sale so a forester can judge it.

const { bbox } = require('./geo');

let data;
try { data = require('../../data/comps.json'); } catch { data = null; }
const rows = data ? data.rows.map(r => Object.fromEntries(data.fields.map((f, i) => [f, r[i]]))) : [];

const USES = new Set(['6', '5M', '5']);           // forest, ag forest, undeveloped
const USE_LABEL = { '6': 'Productive forest', '5M': 'Agricultural forest', '5': 'Undeveloped', '4': 'Agricultural' };
const RADII_MILES = [15, 30, 50];
const MIN_COMPS = 5, MAX_COMPS = 12;

const milesBetween = (a, b) => {
    const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
    return Math.hypot((a.lat - b.lat) * 69.05, (a.lng - b.lng) * 69.17 * k);
};
function percentile(sorted, p) {
    const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);

function findComps(parcel) {
    if (!data) throw new Error('Comparable sales data (data/comps.json) is not loaded.');
    const p = parcel.properties;
    const [minX, minY, maxX, maxY] = bbox(parcel.geometry);
    const subject = { lat: (minY + maxY) / 2, lng: (minX + maxX) / 2 };
    const subjectAcres = num(p.GISACRES) || num(p.DEEDACRES) || num(p.ASSDACRES);

    const pool = rows.filter(r => USES.has(r.use)).map(r => ({ ...r, distanceMiles: milesBetween(subject, r) }));
    const similarSize = (r) => !subjectAcres || (r.acres >= subjectAcres / 4 && r.acres <= subjectAcres * 4);

    let chosen = [], radius = null, sizeMatched = false;
    for (const rad of RADII_MILES) {
        const near = pool.filter(r => r.distanceMiles <= rad);
        const sized = near.filter(similarSize);
        if (sized.length >= MIN_COMPS) { chosen = sized; radius = rad; sizeMatched = Boolean(subjectAcres); break; }
        if (near.length >= MIN_COMPS || rad === RADII_MILES[RADII_MILES.length - 1]) { chosen = near; radius = rad; break; }
    }
    chosen = chosen.sort((a, b) => a.distanceMiles - b.distanceMiles).slice(0, MAX_COMPS);

    const base = { coverage: data.coverage, source: data.source, filter: data.filter, subjectAcres,
        method: 'Sale price ÷ deeded acres. Sale locations are PLSS section centers (about ±1 km).' };
    if (!chosen.length) {
        return { ...base, status: 'none', radiusMiles: radius, count: 0, comps: [],
            note: `No qualifying land sales within ${radius} miles in the loaded data.` };
    }
    const ppa = chosen.map(c => c.price / c.acres).sort((a, b) => a - b);
    const round = (v) => Math.round(v);
    return {
        ...base,
        status: 'ok', radiusMiles: radius, count: chosen.length, sizeMatched,
        pricePerAcre: {
            median: round(percentile(ppa, 0.5)),
            p25: chosen.length >= 4 ? round(percentile(ppa, 0.25)) : null,
            p75: chosen.length >= 4 ? round(percentile(ppa, 0.75)) : null,
            min: round(ppa[0]), max: round(ppa[ppa.length - 1])
        },
        comps: chosen.map(c => ({
            date: c.date, county: c.county, municipality: c.municipality, use: USE_LABEL[c.use] || c.use,
            acres: c.acres, mflAcres: c.mflAcres || 0, price: c.price, pricePerAcre: round(c.price / c.acres),
            distanceMiles: Math.round(c.distanceMiles * 10) / 10, plss: c.plss, parcel: c.parcel, waterFt: c.waterFt || 0
        }))
    };
}

module.exports = { findComps };
