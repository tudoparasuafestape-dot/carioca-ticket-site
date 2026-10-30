/* Reviewed public destinations only. Never geocode or reuse a pin across events. */
(function () {
  'use strict';
  window.CTEventRideDestinations = Object.freeze({
    'EVT-07112026-TBT-DO-ASTRO-ANIVERSARIO-DE-HERMINHO-F103E26A': Object.freeze({
      revision: '2026-10-30-google-public-poi-venue-1',
      approved: true,
      // Public Google Maps place coordinates observed 2026-10-30; venue pin,
      // NOT a verified entrance. No Geocoding API call or independent-pin claim.
      source: 'google-maps-public-place',
      sourceUrl: 'https://www.google.com/maps/place/Clube+10+de+Novembro/@-8.0804985,-34.9683533,17z/data=!3m1!4b1!4m6!3m5!1s0x7ab1c13f4f2c015:0x47c7892ad4272ea9!8m2!3d-8.0804985!4d-34.9683533!16s%2Fg%2F11g7zg4853',
      addressEvidenceUrl: 'https://dome.recife.pe.gov.br/upload_dome/DO__028_22_02_2025-assinado.pdf',
      precision: 'venue-not-entrance',
      latitude: -8.0804985,
      longitude: -34.9683533,
      local: 'Clube 10 de Novembro.',
      endereco: 'Rua Mestre Antônio Valeriano, 65–205, bairro do Totó, Recife - PE, CEP: 50940-700',
      cidade: 'Recife',
      uf: 'PE',
      addressLine1: 'Clube 10 de Novembro',
      addressLine2: 'Rua Mestre Antônio Valeriano, 65–205, Totó, Recife - PE, 50940-700, Brasil'
    }),
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
