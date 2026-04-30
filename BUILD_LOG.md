# Build Log — Cove Space Stays Website

Working record of what's been built, deployed, and what's outstanding. For
setup/onboarding instructions see [README.md](README.md).

---

## Status

| Item | Status | Notes |
|------|--------|-------|
| Astro site scaffold | ✅ Done | Components: Nav, Hero, Space, Gallery, Neighborhood, Availability, WhyBookDirect, InquiryForm, Footer |
| GitHub repo | ✅ Done | https://github.com/covespace/covespacestayswebsite |
| Netlify connected | ✅ Done | Auto-deploys on push to `main` |
| Custom domain `covespacestays.com` | ✅ Live | DNS via Squarespace A + CNAME records |
| HTTPS / SSL | ✅ Live | Let's Encrypt, auto-provisioned by Netlify |
| Airbnb iCal sync | ✅ Working | `AIRBNB_ICAL_URL` env var set in Netlify, function at `/.netlify/functions/availability` |
| PriceLabs daily pricing sync | ✅ Working | `PRICELABS_API_KEY` + `PRICELABS_LISTING_ID` env vars; function at `/.netlify/functions/pricing`; renders nightly price under each calendar date |
| Date-range selection + total | ✅ Working | Range mode, summary card with subtotal, jumps-to-inquiry CTA |
| Stripe Checkout integration | ⏳ Built, needs env vars + webhook config | Functions: `create-checkout`, `stripe-webhook`. Page: `/booking-confirmed`. Pass-through 2.9% card fee. Strict cancellation policy displayed at checkout. |
| Inquiry form | ✅ Live | Netlify Forms — emails matt@covespacebuild.com |
| Property photos | ✅ Uploaded | 7 interior/exterior AVIFs in `public/images/` |
| Hero image | ✅ Uploaded | `hero.avif`, 1920×1280, optimized (4.8MB → 395KB), anchored top |
| Listing copy | ✅ Accurate | Matches corrected facts: propane BBQ, street parking, no private entrance, singular walkable coffee/restaurant/market |

---

## Infrastructure

### Git
- **Remote:** `https://github.com/covespace/covespacestayswebsite.git`
- **Default branch:** `main`
- **Global git identity:** Matt / matt@covespacebuild.com

### Netlify
- **Site name:** (check Netlify dashboard — auto-generated `*.netlify.app` subdomain)
- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Functions directory:** `netlify/functions`
- **Environment variables:**
  - `AIRBNB_ICAL_URL` = `https://www.airbnb.com/calendar/ical/1510247077466470454.ics?t=b237a73bf01544be8cb4a438d7ddd123`
  - `PRICELABS_API_KEY` = (rotate after initial setup; generate at PriceLabs → Account → Profile → API)
  - `PRICELABS_LISTING_ID` = `1510247077466470454` (PriceLabs uses the Airbnb PMS ID directly)
  - `PRICELABS_PMS` = `airbnb` (optional; defaults to `airbnb` in the function)
  - `STRIPE_SECRET_KEY` = `sk_live_...` from Stripe → Developers → API keys
  - `STRIPE_WEBHOOK_SECRET` = `whsec_...` from Stripe → Developers → Webhooks → click endpoint → "Signing secret"
  - `STRIPE_FEE_PCT` = `2.9` (passed through to guest as a "Card processing fee" line item)
  - `PUSHOVER_USER_KEY` = (Pushover home dashboard → "Your User Key")
  - `PUSHOVER_API_TOKEN` = (Pushover application detail page → "API Token/Key")
  - Scopes: all
  - Deploy contexts: all (Production, Deploy Previews, Branch deploys, Preview Server, Local dev)

### Squarespace DNS (domain still registered on Squarespace)
| Type | Name | Value |
|------|------|-------|
| A | (blank) | `75.2.60.5` |
| CNAME | www | `<netlify-site>.netlify.app` |

MX records were left untouched.

---

## Key decisions made during build

1. **Single-page scroll site**, not multi-page — keeps v1 simple and focused on conversion. Sections: Hero → Your Property → Gallery → Neighborhood → Availability → Why Book Direct → Inquire.
2. **Inquiry-only booking model for v1** — no live booking engine. Netlify Forms submits to email. User manually confirms in Airbnb-or-direct conversation. Can upgrade to Stripe + dynamic availability lock later.
3. **Brand umbrella architecture** — the site is branded "Cove Space Stays" so additional properties can be added later. Casa Blanca lives at `/` for v1. When a 2nd property is added, Casa Blanca moves to `/casa-blanca` and `/` becomes a brand homepage with property cards.
4. **Calendar sync via Netlify Function, not client-side** — the Airbnb iCal URL is server-side only (env var), so the booking token isn't exposed in the page source. Function is edge-cached 30 min (1800s) so rebuild bandwidth on iCal is negligible.
5. **Domain kept on Squarespace** — just changed DNS records rather than transferring registration. Simpler and reversible.
6. **Images in AVIF** — 30-50% smaller than equivalent JPEG at same quality. All modern browsers support it.
7. **Hero image anchored to top** (`object-position: center top`) — roof tiles stay in frame across all viewport sizes; cropping happens at the bottom of the photo, not the top.

---

## File map

```
CoveSpaceStays_Website/
├── astro.config.mjs            # static output, site: https://covespacestays.com
├── netlify.toml                # build config, security headers, function cache
├── package.json                # astro, flatpickr, node-ical
├── public/
│   ├── favicon.svg             # simple "C" mark
│   └── images/
│       ├── hero.avif           # 1920×1280, 395 KB
│       ├── InteriorPhoto.avif  # "Your Property" section
│       ├── exterior.avif       # Gallery slot 1
│       ├── livingroom.avif     # Gallery slot 2
│       ├── kingbedroom.avif    # Gallery slot 3
│       ├── kitchen.avif        # Gallery slot 4
│       ├── queenbedroom.avif   # Gallery slot 5
│       └── patio.avif          # Gallery slot 6
├── netlify/
│   └── functions/
│       └── availability.js     # Fetches Airbnb iCal, expands [DTSTART, DTEND), returns JSON
└── src/
    ├── layouts/Layout.astro
    ├── pages/index.astro
    ├── styles/global.css       # design tokens, section scaffolding
    └── components/
        ├── Nav.astro
        ├── Hero.astro
        ├── Space.astro         # "Your Property" copy + interior image
        ├── Gallery.astro
        ├── Neighborhood.astro  # Walkable + driving distance lists
        ├── Availability.astro  # Flatpickr inline calendar, syncs with function
        ├── WhyBookDirect.astro
        ├── InquiryForm.astro   # Netlify Form, honeypot, JS success/error UX
        └── Footer.astro
```

---

## Commits so far (in order)

1. `e8373fd` — Initial commit, Casa Blanca direct booking site scaffold
2. `ebed78a` — Add Casa Blanca property photos (interior, gallery)
3. `2b233ea` — Tighten gap between Availability section header and calendar
4. `9c16492` — Add hero background image (JPG placeholder, 4.8MB)
5. `c99953e` — Optimize hero image: 1920px AVIF (4.8MB → 395KB)
6. `64b141b` — Anchor hero image to top so roof stays visible

---

## Known issues / debugging notes

- **Env var didn't apply until after new deploy** — Netlify env vars only take
  effect on fresh deploys, not retroactively. Always use "Deploy project
  without cache" after adding/changing env vars.
- **Line-ending warnings (LF → CRLF)** on every git commit are benign — Windows
  + Git's default autocrlf setting. Not worth configuring away.
- **Gallery images may not be size-optimized** — they were shipped as-is from
  the user's folder. File sizes 64-250KB are OK but could go lower with a
  pass through the same resize/AVIF flow used on the hero.

---

## Outstanding / future work

### Short-term
- [ ] Size-optimize the 7 gallery/interior AVIFs (same pipeline as hero — resize to 1600px, re-encode)
- [ ] Add a brief "House rules" or "What's included" bullet list if it feels useful
- [ ] Verify form submissions land in inbox — send a real test inquiry once live
- [ ] Enable "Force HTTPS" in Netlify → Domain management → HTTPS if not already on
- [ ] Set primary domain (apex vs. www) in Netlify so the non-primary redirects

### Medium-term
- [ ] Add Google Analytics or Plausible for traffic insight
- [ ] Add Open Graph image (`/public/og-image.jpg`) — shows up when the URL is shared on iMessage/WhatsApp/socials
- [ ] Add an FAQ section (pet policy, check-in details, wifi details for guests who book)
- [ ] Consider a guest testimonial block pulling from Airbnb reviews

### Long-term / pending 2nd property
- [ ] Restructure so `/` is a brand homepage, Casa Blanca moves to `/casa-blanca`
- [ ] Refactor `availability.js` to accept a listing query param (or split to per-property functions)
- [ ] Extract Hero/Space/Gallery into property-configurable components

### Payment / Stripe activation checklist (done in code, pending operational setup)
- [ ] Add `STRIPE_SECRET_KEY` env var in Netlify (from Stripe → Developers → API keys → reveal Live secret key)
- [ ] In Stripe Dashboard → Developers → Webhooks → **Add endpoint**:
  - URL: `https://covespacestays.com/.netlify/functions/stripe-webhook`
  - Events: `checkout.session.completed`
  - Save → reveal **Signing secret** (`whsec_...`) → add to Netlify env var `STRIPE_WEBHOOK_SECRET`
- [ ] (Optional) Add `STRIPE_FEE_PCT` env var = `2.9` if you want different surcharge than default
- [ ] Trigger a Netlify redeploy after env vars are saved
- [ ] Test end-to-end with a real card on Stripe test mode first (toggle keys to test mode for dev), then flip to live keys
- [ ] **Calendar sync workflow**: Stripe webhook fires Pushover notification — when a booking comes in, manually block those dates on Airbnb host app (~30 sec). Document this internal process so it doesn't get forgotten.
- [ ] Decide whether to lift surcharge if it kills conversions — common to absorb it into the nightly rate instead

### TPT / tax handling
- User decided to NOT collect AZ TPT on direct Stripe bookings (Airbnb collects + remits for Airbnb bookings).
- Note: AZ Department of Revenue still expects TPT on transient lodging revenue regardless of payment platform. Direct-booking revenue is technically taxable. Check with an Arizona accountant whether to:
  (a) absorb the tax out of the nightly rate (host pays it on Schedule C / TPT return)
  (b) gross up the rate to cover it
  (c) collect & remit explicitly (current code is set up for this — set `TAX_RATE_PCT` env var to re-enable a tax line item)

### SMS notifications (deferred until inquiry volume warrants it)
- [ ] Add Twilio SMS notification for inquiries — fires when the volume is high enough that email is easy to miss
- Plan: Netlify form outgoing webhook → Netlify Function → Twilio API → text to owner's phone
- Text body includes name, dates, guests, phone, email, and message so owner can reply directly via tap-to-text
- Env vars needed: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `OWNER_PHONE`
- Cost: ~$1.15/mo phone number + ~$0.008/SMS sent (roughly $15–30/year at typical inquiry volume)
- If going this route, also change the inquiry form's phone field from optional to required
- Alternative if cost-sensitive: carrier email-to-SMS gateways (Verizon `@vtext.com`, AT&T `@txt.att.net`) — free but 160-char limit and inconsistent delivery
