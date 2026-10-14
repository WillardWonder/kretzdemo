'use strict';

// Soils and forest productivity from USDA NRCS Soil Data Access (SSURGO).
// 1) Clip soil map units to the parcel polygon to get acres per map unit.
// 2) Pull components and forest-productivity ratings (coforprod) for them.
// 3) Area-weight site index by species, in code.

const { fetchJson } = require('./http');
const { toWkt } = require('./geo');

const SDA_URL = 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest';
const SQ_M_TO_ACRES = 0.000247105;

async function sda(query) {
    const data = await fetchJson(SDA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, format: 'JSON+COLUMNNAME' })
    }, { label: 'USDA Soil Data Access', timeoutMs: 15000 });
    const table = data.Table;
    if (!Array.isArray(table) || table.length < 1) return [];
    const [cols, ...rows] = table;
    return rows.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
}

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
const round = (v, d = 1) => v === null ? null : Math.round(v * 10 ** d) / 10 ** d;

function clipQuery(wkt) {
    return `~DeclareGeometry(@aoi)~
select @aoi = geometry::STGeomFromText('${wkt}', 4326).MakeValid()
~DeclareIdGeomTable(@intersectedPolygonGeometries)~
~GetClippedMapunits(@aoi,polygon,geo,@intersectedPolygonGeometries)~
~DeclareIdGeogTable(@intersectedPolygonGeographies)~
~GetGeogFromGeomWgs84(@intersectedPolygonGeometries,@intersectedPolygonGeographies)~
select id as mukey, sum(geog.STArea()) * ${SQ_M_TO_ACRES} as acres
from @intersectedPolygonGeographies group by id`;
}

function attributeQuery(mukeys) {
    return `select mu.mukey, mu.musym, mu.muname, ma.drclassdcd,
  c.cokey, c.compname, c.comppct_r, c.majcompflag,
  fp.plantsym, fp.plantcomname, fp.siteindexbase, fp.siteindex_r, fp.fprod_r
from mapunit mu
left join muaggatt ma on ma.mukey = mu.mukey
inner join component c on c.mukey = mu.mukey
left join coforprod fp on fp.cokey = c.cokey
where mu.mukey in (${mukeys.join(',')})
order by mu.mukey, c.comppct_r desc`;
}

async function lookupSoils(parcel) {
    const wkt = toWkt(parcel.geometry);
    let acresByMukey = null, clipError = null, mukeys;

    try {
        const rows = await sda(clipQuery(wkt));
        acresByMukey = new Map(rows.map(r => [String(r.mukey), num(r.acres)]));
        mukeys = [...acresByMukey.keys()];
    } catch (e) {
        // Fall back to map unit list without acreage rather than nothing.
        clipError = e.message;
        const rows = await sda(`select distinct mukey from SDA_Get_Mukey_from_intersection_with_WktWgs84('${wkt}')`);
        mukeys = rows.map(r => String(r.mukey));
    }
    mukeys = mukeys.filter(k => /^\d{1,12}$/.test(k));
    if (!mukeys.length) {
        return { status: 'none', units: [], productivity: [], totalAcres: 0,
            note: 'No SSURGO soil map units intersect this parcel (open water or unsurveyed area).' };
    }

    const rows = await sda(attributeQuery(mukeys));
    const units = new Map();
    for (const r of rows) {
        const key = String(r.mukey);
        if (!units.has(key)) {
            units.set(key, { mukey: key, symbol: r.musym || null, name: r.muname || null, drainage: r.drclassdcd || null,
                acres: acresByMukey ? round(acresByMukey.get(key), 2) : null, components: new Map() });
        }
        const u = units.get(key);
        if (!u.components.has(r.cokey)) {
            u.components.set(r.cokey, { name: r.compname || null, percent: num(r.comppct_r),
                major: r.majcompflag === 'Yes', siteIndex: [] });
        }
        const si = num(r.siteindex_r);
        if (si !== null) {
            u.components.get(r.cokey).siteIndex.push({ species: r.plantcomname || r.plantsym || null, symbol: r.plantsym || null,
                siteIndex: si, method: r.siteindexbase || null, productivityFt3AcYr: num(r.fprod_r) });
        }
    }

    const list = [...units.values()].map(u => ({ ...u, components: [...u.components.values()] }));
    const totalAcres = acresByMukey ? round(list.reduce((s, u) => s + (u.acres || 0), 0), 2) : null;
    for (const u of list) u.percentOfParcel = totalAcres ? round(100 * (u.acres || 0) / totalAcres, 1) : null;
    list.sort((a, b) => (b.acres || 0) - (a.acres || 0));

    // Area-weighted site index per species and method (different methods
    // are not comparable, so they are kept separate). weight = map unit
    // acres x component percent.
    const productivity = [];
    if (acresByMukey) {
        const agg = new Map();
        for (const u of list) for (const c of u.components) for (const s of c.siteIndex) {
            const w = (u.acres || 0) * (c.percent || 0) / 100;
            if (!w) continue;
            const k = `${s.symbol}|${s.method}`;
            const a = agg.get(k) || { species: s.species, symbol: s.symbol, method: s.method, w: 0, si: 0, fw: 0, fp: 0 };
            a.w += w; a.si += w * s.siteIndex;
            if (s.productivityFt3AcYr !== null) { a.fw += w; a.fp += w * s.productivityFt3AcYr; }
            agg.set(k, a);
        }
        for (const a of agg.values()) {
            productivity.push({ species: a.species, symbol: a.symbol, method: a.method,
                siteIndex: Math.round(a.si / a.w), ratedAcres: round(a.w, 1),
                productivityFt3AcYr: a.fw ? Math.round(a.fp / a.fw) : null });
        }
        productivity.sort((a, b) => b.ratedAcres - a.ratedAcres);
    }

    return {
        status: acresByMukey ? 'ok' : 'partial',
        units: list, productivity, totalAcres,
        note: acresByMukey ? null : `Acreage by soil unit unavailable (${clipError}). Map units listed without area.`
    };
}

module.exports = { lookupSoils, clipQuery, attributeQuery, SDA_URL };
