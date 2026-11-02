# Eventza

Eventza is an event discovery and ticketing web app. Visitors browse events, sign in with an email one-time code, pay through Razorpay (test mode), and get a QR pass per ticket. Organisers manage events and orders from an admin dashboard, and assigned staff scan passes at the door.

I built it on [Hatchable](https://hatchable.com) as a full-stack project: serverless API routes, a per-project PostgreSQL database, and a static frontend with no build step.

**Live app:** https://eventpass.hatchable.site
> The Hatchable project is currently set to private, so the live URL may show a sign-in wall. Payments run in Razorpay **test mode only**; no real money moves.

## What it does

**For attendees**
- Browse published events and pick a ticket type (`/`, `/event.html`)
- Sign in with an email one-time code; passkeys can be added afterwards (`/login.html`)
- Checkout with Razorpay; the server creates the order, then verifies the payment signature before issuing tickets
- Each ticket gets its own QR pass with a secure random token (only a SHA-256 hash is stored), viewable on a pass page and as a PDF
- "My passes" page, pass resend by email, contact form, terms / privacy / refund pages

**For admins** (`/admin/`)
- Overview, event and ticket-type management, orders, cancel and refund, resend passes, staff assignment, site settings, reports
- Audit log table for admin actions

**For staff** (`/staff/login.html`, `/staff/scanner.html`)
- Staff are assigned per event; they scan QR codes with the device camera (jsQR)
- Check-in is single-use: duplicate, wrong-event, unpaid, cancelled and refunded tickets are rejected with a clear status
- Every scan attempt is logged

**Booking integrity**
- Capacity is tracked per event and per ticket type, with database constraints to stop overselling
- Orders reserve inventory for 15 minutes; an hourly scheduled job (`api/jobs/release-expired.js`) releases expired reservations
- Payment webhooks are stored and signature-checked
- Seed data is marked `is_sample` and cannot be purchased

## Tech stack

| Layer | What's used |
|---|---|
| Platform | Hatchable (serverless functions, hosting, scheduler, email, auth) |
| Backend | JavaScript API routes in `api/`, raw parameterised SQL via the Hatchable `db` SDK |
| Database | PostgreSQL, 9 SQL migrations in `migrations/` |
| Frontend | Plain HTML, CSS and vanilla JavaScript in `public/` (no framework, no build step) |
| Payments | Razorpay Orders API (test mode) |
| Auth | Hatchable end-user auth: email code sign-in, optional passkeys |
| QR | `qrcode-generator` (creating) and `jsQR` (scanning), both vendored in `public/vendor/` |
| PDF passes | Hatchable `browser` SDK |

## Project structure

```
api/          Serverless routes (public, user, admin, staff, scheduler)
lib/          Shared helpers: crypto, inventory, order fulfilment
migrations/   Forward-only SQL schema migrations (001 to 009)
public/       Static frontend (customer pages, /admin, /staff, vendor libs)
seed.sql      Sample events and ticket types
hatchable.toml  Project config: auth, secrets, settings
```

## Running it

Eventza uses Hatchable-specific imports (`import { db, config, email } from "hatchable"`), so it runs on the Hatchable runtime and not as a plain Node app.

1. Create a Hatchable project and add the files from this repo with the same paths.
2. Add the three secrets declared in `hatchable.toml` (see `.env.example`). Use Razorpay **test** keys; checkout refuses keys that don't start with `rzp_test_`.
3. Deploy. Migrations run in order, then `seed.sql` runs on the first deploy.
4. In the Razorpay dashboard, point the webhook at `https://<your-app>/api/payment/webhook` and use the same signing secret you stored.
5. Set up an admin or staff account in the Hatchable console, then assign staff to events from the admin dashboard.

## Configuration

| Name | Purpose |
|---|---|
| `RAZORPAY_KEY_ID` | Razorpay test key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay test key secret (server-side only) |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signing secret from the Razorpay dashboard |
| `site_name`, `site_support_email` | Editable settings in `hatchable.toml` |

Secrets live in Hatchable and are read with `config.get()`. None are stored in this repository.

## Known limitations

- Razorpay is test mode only; live payments are intentionally blocked in code.
- There is no automated test suite yet.
- It depends on the Hatchable runtime, so it cannot be run locally with `npm start`.

## Planned improvements

These are ideas, not implemented features:
- Automated tests for booking, payment verification and check-in
- Rate limiting on public endpoints
- Screenshots and a short demo in this README

## Author

Built by Ubaid, B.Tech Information Technology student at KITS Ramtek.

## Credits and AI assistance

- `jsQR` and `qrcode-generator` are third-party libraries, included under their own licences.
- Parts of this project were written with AI assistance on the Hatchable platform. I reviewed the behaviour and can explain the booking, payment and check-in flows.
