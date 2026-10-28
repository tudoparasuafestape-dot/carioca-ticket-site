# Internal workspace tranche — candidate only

Base: `43760ce15f68c3fa996b8801964e473add414bcd` (includes PR #229).

## Implemented
- Producer portal: unified native disclosure menu; original permission/handoff controls preserved; responsive graphite/gold styling and clearer overview/context.
- Panel refresh: immediate loading + busy state, same-tick duplicate guard, success/error/timeout feedback, obsolete requests rejected after event change; panel-owned overlay cleared on interruption.
- Event management: authorized list searched by name/accent, descriptive stages, backend-reported pending items and technical IDs collapsed. Existing named producer selection retained.

## Not implemented
- Master commercial-policy manual IDs: requires a separate authorized Master catalog contract; no financial rules changed.
- General cover/editor: no secure generic endpoint confirmed. See architecture audit; no uploads, storage, ERA handler changes or backend writes.

## Local verification
Passed: 6 panel state-transition runtime tests; event search/stages/escaping runtime; 41 protected-surface contracts; private-events/commercial-policy contracts; producer performance (10); journey contracts; full-surface audit (70 pages); script parsing and diff whitespace checks. Independent review found an overlay interruption bug, corrected and retested, then no remaining code blocker.

Browser: **not executed successfully locally**. Chromium launch was blocked by executor socket restrictions; an escalation failed in environment setup. No browser-layout, focus or screenshot claim is made. Static preview HTML was generated from real candidate source with synthetic data, disabled actions and no external network; it is not a screenshot or evidence of rendered responsiveness.

No new CI workflow or existing job was changed. The Draft triggers only existing repository CI. Existing first-party facade jobs already execute producer-portal-first-paint and producer-event-governance specs: additive synthetic menu/overview and name-search/stages cases now save screenshots through their existing test-results artifact upload. No job, schedule or permission changed. Standalone refresh/browser interruption tests are delivered but are not wired to CI; their state transitions passed locally in VM tests. Captures and rendered layout remain pending until the existing CI completes.

Keep Draft until browser results and visual review are available. Merge and production deployment require explicit user approval. Tests never authorize publication.
