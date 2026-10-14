'use strict';

// Phase 1 parcel intelligence. Everything here is fetched or computed in
// code from public sources; no model is involved.
//
//   POST { objectId, parcelId }  ->  ownership, MFL/FCL enrollment, soils,
//                                    comparable land sales, lead signals
//
// Each section succeeds or fails on its own, and a failure is reported as
// an error for that section, never as "none found".

const { handleCors } = require('./_lib/origin');
const { fetchParcel, PARCEL_SVC } = require('./_lib/parcel');
const { analyzeOwnership } = require('./_lib/ownership');
const { lookupTaxLaw, TAXLAW_SVC } = require('./_lib/mfl');
const { lookupSoils, SDA_URL } = require('./_lib/soils');
const { findComps } = require('./_lib/comps');

const LEAD_MIN_ACRES = 40;
const MFL_EXPIRING_YEARS = 5;

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
const settled = (r) => r.status === 'fulfilled' ? { ok: true, ...r.value } : { ok: false, error: r.reason && r.reason.message || String(r.reason) };

function leadSignals(p, ownership, mfl) {
    const gis = num(p.GISACRES), deed = num(p.DEEDACRES);
    const acres = gis !== null ? gis : deed;
    const acresSource = gis !== null ? 'GIS acres' : 'deed acres';

    const criteria = [
        { key: 'acres', label: `${LEAD_MIN_ACRES}+ acres`,
          met: acres === null ? null : acres >= LEAD_MIN_ACRES,
          detail: acres === null ? 'Acreage not on record' : `${acres.toLocaleString('en-US', { maximumFractionDigits: 2 })} ac (${acresSource})` },
        { key: 'absentee', label: 'Absentee owner',
          met: ownership.status === 'absentee' ? true : ownership.status === 'resident' ? false : null,
          detail: ownership.label },
        { key: 'unenrolled', label: 'Not enrolled in MFL / Forest Crop',
          met: !mfl.ok ? null : mfl.status === 'none_found',
          detail: !mfl.ok ? 'Enrollment check failed' : mfl.status === 'enrolled'
              ? `Enrolled: ${mfl.matched.map(o => o.orderNo).join(', ')}` : 'No enrollment matched this parcel' }
    ];
    const expiring = mfl.ok ? mfl.matched.filter(o => o.yearsRemaining !== null && o.yearsRemaining >= 0 && o.yearsRemaining <= MFL_EXPIRING_YEARS) : [];
    const known = criteria.filter(c => c.met !== null);
    return {
        criteria,
        allCriteriaMet: known.length === criteria.length && known.every(c => c.met),
        expiringEnrollments: expiring.map(o => ({ orderNo: o.orderNo, expires: o.expires, yearsRemaining: o.yearsRemaining })),
        note: 'Public records cannot show whether land is actively managed. "Not enrolled" is the closest public proxy.'
    };
}

async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Body must be JSON.' }); }
    }
    const objectId = Number(body && body.objectId);
    const parcelId = body && typeof body.parcelId === 'string' ? body.parcelId : null;
    if (!Number.isInteger(objectId) || objectId <= 0) {
        return res.status(400).json({ error: 'Request must include a numeric objectId from the statewide parcel layer.' });
    }

    let parcel;
    try {
        parcel = await fetchParcel(objectId);
    } catch (e) {
        return res.status(502).json({ error: e.message });
    }
    if (!parcel) return res.status(404).json({ error: `No statewide parcel with OBJECTID ${objectId}.` });
    const p = parcel.properties;
    if (parcelId && p.PARCELID && parcelId !== p.PARCELID) {
        return res.status(409).json({ error: `Parcel mismatch: OBJECTID ${objectId} is ${p.PARCELID}, not ${parcelId}. Reload the parcel.` });
    }

    const ownership = analyzeOwnership(p);
    const [mflResult, soilsResult] = await Promise.allSettled([lookupTaxLaw(parcel), lookupSoils(parcel)]);
    const mfl = settled(mflResult), soils = settled(soilsResult);
    let comps;
    try { comps = { ok: true, ...findComps(parcel) }; } catch (e) { comps = { ok: false, error: e.message }; }

    return res.status(200).json({
        parcel: { objectId, parcelId: p.PARCELID || null, county: p.CONAME || null,
            gisAcres: num(p.GISACRES), deedAcres: num(p.DEEDACRES), taxRollYear: p.TAXROLLYEAR || null },
        ownership,
        mfl,
        soils,
        comps,
        lead: leadSignals(p, ownership, mfl),
        sources: [
            { name: 'Wisconsin Statewide Parcel Database (V12, 2026)', url: PARCEL_SVC.replace(/\/query$/, '') },
            { name: 'WI DNR Tax Law Points (MFL / Forest Crop)', url: TAXLAW_SVC.replace(/\/query$/, '') },
            { name: 'USDA NRCS Soil Data Access (SSURGO)', url: SDA_URL },
            { name: 'WI DOR Real Estate Transfer Returns', url: 'https://revenue.wi.gov/Pages/ERETR/data-home.aspx' }
        ],
        generatedAt: new Date().toISOString()
    });
}

module.exports = handler;
module.exports.leadSignals = leadSignals;
