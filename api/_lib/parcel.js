'use strict';

// Re-fetch the parcel by OBJECTID from the statewide layer, so every
// downstream lookup runs on the authoritative record and geometry rather
// than on anything the browser sends.

const { fetchJson } = require('./http');

const PARCEL_SVC = 'https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels_DB/FeatureServer/0/query';

async function fetchParcel(objectId) {
    const params = new URLSearchParams({
        objectIds: String(objectId), outFields: '*', returnGeometry: 'true', outSR: '4326',
        maxAllowableOffset: '0.00002', geometryPrecision: '7', f: 'geojson'
    });
    const data = await fetchJson(`${PARCEL_SVC}?${params}`, {}, { label: 'Statewide parcel service' });
    const feature = Array.isArray(data.features) ? data.features[0] : null;
    if (!feature) return null;
    if (!feature.geometry) throw new Error('Statewide parcel record has no geometry.');
    return feature;
}

module.exports = { fetchParcel, PARCEL_SVC };
