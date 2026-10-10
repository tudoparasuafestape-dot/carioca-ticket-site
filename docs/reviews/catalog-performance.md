# Public catalog performance: isolated candidate

Baseline: `b3f62f2554bebc7fde65a467358fafc634f18af2`.

## Scope

- Start the existing public catalog POST/iframe request as the first deferred script, overlapping download and initialization of presentation modules. The DOM mounts after `DOMContentLoaded`, once translation and filter helpers have initialized. The transport, public method, arguments, origin checks and timeouts are unchanged.
- Keep rendered cards only in the current page's authoritative response. Filters reuse nodes and a normalized search index, with stable accessible identifiers based on the original response order. Every load and language change invalidates the relevant presentation cache. No catalog response is stored in browser storage or the service worker.
- Initialize every carousel card once after each render, but update only outgoing/current/incoming visible cards during navigation and drag. Translate all card labels on reset or language change rather than on every rotation.

No change to backend, checkout, payment, session, prices, stock, publication eligibility, catalog ordering or sharing destinations. No merge, production deploy or rollback is part of this candidate.

## Verification

`node tests/catalog-performance-isolated.cjs` compares this candidate with the pinned baseline using Chromium and fully intercepted synthetic content. It uses offline contexts, blocks service workers and aborts every undeclared request. The simulated profile delays one presentation script by 500 ms, the public RPC response by 250 ms and covers by 100 ms. Those are test inputs, not observed production timings.

The comparison records RPC start, response, card and first-cover checkpoints for 1/15/50/200 events; synchronous filter work and created-node counts; carousel work and attribute writes. Additional regression groups cover 0/1/2/15/50/200 events, response replacement/removal, return by a new navigation, retry, stable unique accessible IDs, all four locales, original ordering, broken covers and missing optional carousel enhancement. Existing isolated home/catalog CI also runs and covers keyboard, touch, sharing, layout and interrupted flows.

Results are produced as `test-results/catalog-performance/results.json` in the workflow artifact. Timings are illustrative single-run samples; deterministic work counts support the optimization independently of runner noise. They do not measure Apps Script execution, real network/CDN caching, a physical phone, Safari, back-forward cache restoration or production Web Vitals. Initial catalog download and first render still grow with the returned catalog; there is no pagination or virtualization in this small change.

The first local Chromium launch was blocked by the cloud shell's socket restrictions; the escalated launch failed while provisioning its sandbox. Syntax checks passed. Browser verification is delegated to the isolated GitHub Actions workflows; no live production RPC is authorized or used.
