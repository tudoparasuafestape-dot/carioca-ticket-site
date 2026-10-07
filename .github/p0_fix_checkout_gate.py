from pathlib import Path

path = Path('checkout/index.html')
text = path.read_text(encoding='utf-8')

old = """        if(
          state.feeBusy||
          state.feeReady!==true||
          (
            state.politicaComercialAtiva&&
            (
              !state.feeQuotedAt||
              (Date.now()-state.feeQuotedAt)>30000
            )
          )
        ){
"""
new = """        if(
          state.politicaComercialAtiva&&
          (
            state.feeBusy||
            state.feeReady!==true||
            !state.feeQuotedAt||
            (Date.now()-state.feeQuotedAt)>30000
          )
        ){
"""

if text.count(old) != 1:
    raise SystemExit(f'gate esperado uma vez; encontrado {text.count(old)}')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')

test_path = Path('tests/politica-comercial.contract.mjs')
test = test_path.read_text(encoding='utf-8')
needle = """  'Confirmando o total',
  'feeQuotedAt',
"""
replacement = """  'Confirmando o total',
  'state.politicaComercialAtiva&&',
  'feeQuotedAt',
"""
if test.count(needle) != 1:
    raise SystemExit(f'contrato esperado uma vez; encontrado {test.count(needle)}')
test = test.replace(needle, replacement, 1)
test_path.write_text(test, encoding='utf-8')

Path('.github/workflows/temp-p0-fix-checkout-gate.yml').unlink()
Path('.github/p0_fix_checkout_gate.py').unlink()
