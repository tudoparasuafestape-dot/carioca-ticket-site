# Public event Uber link

## Scope and data contract
Only `/evento/` and `/evento-v2/` gain a rider-controlled Uber link. No backend, payment, checkout, geocoding, ride API, browser location request, account, credential or 99 integration is added. No request to Uber occurs before the visitor clicks the normal anchor.

The current backend `ctEventoPublicoCarregarPROD` exposes `evento.id`, `nome`, `data`, `horario`, `local`, `endereco`, `cidade`, and `uf`. It does not expose coordinates or their approval status. The front end therefore uses a deliberately small reviewed registry keyed by exact event ID. The requested page ID and returned payload ID must agree; the local/address/city/state signature must also match the approved entry. A changed venue or address hides the button until re-reviewed. Arbitrary `latitude`/`longitude` values added to the payload are not silently trusted.

The existing public-canary and buyer-journey fixtures identify the samba event as `EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD`. The registry contains only that event and the owner-approved tested destination at latitude -8.1932272, longitude -34.9293376, revision `2026-10-10-approved-destination-1`. This is the point Google associates with the address 82. It is explicitly **not a verified exact entrance**. The owner approved using the last tested point. No production RPC was invoked to prepare this change; the fixture location fields are the baseline for the fail-closed signature.

For another event, the minimum reviewed data is its exact ID, current venue/address/city/state, finite destination latitude/longitude, a display name/address, approval and a version. Add a distinct reviewed registry entry. Do not copy this point globally or treat a geocoded city/viewport center as a venue.

## URL and user experience
The documented `https://m.uber.com/looking` format receives `pickup=my_location` and an encoded `drop[0]` JSON object with coordinates and `addressLine1`/`addressLine2`. No product or payment is selected. The tested owner Android flow reached the destination and ride-choice screens without this implementation submitting a ride. That validates the link approach, not every device or venue entrance.

Official reference: https://developer.uber.com/docs/riders/ride-requests/tutorials/deep-links/introduction . Uber documents app/store/account fallbacks; the provider controls them. The current link omits `client_id`, as did the independently observed Meaple links. Uber explains its attribution purpose at https://www.uber.com/rs/en/blog/uber-deeplink/ . No SDK is installed. A mobile test is still necessary for other device/browser combinations. Safari address-bar paste is not equivalent to tapping a link.

The anchor is hidden without a reviewed matching record. It uses the existing directions area, 44px minimum targets, visible focus and a monochrome text identifier. The adjacent note asks visitors to check the destination in Uber before requesting a ride. Its new label/note/accessibility text has pt-BR, en-US, es and zh-Hans variants and follows existing locale signals. Existing Maps/Copy behavior remains available. Error/reload clears stale Uber destinations.

## Verification
Run `node tests/event-uber-contract.cjs` and `node tests/event-uber-browser.cjs`. Browser tests are isolated with synthetic event payloads, blocked external destinations, no real app RPC, and no rides. They cover both page templates, approved and rejected events, four languages, responsive light/dark captures, keyboard access and repeated renders. Actual app handoff is not simulated by the browser checks.

## Address-contract correction (2026-10-10)
The initial registry used a test fixture that omitted the district suffix. Read-only confirmation of PROD EVENTOS row 1002 showed the same event ID and venue, city and state, but `endereco` is `Rua Arenópolis, 82 - Candeias`. The strict address comparison correctly hid the button on that real payload. Revision 2 corrects this event's reviewed registry to the confirmed full field and exercises it in the isolated browser fixture. Coordinates and all guards are unchanged. Tests reject the old shortened fixture, a different district, street number, venue, city, state and event ID. No production RPC was used for diagnosis.
