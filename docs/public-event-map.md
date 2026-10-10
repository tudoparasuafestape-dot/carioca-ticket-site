# Public event map

Adds an inline, responsive Google map to the existing public directions section on `/evento/` and `/evento-v2/`. Existing Maps and Copy actions remain unchanged.

## Destination and scope
The map uses the exact destination already validated by `CTEventDirections`, only while `directions-details` is visible and its Maps URL agrees with the address field. No event-specific venue is hard-coded. Missing, uncertain and online destinations rejected by the existing module produce no iframe. This frontend filter is not geocoding or a guarantee of address accuracy; the user-facing copy asks visitors to confirm with the organizer.

The owner accepted Google's displayed “Tv. Arenópolis, 82” nomenclature for the public Vevets address on 2026-10-10 and requested proceeding. This does not establish absolute pin/building precision. The event's stored address is unchanged. Test-only PR199 captured the actual map on 390px/1440px at commit 5028d33 in run 38011359188; see that run's `event-map-live-review-required` artifact. Those captures establish rendering, not universal geocoding accuracy.

## Provider and privacy
The HTTPS legacy URL `maps.google.com/maps?output=embed&q=` is cited in Oracle's mapping-service documentation: https://docs.oracle.com/en/cloud/saas/procurement/26b/oapro/set-up-the-mapping-service-for-contextual-addresses.html . It is a best-effort integration, not a contracted Google API. No API credentials, new billing, account, backend or geocoding service were introduced.

The public destination is encoded into the query. A local fixed-height viewport reserves layout; the iframe's URL is set while detached and inserted only upon entering the viewport, with native lazy loading too. Referrer is omitted. Geolocation, camera and microphone are denied to the iframe. The provider still receives visitor IP/browser data and may use cookies. An explicit notice and Google privacy link are displayed. Automatic lazy loading is not a cookie-consent solution; existing privacy obligations remain applicable.

A timeout, iframe error and permanent fallback text preserve usability. Cross-origin iframe `load` never certifies map or pin correctness. No auto-retry, rideshare request, route origin, visitor geolocation or buyer data is sent.

## Languages and accessibility
Only the new map component has a local four-language dictionary (pt-BR, en-US, es, zh-Hans). It follows `CTPublicI18n.getLocale()` when present, otherwise the existing saved `ct-home-locale`, and updates on public-language, storage and pageshow events. The map container receives its own language attribute; the untranslated legacy page is not relabeled. This is independent of PR197 and does not incorporate that patch.

The iframe has a translated accessible title. Feedback uses a status region. Controls retain visible keyboard focus and 44px minimum target height. Provider chrome is external and may use its own language. The owner-requested “Se beber, não dirija. Planeje uma volta segura.” reminder is translated in all four languages. Uber/99 deep links are outside this change.

## Verification
Dependency-free tests cover lazy lifecycle, encoding, fixed host, privacy attributes, timeout/fallback, language refresh, old-event cleanup, invalid input and teardown. Isolated browser CI exercises both actual public templates with synthetic transport, no real application RPC/checkout, and mock map responses: four languages, 320/390/768/1440px, light/dark, copy/map-link preservation, event changes, missing/online addresses and storage denial. Mock maps are never evidence of real pin location. Independent review and CI on the final SHA are required before release.


## Reduced duplicate action emphasis

The same validated directions link moves from the large action row to a permanent
text fallback beneath the map while the map exists. The original node, URL,
translation hooks and new-tab safety attributes are retained. Teardown restores
the original position, so absent/invalid maps do not remove the directions path.
Copy address is unchanged. Error/timeout adds a border and weight to the fallback;
load never hides it because a provider error page may also fire load. The link
keeps a 44px target and keyboard focus styling. No claim of provider success or
precise venue geocoding is made by these isolated UI tests.
