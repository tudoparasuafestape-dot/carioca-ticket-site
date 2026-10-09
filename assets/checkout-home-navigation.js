(function (root) {
  'use strict';
  // Presentation/navigation only. Never initiate, cancel, refresh or persist an order.
  root.CTCheckoutHome = {
    init: function (readState) {
      var link = document.getElementById('checkoutHome');
      var dialog = document.getElementById('checkoutLeaveDialog');
      var message = document.getElementById('checkoutLeaveMessage');
      var stay = document.getElementById('checkoutStay');
      var leave = document.getElementById('checkoutLeave');
      var changed = false, timer = null, navigating = false;
      if (!link || !dialog || !message || !stay || !leave) return false;
      function rememberChange(event) {
        if (event.target.closest('#salePanel, #buyerPanel, #payActionPanel')) changed = true;
      }
      document.addEventListener('input', rememberChange);
      document.addEventListener('change', rememberChange);
      function reason() {
        var state = readState();
        if (state.busy) return 'busy';
        if (state.recovering) return 'recovery';
        if (state.orderPending) return 'order';
        if (state.complete) return '';
        // Also catch browser autofill without saving or retaining personal values.
        var filled = Array.from(document.querySelectorAll('#buyerPanel input, #participants input, #couponCode'))
          .some(function (input) { return input.type === 'checkbox' ? input.checked : !!input.value.trim(); });
        return changed || filled ? 'form' : '';
      }
      function text(kind) {
        if (kind === 'busy') return 'Estamos aguardando a resposta da criação do pedido. Continue nesta tela por enquanto para não interromper a recuperação do pagamento. A saída será liberada após a resposta.';
        if (kind === 'recovery') return 'Estamos consultando um pedido anterior. Aguarde a resposta para conferir o andamento antes de sair ou iniciar outra compra.';
        if (kind === 'order') return 'Voltar à página inicial não cancela o pedido nem uma cobrança existente. A atualização do pagamento nesta tela será interrompida. A recuperação ao retornar depende dos dados disponíveis neste navegador. Se já pagou, confira o pagamento antes de tentar outra compra. Deseja sair?';
        return 'Os dados preenchidos e as escolhas que ainda não foram concluídas podem ser perdidos ao sair. Deseja voltar à página inicial?';
      }
      function stopTimer() { if (timer !== null) { clearInterval(timer); timer = null; } }
      function refresh() {
        var kind = reason();
        var value = text(kind);
        if (message.textContent !== value) message.textContent = value;
        leave.disabled = kind === 'busy' || kind === 'recovery';
      }
      function goHome() {
        if (navigating) return;
        navigating = true;
        stopTimer();
        if (dialog.open) dialog.close();
        // Honor the existing top-level navigation used by both checkout versions.
        root.top.location.href = link.href;
      }
      function dismiss() { dialog.close(); }
      dialog.addEventListener('close', function () { stopTimer(); if (!navigating) link.focus(); });
      dialog.addEventListener('keydown', function (event) {
        if (event.key !== 'Tab') return;
        var last = leave.disabled ? stay : leave;
        if (event.shiftKey && document.activeElement === stay) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); stay.focus();
        }
      });
      stay.addEventListener('click', dismiss);
      leave.addEventListener('click', function () {
        // Recheck at the decision point: payment may have started/finished meanwhile.
        var current = reason();
        if (current === 'busy' || current === 'recovery') { refresh(); stay.focus(); return; }
        goHome();
      });
      link.addEventListener('click', function (event) {
        // Opening another tab leaves this checkout and its timers intact.
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (navigating || dialog.open) return;
        var kind = reason();
        if (!kind) { goHome(); return; }
        if (typeof dialog.showModal !== 'function') {
          if (kind === 'busy' || kind === 'recovery') { root.alert(text(kind)); return; }
          if (root.confirm(text(kind))) {
            var current = reason();
            if (current !== 'busy' && current !== 'recovery') goHome();
          }
          return;
        }
        refresh();
        dialog.showModal();
        stay.focus();
        timer = setInterval(refresh, 250);
      });
      root.addEventListener('pagehide', stopTimer);
      root.addEventListener('pageshow', function () {
        navigating = false;
        stopTimer();
        if (dialog.open) dialog.close();
      });
      return true;
    }
  };
}(window));
