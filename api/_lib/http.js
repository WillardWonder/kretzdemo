'use strict';

// fetch + JSON parse with a timeout. Throws a labeled Error on network
// failure, HTTP error, non-JSON body, or an ArcGIS-style { error } payload,
// so a failed call can never be read as "no data".
async function fetchJson(url, options = {}, { label = 'Request', timeoutMs = 12000 } = {}) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res, text;
    try {
        res = await fetch(url, { ...options, signal: ctl.signal });
        text = await res.text();
    } catch (e) {
        throw new Error(e.name === 'AbortError'
            ? `${label} did not respond within ${timeoutMs / 1000} s.`
            : `${label} unreachable: ${e.message}`);
    } finally {
        clearTimeout(timer);
    }
    let data;
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        throw new Error(`${label} returned HTTP ${res.status} with a non-JSON body: ${text.slice(0, 160)}`);
    }
    if (!res.ok) {
        const msg = (data && (data.error && data.error.message || data.message)) || text.slice(0, 160);
        throw new Error(`${label} returned HTTP ${res.status}: ${msg}`);
    }
    if (data && data.error) {
        const detail = (data.error.details || []).join(' ');
        throw new Error(`${label} error ${data.error.code || ''}: ${data.error.message}${detail ? ' (' + detail + ')' : ''}`);
    }
    return data;
}

module.exports = { fetchJson };
