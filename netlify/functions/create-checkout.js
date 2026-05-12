// Creates a Stripe Checkout Session for a confirmed date range.
//
// Frontend POSTs:
//   { checkin: "YYYY-MM-DD", checkout: "YYYY-MM-DD", guests: "2",
//     name?: string, email?: string }
//
// Server recomputes the subtotal from PriceLabs (never trusts client-provided
// prices), adds cleaning fee + tax, and creates a Stripe Checkout Session in
// USD. Returns { url } for the browser to redirect to.

const STRIPE_API = 'https://api.stripe.com/v1/checkout/sessions';
const PRICELABS_API = 'https://api.pricelabs.co/v1/listing_prices';
const SITE_URL = process.env.URL || 'https://www.covespacestays.com';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonError(405, 'Method not allowed');
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripeFeePct = Number(process.env.STRIPE_FEE_PCT || 2.9);
  const plKey = process.env.PRICELABS_API_KEY;
  const plListing = process.env.PRICELABS_LISTING_ID;
  const plPms = process.env.PRICELABS_PMS || 'airbnb';

  if (!stripeKey) return jsonError(500, 'Stripe not configured');
  if (!plKey || !plListing) return jsonError(500, 'PriceLabs not configured');

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonError(400, 'Invalid JSON');
  }

  const { checkin, checkout, guests, name, email } = body;
  if (!isISODate(checkin) || !isISODate(checkout)) {
    return jsonError(400, 'checkin/checkout must be YYYY-MM-DD');
  }
  const start = new Date(checkin + 'T00:00:00Z');
  const end = new Date(checkout + 'T00:00:00Z');
  if (!(end > start)) {
    return jsonError(400, 'checkout must be after checkin');
  }
  const nights = Math.round((end - start) / 86400000);
  if (nights < 1 || nights > 60) {
    return jsonError(400, 'Stay length out of range');
  }

  // Pull fresh prices from PriceLabs
  let prices;
  try {
    const res = await fetch(PRICELABS_API, {
      method: 'POST',
      headers: { 'X-API-Key': plKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ listings: [{ id: plListing, pms: plPms }] }),
    });
    if (!res.ok) throw new Error(`PriceLabs ${res.status}`);
    const payload = await res.json();
    const listing = Array.isArray(payload) ? payload[0] : null;
    prices = {};
    for (const day of (listing && listing.data) || []) {
      const status = (day.booking_status || '').toLowerCase();
      if (status.includes('booked') || status.includes('blocked')) continue;
      if (day.unbookable) continue;
      const p = Number(day.price);
      if (Number.isFinite(p) && p > 0) prices[day.date] = Math.round(p);
    }
  } catch (err) {
    console.error('PriceLabs fetch failed', err);
    return jsonError(502, 'Could not verify pricing — please try again');
  }

  // Sum nightly rates for [checkin, checkout). Reject if any night is missing
  // (likely means the range overlaps a booked or blocked date).
  let subtotal = 0;
  const cur = new Date(start);
  while (cur < end) {
    const iso = toISO(cur);
    const p = prices[iso];
    if (!p) {
      return jsonError(409, `No price available for ${iso} — date may be booked. Refresh and try again.`);
    }
    subtotal += p;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  const subtotalCents = Math.round(subtotal * 100);
  const processingFeeCents = Math.round(subtotalCents * (stripeFeePct / 100));

  const dateLabel = `${formatDate(start)} → ${formatDate(end)}`;
  const stayName = `Casa Blanca · ${nights} night${nights === 1 ? '' : 's'} · ${dateLabel}`;

  // Build line items for Stripe Checkout
  const params = new URLSearchParams();
  params.append('mode', 'payment');
  params.append('payment_method_types[]', 'card');
  params.append('success_url', `${SITE_URL}/booking-confirmed?session_id={CHECKOUT_SESSION_ID}`);
  params.append('cancel_url', `${SITE_URL}/#availability`);
  params.append('billing_address_collection', 'required');
  params.append('phone_number_collection[enabled]', 'true');
  if (email) params.append('customer_email', email);

  // Line item 1: stay
  params.append('line_items[0][quantity]', '1');
  params.append('line_items[0][price_data][currency]', 'usd');
  params.append('line_items[0][price_data][unit_amount]', String(subtotalCents));
  params.append('line_items[0][price_data][product_data][name]', stayName);
  params.append(
    'line_items[0][price_data][product_data][description]',
    `${guests || '?'} guest${guests === '1' ? '' : 's'} · Coronado Historic District, Phoenix`,
  );

  // Line item 2: card processing fee (passed through to guest)
  if (processingFeeCents > 0) {
    params.append('line_items[1][quantity]', '1');
    params.append('line_items[1][price_data][currency]', 'usd');
    params.append('line_items[1][price_data][unit_amount]', String(processingFeeCents));
    params.append(
      'line_items[1][price_data][product_data][name]',
      `Card processing fee (${stripeFeePct}%)`,
    );
  }

  // Metadata — flows through to webhook + Stripe dashboard
  params.append('metadata[listing]', 'casa-blanca');
  params.append('metadata[checkin]', checkin);
  params.append('metadata[checkout]', checkout);
  params.append('metadata[nights]', String(nights));
  params.append('metadata[guests]', String(guests || ''));
  params.append('metadata[guest_name]', name || '');
  params.append('metadata[subtotal_cents]', String(subtotalCents));
  params.append('metadata[processing_fee_cents]', String(processingFeeCents));

  // Strict cancellation policy displayed at checkout
  params.append(
    'custom_text[submit][message]',
    'Cancellation: full refund if requested more than 30 days before check-in. 50% refund 7–29 days before. No refund within 7 days of check-in.',
  );

  try {
    const res = await fetch(STRIPE_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Stripe error', res.status, data);
      const msg = (data && data.error && data.error.message) || 'Stripe error';
      return jsonError(502, msg);
    }
    return {
      statusCode: 200,
      headers: jsonHeaders(),
      body: JSON.stringify({ url: data.url, sessionId: data.id }),
    };
  } catch (err) {
    console.error('Stripe request failed', err);
    return jsonError(502, 'Could not create checkout session');
  }
};

function isISODate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function toISO(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDate(d) {
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
function jsonHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };
}
function jsonError(status, msg) {
  return {
    statusCode: status,
    headers: jsonHeaders(),
    body: JSON.stringify({ error: msg }),
  };
}
