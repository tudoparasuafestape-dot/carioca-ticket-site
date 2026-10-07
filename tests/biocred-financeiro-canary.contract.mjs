import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync('backoffice/carioca-pay/produtores/index.html', 'utf8');
const canary = 'PROD-1D96238E910D473CBC159AABCC2EAA94';

assert.ok(html.includes(`BIOCRED_CANARY='${canary}'`), 'canary producer must be hard-scoped to BIOCRED');
assert.ok(html.includes("acao:'PROVISIONAMENTO_PRODUCAO_CANARY'"), 'read-only readiness action missing');
assert.ok(html.includes("acao:'PROVISIONAR_SUBCONTA_PRODUCAO_CANARY'"), 'sensitive provisioning action missing');
assert.ok(html.includes("confirmacaoProvisionamento:'CRIAR SUBCONTA PRODUCAO'"), 'explicit creation confirmation missing');
assert.ok(html.includes("ctFinanceiroProdutorMasterProntidaoPROD"), 'existing allowlisted readiness RPC must be reused');
assert.ok(html.includes("ctFinanceiroProdutorMasterAtivarPROD"), 'existing allowlisted activation RPC must be reused');
assert.ok(html.includes("r.chamouProvider===true"), 'readiness provider-call safety gate missing');
assert.ok(html.includes("r.apiKeyExposta===true"), 'API-key exposure safety gate missing');
assert.ok(html.includes("r.movimentouDinheiro===true"), 'money-movement safety gate missing');
assert.ok(html.includes("r.splitHabilitado===true"), 'split safety gate missing');
assert.ok(html.includes("maskRef"), 'opaque reference masking helper missing');
assert.ok(html.includes("CT_SECRET_ASAAS_PRODUCAO_…"), 'masked opaque reference display missing');
assert.ok(html.includes("Verificar dados do cadastro"), 'safe first-step button missing');
assert.ok(html.includes("activationBox"), 'activation gating container missing');
assert.ok(html.includes("r.podeAtivar===true"), 'activation must remain gated by validated provider readiness');
assert.ok(!html.includes('ctSegredosObterValorInternoPROD_'), 'frontend must never read secret values');
assert.ok(!html.includes('/accounts'), 'frontend must never call Asaas accounts endpoint directly');
assert.ok(!html.includes('$aact_prod_'), 'frontend must never contain child API-key material');

console.log('BIOCRED financial canary contract: OK');
