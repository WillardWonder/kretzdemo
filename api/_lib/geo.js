'use strict';

// Minimal geometry helpers for GeoJSON Polygon / MultiPolygon in WGS84.

const M_PER_DEG = 111320;

function polygonsOf(g) {
    if (!g) return [];
    if (g.type === 'Polygon') return [g.coordinates];
    if (g.type === 'MultiPolygon') return g.coordinates;
    return [];
}

function bbox(g) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const poly of polygonsOf(g)) for (const ring of poly) for (const [x, y] of ring) {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX)) throw new Error('Parcel has no polygon geometry.');
    return [minX, minY, maxX, maxY];
}

function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function pointInGeometry(x, y, g) {
    return polygonsOf(g).some(([outer, ...holes]) => inRing(x, y, outer) && !holes.some(h => inRing(x, y, h)));
}

// Approximate distance in meters from a point to the polygon boundary (0 if inside).
function distanceMeters(x, y, g) {
    if (pointInGeometry(x, y, g)) return 0;
    const kx = M_PER_DEG * Math.cos(y * Math.PI / 180), ky = M_PER_DEG;
    let best = Infinity;
    for (const poly of polygonsOf(g)) for (const ring of poly) {
        for (let i = 0; i < ring.length - 1; i++) {
            const ax = (ring[i][0] - x) * kx, ay = (ring[i][1] - y) * ky;
            const bx = (ring[i + 1][0] - x) * kx, by = (ring[i + 1][1] - y) * ky;
            const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
            const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
            const px = ax + t * dx, py = ay + t * dy;
            best = Math.min(best, Math.hypot(px, py));
        }
    }
    return best;
}

function expandBbox([minX, minY, maxX, maxY], meters) {
    const midLat = (minY + maxY) / 2;
    const dLat = meters / M_PER_DEG, dLng = meters / (M_PER_DEG * Math.cos(midLat * Math.PI / 180));
    return [minX - dLng, minY - dLat, maxX + dLng, maxY + dLat];
}

// WKT for SQL Server geometry::STGeomFromText. Numbers fixed to 7 decimals
// (~1 cm), so no exponent notation and no injectable characters.
function toWkt(g) {
    const polys = polygonsOf(g);
    if (!polys.length) throw new Error('Parcel has no polygon geometry.');
    const ring = r => '(' + r.map(([x, y]) => `${Number(x).toFixed(7)} ${Number(y).toFixed(7)}`).join(', ') + ')';
    const poly = p => '(' + p.map(ring).join(', ') + ')';
    return polys.length === 1 ? 'POLYGON' + poly(polys[0]) : 'MULTIPOLYGON(' + polys.map(poly).join(', ') + ')';
}

module.exports = { bbox, pointInGeometry, distanceMeters, expandBbox, toWkt };
