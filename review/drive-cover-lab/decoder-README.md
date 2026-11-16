# Decoder offline, ainda não integrado

`decoder.py` usa Pillow 13.0.0 já instalado no ambiente local. Dependência explicitada em `decoder-requirements.txt`. Não é serviço Apps Script, endpoint, uploader nem prova de entrega pública.

- Aceita exclusivamente PNG/JPEG, até 2.065.000 bytes, 8 milhões de pixels e 8192 por lado.
- Confere container PNG/CRC/IEND e JPEG/markers/EOI exato; rejeita trailers, truncamento e APNG/animação.
- Verifica estrutura, reabre, carrega todos os pixels e converte para RGB; warnings viram rejeição.
- Retorna SHA256 dos bytes originais, tamanho e dimensões. Não modifica arquivo e não promete remoção de metadata/malware. `sanitized:false` é intencional.
- Entrada de produção deve usar `validate_isolated`: processo separado com limite de memória 256 MiB, CPU 3s, espera 5s. Requer POSIX/resource, falha fechado fora desse ambiente. Isso limita recursos, mas não é uma sandbox de segurança completa. Serviço final deve executar sem rede/credenciais e filesystem restrito.
- Não confiar em resultado JSON submetido pelo navegador. Worker deve receber os bytes pelo servidor e vincular resultado ao registro/fileId/hash esperado.

Testes locais:
```
cd review/drive-cover-lab
python -m unittest decoder_test -v
```

CLI isolada, leitura local sem alteração:
```
python decoder.py /caminho/arquivo.png image/png
```

CI proposta, ainda não adicionada ao workflow pelo autor destes arquivos:
```
python3 -m pip install --disable-pip-version-check -r review/drive-cover-lab/decoder-requirements.txt
(cd review/drive-cover-lab && python3 -m unittest decoder_test -v)
```
A instalação utiliza PyPI, registry oficial, e precisa constar expressamente no workflow; remover afirmação de CI sem rede se essa etapa for adicionada. A versão instalada localmente foi confirmada; disponibilidade do pacote no runner/registry não foi consultada neste subtrabalho sem rede. Alternativa: imagem CI já preparada e atestada com a dependência. Não presumir que ubuntu-latest contém Pillow.

11 testes passaram: PNG/JPEG, progressivo, truncamento, corrupção CRC, MIME, trailers/concatenação, pixel bomb, APNG, limite bytes e worker isolado. Ainda não exercitado em Railway ou Apps Script; nenhum serviço criado.
