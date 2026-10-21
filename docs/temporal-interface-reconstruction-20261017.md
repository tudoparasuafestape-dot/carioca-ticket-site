# Temporal interface reconstruction, 17 October 2026

## Provenance and scope

This is a **new reconstruction**, based on site main `dc3fb3f1c19804c6a641118326621f1c177d70ae`. It is not a recovery of the missing UI13 archive and does not claim its recorded hashes or historical test counts. Current main's session handling, public demonstration/catalog exceptions and explicit-date producer authoring remain the starting point.

The interface consumes the contract in the separately recovered 18-file backend proposal, particularly `CTLotesSequenciaisPROD.js`, `CTCheckoutPublicoCatalogoPROD.js`, `CTEventoPublicoExperienciaPROD.js`, and `CTIngressosConfigProdutorPROD.js`. This PR does not deploy that backend, activate sequential lots, merge, publish the site, call production, create payments/tickets, or exercise native Apps Script/Sheets locking.

## Behavior

- The server is the sole authority for current lots, inventory, rollover and admission. The UI never chooses a successor from dates, labels or a zero available count.
- `lotesVenda` is activation-gated. Its absence preserves legacy lot presentation. A valid temporal envelope can still protect a legacy lot catalog.
- A server-anchored monotonic clock invalidates the response at the exact deadline, accounting conservatively for transport time. Device wall-clock changes cannot extend availability.
- Checkout and event pages show server-projected current, closed, paused and upcoming lots. Pending reservations remain a blocked current lot; they do not imply a sold-out/durable close. Quantity zero is represented as unlimited, without inventing a remaining quantity.
- Expired responses disable new purchase actions before a read-only refresh. A refreshed successor is never auto-selected. An unchanged same-price selection may remain only after the new authoritative response validates that exact lot.
- Canonical event ends remove home cards and block event/checkout purchase UI at `fimEm`. Legacy display dates are never parsed as a cutoff.
- Saved committed orders retain recovery, their original payment state and status polling even if the public event/catalog is no longer eligible. Catalog refresh never creates a charge or reprices an existing order. Recovery reads are deduplicated and older callbacks cannot replace a newer accepted order. An uncertain first payment response exposes an explicit recovery action using the exact original intent/key held in page memory, regardless of later form edits. Exact audited pre-commit input/admission rejections release that frozen intent, revalidate the catalog and require deliberate review/selection; unrecognized errors remain uncertain.
- Producer UI separates stored status from effective availability. Unknown projection does not fall back to stored `ATIVO`. Durable closure cannot be reopened. Existing second-precision date, timezone and temporal revision fields remain intact.
- New public labels cover Portuguese, English, Spanish and Simplified Chinese. Producer-authored names remain original text and are inserted safely.

## Reproducible checks

Run from the repository root:

```sh
npm run test:temporal
node tests/checkout-era-beauty.dom.js
node tests/checkout-cover-contract.cjs
node tests/checkout-home-navigation.runtime.cjs
node tests/public-i18n.runtime.cjs
node tests/safety/public-request-policy.test.cjs
```

`test:temporal` executes real shipped controller functions and clock/lot modules against deterministic local DOM/RPC fixtures. It covers canonical end boundaries, partial/malformed authority, latency and monotonic clock behavior, pending/full/unlimited states, legacy compatibility, delayed replies, navigation/resume, localized labels, saved paid-order recovery, producer reopening restrictions and preserved date authoring. These are frontend contract tests, not native backend/payment-provider validation.

The PR-only `Temporal interface (isolated fixtures)` workflow also runs actual HTML/iframe browser fixtures:

```sh
npm install --ignore-scripts --no-audit --no-fund
npx playwright install --with-deps chromium
npm run test:temporal:browser
```

Browser contexts use deny-by-default interception, offline mode, blocked service workers/WebSockets and an unreachable proxy. Only declared synthetic read fixtures are fulfilled. Existing fixture allowlists are extended with exact new static asset paths; no external-network permission is broadened.

## Verification limits

Local deterministic tests and syntax checks are recorded in the PR. Local Chromium launch is blocked by the execution sandbox; browser results must come from the exact PR commit's GitHub-hosted isolated workflow. Do not describe an unrun browser suite as passing. Native Apps Script timing, lock behavior, Sheets persistence, production deployment and real payment/issuance remain separate validation gates requiring an authorized route. The exact-intent retry snapshot is intentionally memory-only: no additional buyer identity or access-grant data is persisted. A full reload before any secure order token was received cannot reconstruct that lost intent; persisted secure order/token recovery remains available when already saved.

Existing workflows and their production-read protections are preserved. The new workflow has read-only repository permission, triggers only for pull requests to main, and contains no deployment or production request step.
