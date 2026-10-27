'use strict';
// Positive synthetic fixtures only. Never wrap an intentional negative or
// malformed response: those cases must remain fail-closed without repair.
const assert = require('node:assert/strict');
const PROFILE_MS = Object.freeze({ checkout: 120000, detail: 300000, home: 300000 });
function temporalEnvelope(profile, nowMs) {
  assert(Object.hasOwn(PROFILE_MS, profile), 'Unknown public fixture temporal profile');
  assert(Number.isFinite(nowMs), 'The fixture must supply its explicit clock instant');
  const now = new Date(nowMs).toISOString();
  return { temporalVersion: 1, eligibilityContract: 'CT_PUBLIC_ELIGIBILITY_EXCLUSIVE_V1',
    serverNow: now, temporalEvaluatedAt: now,
    validUntil: new Date(nowMs + PROFILE_MS[profile]).toISOString(), nextTransitionAt: null };
}
function legacyNoEndTemporal() {
  return { state: 'LEGADO_SEM_FIM', inicioEm: null, fimEm: null, fusoHorario: null, temporalVersion: null };
}
module.exports = { temporalEnvelope, legacyNoEndTemporal, PROFILE_MS };
