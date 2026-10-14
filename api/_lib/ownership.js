'use strict';

// Absentee-owner check from the county record alone: mailing address
// (PSTLADRESS) vs. site address (SITEADRESS), plus improvement value.

const SUFFIXES = new Set(['RD', 'ROAD', 'ST', 'STREET', 'AVE', 'AVENUE', 'LN', 'LANE', 'DR', 'DRIVE', 'CT', 'COURT',
    'HWY', 'HIGHWAY', 'CTY', 'COUNTY', 'TRL', 'TRAIL', 'BLVD', 'PL', 'CIR', 'WAY', 'N', 'S', 'E', 'W', 'RR']);

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function mailingStateZip(addr) {
    const m = norm(addr).match(/\b([A-Z]{2}) (\d{5})(?: \d{4})?$/);
    return m ? { state: m[1], zip: m[2] } : null;
}

// Same house number and at least one shared street-name word.
function sameStreetAddress(site, mail) {
    const s = norm(site).split(' '), m = norm(mail).split(' ');
    if (!s.length || !m.length) return null;
    if (/\d/.test(s[0]) && /\d/.test(m[0])) {
        if (s[0] !== m[0]) return false;
        const words = new Set(s.slice(1).filter(w => w.length > 1 && !SUFFIXES.has(w)));
        return words.size === 0 ? true : m.slice(1).some(w => words.has(w));
    }
    return norm(mail).startsWith(norm(site)) ? true : null;
}

function analyzeOwnership(p) {
    const mail = norm(p.PSTLADRESS), site = norm(p.SITEADRESS);
    const improved = Number(p.IMPVALUE) > 0;
    const loc = mailingStateZip(p.PSTLADRESS);
    const base = { mailingAddress: p.PSTLADRESS || null, siteAddress: p.SITEADRESS || null, mailingState: loc && loc.state };

    if (!mail) {
        return { ...base, status: 'unknown', label: 'Cannot determine', reasons: ['No mailing address on the county record.'] };
    }
    if (loc && loc.state !== 'WI') {
        return { ...base, status: 'absentee', label: `Absentee (out of state: ${loc.state})`, reasons: [`Tax bill mails to ${loc.state}.`] };
    }
    if (site) {
        const same = sameStreetAddress(site, mail);
        if (same === true) return { ...base, status: 'resident', label: 'Likely owner-occupied', reasons: ['Mailing address matches the site address.'] };
        if (same === false) return { ...base, status: 'absentee', label: 'Absentee (in state)', reasons: ['Mailing address differs from the site address.'] };
        return { ...base, status: 'unknown', label: 'Cannot determine', reasons: ['Site and mailing addresses could not be compared reliably.'] };
    }
    if (!improved) {
        return { ...base, status: 'absentee', label: 'Absentee (vacant land)',
            reasons: ['No site address and no improvement value on record, so no residence exists on this parcel.'] };
    }
    return { ...base, status: 'unknown', label: 'Cannot determine', reasons: ['Improvements are recorded but there is no site address to compare.'] };
}

module.exports = { analyzeOwnership, sameStreetAddress, mailingStateZip };
