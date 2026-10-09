# Public language infrastructure and remaining delivery scope

This change is infrastructure only. No page loads the module yet, no production user sees a new translation, and no completeness claim is made.

## Core contract

- `window.CTPublicI18n`: `getLocale`, `setLocale`, `register`, `message`, `apply`, `content`.
- Supported locales: pt-BR, en-US, es, zh-Hans. Existing `ct-home-locale` preference is retained. Storage denial falls back to memory. Storage events synchronize same-origin tabs without rewrite loops. Persisted pageshow refreshes the preference after same-tab BFCache restoration.
- `ct:public-language` announces actual changes. Integration must bridge existing home `ct:language` deliberately; this PR does not mutate CTHome or attach competing handlers.
- DOM opt-in uses `data-public-i18n`, `data-public-i18n-placeholder`, `data-public-i18n-aria-label`. Apply explicitly after dynamic rendering. Use labels on leaf nodes; applying textContent replaces a node's children. If any requested key is missing, all authored text and attributes on that node remain unchanged, with the original inherited language pinned before the page root changes.
- Only fully integrated pages should use `data-public-i18n-root` on html. Otherwise the document language remains unchanged, while translated nodes receive their actual language.
- No network, new dependencies, credentials, backend changes or transaction changes.

## Source-bound event-content translations

`content({sourceText, sourceLanguage, locale, entry, informative})` consumes an optional entry with `sourceText`, `sourceLanguage`, and `translations` keyed by locale. Exact source text AND source language must match; a change returns the current original with status `stale`. Missing language returns `missing`. Both include a localized unavailable notice. A valid entry returns `translated` and keeps `original` and `originalLanguage`.

The caller must select entries by event ID plus field, render the returned notice, set language appropriately, and offer the original. Legal/informational translations must retain the original visibly accessible and use `informative: true`; this does not authorize changing terms or contractual meaning. Do not pass prices, dates, person names, places, IDs, payment data or customer data through translation.

A future source-store cache key should include event ID, field, source language, target language and source hash/revision. The stored source text remains an additional exact-match guard. Never reuse a translation by event ID alone. Edits invalidate only changed fields; delete or ignore stale entries rather than presenting older descriptions. This module does not fabricate hashes, fetch or persist content caches.

A static bundle can cover current reviewed event texts only. It cannot automatically translate future events or edits. Continuous full coverage needs an editorial translation store exposed in public responses, or an approved translation service with data handling, quotas, cost and deployment considered separately. Current inspected backend visual getters and save handlers expose Portuguese fields without locale variants. Changing the Apps Script contract/store requires a separate reviewed implementation. Do not use unapproved public translation endpoints or assume credentials.

## Delivery phases and route inventory

Inventory based on main 41ba64152c2f9dbb13309eda488d0f44ab6e6706. Public includes pages accessible before authentication; being reachable does not make financial or account behavior part of the design exception.

1. Public discovery: `/anuncie/` (new page in parallel preparation), `/`, `/evento/`, `/evento-v2/`, `/roda-de-samba/`, `404.html`. Home dictionaries already exist, but event description translation and cross-page integration remain outstanding. Review card and carousel copy, error/retry/loading states, share text, ARIA, titles, and audio. Event routes await directions changes.
2. Public institutional: `/ajuda/`, `/sobre/`, `/termos/`, `/privacidade/`, `/cancelamento-reembolso/`. Coordinate logo changes first. Legal translations are informational alongside unchanged originals.
3. Public partner acquisition/documentation: `/parceiro/programa/`, `/parceiro/ativar/`, `/parceiro/conduta/`, `/parceiro/manual/`, `/parceiro/regras-comerciais/`, `/parceiro/regulamento/`, `/parceiro/tratamento-dados/`. Program page mixes marketing and registration; preserve all actions and conditions. Public dynamically supplied material descriptions need the same source-bound translation contract.
4. Public purchase, invitation and ticket entry surfaces: `/checkout/`, `/checkout-v2/`, `/convite/`, `/campanha/`, `/consulta/`, `/ingresso/`. Translate presentation only in a separately reviewed phase; preserve calculations, fields, validation semantics, IDs, rules, payloads, navigation and transaction behavior. Merge checkout work only after its safe-exit changes are reconciled.
5. Buyer account/auth entry: `/minha-carioca/`, `/minha-carioca/acesso/`, `/minha-carioca/login/`, `/minha-carioca/conta/`, `/minha-carioca/ingressos/`. Public auth screens and authenticated content require explicit coverage distinction; do not send account/customer text to a translation service.
6. Operator/producer/partner entry pages have publicly reachable login shells but internal areas: `/produtor/`, `/produtor-v2/`, `/produtor/solicitar/`, `/parceiro/`, `/fornecedor/`, `/acessos/`, `/acessos-v2/`, `/checkin/`, `/eventos-v2/`. Inventory and classify their login copy before claiming public coverage. Internal design and operational pages are excluded from the current public-design exception.

Other repository routes are operational/authenticated and are not silently considered translated: `/backoffice/` and children, `/bar/`, `/central/`, `/comissionado/`, `/comissoes/`, `/crm/`, `/cupons/` and admin, `/financeiro/`, `/fornecedores/`, `/parceiro/admin/`, `/produtor/campanhas/`, `/produtor/carioca-pay/`, `/produtor/comissoes/`, `/produtor/convidados/`, `/produtor/cortesias/`, `/produtor/financeiro/`, `/produtor/ingressos/`, `/produtor/politica-comercial/`, `/produtor/solicitacoes/`, `/reembolsos/`, `/relatorios/`, `/saude-vendas/`, `/vendas/`.

## Validation

Run `node --check assets/public-i18n.js` and `node --test tests/public-i18n.runtime.cjs`. The dedicated public-i18n-isolated.yml PR workflow runs both commands without npm install or network-facing test code. These are isolated VM/DOM-contract tests with no backend or browser traffic, not browser end-to-end tests. Do not run legacy aggregate tests that can target production.

Integration remains responsible for four-language desktop/mobile visual and browser tests, reload/navigation/back-forward, storage restrictions, repeated language changes, same-origin tabs, unknown event and changed source fallback, unchanged URLs/IDs/dates/values/payloads, and speech cancellation/appropriate local voices. No voice available must leave readable text and an honest localized status. Current speech module is Portuguese-only and is untouched here.
