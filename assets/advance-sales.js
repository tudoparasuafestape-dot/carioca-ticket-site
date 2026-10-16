(function () {
  'use strict';
  // Presentation only. The checkout backend enforces creation under its lock.
  var eventId = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
  window.CTAdvanceSales = Object.freeze({
    closed: function (id) { return String(id || '').trim() === eventId; },
    message: 'Evento encerrado.'
  });
}());
