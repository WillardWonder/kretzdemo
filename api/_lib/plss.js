'use strict';

// Approximate WGS84 location of a Wisconsin PLSS section center.
// Townships count north from the WI-IL baseline (42.5 N); ranges count
// east/west from the 4th Principal Meridian (90 25' 37" W). Townships are
// 6 miles square; sections are numbered boustrophedon from the NE corner.
// Surveyed lines drift from this ideal grid, so expect ~0.5-1.5 km error:
// fine for "comps within N miles", not for boundaries.

const BASELINE_LAT = 42.5;
const PM_LNG = -(90 + 25 / 60 + 37 / 3600);
const TOWNSHIP_M = 9656.064;
const M_PER_DEG_LAT = 111132;

function sectionCenter(section, township, range, meridian) {
    const s = Number(section), t = Number(township), r = Number(range);
    if (!(s >= 1 && s <= 36) || !(t >= 1) || !(r >= 1)) return null;
    const dir = String(meridian || '').toUpperCase().startsWith('W') ? -1 : 1;
    const row = Math.floor((s - 1) / 6);                     // 0 = north row
    const col = row % 2 === 0 ? 5 - ((s - 1) % 6) : (s - 1) % 6;  // 0 = west column
    const northM = (t - 1) * TOWNSHIP_M + (5 - row + 0.5) / 6 * TOWNSHIP_M;
    const lat = BASELINE_LAT + northM / M_PER_DEG_LAT;
    const eastM = dir > 0 ? (r - 1) * TOWNSHIP_M + (col + 0.5) / 6 * TOWNSHIP_M
                          : -(r * TOWNSHIP_M) + (col + 0.5) / 6 * TOWNSHIP_M;
    const lng = PM_LNG + eastM / (111320 * Math.cos(lat * Math.PI / 180));
    return { lat, lng };
}

module.exports = { sectionCenter };
