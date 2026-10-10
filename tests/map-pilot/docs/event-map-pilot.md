# Event map pilot — unpublished, not production-ready

## Decision and scope
A best-effort frontend-only pilot of the legacy Google Maps URL documented by Oracle. No Maps API key, new account, billing, backend/RPC change, Nominatim, browser geolocation, buyer data, or hard-coded event venue. This is not a claim of an officially supported Google API contract.

Sources checked 2026-10-09:
- https://docs.oracle.com/en/cloud/saas/procurement/26b/oapro/set-up-the-mapping-service-for-contextual-addresses.html documents `maps.google.com/maps?output=embed&q=`.
- https://developers.google.com/maps/documentation/embed/quickstart states the official Embed API requires a key and billing account, though requests are free.
- https://support.google.com/maps/answer/7101463?hl=en documents copying a specific map's embed HTML.
- https://policies.google.com/technologies/partner-sites?hl=en and https://policies.google.com/privacy explain third-party service data collection.

## Read-only live result
The legacy HTTPS URL with the user's public venue/address was recognized and redirected by Google to `/maps/embed?origin=mfe&pb=...`. Direct navigation displayed `The Google Maps Embed API must be used in an iframe.` This verifies only recognition of the format, not map rendering, tile loading, address resolution, or pin precision.

A local HTTP fixture was served on loopback port 42976. The cloud browser returned ERR_CONNECTION_REFUSED because it cannot reach that executor's loopback. A file URL was blocked by browser policy and was not bypassed. Headless Chromium did not launch in the executor (socket sandbox error); one supported escalation failed in the runtime mount setup. No further attempts to change restrictions were made.

**Real iframe rendering and correct venue/pin remain unverified. No production release until that verification succeeds through an authorized environment.** The probe fixture contains the supplied public address, not a claimed verified coordinate. The real probe Python script is diagnostic only and did not complete.

## Privacy and performance
The frame is inserted only for a validated public destination once the section intersects the viewport. A fixed-height local viewport reserves its space; the URL is assigned while the iframe is detached before insertion, avoiding an initial about:blank load race. Native `loading=lazy` remains a secondary defense. If IntersectionObserver is absent, native lazy loading alone is used. No preconnect, no geocoder call, no geolocation request. `referrerpolicy=no-referrer` avoids sending the host-page URL, and Permissions Policy denies geolocation, camera, and microphone inside the iframe.

Loading still contacts Google and exposes ordinary connection information including visitor IP/browser data, and Google may use cookies. The page must not promise “no data is sent” or “no tracking.” A privacy notice is displayed above the frame with a direct Google privacy link. Automatic loading does not itself constitute a consent solution. Check existing privacy/consent requirements before production; click-to-load would be a separate UX decision if needed.

Actual transferred bytes, request count, cookies written, real load latency, mobile touch behavior, and map appearance were not measured because live iframe rendering is blocked in the available environment. No numbers are invented.

## Minimal integration after review
Do not overwrite the language worker's HTML or directions module. Once its latest draft is available:
1. Include `assets/event-map-preview.css` and `assets/event-map-preview.js` in `/evento/` and `/evento-v2/`.
2. Add `<div id="directions-map-preview" hidden></div>` inside the existing validated `directions-details` section, after the existing Maps/copy controls and help.
3. At the start of `CTEventDirections.render`, call `CTEventMapPreview.clear()` if available. After the existing address checks succeed, call `CTEventMapPreview.render(document.getElementById('directions-map-preview'), destination)`.
4. Caller must establish that this is a public event with a confirmed physical venue. The current string filter rejects some uncertain/remote addresses but does not itself verify event modality, public visibility, or physical location. Do not blindly integrate into private event views.
5. Register the new source strings in all four event dictionaries before release. The module translates through `CTEventI18n.text` and responds to `ct:public-language`; missing dictionary entries will otherwise fall back to Portuguese.
6. Preserve existing Maps/copy actions, RPCs, event payload, and checkout links.

No integration patch has been applied. No git branch, PR, push, merge, deployment, or credentials were created.

## Failure semantics
Iframe `load` cannot establish success across origins and may occur for an error document. The fallback stays available at all times; the status says “If the map does not appear…” and never says the map or pin is verified. Timeout at 15 seconds is advisory, does not auto-retry, and does not prevent later load. The error event hides the frame with an explicit fallback message. Rerendering cleans up observer, timer, and handlers to avoid a stale event destination.

## Checks completed
- `node --check assets/event-map-preview.js`: pass.
- `node tests/event-map-contract.cjs`: pass, using VM/DOM mocks; no Google calls.
- Contracts cover viewport-delayed URL assignment, encoding, fixed provider origin, lazy loading, no-referrer, restricted capabilities, timeout, non-authoritative onload message, translation hook, rerender cleanup, explicit error, invalid input, malformed Unicode, teardown.
- Browser rendering, visual/mobile QA and final integrated regression: pending, not passed.

## Review status
Self-review completed and the initial about:blank load race was removed by assigning the URL before iframe insertion. Independent reviewer could not be started because the agent-thread limit was reached; parent must arrange review before integration.

## CI pilot (prepared 2026-10-10)
The entire pilot is copied only under `tests/map-pilot/`, with a dedicated pull-request workflow. Production templates/assets are not touched. The isolated job mocks provider responses and tests geometry/fallback only. The separate live job allows HTTPS Google Maps-related hosts for the authorized public Vevets address and captures desktop/mobile screenshots plus visible iframe text. It does not submit platform RPCs, request geolocation, use keys, or click external links. Cookie metadata contains names/domains/flags, never values. Captures do not establish pin accuracy; a human review of the artifacts is required even if the job succeeds. A challenge/denial stops without solving or retrying. Asset origins outside the allowlist remain blocked and reported, not silently allowed.
