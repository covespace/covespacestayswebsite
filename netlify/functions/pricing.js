// Fetches daily prices from PriceLabs for the configured listing and returns
// a date -> price map. Cached at the edge for 30 min so we don't hammer the
// PriceLabs API.

const API_URL = 'https://api.pricelabs.co/v1/listing_prices';

exports.handler = async () => {
  const apiKey = process.env.PRICELABS_API_KEY;
  const listingId = process.env.PRICELABS_LISTING_ID;
  const pms = process.env.PRICELABS_PMS || 'airbnb';

  if (!apiKey || !listingId) {
    return jsonError(500, 'PRICELABS_API_KEY or PRICELABS_LISTING_ID not configured', 60);
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        listings: [{ id: listingId, pms }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('PriceLabs API error', res.status, text.slice(0, 200));
      return jsonError(502, `PriceLabs API ${res.status}`, 60);
    }

    const payload = await res.json();
    const listing = Array.isArray(payload) ? payload[0] : null;
    if (!listing || !Array.isArray(listing.data)) {
      return jsonError(502, 'Unexpected PriceLabs response shape', 60);
    }

    const prices = {};
    for (const day of listing.data) {
      if (!day.date) continue;
      // booking_status of "Booked", "Booked (Check-In)", or "Blocked" means
      // the date is unavailable; skip pricing for those (the iCal feed already
      // disables them in the calendar UI).
      const status = (day.booking_status || '').toLowerCase();
      if (status.includes('booked') || status.includes('blocked')) continue;
      if (day.unbookable) continue;

      const price = Number(day.price);
      if (Number.isFinite(price) && price > 0) {
        prices[day.date] = Math.round(price);
      }
    }

    return {
      statusCode: 200,
      headers: jsonHeaders(1800),
      body: JSON.stringify({
        prices,
        currency: listing.currency || 'USD',
        updated: listing.last_refreshed_at || new Date().toISOString(),
        count: Object.keys(prices).length,
      }),
    };
  } catch (err) {
    console.error('pricing fetch failed', err);
    return jsonError(502, 'Failed to fetch pricing', 60);
  }
};

function jsonHeaders(maxAge) {
  return {
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    'Access-Control-Allow-Origin': '*',
  };
}

function jsonError(status, msg, maxAge) {
  return {
    statusCode: status,
    headers: jsonHeaders(maxAge),
    body: JSON.stringify({ error: msg }),
  };
}
