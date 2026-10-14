'use strict';

// Same-origin requests are always allowed; other sites only if listed in
// ALLOWED_ORIGINS (comma-separated). This stops other websites from using
// the endpoints, not scripted abuse. Use Vercel Deployment Protection for that.
function originAllowed(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    try {
        if (new URL(origin).host === host) return true;
    } catch {
        return false;
    }
    const list = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    return list.includes(origin);
}

// Applies CORS headers. Returns false (and responds) if the request is done.
function handleCors(req, res, methods = 'POST, OPTIONS') {
    if (!originAllowed(req)) { res.status(403).json({ error: 'Origin not allowed.' }); return false; }
    if (req.headers.origin) {
        res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', methods);
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') { res.status(204).end(); return false; }
    return true;
}

module.exports = { originAllowed, handleCors };
