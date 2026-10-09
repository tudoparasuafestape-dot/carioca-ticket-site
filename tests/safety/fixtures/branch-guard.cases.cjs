const { test, expect, mockRoute, mockFailure, fixtureError } = require('../../e2e/helpers/branch-isolated.cjs');
const { RPC_ENDPOINT } = require('../isolated-network.cjs');
const METHOD = 'ctBackofficeMasterCarregarPROD';
async function rpc(page, method = METHOD) {
  await page.evaluate(({endpoint, method}) => {
    const form = document.createElement('form'), frame = document.createElement('iframe');
    frame.name = 'negative-rpc'; document.body.append(frame); form.target = frame.name; form.method = 'POST'; form.action = endpoint;
    for (const [name, value] of Object.entries({ctMinhaCariocaAction:'portalRpc', ctMinhaCariocaRequestId:'FIXTURE', metodo:method, argsJson:'["WRONG-SYNTHETIC-TOKEN"]'})) {
      const input = document.createElement('input'); input.name = name; input.value = value; form.append(input);
    }
    document.body.append(form); form.submit();
  }, {endpoint: RPC_ENDPOINT, method});
}
test.beforeEach(async ({page}) => { await page.goto('/central/'); });
test('FAIL caught assertion returned as ok:false still fails helper teardown', async ({page, _branchNetwork: guard}) => {
  await mockRoute(page, {rpc:{portalRpc:[METHOD]}}, async route => {
    try { expect(JSON.parse(new URLSearchParams(route.request().postData()).get('argsJson'))[0]).toBe('EXPECTED-TOKEN'); }
    catch (_) { /* Deliberately swallowed: the guard must still see it. */ }
    await route.fulfill({status:200,body:'{"ok":false}'});
  });
  await rpc(page); await expect.poll(() => guard.state.unexpected.length).toBeGreaterThan(0);
});
test('FAIL unknown RPC cannot be hidden by a declared handler returning 200', async ({page, _branchNetwork: guard}) => {
  await mockRoute(page, {rpc:{portalRpc:[METHOD]}}, route => route.fulfill({status:200,body:'{"ok":true}'}));
  await rpc(page, 'ctUnexpectedMutationPROD'); await expect.poll(() => guard.state.unexpected.length).toBeGreaterThan(0);
});
test('FAIL raw page route cannot silently abort an external request', async ({page, _branchNetwork: guard}) => {
  await page.route('**/*', route => route.abort());
  await page.evaluate(() => fetch('https://unexpected.invalid/write').catch(() => {}));
  await expect.poll(() => guard.state.unexpected.length).toBeGreaterThan(0);
});
test('FAIL raw context catch-all 200 cannot hide an undeclared popup', async ({page, context, _branchNetwork: guard}) => {
  await context.route('**/*', route => route.fulfill({status:200,body:'fake success'}));
  await page.evaluate(() => window.open('https://unexpected.invalid/popup'));
  await expect.poll(() => guard.state.unexpected.length).toBeGreaterThan(0);
});
test('FAIL explicit resource mock cannot serve any other path', async ({page, context, _branchNetwork: guard}) => {
  await mockRoute(context, {resources:['https://example.invalid/declared']}, route => route.fulfill({status:200,body:'fixture'}));
  await page.evaluate(() => fetch('https://example.invalid/undeclared').catch(() => {}));
  await expect.poll(() => guard.state.unexpected.length).toBeGreaterThan(0);
});
test('PASS explicitly simulated RPC failure is accounted without unexpected call', async ({page, _branchNetwork: guard}) => {
  await mockRoute(page, {rpc:{portalRpc:[METHOD]}}, async route => {
    try { throw fixtureError('INTENTIONAL_FIXTURE_FAILURE'); } catch (error) { mockFailure(route,error); }
    await route.fulfill({status:200,body:'{"ok":false}'});
  });
  await rpc(page); await expect.poll(() => guard.state.simulatedErrors).toBe(1);
});
test('PASS exact popup resource is accounted even at context route precedence', async ({page, context, _branchNetwork: guard}) => {
  await mockRoute(context, {resources:['https://example.invalid/declared']}, route => route.fulfill({status:200,body:'fixture'}));
  const popupPromise=page.waitForEvent('popup'); await page.evaluate(() => window.open('https://example.invalid/declared'));
  const popup=await popupPromise; await popup.waitForLoadState();
  expect(guard.state.observed.some(x => x.host==='example.invalid' && x.handling==='declared-resource')).toBe(true);
});
