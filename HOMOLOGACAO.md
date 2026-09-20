# Homologação automática — Carioca Ticket

Esta suíte protege a experiência já homologada antes de novas alterações.

## O que é validado automaticamente

### Contratos de regressão
- presença das superfícies públicas protegidas;
- identidade Carioca Ticket;
- ausência de navegação visível para `script.google.com`, `googleusercontent.com` ou `github.io`;
- ausência de rotas públicas legadas `?page=...` em links/formulários;
- ausência de escapes literais `\n` em formulários;
- existência das rotas oficiais `/evento/` e `/checkout/`.

### E2E no site oficial
Executado em Chromium nos perfis desktop e mobile:
- Home → Evento → Checkout → Voltar ao evento;
- validação do campo de e-mail no checkout;
- Minha Carioca → voltar aos eventos;
- entradas públicas de Central Mobile, Portal do Produtor, Check-in e Consulta sem sessão;
- barra do navegador permanece em `cariocaticket.com.br`;
- respostas HTTP 5xx são tratadas como falha;
- erros JavaScript não tratados são tratados como falha na jornada pública;
- evidências (screenshot, trace e vídeo) ficam disponíveis quando um teste falha.

## Regra de publicação

1. Alterar primeiro em branch.
2. Rodar contratos e E2E.
3. Corrigir qualquer regressão.
4. Só depois integrar ao `main`.
5. Funcionalidades com efeito real (pagamento, envio, consumo de ingresso) exigem ambiente/fixture de teste antes de serem automatizadas com mutação.

## Execução

```bash
npm install
npx playwright install chromium
npm run homologar
```

A URL padrão é `https://cariocaticket.com.br`. Para outro ambiente:

```bash
CT_BASE_URL=https://exemplo.com npm run test:e2e
```
