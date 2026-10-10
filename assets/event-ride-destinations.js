/* Reviewed public destinations only. Never geocode or reuse a pin across events. */
(function () {
  'use strict';
  window.CTEventRideDestinations = Object.freeze({
    'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD': Object.freeze({
      revision: '2026-10-10-approved-destination-2',
      approved: true,
      // Owner-approved tested destination; not a claim of exact venue entrance.
      latitude: -8.1932272,
      longitude: -34.9293376,
      local: 'Vevets Recepções',
      endereco: 'Rua Arenópolis, 82 - Candeias',
      cidade: 'Jaboatão dos Guararapes',
      uf: 'PE',
      addressLine1: 'Vevets Recepções',
      addressLine2: 'Rua Arenópolis, 82, Candeias, Jaboatão dos Guararapes - PE, Brasil'
    }),
    'EVT-23112026-ERA-BEAUTY-EAC4B673': Object.freeze({
      revision: '2026-10-10-sebrae-map-1',
      approved: true,
      // Google Maps establishment pin corroborated by Sebrae's own venue listing.
      // Not a claim about a specific door. Keep the exact current event signature.
      latitude: -8.0651289,
      longitude: -34.9050337,
      local: 'SEBRAE PE',
      endereco: 'Rua Tabajaras, 360 - Ilha do Retiro',
      cidade: 'Recife',
      uf: 'PE',
      addressLine1: 'Sebrae - Recife',
      addressLine2: 'Rua Tabaiares, 360 - Ilha do Retiro, Recife - PE, 50750-230, Brasil'
    })
  });
}());
