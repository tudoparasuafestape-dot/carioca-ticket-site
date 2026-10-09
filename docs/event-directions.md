# Public event directions

This stage adds the same address component to `/evento/` and `/evento-v2/`.
It consumes the current public event payload (`local`, `endereco`, `cidade`, `uf`) after successful loading. A venue and complete address are required. Empty/placeholder values, obvious URLs and malformed data produce an honest unavailable state without an actionable link. The organization remains responsible for the venue/address; string validation is not physical-location verification.

The current payload has no explicit event modality. `PUBLICO`/`PRIVADO` is visibility, never modality. This component does not label an event as in-person based on that field or infer modality from the description. Supporting a guaranteed exclusion of online-only events requires an explicit authoritative modality/location contract from the backend. No backend, checkout, payment, operational route or geocoding changes are included.

## Supported action and fallback

- Google Maps destination includes venue, street address, city, Brazilian UF and country, encoded and bounded to the official 2,048-character URL limit. It opens only on link activation.
- Copy works only on an explicit click. Clipboard denial/unavailability selects the visible address for manual copying, with an accessible status. Concurrent copying is suppressed and obsolete asynchronous results cannot update a newer event.
- Uber/99: copy and paste is the honest current fallback. No generic app-opening button is advertised as prefilled.
- No geolocation, embeds, geocoding, ride bookings, new accounts, keys or costs.

## Remaining requested ride-app integration

Uber's current official deep-link documentation presents destination Location objects with latitude/longitude. `addressLine2` is display text and does not override coordinates. The legacy FAQ also requires a nickname or formatted address for a destination to display, but does not establish that address-only resolves a destination. The current public payload does not contain verified coordinates. Therefore destination-prefilled Uber is pending an authoritative coordinate contract plus physical-device validation. No claim that an address-only link works is made.

A documented public 99 destination-prefill contract could not be verified in official sources searched on 2026-10-09. Do not guess private URL schemes or use a generic home/app link as if it prefilled a destination. This item remains pending verified provider documentation/integration and device validation.

Sources checked:
- https://developers.google.com/maps/documentation/urls/get-started
- https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction
- https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/faq

## Verification

- `node tests/event-directions-contract.cjs`: dependency-free component, escaping, malformed data, async race, repeated clicks and both HTML integrations.
- `python tests/event-directions-browser.py`: Playwright/Chromium; actual pages with a synthetic RPC response, every HTTP request intercepted, PWA/analytics inert, no real API/purchase. Desktop/mobile, both themes, enlarged component text, clipboard fallback and navigation. Optional `CHROMIUM_PATH` selects an installed executable.
- `.github/workflows/event-directions-isolated.yml` runs both checks and retains review screenshots. It has read-only repository permissions and no deployment step.
- Local Chromium launch was blocked by environment socket restrictions; CI is the browser-validation path. Production verification and native Uber/99 device tests are not covered by the isolated suite.
