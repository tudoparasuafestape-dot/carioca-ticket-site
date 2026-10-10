# Public checkout and ticket language review

Scope: inherit the existing public language preference (Portuguese, English, Spanish, Simplified Chinese) through the two checkout pages and public ticket page, including browser printing. UI presentation only. Producer text, participant details, monetary amounts, identifiers, secure links and QR data are preserved. Unknown backend/producer text keeps its original language. No backend, payment authority or checkout-state changes are intended.

Base: ed0ef078fc3289cfb85fa71145db57db03304458, including PR211 cover fallback and PR197 event language. PR209 privacy work is not merged or included here; its future CSS/JS/analytics includes must be reconciled separately rather than copied from an unverified branch.

## Implementation and safety

- Explicit authored text/attribute bindings and explicit dynamic template keys/values. Never infer a template from producer/backend text.
- Locale changes update presentation only: no catalog/participant rerender, financial recalculation, new RPC, polling restart, or purchase submission.
- Original message preservation for unknown coupon observations; reviewed admission-only wording has its own exact key.
- Fee presentation keys preserve existing v2 payer/degraded branches and monetary calculations. Existing commercial-policy asset unchanged.
- Existing window.print() remains the print action. Language controls are excluded from print.
- Core/helper failure retains usable Portuguese. Back/pageshow/storage reconciliation retains the public preference without deriving it from restored form controls.

## Local verification before draft

- 98 checkout VM cases, 31 checkout-v2 VM cases, 6 ticket VM cases passed; actual inline scripts with explicit synthetic RPC mocks, no real network/payment/order/ticket.
- Complete RPC arguments/payment payloads, input values, selections and pending PIX/card polling schedules compared before/after repeated locale changes.
- Adversarial names (Cupom VIP, Participante Premium and literal template tokens) and unfamiliar backend messages stay unchanged.
- v2 six payer/additional-charge combinations exercised in all four languages with identical totals/call counts.
- Independent local review reproduced initial template-inference defects, verified their correction and checked fallback/storage/BFCache/navigation cases. No remaining local code blocker was found.

## Draft CI gates

- 24 checkout page/locale/width combinations: 320/390/1440, 150% text, field/state retention, dialog close/focus, synthetic pending payment/polling, screenshots.
- 12 ticket locale/width combinations plus missing-core/blocked-storage cases; synthetic signed link, unchanged QR bytes, repeated share/cancel/copy, print controls, print screenshots and four A4 PDFs. QR fixture is deliberately non-redeemable; this checks byte/layout preservation, not real ticket validity or scanner operation.
- Browser/capture/print results are pending until the isolated workflow runs on this exact draft head; local VM passes are not browser approval.
- Published-static contract now includes these language assets and previously merged event-i18n.js/css. It performs allowed static GET comparison only after a future authorized merge; no production JavaScript or RPC runs. Opening this draft does not execute that production job.

No publication is authorized by this draft itself. Final review, successful gates and parent coordination are required before any merge.
