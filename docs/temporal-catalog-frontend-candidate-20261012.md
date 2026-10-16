# Temporal catalog frontend candidate — 2026-10-12

## Candidate status

Draft PR220 integrates the shared monotonic lease with evento/, evento-v2/,
checkout/ and checkout-v2/. It is not a production release. Publication requires
the backend temporal contract (backend PR299) to be deployed and verified first.
Neither this candidate nor its tests authorize merge or production deployment.

The homepage and the definition of event end remain outside this change.
Lot expiry is not stock exhaustion: no stock is zeroed. The next lot opens only
at its own configured start. A gap means no current offer, not event end.

## Contract and timing

Successful event and checkout catalog responses, including zero active lots:
temporalVersion:1; temporalEvaluatedAt; serverNow refreshed on every return;
nextTransitionAt UTC ISO or null; validUntil exclusive UTC ISO.

The browser deducts the full request duration from the lease, using
performance.now() rather than the device wall clock. Inclusive backend lot-end
semantics remain unchanged: expiry is end+1ms. Timers can run late or stop during
suspension. The browser invalidates offers and revalidates on visibility return,
focus, online and BFCache pageshow; synchronous CTA/payment guards handle delayed
timers. Network latency means visual replacement is not instantaneous.

## Checkout preservation

Commercial refresh preserves buyer, participant, quantity and payment-method
fields. Selected IDs survive only if still present. Removed lots are cleared;
a higher-price replacement is never selected automatically. Quotes and coupons
must still match their request generation and a fresh catalog at callback time.
Campaign reporting occurs once on initial rendering; private grants remain in
the original v2 read request.

Known orders, in-flight creation, PIX, card, success panels and existing
pedidoId+consultaToken recovery remain separate from availability refresh.
Recovery using that existing proof is attempted even if catalog metadata is
missing; failure presents a retry for the same read-only recovery flow.

## Unknown financial result: manual recovery limitation

A saved idempotency key alone proves neither a completed order nor that no order
was created. It never authorizes a stale retry or a second purchase.

If a financial response is lost and only an unresolved key remains, the
candidate preserves that key and the current form, blocks all new creation
(including another method/key), and shows an explicit link to the existing
/minha-carioca/conta/ route. The link has no personal data, token or query string.
Navigation is user initiated. There is no automatic sign-in, OTP request,
financial retry, new recovery endpoint or additional credential.

This is a pending/unknown state, not a declaration that an order does not exist.
It clears only on an authoritative existing-order result. One separate, proven
pre-order rejection is handled without entering unknown-result state:
CT_POLITICA_COMERCIAL_PRECO_ATUALIZADO, correlated to this tab's exact attempted
method and key. Backend review established this rejection occurs after the
idempotent replay lookup and before order/provider creation. It permits fresh
catalog revalidation and explicit buyer reconfirmation with that same method/key;
it never clears an earlier unknown-result state and is not persisted across reload.
An unrelated error, changed method, unmatched key or stale response is not that proof. Viewing the account
does not by itself prove that an order belongs to that account or that no order
was created. Association and authentication follow the existing Minha Carioca
flow. There is no new cross-tab reconciliation in this patch.

No personal form data is newly persisted: after reload, the saved key still
blocks new creation, but restoring unsaved personal fields is not guaranteed.
No button clears the key or silently retries purchase. Complete automatic
recovery from a key without a returned order token is outside this candidate.

## Verification and review

The initial isolated helper passed 16 unit cases and existing hosted CI at
6f26ace. Those results do not validate this later integration.

Integration requires independent review plus the dedicated offline browser
matrix and all relevant existing regressions. Fixtures must intercept or abort
every request; unexpected destinations/RPCs fail tests. No real site, production
RPC, payment, user computer or local executor is used. GitHub-hosted test results
must be checked for the final branch SHA before reporting validation.

Coverage includes first-load retry, zero lots, deadlines and delayed timers,
hidden/resumed tabs, deduplicated refresh, old quote/coupon responses, buyer and
participant preservation, v2 campaign/grant, known/recovered PIX/card/success,
terminal order re-entry and unknown-result timeout/reload/method changes.

## Deliberate regression-test contract changes

The suites `tests/checkout-era-beauty.dom.js`, `tests/checkout-language.dom.cjs`, `tests/advance-sales-closure.browser.cjs`, and `tests/checkout-home-navigation.browser.cjs` now require pending recovery, preserved keys/form, and zero second creation after an ambiguous result, including method changes or reload. The DOM suites also treat `CT_PC_REVISAO_DIVERGENTE` as unknown because its pre-order provenance is unverified. Existing exact `CT_POLITICA_COMERCIAL_PRECO_ATUALIZADO` scenarios remain: its narrowly correlated rejection permits revalidation with the same key and new explicit consent. That proof is consumed before every subsequent submission; a later timeout or generic failure returns to pending recovery and cannot authorize a third attempt. Manual authenticated recovery remains a documented limitation requiring production review.

The legacy non-ERA late-coupon regression also changes deliberately: an obsolete quantity-1 response must not overwrite the current quantity-2 selection/total. The assertion now requires total 174 (rather than the old stale 77), unchanged type/lot/quantity, hidden obsolete promotion, and no ERA quote or payment call.
