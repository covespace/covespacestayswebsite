# Cove Space Stays — Direct Booking Website

Single-page direct-booking site for **Casa Blanca** (Phoenix, Coronado Historic
District), built to drive bookings outside the Airbnb platform and avoid guest
service fees. Designed as a brand umbrella — additional properties can be added
as sub-pages later.

**Live domain:** covespacestays.com (registered on Squarespace, DNS points to Netlify)

---

## Stack

- **Astro 5** — static site generator
- **Netlify** — hosting, Forms (inquiry handling), Functions (iCal sync)
- **node-ical** — parses the live Airbnb iCal feed
- **flatpickr** — inline availability calendar + date range picker
- **Fraunces + Inter** — typefaces (via Google Fonts)

No database. No build-time booking engine. Inquiries are a Netlify Form that
emails `matt@covespacebuild.com`. Calendar availability is fetched live from
Airbnb's iCal feed and cached for 30 minutes.

---

## Local development

```bash
cd CoveSpaceStays_Website
npm install
npm run dev
```

Site runs at http://localhost:4321 by default.

For local availability testing you need `AIRBNB_ICAL_URL` set in a `.env` file
(or inline). The function only runs on Netlify — for pure UI work the calendar
will show an error banner, which is expected.

---

## Environment variables

Set these in **Netlify → Site settings → Environment variables**:

| Key | Value |
|-----|-------|
| `AIRBNB_ICAL_URL` | The long Airbnb iCal URL for the listing. Example: `https://www.airbnb.com/calendar/ical/<LISTING_ID>.ics?t=<TOKEN>` |

Keeping the URL server-side (as an env var) prevents it from being scraped out
of the client bundle.

---

## Deploy to Netlify

1. Push this folder to a git repo (GitHub, GitLab, or Bitbucket).
2. In Netlify: **Add new site → Import from Git** → pick the repo.
3. Build command and publish directory are already set in `netlify.toml`:
   - Build: `npm run build`
   - Publish: `dist`
   - Functions: `netlify/functions`
4. Set the `AIRBNB_ICAL_URL` env var (see above).
5. Deploy. First build takes ~2 min.
6. Confirm the inquiry form is picked up under **Site → Forms → Active forms**
   (should show `inquiry`).
7. Add your email under **Forms → Form notifications → Add notification →
   Email notification** for the `inquiry` form → send to
   `matt@covespacebuild.com`.

---

## Point covespacestays.com at Netlify (keep domain on Squarespace)

You do **not** need to transfer the domain. Just change DNS records.

1. In Netlify, go to **Domains → Add a domain** → enter `covespacestays.com`.
   Netlify will give you 4 nameservers (e.g. `dns1.p01.nsone.net`, etc.)
   **OR** instructions to set A/CNAME records on your current registrar.
2. Easiest path — **keep Squarespace DNS, just change records:**
   - Log in to **Squarespace → Settings → Domains → covespacestays.com →
     DNS Settings**.
   - Remove the default Squarespace A/CNAME/ALIAS records for the apex and `www`.
   - Add:
     - **A record** — host: `@`, value: `75.2.60.5` (Netlify's load balancer)
     - **CNAME** — host: `www`, value: `<your-site>.netlify.app`
   - (Exact values will be shown in the Netlify Domains panel — use those
     instead of copy-pasting this doc in case Netlify rotates IPs.)
3. Wait 15–60 min for DNS propagation.
4. Netlify will auto-provision a Let's Encrypt SSL cert once DNS resolves.

If you'd rather hand the whole domain over to Netlify, use **Nameserver**
delegation instead — but keeping Squarespace as registrar + DNS is the
simplest path.

---

## Structure

```
CoveSpaceStays_Website/
├── astro.config.mjs
├── netlify.toml
├── package.json
├── tsconfig.json
├── public/
│   └── favicon.svg
├── netlify/
│   └── functions/
│       └── availability.js      # Fetches + parses Airbnb iCal, returns JSON
└── src/
    ├── layouts/
    │   └── Layout.astro         # HTML shell, fonts, flatpickr CDN
    ├── components/
    │   ├── Nav.astro
    │   ├── Hero.astro
    │   ├── Space.astro          # "Your Property"
    │   ├── Gallery.astro        # 6-photo placeholder grid
    │   ├── Neighborhood.astro   # Walkable + driving lists
    │   ├── Availability.astro   # Live calendar
    │   ├── WhyBookDirect.astro
    │   ├── InquiryForm.astro    # Netlify Form
    │   └── Footer.astro
    ├── pages/
    │   └── index.astro
    └── styles/
        └── global.css           # Design tokens + base styles
```

---

## How the calendar stays in sync

1. Every time a visitor loads the site, the browser calls
   `/.netlify/functions/availability`.
2. That function fetches the Airbnb iCal feed server-side, expands every
   reservation into individual `YYYY-MM-DD` date strings, and returns them as
   JSON.
3. Netlify caches the JSON at the CDN edge for 30 minutes. Subsequent visitors
   hit the cache, not Airbnb — so you won't rate-limit the iCal endpoint.
4. The Availability calendar and the inquiry-form date pickers both read the
   same list and disable those days.

iCal DTEND is exclusive — the checkout day itself is **not** blocked, which
is correct (a new guest can check in the day someone else checks out).

---

## Adding photos later

Replace the placeholder gradient `<div>`s in:

- `src/components/Hero.astro` — hero background image
- `src/components/Space.astro` — `.space-image` block
- `src/components/Gallery.astro` — the 6 `.photo` items

Drop images in `public/images/` and reference as `/images/filename.jpg`.
Prefer `.webp` or `.avif` for performance; target 1600px wide for hero,
1200px for gallery.

---

## Adding a second property later

Current v1 puts Casa Blanca at `/`. When a second property is added:

1. Move Casa Blanca content into `src/pages/casa-blanca.astro`.
2. Create a new brand homepage at `src/pages/index.astro` that lists all
   properties with a card each, linking to each property's page.
3. Add the new property at `src/pages/<property-slug>.astro` with its own
   iCal URL (you'll want to turn the availability function into one that
   takes a listing query param, or add separate functions per property).
