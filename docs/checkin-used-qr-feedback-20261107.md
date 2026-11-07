# Check-in: feedback on repeated QR

## Scope and diagnosis

The common first-party reader silently rejected `codigo === codigoUltimaLeitura` indefinitely. Explicitly continuing after a result did not clear that condition, so presenting the same QR again never queried the server. This logic did not depend on the event ID.

Baseline: f708961. The baseline `checkin/checkin.js` is byte-identical to the retained input of the previous official publication. This is not a fresh remote deployment verification.

## Change

Remove the permanent same-code exclusion. Keep the existing 2600 ms debounce, restarting it when the operator explicitly closes a result. A distinct QR remains immediately eligible. Keep all processing/result locks and the server-side preview followed by explicit confirmation. A repeated used ticket obtains the backend's `JÁ UTILIZADO` result without a second write. An uncertain confirmation still cannot be recommitted.

No backend, credential, financial, event data, or deployment changes.

## Verification

- Baseline runtime suite: all 24 existing scenarios passed.
- Added regression failed on baseline: expected `JÁ UTILIZADO`, observed the old `ENTRADA LIBERADA` title with no fresh query.
- Final runtime suite: 32 scenarios passed, including original 24 unchanged and new same-QR retry after used/cancel/preview timeout/uncertain confirmation at mobile and desktop widths.
- `npm run test:contracts`: passed (41 protected surfaces and private-event frontend contracts).
- JavaScript syntax and `git diff --check`: passed.
- Browser suite extended with visible already-used result, read/write counts, and screenshot at all four existing viewports. NOT RUN successfully: bundled Playwright browser missing; installed `/usr/bin/chromium` fails to start with `socket() failed: Operation not permitted`, including an approved escalated attempt. Browser assertions/screenshots therefore remain unverified.
- No real camera, live ticket, backend mutation, merge, push, or production deployment performed.

To complete visual verification in a compatible executor:

```
node tests/scanner-session.runtime.cjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node tests/scanner-session.browser.cjs
npm run test:contracts
```

The browser executable override is optional; omit it when the pinned Playwright browser is installed. All browser page requests are intercepted by the existing synthetic test harness. Do not run the legacy full e2e command without its explicit branch isolation settings (see HOMOLOGACAO.md).
