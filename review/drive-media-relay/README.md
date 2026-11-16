# Local binary delivery prototype, NOT deployed or connected

This prototype explores using the EXISTING Railway API runtime as a binary delivery layer while Drive remains the source. It creates no service, account, bucket, database table, event edit, permission change or cost commitment. It is not imported by the staging candidate or any live Nest module. No credentials were read, generated, transferred or configured.

## Why this is different from redirecting to Drive

The reported diagnostic observed NodeGET200/image/png with the expected original hash, but Chromium received403/text/html and ORB; Google delivery used attachment and same-site CORP. This implementation does not disable ORB, spoof browser security policy, or redirect users to a Google error page. A server adapter must independently fetch authorized ORIGINAL bytes and the service only returns an approved, exact-hash PNG/JPEG with its own response headers. Local tests used a synthetic valid PNG and fake upstream transport, not authenticated Drive.

## Local components

- media-core.cjs: public opaque hashID -> current server registry -> bounded source bytes -> exact hash/MIME/size -> second current registry check -> response. No URL is accepted from the caller. The public ID equals the approved SHA256 and does not expose the Drive fileId.
- drive-source.cjs: prospective official Drive v3 metadata+alt=media adapter, fixed Google API origin, safe fileId grammar, no cookies, no redirect, streaming byte cap. Missing getAccessToken provider fails CLOSED before network. Public-fixture mode is OFF by default and only permits one already-public fixture with its fixed fileId/hash/bytes/MIME and literal previously observed URL. It is NOT a general anonymous Drive API or public URL fetcher.
- http-handler.cjs: local Node HTTP composition only, GET/HEAD at /api/v2/media/covers/<64hex>. Rejects query URLs, other methods and Range. Responds image/png or image/jpeg, inline, nosniff, CORPcross-origin, ACAO* without credentials, no-store. Upstream HTML/errors, fileId and token are not reflected. The byte stream may contain original embedded metadata; this is not metadata sanitization.
- media.test.cjs: 25 local tests, including real loopback HTTP. All passed on Node24. No new dependencies, internet request, browser configuration or service calls were used by these tests.

Run:
```
node --test fabrica-drive-binary-prototype-20261116/media.test.cjs
```

## Mandatory trusted record contract, not implemented persistence

resolvePublicAsset(id, {signal}) must read a current, server-protected registry and the event's current public eligibility. The return is not a browser-submitted object. It must contain:
- assetId and sha256 equal to the requested 64hex content hash;
- stateREADY, publicRelease=true, eventPublic=true, revoked not true;
- immutable approval revision64hex, explicit unexpired approvalExpiresAt;
- exact fileId/folderId, sourceKind drive-oauth or tightly scoped public-fixture;
- mimePNG/JPEG, bytes<=2,065,000;
- validationFULL_DECODE_PASSED for those exact bytes, and explicit metadataPolicy ORIGINAL_METADATA_REVIEWED or SANITIZED_DERIVATIVE.

No database adapter, authenticated registry endpoint, approved metadata policy provider, event-public lookup or signed validation attestation has been installed. The prototype cannot infer these properties from the existing Sheets intake alone. A forged/client-controlled READY record must never reach this boundary. The publication approval must expressly authorize exposing the exact bytes publicly through the media endpoint even if the source Drive file remains private.

## Cache, revocation, limits

In-process byte cache only, at most16MiB and60seconds, keyed by approved record fingerprint. Copies prevent caller cache mutation. No browser/CDN caching is requested (no-store). Registry and event-public eligibility are rechecked on every request, including cache hits, and again before the response. Revoked/unavailable/changed registry fails closed and purges that asset's cached bytes. Already-downloaded copies cannot be retracted.

Explicit registry revocation is the authoritative public-release control. A Drive edit/delete/ACL change alone is not an instantaneous registry revocation; a valid prior approved byte snapshot may remain in the internal cache for up to60seconds. If policy requires Drive ACL/delete to revoke delivery immediately, a trusted fresh metadata/access check must also be added on cache hits before enabling the service. Do not promise immediate Google ACL revocation with this prototype.

Global per-process quota60requests/minute and max2in-flight. While the Node event loop remains responsive, an independent5second deadline responds503 and requests provider cancellation. The slot is NOT released until actual provider work settles. Two never-resolving providers therefore hold the two slots and subsequent requests promptly return429; they do not spawn an unbounded number of orphan tasks. Registry/source providers must still honor cancellation for availability. Default fetch honors AbortSignal. A blocked synchronous event loop cannot be preempted by this timer; the bounded2MB hashing loop is not an arbitrary-code sandbox. The service factory must be a process-lifetime singleton, not recreated per request. No automatic restart/reset is included; recovery from wedged providers requires an explicitly authorized operational action, not silently clearing counters. These are HML prototype limits, not a production traffic policy. No external-service call is made while waiting for a browser to consume bytes. Multi-replica quotas/revocation coherency, distributed abuse controls, slow-client limits and production observability remain deployment design requirements. These local quotas are conservative test controls, not the final commercial policy.

## Real credential/runtime requirement

Railway is NOT shown to have Drive credentials just because Apps Script or this assistant can read Drive. The private-source adapter needs an explicitly authorized credential provider on the Railway service, scoped to reading the selected Drive files (for example an appropriate OAuth grant or service identity explicitly granted those files). It must refresh/rotate safely, never log/store access tokens in public artifacts, and enforce the chosen account and file scope. No such provider or grant was located or configured in this task. Existing GitHub/AppsScript/browser credentials must not be copied implicitly. Scope choice and any cross-service credential transmission require their own approval and secure credential flow.

The registry/event eligibility adapter also needs a real, authenticated read path to the authoritative CT data. That path is absent. The full decoder exists as a separate Python review worker, not a production validation service. Node does not automatically execute Python or provide a secure sandbox. Bind exact hash validation and editorial approval server-side before READY. Removing metadata would produce a NEW derivative/hash requiring its own approval.

The current picker/core/promote/revalidators were designed around strict direct-Drive URLs. Pointing a field at this new endpoint is NOT sufficient: introduce and review an explicit delivery type (e.g. DRIVE_ORIGIN_API_DELIVERY), update server validators, public URL mapping, promotion, selection writer and picker allowlists, preserve legacy assets and prove save/reopen/revocation. Never relax an arbitrary-host URL regex as a shortcut. No such integration has been performed by this prototype.

## Remaining evidence before any deployment

- Credential provider and authoritative registry/event-public adapters, with their actual permissions tested.
- Real source metadata/bytes/hash checks against the selected account; no synthetic credential claims.
- Real decode/metadata policy plus publication approval for the exact bytes.
- Safe adapter integration into existing Nest module and current staging build, without new infrastructure.
- Explicit deployment/configuration authorization and full staging runtime tests.
- Browser img and real OG crawler against the own-origin binary endpoint, including redirects/errors/revocation; local HTTP success is not browser/OG proof.
- Source/runtime current-state recheck, costs/egress/quotas assessment for the existing service. Existing infrastructure does not guarantee zero marginal cost.

No push, deployment, database consultation, image upload, event mutation or permission change was made.


## Cancellation/deadline review evidence

Rejected upstream status/MIME/encoding/length and metadata responses request body cancellation, as do streaming overflows/read failures. Cancellation is initiated without waiting indefinitely for an untrusted cancellation implementation. Tests assert cancellation occurs on the previously uncovered early exits. Independent deadline tests include a registry that NEVER resolves: two caller responses time out, in-flight remains2, a third request gets429 and source fetch/cache never occurs. Late resolution is discarded after the aborted-signal check; a cooperative abort releases its slot. 25 local tests passed after these fixes. Parent requested independent review of these gates before any browser proof; no live service was exercised.

## Prepared cross-site Chromium relay proof (not executed here)

`browser-relay-probe.cjs` is an explicit test executable requiring the exact environment opt-in:
```
CT_RELAY_PROBE=READ_ONLY_PUBLIC_FIXTURE node browser-relay-probe.cjs
```
Without that exact environment value (or if any CLI argument is added), it fails before loading Chromium, binding servers or making a source request. Requires already-prepared Playwright1.55.0/Chromium, matching the existing reviewed CI test runtime; it does not install or download a browser itself.

The script binds HTML ONLY on127.0.0.1 and media ONLY on127.0.0.2, each on an ephemeral loopback port. Failure to bind either address fails the proof; there is no0.0.0.0 or external fallback. Browser context allowlist contains only the exact local page, favicon and own-media URLs. Service workers are blocked; unexpected browser requests are aborted. Browser does not request Google. It uses normal Chromium networking/security and no ORB/site-isolation disabling flags, no browser response fulfillment and no modified Google headers.

Node source allows exactly ONE credentialless GET to the previously observed public-fixture URL, redirects rejected and no retry. MIME/size/SHA are checked by the source/service before delivery. The browser receives the own endpoint's image/png, inline, nosniff, CORPcross-origin headers; the script requires actual Sec-Fetch-Site=cross-site, decoded natural dimensions1080x1350, byte count1959605 and SHA51641c2541154228a4f9099f4056c1b47daab1598e369c50b91bccd1d76ce570. Media body bytes are read from the browser response and hashed without printing them. HTML/HTTPheaders do not contain the source fileId or token. No credentials are used.

JSON output explicitly labels the registry SYNTHETIC_PUBLIC_FIXTURE_ONLY, privateDriveCredentials=false, realEventRegistry=false, realOgCrawler=false and deployed=false. A pass proves only this controlled public fixture through the loopback relay in that Chromium runtime; it does not prove the private Drive provider, actual registry/event eligibility, integration with the deployed API, internet reachability or real OG crawler behavior. A failure remains a diagnostic: do not disable browser protection or replace the registry with a claimed production record to force a pass.

Only syntax checks and the25 non-browser tests were run by this author. Browser execution/publishing remains with the coordinating agent's reviewed test-only branch/CI process. No push, controller mount, config change, DB query, credential access or deploy was made.
