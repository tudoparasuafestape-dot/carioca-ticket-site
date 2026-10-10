# Public event language integration

Scope: `/evento/` and `/evento-v2/` use the existing `ct-home-locale` preference and `CTPublicI18n` service for Portuguese, English, Spanish, and Simplified Chinese. Explicitly marked UI labels and fixed render/error/share messages are translated. No runtime DOM text matching, external translation API, backend edits, operational mutations, or checkout calculation changes.

## Producer content

Names, dates, locations, ticket names/descriptions, amounts and producer-authored descriptions remain the exact source values. Non-Portuguese UI shows an original-language notice. The legacy event payload has no content-language or reviewed translation fields; its existing Portuguese source-language convention is retained. This is **UI localization**, not a claim that producer descriptions are translated. Complete producer-description translation remains pending an approved source-language and exact-source reviewed-translation contract (the shared core already supports exact-source matching). No automatic translation service has been added.

Speech uses local voices matching the description's own `lang`, never the selected UI language. It stops on language changes, description changes and navigation; incompatible or remote-only voices leave the text available and listening disabled.

## Invariants

The RPC bootstrap, RPC method names, event IDs, campaign attribution parameters, checkout destinations, price formatting and amounts remain unchanged. Theme variables, address destination validation and canonical sharing are retained. The share dialog now supports Escape, focus containment, focus return and browser history dismissal.

## Verification

- `node tests/event-directions-contract.cjs`: dependency-free address/integrity contract.
- `node tests/event-language-preview.cjs`, then `python tests/event-language.spec.py`: loopback synthetic preview, CSP blocks network/forms/frames; Playwright also aborts all non-loopback requests. Covers both routes, four locales, 320/390/1440 widths, light/dark, 150% text, storage denied/events, BFCache preference reconciliation, repeated share/close/Escape/Back, clipboard/native payloads, local speech language and unavailable voices.
- Existing event-accessibility preview allowlist includes the new locale assets.
- Local browser execution is blocked by the execution environment; the dedicated pull-request workflow is the authoritative browser run. A workflow failure must be resolved before merge. No production smoke test is performed by these fixtures.
