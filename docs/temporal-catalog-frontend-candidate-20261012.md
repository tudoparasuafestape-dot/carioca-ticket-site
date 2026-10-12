# Temporal catalog frontend candidate — 2026-10-12

## Status and scope

This branch is an **unactivated foundation**, not a completed frontend fix.
No HTML page imports public-catalog-clock.js. No payment, order, recovery,
campaign, private grant, stock or production configuration is changed.
The module is the shared lease implementation intended for both event pages and
both checkout pages. Its tests are dependency-free, synthetic Node tests.

Do not publish/activate frontend enforcement before the backend contract is
deployed and independently verified. Neither this branch nor its draft PR
authorizes merge or production deployment.

## Backend contract

Successful ctEventoPublicoCarregarPROD and
ctCheckoutPublicoCarregarEventoPROD responses, including zero available lots:

- temporalVersion: 1
- temporalEvaluatedAt: UTC ISO instant of evaluation
- serverNow: UTC ISO instant refreshed for each response, including cache hits
- nextTransitionAt: UTC ISO instant or null
- validUntil: exclusive UTC ISO bound

The backend owns lot eligibility and transaction enforcement. Current inclusive
lot-end semantics remain unchanged: expiry transition is end + 1 ms.
An expired selling period means closed for sale; it does not mean stock sold out.
Never zero stock, advance the next lot before its own start, or infer event end.
A gap with no active lot means no current offer. Event-list removal is separate.

The lease subtracts the complete request duration conservatively using the
request-start monotonic sample. It never trusts the device wall clock. Cached
temporalEvaluatedAt may remain unchanged, but neither serverNow nor the evaluated
snapshot may regress compared with previously accepted data.

## Activation work still required

1. Add the shared script to evento/index.html, evento-v2/index.html,
   checkout/index.html and checkout-v2/index.html only after backend readiness.
2. Call begin immediately before the read-only catalog request. Accept the
   envelope using the exact returned ticket; a rejected or missing envelope
   cannot authorize a new purchase.
3. On expiry, invalidate displayed commercial data and fetch availability once.
   Do not automatically retry invalid/expired responses in a tight loop.
   Use a bounded backoff and an explicit retry action on failure.
4. On visibility returning to visible, focus, pageshow (including BFCache) and
   online, invalidate before reading availability. Coalesce simultaneous events
   and in-flight work. Always revalidate after suspension: some platforms pause
   monotonic clocks while the operating system sleeps.
5. Refresh event lots and minimum price without reinitializing maps, media,
   campaign recording or page navigation.
6. Implement a separate checkout availability refresh, rather than calling the
   existing loadCatalog initializer. Preserve buyer/participant fields, quantity
   and payment method. Retain selected IDs only if still available. If the lot
   disappears, clear it and request a new choice, never silently choose a higher
   price. Invalidate in-flight coupon and price-quote responses.
7. Check isFresh synchronously before creating a genuinely new order, as browser
   timers may be delayed. Do not let generic expiry handling conceal existing
   PIX/card/success panels, replace orders, clear idempotency or break recovery.
   The existing order or in-flight creation owns its payment flow. Revalidation
   is required when a terminal order returns to a new-sale form.
8. Preserve private grant arguments in v2 and do not repeat campaign side effects.
9. Finish an offline browser matrix for all four routes, stale response races,
   zero lots, retry, tabs restored after a boundary, existing/recovered orders,
   in-flight creation and terminal-order re-entry. Use the existing fail-closed
   isolated-network harness, no forwarded requests, real RPC or payment.

## Timing guarantee

A backend can enforce its scheduled boundary independently of a browser.
An active browser can invalidate its lease at that boundary, subject to browser
scheduling. A genuinely suspended tab cannot execute JavaScript; it must block
stale new-sale actions and revalidate on resume. Network latency means visual
replacement is not guaranteed at the exact backend instant.

## Verification

Intended command: node --test tests/public-catalog-clock.test.cjs.
A dedicated GitHub-hosted workflow may execute these pure unit tests.
Connector-only authoring has not run local commands or a browser.
Passing these unit tests is not a substitute for the activation browser matrix.
