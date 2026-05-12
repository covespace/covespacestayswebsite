// Receives Netlify Form submission webhooks and forwards them as a Pushover
// push notification to the host's phone.
//
// Netlify posts JSON like:
// {
//   "form_name": "inquiry",
//   "data": {"name": "...", "email": "...", ...},
//   "site_url": "https://www.covespacestays.com",
//   ...
// }

const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const userKey = process.env.PUSHOVER_USER_KEY;
  const apiToken = process.env.PUSHOVER_API_TOKEN;

  if (!userKey || !apiToken) {
    console.error('Pushover env vars missing');
    return { statusCode: 500, body: 'Pushover not configured' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const data = payload.data || {};
  const formName = payload.form_name || 'inquiry';

  // Only handle the inquiry form (defensive — in case the webhook gets reused later)
  if (formName !== 'inquiry') {
    return { statusCode: 200, body: 'Ignored' };
  }

  const name = data.name || '(no name)';
  const email = data.email || '';
  const phone = data.phone || '';
  const guests = data.guests || '?';
  const checkin = data.checkin || '?';
  const checkout = data.checkout || '?';
  const message = (data.message || '').trim();

  const lines = [
    `${name} · ${guests} guest${guests === '1' ? '' : 's'}`,
    `${checkin} → ${checkout}`,
    phone ? `📞 ${phone}` : '',
    email ? `✉️ ${email}` : '',
  ].filter(Boolean);

  if (message) {
    lines.push('');
    lines.push(`"${message}"`);
  }

  const body = new URLSearchParams({
    token: apiToken,
    user: userKey,
    title: '📩 New Casa Blanca inquiry',
    message: lines.join('\n'),
    url: 'https://app.netlify.com/sites/covespacestays/forms',
    url_title: 'View in Netlify',
    sound: 'pushover',
  });

  try {
    const res = await fetch(PUSHOVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error('Pushover API error', res.status, text);
      return { statusCode: 502, body: 'Pushover send failed' };
    }
    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Pushover request failed', err);
    return { statusCode: 502, body: 'Pushover request failed' };
  }
};
