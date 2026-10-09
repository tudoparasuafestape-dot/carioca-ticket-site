# Optional device location on the public home

The visitor clicks **Use my location** inside the existing location dialog. The browser permission is requested once. Nothing happens automatically on page load. The device API may use the browser vendor's own positioning services; Carioca Ticket does not send coordinates to any mapping provider, API backend, analytics, URL, or storage.

A same-origin Web Worker fetches the national state topology and **only one** state municipality topology. The visitor must confirm the suggested city before filters change. Existing manual state/city selection is preserved. No radius or regional widening is silently applied when there are no matching events.

## Source and fixed snapshot

- IBGE API de Malhas Geográficas v4, maximum available simplified quality, TopoJSON.
- Reference revision: **2025**, announced **27 April 2026** in the official v4 documentation release notes.
- Downloaded **9 October 2026**. URLs, raw SHA256 hashes, sizes and code reconciliation are in `assets/geo-ibge-2025/manifest.json`.
- Official documentation: https://servicodados.ibge.gov.br/api/docs/malhas?versao=4
- Original product and technical documentation: https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais/15774-malhas.html
- **v4 has no documented year parameter**. The snapshot is fixed by committed bytes/hashes, not by pretending a query parameter pins an upstream year. Review release notes before refreshing with `scripts/fetch-home-boundaries.py`; update snapshot directory and manifest deliberately if the reference changes.
- All 5,571 codes in the shipped manual municipality list are present in the appropriate state mesh. Additional non-selectable geographic areas are never accepted as cities.
- Shipped 27 states plus national state boundaries: 15,697,371 raw bytes; independently calculated gzip total 4,683,791 bytes. This total is never downloaded at runtime. Measure actual hosting Content-Encoding after deployment; the gzip numbers are not a hosting guarantee.

## Accuracy and failure modes

These simplified boundaries are an approximate discovery aid, not cadastral or legal boundaries. The nearest centroid is never used as municipality membership. Polygon holes and detached MultiPolygon parts are handled. We reject ambiguous/overlapping membership, reported accuracy over 5 km, and points within the reported accuracy plus a conservative **500 m UX margin** of any matched boundary. That margin is not a validated upper bound on mesh error; therefore even a result always requires human confirmation.

Near a state boundary we fall back to manual choice rather than downloading several neighboring states or inventing certainty. Outside the coverage, missing data, unsupported Worker/HTTPS/geolocation, declined permission and timeouts leave the current filter unchanged. Position timeout is 10 s; an overall 25 s UI deadline also covers an unanswered permission prompt. City-name dataset loading and mesh requests have separate timeouts. Cancellation, dialog closing/Escape, manual changes, page hiding, filter changes and obsolete callbacks invalidate the attempt; workers are terminated promptly. Only city ID/UF/name may be saved by the pre-existing location control.

## Performance

No mesh or worker code is loaded before an explicit request. Geometry decoding/testing is off the main UI thread. Topology retains shared arcs to reduce transfer, no map library is loaded. Worker mesh responses are bounded at 8 MB and are same-origin GETs with omitted credentials. Browser HTTP caching is reused; no coordinate cache is created.

## Verification

`node --test tests/home-location.test.js` checks topology arc reversal/transform, Polygon holes, MultiPolygon islands, imprecise coordinates, boundaries, all dataset hashes and all official codes, plus real-coordinate fixtures for Recife/Rio/São Paulo. Local run: six tests passed in approximately 0.56 s.

`python tests/home-location-browser.py` uses Playwright fixtures and stubs the device API before page load. All requests are intercepted and constrained to local checked-in files. It tests Portuguese, English, Spanish and Simplified Chinese at 320/1440 px; confirmation, keyboard, manual/cancel/worker races, denied/unavailable/timeout callbacks, inaccurate position and the overall permission deadline. It records suggestion latency, observed main-thread long tasks and screenshots. No actual GPS or production backend is contacted. Local Chromium process startup is blocked by executor socket restrictions; browser results must be verified in the dedicated read-only CI job before merge.
