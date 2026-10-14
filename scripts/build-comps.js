#!/usr/bin/env node
'use strict';

// Build data/comps.json from Wisconsin DOR RETR "Historical Data" CSV files.
//
//   node scripts/build-comps.js RETRHistoricalReport202608.csv [more.csv ...]
//
// Merges into the existing data/comps.json (deduplicated by document
// number), so you can add one month at a time. Keeps only arm's-length,
// full-parcel, land-only sales of rural land with a price. Buyer, seller,
// agent and address fields are never written.

const fs = require('fs');
const path = require('path');
const { sectionCenter } = require('../api/_lib/plss');

const OUT = path.join(__dirname, '..', 'data', 'comps.json');
const MIN_ACRES = 5;
const USE_CLASS = {
    'Productive forest land (Class 6)': '6',
    'Agricultural forest (Class 5m)': '5M',
    'Undeveloped land (Class 5)': '5',
    'Agricultural (Class 4)': '4'
};
const FIELDS = ['doc', 'county', 'municipality', 'date', 'use', 'acres', 'mflAcres', 'price', 'parcel', 'lat', 'lng', 'plss', 'waterFt'];

// RFC 4180 CSV parser (quoted fields, embedded commas/newlines, "" escapes).
function parseCsv(text) {
    const rows = []; let row = [], field = '', i = 0, quoted = false;
    if (text.charCodeAt(0) === 0xFEFF) i = 1;
    for (; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
            else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') { row.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field); rows.push(row); row = []; field = '';
        } else field += ch;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
}

const money = (s) => Number(String(s || '').replace(/[$,\s]/g, '')) || 0;
const number = (s) => Number(String(s || '').replace(/[,\s]/g, '')) || 0;
function isoDate(mmddyyyy) {
    const m = String(mmddyyyy || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
    return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

function qualifies(r) {
    return r['Conveyance Type'] === 'Sale'
        && r['Grantor/Grantee Relationship'] === 'No relationship'
        && r['Ownership Type'] === 'Full'
        && String(r['Part of Parcel Transferred']).startsWith('1.')
        && r['Property Type'] === 'Land only'
        && r['Rights Retained by Grantor'] === 'None'
        && USE_CLASS[r['Property Use Type']]
        && money(r['Sale Price']) > 0
        && money(r['Personal Property Included']) === 0
        && number(r['Acres']) >= MIN_ACRES;
}

function toComp(r) {
    const loc = sectionCenter(r['Section'], r['Township'], r['Range'], r['Meridian']);
    if (!loc) return null;
    return {
        doc: String(r['Document Number']).trim(),
        county: r['County'],
        municipality: r['Municipality'],
        date: isoDate(r['Conveyance Date']) || isoDate(r['Recorded Date']),
        use: USE_CLASS[r['Property Use Type']],
        acres: number(r['Acres']),
        mflAcres: number(r['MFL/PFC Acres']),
        price: money(r['Sale Price']),
        parcel: String(r['Parcel Number']).replace(/^[\s\t]+|\s+$/g, ''),
        lat: Math.round(loc.lat * 1e5) / 1e5,
        lng: Math.round(loc.lng * 1e5) / 1e5,
        plss: `S${r['Section']} T${r['Township']}N R${r['Range']}${String(r['Meridian']).startsWith('W') ? 'W' : 'E'}`,
        waterFt: number(r['Feet of Water Frontage'])
    };
}

function main(files) {
    if (!files.length) { console.error('Usage: node scripts/build-comps.js <RETR csv> [...]'); process.exit(1); }
    const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
    const byDoc = new Map();
    if (existing) for (const row of existing.rows) {
        const c = Object.fromEntries(existing.fields.map((f, i) => [f, row[i]]));
        byDoc.set(`${c.county}|${c.doc}`, c);
    }
    let read = 0, kept = 0, noPlss = 0;
    for (const file of files) {
        const [header, ...rows] = parseCsv(fs.readFileSync(file, 'utf8'));
        for (const values of rows) {
            if (values.length < header.length / 2) continue;
            read++;
            const r = Object.fromEntries(header.map((h, i) => [h, values[i]]));
            if (!qualifies(r)) continue;
            const c = toComp(r);
            if (!c) { noPlss++; continue; }
            byDoc.set(`${c.county}|${c.doc}`, c); kept++;
        }
    }
    const comps = [...byDoc.values()].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const dates = comps.map(c => c.date).filter(Boolean).sort();
    const out = {
        source: 'Wisconsin DOR Real Estate Transfer Returns (RETR), Historical Data CSV',
        filter: `Arm's-length sale, full parcel, land only, no rights retained, no personal property, >= ${MIN_ACRES} ac, use class 4/5/5M/6`,
        coverage: { from: dates[0] || null, to: dates[dates.length - 1] || null },
        builtAt: new Date().toISOString(),
        fields: FIELDS,
        rows: comps.map(c => FIELDS.map(f => c[f]))
    };
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out));
    console.log(`Read ${read} returns; kept ${kept} (${noPlss} qualifying sales skipped for missing PLSS). ` +
        `comps.json now has ${comps.length} sales, ${out.coverage.from} to ${out.coverage.to}.`);
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { parseCsv, qualifies, toComp };
