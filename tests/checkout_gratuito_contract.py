from pathlib import Path

html = Path("checkout-v2/index.html").read_text(encoding="utf-8")

assert "function isOfficialFree()" in html
assert "if(raw===null||typeof raw==='undefined'||String(raw).trim()==='')return false" in html
assert "Number.isFinite(valor)&&Math.abs(valor)<0.0001" in html
assert "Emitir ingresso gratuito" in html
assert "Nenhuma cobrança será criada" in html
assert "gratuito?'PIX':state.paymentMethod" in html
assert "cupomCodigo:gratuito?''" in html
assert "CT_CHECKOUT_DESCONTO_NAO_PODE_ZERAR_INGRESSO_PAGO" in html
assert "CT_CHECKOUT_GRATUITO_SOMENTE_PRECO_OFICIAL_ZERO" in html
assert "Nenhuma cobrança foi criada" in html

assert "Number(state.lot.precoNumero||0)===0" not in html, "Preço ausente não pode ser presumido como gratuito"
