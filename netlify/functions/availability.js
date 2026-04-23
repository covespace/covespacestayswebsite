// Fetches the Airbnb iCal feed, expands booked events into a flat list
// of YYYY-MM-DD date strings, and returns them as JSON. Cached 30 min.
//
// Note on iCal semantics: DTEND is EXCLUSIVE. A reservation Fri -> Sun
// (checkout Sun) blocks Fri and Sat nights. Sunday is the checkout day
// and remains bookable as a new check-in. We expand [DTSTART, DTEND).

const ical = require('node-ical');

const ICAL_URL = process.env.AIRBNB_ICAL_URL;

exports.handler = async () => {
  if (!ICAL_URL) {
    return {
      statusCode: 500,
      headers: jsonHeaders(60),
      body: JSON.stringify({ error: 'AIRBNB_ICAL_URL not configured' }),
    };
  }

  try {
    const data = await ical.async.fromURL(ICAL_URL);
    const booked = new Set();

    for (const k of Object.keys(data)) {
      const ev = data[k];
      if (!ev || ev.type !== 'VEVENT') continue;
      if (!ev.start || !ev.end) continue;

      // Airbnb iCal events cover both guest-booked ("Reserved") and
      // host-blocked ("Not available") dates. Both should render as
      // unavailable to the guest, so we block on any VEVENT.

      const start = toUTCDate(ev.start);
      const end = toUTCDate(ev.end);
      if (!start || !end) continue;

      const cur = new Date(start);
      while (cur < end) {
        booked.add(toISODate(cur));
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    const sorted = Array.from(booked).sort();

    return {
      statusCode: 200,
      headers: jsonHeaders(1800), // 30 minutes
      body: JSON.stringify({
        booked: sorted,
        updated: new Date().toISOString(),
        count: sorted.length,
      }),
    };
  } catch (err) {
    console.error('availability error', err);
    return {
      statusCode: 502,
      headers: jsonHeaders(60),
      body: JSON.stringify({ error: 'Failed to fetch availability' }),
    };
  }
};

function toUTCDate(d) {
  if (!d) return null;
  if (d instanceof Date) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const parsed = new Date(d);
  if (isNaN(parsed)) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function toISODate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function jsonHeaders(maxAge) {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    'Access-Control-Allow-Origin': '*',
  };
}
