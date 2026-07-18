# Tesla New Model Y Monitor

A small server-ready service that watches Tesla France's **new Model Y inventory** and emails immediately when a previously unseen car appears.

It monitors this exact search:

<https://www.tesla.com/fr_FR/inventory/new/my?arrangeby=plh&zip=92360&range=0>

The page is often legitimately empty. The monitor distinguishes a confirmed empty inventory from an error or Tesla “Access Denied” page, so an outage is never silently treated as “zero cars.”

## What it does

- Checks the new Model Y inventory every five minutes by default.
- Uses only Tesla France sources—never substitutes used cars or marketplace listings.
- Accepts every new Model Y variant; there are no year, mileage, trim, price, or distance filters.
- Emails all newly observed vehicles in one alert.
- Also reports price drops for a previously seen VIN.
- Permanently remembers seen VINs, preventing duplicate alerts when a car disappears and later reappears.
- Retries temporary failures with exponential backoff.
- Emails an operational warning after three consecutive failed checks and a recovery notice when monitoring works again.
- Writes a readable `output/latest.md` and structured `output/latest.json` after every successful check.
- Runs continuously under Docker with restart and bounded log retention.

## How scraping works

Every monitoring cycle tries two independent routes for the same official Tesla search.

### Route 1: Tesla inventory page

The service opens the exact Tesla page in stable Google Chrome through Playwright. While the page loads, it captures only an inventory API response whose decoded query has all four required values:

- `model=my`
- `condition=new`
- `zip=92360`
- `range=0`

Results from different searches—including used cars or “outside search” suggestions—are not accepted. If the API response is unavailable, the service reads real inventory cards while excluding Tesla's generic build/order card.

An empty result is accepted only when the normal Tesla inventory shell is present. A page titled “Access Denied,” missing inventory structure, timeout, or malformed API response throws an error and leaves notification state untouched.

### Route 2: Tesla inventory API

If the browser route fails, the service requests Tesla's inventory API directly with the same new Model Y query. A successful JSON response containing `results: []` is an authoritative empty result. Non-JSON, non-2xx, malformed, or blocked responses are failures—not empty inventory.

Some data-centre IP ranges are blocked by Tesla. If both official routes are refused on a server, configure the optional `TESLA_PROXY_*` variables with a reputable proxy under your control. Do not reduce the five-minute interval to hammer the site.

## Change detection and duplicate protection

`data/state.json` contains two separate collections:

- `active`: VINs visible during the most recent successful check.
- `seen`: every VIN ever observed, including cars no longer visible.

The process is transactional:

1. Scrape and validate an authoritative result.
2. Compare every current VIN with `seen`.
3. Build one email containing all new cars and price drops.
4. Send the email.
5. Only after the send succeeds, update `state.json`.

If Gmail fails, step 5 does not happen, so the same alert is retried instead of being lost. If scraping fails, neither reports nor state are replaced with a false empty result.

`NOTIFY_ON_FIRST_RUN=true` is deliberate. If a car is present when a fresh server starts, it should be reported rather than silently used as a baseline.

## Requirements

- Node.js 20 or newer for local use.
- Stable Google Chrome for local browser checks.
- Docker and Docker Compose for the recommended server deployment.
- A Gmail account with Google 2-Step Verification and a dedicated 16-character App Password.

Never use the normal Google account password. Never send the App Password by email or WhatsApp, and never commit `.env`.

## Secure interactive setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/taha-lyousfi/tesla-new-model-y-monitor.git
cd tesla-new-model-y-monitor
npm install
npm run setup
```

`npm run setup` explains how to create a Google App Password, then asks for:

1. The Gmail address that will send alerts.
2. The notification recipient; pressing Enter uses the sender address.
3. The successful-check interval; pressing Enter uses five minutes.
4. The 16-character App Password through a hidden prompt.

It verifies Gmail authentication, creates `.env` with owner-only permissions, and sends a test email. The secret is never printed or written anywhere else.

## Deterministic tests

```bash
npm run check
```

The tests cover:

- Exact new Model Y page and API queries, including numeric `range=0`.
- Rejection of used or malformed inventory responses.
- A valid authoritative empty inventory.
- API-result normalization and new-order links.
- Source fallback semantics.
- VIN deduplication and price ordering.
- New-car, price-drop, and disappear/reappear state behavior.
- Gmail credential validation without making network calls.
- Exponential retry timing and cap.

Run one live cycle without sending email or changing state:

```bash
npm run dry-run
```

The live cycle may fail with “Access Denied” on blocked networks. That is the correct safe behavior; it must never print a successful zero-car check for an error page.

## Run locally

After `npm run setup`:

```bash
npm start
```

The process runs checks sequentially, so browser sessions never overlap. Stop it cleanly with `Ctrl+C`.

A laptop must remain awake and connected. For real continuous monitoring, use an always-on server.

## Run endlessly on a server

On an x86_64 server with Docker:

```bash
git clone https://github.com/taha-lyousfi/tesla-new-model-y-monitor.git
cd tesla-new-model-y-monitor
npm install
npm run setup
docker compose up -d --build
```

Then inspect it with:

```bash
docker compose ps
docker compose logs --tail=100
docker compose logs -f
```

The container has `restart: unless-stopped`, clean termination handling, and rotating logs capped to three 10 MB files. `data/` and `output/` are mounted from the host, so replacing or restarting the container does not erase seen VINs.

Useful operations:

```bash
docker compose restart
docker compose down
docker compose up -d --build
```

`docker compose down` stops the monitor but does not delete `data/state.json`.

## Configuration

The interactive setup creates the main settings. Advanced options can be edited in `.env`:

| Variable | Default | Purpose |
|---|---:|---|
| `POSTAL_CODE` | `92360` | Exact Tesla search postal code |
| `SEARCH_RANGE` | `0` | Exact Tesla range parameter; zero is intentionally preserved |
| `CHECK_INTERVAL_MINUTES` | `5` | Normal interval; minimum five minutes |
| `RETRY_DELAY_MINUTES` | `2` | First delay after a failed check |
| `MAX_RETRY_DELAY_MINUTES` | `30` | Retry-delay cap |
| `FAILURE_ALERT_THRESHOLD` | `3` | Consecutive failures before an operational email |
| `NOTIFY_ON_FIRST_RUN` | `true` | Alert for cars already present at first startup |
| `HEADLESS` | `true` | Run Chrome without a visible window |
| `BROWSER_CHANNEL` | `chrome` | Stable browser channel |
| `TESLA_PROXY_SERVER` | blank | Optional proxy URL for blocked server IPs |
| `TESLA_PROXY_USERNAME` | blank | Optional proxy username |
| `TESLA_PROXY_PASSWORD` | blank | Optional proxy password |

## Limitations

- Tesla has no public consumer-inventory SLA and can change its HTML, JSON schema, or access controls.
- Two official routes and strict validation reduce silent failures but cannot guarantee that Tesla will accept every server IP.
- An alert does not reserve a vehicle. Open the Tesla link and confirm price, configuration, delivery location, and availability immediately.
- Run this as a personal, low-frequency monitor and comply with Tesla's applicable terms and local law.
