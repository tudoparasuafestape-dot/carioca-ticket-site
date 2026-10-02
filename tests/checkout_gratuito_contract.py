from pathlib import Path

html = Path("checkout-v2/index.html").read_text(encoding="utf-8")

assert "function isOfficialFree()" in html
assert "Number(state.lot.precoNumero||0)===0" in html
assert "Emitir ingresso gratuito" in html
assert "Nenhuma cobrança será criada" in html
assert "gratuito?'PIX':state.paymentMethod" in html
assert "cupomCodigo:gratuito?''" in html
assert "CT_CHECKOUT_DESCONTO_NAO_PODE_ZERAR_INGRESSO_PAGO" in html
assert "CT_CHECKOUT_GRATUITO_SOMENTE_PRECO_OFICIAL_ZERO" in html
assert "Nenhuma cobrança foi criada" in html
