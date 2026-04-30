// Receives Stripe webhook events. On checkout.session.completed it sends a
// Pushover notification to the host with the booking details.
//
// Stripe signs every webhook with HMAC-SHA256 using the endpoint signing
// secret. We verify the signature before trusting the payload.

const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return { statusCode: 500, body: 'Webhook not configured' };
  }

  const sigHeader = event.headers['stripe-signature'] || event.headers['Stripe-Signature'];
  if (!sigHeader) return { statusCode: 400, body: 'Missing signature' };

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  if (!verifyStripeSignature(rawBody, sigHeader, secret)) {
    console.warn('Invalid Stripe signature');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  let stripeEvent;
  try {
    stripeEvent = JSON.parse(rawBody);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  if (stripeEvent.type !== 'checkout.session.completed') {
    // Acknowledge other events without doing anything
    return { statusCode: 200, body: 'OK (ignored)' };
  }

  const session = stripeEvent.data && stripeEvent.data.object;
  if (!session) return { statusCode: 200, body: 'OK (no session)' };

  const meta = session.metadata || {};
  const totalUsd = (session.amount_total || 0) / 100;
  const guestEmail = (session.customer_details && session.customer_details.email) || session.customer_email || '';
  const guestName = (session.customer_details && session.customer_details.name) || meta.guest_name || '(unknown)';
  const guestPhone = (session.customer_details && session.customer_details.phone) || '';

  // Fire Pushover notification to host
  await sendPushover({
    title: '✅ Booking confirmed — Casa Blanca',
    message: [
      `${guestName} · ${meta.guests || '?'} guest${meta.guests === '1' ? '' : 's'}`,
      `${meta.checkin} → ${meta.checkout} (${meta.nights} night${meta.nights === '1' ? '' : 's'})`,
      `Paid: $${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      guestPhone ? `📞 ${guestPhone}` : '',
      guestEmail ? `✉️ ${guestEmail}` : '',
      '',
      '⚠️ Block these dates on Airbnb now.',
    ].filter(Boolean).join('\n'),
    url: `https://dashboard.stripe.com/payments/${session.payment_intent || session.id}`,
    url_title: 'View in Stripe',
    priority: 1, // high priority — bypasses quiet hours
  });

  return { statusCode: 200, body: 'OK' };
};

function verifyStripeSignature(payload, header, secret) {
  // Header format: t=<timestamp>,v1=<signature>,...
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const idx = p.indexOf('=');
      return [p.slice(0, idx), p.slice(idx + 1)];
    }),
  );
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;

  const signed = `${timestamp}.${payload}`;
  const computed = crypto.createHmac('sha256', secret).update(signed).digest('hex');

  // Constant-time compare
  if (computed.length !== expectedSig.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expectedSig));
}

async function sendPushover({ title, message, url, url_title, priority }) {
  const userKey = process.env.PUSHOVER_USER_KEY;
  const apiToken = process.env.PUSHOVER_API_TOKEN;
  if (!userKey || !apiToken) {
    console.warn('Pushover not configured — skipping notification');
    return;
  }

  const params = new URLSearchParams({
    token: apiToken,
    user: userKey,
    title,
    message,
    sound: 'cashregister',
  });
  if (url) params.append('url', url);
  if (url_title) params.append('url_title', url_title);
  if (priority != null) params.append('priority', String(priority));

  try {
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) {
      console.error('Pushover error', res.status, await res.text());
    }
  } catch (err) {
    console.error('Pushover failed', err);
  }
}
