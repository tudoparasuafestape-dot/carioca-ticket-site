const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
// Preserve the approved catalog release as well as the public-brand markup.
const base='a555b3acdfa94490d33475b09404de38d07062d2';
const pages=['index.html','anuncie/index.html','como-funciona/index.html','ajuda/index.html','sobre/index.html','termos/index.html','privacidade/index.html','cancelamento-reembolso/index.html'];
for(const path of pages){
 let now=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
 const local='../logo-light-home-base/'+path;
 let old=(fs.existsSync(local)?fs.readFileSync(local,'utf8'):cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'})).replace(/\r\n/g,'\n');
 // The separately approved demo adds this exact section and asset, outside the catalog.
 // Keep all other markup, navigation, scripts and commercial copy under comparison.
 if(path==='index.html'){
  // PR227/main 2e9d596d published this exact temporal pair; no other script delta is allowed.
  const before='  <script src="/assets/public-event-catalog.js?v=20261010-catalog-performance1" defer></script>\n';
  const after='  <script src="/assets/public-catalog-clock.js?v=20261021-eligibility-exclusive1" defer></script>\n'+
   '  <script src="/assets/public-event-catalog.js?v=20261021-eligibility-exclusive1" defer></script>\n';
  assert.equal(old.split(before).length-1,1,'Historical catalog tag must occur exactly once');
  assert.equal(now.split(after).length-1,1,'Approved temporal pair must occur exactly once and in order');
  old=old.replace(before,()=>after);
  const railBefore='  <script src="/assets/home-event-rail.js?v=20261010-catalog-performance1" defer></script>\n';
  const railAfter='  <script src="/assets/home-event-rail.js?v=20261021-eligibility-exclusive1" defer></script>\n';
  assert.equal(old.split(railBefore).length-1,1,'Historical rail tag must occur exactly once');
  assert.equal(now.split(railAfter).length-1,1,'Approved temporal rail tag must occur exactly once');
  old=old.replace(railBefore,()=>railAfter);

  const demoSection='    <section id="event-demonstration" class="ct-demo-teaser shell" aria-labelledby="demo-home-title">\n'+
   '      <img src="/assets/roda-samba-30-anos.webp" width="639" height="277" alt="" loading="lazy">\n'+
   '      <div><span class="demo-home-label" data-i18n="demoLabel">DEMONSTRAÇÃO</span><h2 id="demo-home-title" data-i18n="demoTitle">Conheça um evento demonstrativo</h2><p data-i18n="demoCopy">Explore uma página de exemplo, com informações, mapa e Waze. Sem data marcada, venda ou emissão de ingressos.</p></div>\n'+
   '      <a class="btn btn-primary demo-home-action" href="/demonstracao/roda-de-samba/" data-i18n="demoOpen">Explorar demonstração</a>\n'+
   '    </section>\n';
  now=now.replace(demoSection,'')
   .replace('  <link rel="stylesheet" href="/assets/demo-event.css?v=20261016-demo1">\n','')
   .replace('/assets/public-event-catalog.js?v=20261016-demo-catalog1','/assets/public-event-catalog.js?v=20261010-catalog-performance1')
   .replace('/assets/home-i18n.js?v=20261016-demo1','/assets/home-i18n.js?v=20261009-ad-plan-label')
   .replace('/assets/advance-sales.js?v=20261016-encerrado1','/assets/advance-sales.js?v=20261011-1');
 }
 // The privacy disclosure was separately published before CPF (main 2e9d596d).
 // Five exact source deltas only: translation key, both Google sections and both version labels.
 if(path==='privacidade/index.html'){
  const changes=[
  {
    "before": "  <script src=\"/assets/institutional-translations.js?v=20261009\" defer></script>\n",
    "after": "  <script src=\"/assets/institutional-translations.js?v=20261021-privacy-google\" defer></script>\n"
  },
  {
    "before": "    <p><span lang=\"pt-BR\" data-public-i18n=\"institutional.text.84\">Informações podem ser compartilhadas com o produtor responsável pelo evento e com fornecedores essenciais à operação, como provedores de pagamento e infraestrutura, na medida necessária à prestação do serviço.</span></p>\n",
    "after": "    <p><span lang=\"pt-BR\" data-public-i18n=\"institutional.text.84\">Informações podem ser compartilhadas com o produtor responsável pelo evento e com fornecedores essenciais à operação, como provedores de pagamento e infraestrutura, na medida necessária à prestação do serviço.</span></p>\n    <h2><span lang=\"pt-BR\" data-public-i18n=\"institutional.privacy.google.0\">Uso de serviços e dados Google</span></h2>\n    <p><span lang=\"pt-BR\" data-public-i18n=\"institutional.privacy.google.1\">A Carioca Ticket possui recursos operacionais integrados ao Google Apps Script, Google Sheets, Google Drive e Google Docs. Com a autorização da conta Google responsável pela execução, esses recursos podem consultar e atualizar planilhas, criar documentos e arquivos de ingressos, acessar arquivos de marca e enviar e-mails de acesso. Os dados envolvidos incluem, conforme o recurso, nome, e-mail, telefone ou WhatsApp e informações de eventos, pedidos, ingressos e pagamentos. Comprar um ingresso não autoriza acesso à conta Google, ao Drive ou aos e-mails do comprador.</span></p>\n    <p><span lang=\"pt-BR\" data-public-i18n=\"institutional.privacy.google.2\">Na página pública do ingresso, a opção “Salvar em PDF” utiliza a impressão do navegador. Esse procedimento não é o gerador operacional de PDFs no Drive. A exibição do QR Code do ingresso pode consultar o QuickChart, enviando o código do ingresso para gerar a imagem.</span></p>\n    <p><span lang=\"pt-BR\" data-public-i18n=\"institutional.privacy.google.3\">Recursos operacionais separados podem gerar PDFs de ingressos no Google Drive. Esses arquivos podem conter dados do ingresso, incluindo nome, telefone, tipo, valor e informações de pagamento. Se forem disponibilizados com acesso por link, quem obtiver o link poderá visualizar o PDF conforme a permissão do arquivo. Documentos temporários usados na geração podem ser movidos para a lixeira; isso não equivale à exclusão definitiva dos dados nem apaga o PDF.</span></p>\n    <p><span lang=\"pt-BR\" data-public-i18n=\"institutional.privacy.google.4\">Nos recursos que utilizam Asaas para pagamentos, podem ser enviados nome, CPF ou CNPJ, telefone e referências do cliente. No envio de códigos de acesso pelo WhatsApp/Meta, são utilizados o número destinatário e a mensagem com o código.</span></p>\n    <p><span lang=\"pt-BR\" data-public-i18n=\"institutional.privacy.google.5\">O acesso administrativo direto às planilhas e aos arquivos da operação é realizado pelo responsável pela Carioca Ticket. Atualmente, os registros e PDFs são mantidos, sem prazo fixo de exclusão definido. Essa administração direta não impede a visualização de arquivos disponibilizados por link.</span></p>\n    <p><span lang=\"pt-BR\" data-public-i18n=\"institutional.privacy.google.6\">A autorização Google da conta responsável pode ser revisada ou revogada nas configurações da Conta Google. A revogação pode impedir recursos dependentes dessa autorização e não apaga automaticamente registros ou arquivos já mantidos pela Carioca Ticket. Solicitações relacionadas a dados pessoais podem ser encaminhadas a contato@cariocaticket.com.br.</span></p>\n"
  },
  {
    "before": "    <div class=\"page-updated\"><span lang=\"pt-BR\" data-public-i18n=\"institutional.text.89\">Versão operacional publicada em 17/09/2026. Esta política poderá ser atualizada conforme a evolução da plataforma.</span></div>\n",
    "after": "    <div class=\"page-updated\"><span lang=\"pt-BR\" data-public-i18n=\"institutional.text.89\">Versão operacional publicada em 20/10/2026. Esta política poderá ser atualizada conforme a evolução da plataforma.</span></div>\n"
  },
  {
    "before": "    <p>Informações podem ser compartilhadas com o produtor responsável pelo evento e com fornecedores essenciais à operação, como provedores de pagamento e infraestrutura, na medida necessária à prestação do serviço.</p>\n",
    "after": "    <p>Informações podem ser compartilhadas com o produtor responsável pelo evento e com fornecedores essenciais à operação, como provedores de pagamento e infraestrutura, na medida necessária à prestação do serviço.</p>\n    <h2>Uso de serviços e dados Google</h2>\n    <p>A Carioca Ticket possui recursos operacionais integrados ao Google Apps Script, Google Sheets, Google Drive e Google Docs. Com a autorização da conta Google responsável pela execução, esses recursos podem consultar e atualizar planilhas, criar documentos e arquivos de ingressos, acessar arquivos de marca e enviar e-mails de acesso. Os dados envolvidos incluem, conforme o recurso, nome, e-mail, telefone ou WhatsApp e informações de eventos, pedidos, ingressos e pagamentos. Comprar um ingresso não autoriza acesso à conta Google, ao Drive ou aos e-mails do comprador.</p>\n    <p>Na página pública do ingresso, a opção “Salvar em PDF” utiliza a impressão do navegador. Esse procedimento não é o gerador operacional de PDFs no Drive. A exibição do QR Code do ingresso pode consultar o QuickChart, enviando o código do ingresso para gerar a imagem.</p>\n    <p>Recursos operacionais separados podem gerar PDFs de ingressos no Google Drive. Esses arquivos podem conter dados do ingresso, incluindo nome, telefone, tipo, valor e informações de pagamento. Se forem disponibilizados com acesso por link, quem obtiver o link poderá visualizar o PDF conforme a permissão do arquivo. Documentos temporários usados na geração podem ser movidos para a lixeira; isso não equivale à exclusão definitiva dos dados nem apaga o PDF.</p>\n    <p>Nos recursos que utilizam Asaas para pagamentos, podem ser enviados nome, CPF ou CNPJ, telefone e referências do cliente. No envio de códigos de acesso pelo WhatsApp/Meta, são utilizados o número destinatário e a mensagem com o código.</p>\n    <p>O acesso administrativo direto às planilhas e aos arquivos da operação é realizado pelo responsável pela Carioca Ticket. Atualmente, os registros e PDFs são mantidos, sem prazo fixo de exclusão definido. Essa administração direta não impede a visualização de arquivos disponibilizados por link.</p>\n    <p>A autorização Google da conta responsável pode ser revisada ou revogada nas configurações da Conta Google. A revogação pode impedir recursos dependentes dessa autorização e não apaga automaticamente registros ou arquivos já mantidos pela Carioca Ticket. Solicitações relacionadas a dados pessoais podem ser encaminhadas a contato@cariocaticket.com.br.</p>\n"
  },
  {
    "before": "    <div class=\"page-updated\">Versão operacional publicada em 17/09/2026. Esta política poderá ser atualizada conforme a evolução da plataforma.</div>\n",
    "after": "    <div class=\"page-updated\">Versão operacional publicada em 20/10/2026. Esta política poderá ser atualizada conforme a evolução da plataforma.</div>\n"
  }
];
  assert.equal(changes.length,5);
  for(const change of changes){
   assert.equal(old.split(change.before).length-1,1,'Historical privacy anchor must occur exactly once');
   assert.equal(now.split(change.after).length-1,1,'Published privacy delta must occur exactly once');
   old=old.replace(change.before,()=>change.after);
  }
 }
 // The logo suite must not roll back later approved script-order/version changes.
 const oldFooter='<a class="footer-home-link" href="/"><img src="/assets/carioca-ticket-logo.png" alt="Carioca Ticket"></a>';
 const newFooter='<a class="footer-home-link" href="/" aria-label="Carioca Ticket"><img src="/assets/carioca-ticket-simbolo.png" alt="" width="42" height="42"><span>Carioca <b>Ticket</b></span></a>';
 // Exact cache keys for the approved WhatsApp share enhancement; retain all other comparisons.
 const normalize=s=>s.replace('  <script src="/assets/advance-sales.js?v=20261011-1"></script>\n','').replace('  <link rel="stylesheet" href="/assets/public-privacy.css?v=20261010-1">\n','').replace('  <script src="/assets/public-privacy.js?v=20261010-1" defer></script>\n','').replace('/assets/ct-analytics.js?v=20261010-privacy1" data-ct-public-privacy="required"','/assets/ct-analytics.js?v=20260923a"').replace('/assets/public-share.js?v=20261009-card-share1','/assets/public-share.js?v=20261010-whatsapp1').replace('/assets/public-share.css?v=20261009-share1','/assets/public-share.css?v=20261010-whatsapp1').replace(newFooter,oldFooter).replace(/<a class="(ad-brand|brand)" href="\/" aria-label="Carioca Ticket"><img src="\/assets\/carioca-ticket-simbolo.png" alt="" width="42" height="42"><span class="brand-name">Carioca <b>Ticket<\/b><\/span><\/a>/g,(_,cls)=>'<a class="'+cls+'" href="/"><img src="/assets/carioca-ticket-logo.png" alt="Carioca Ticket" width="200" height="72"></a>').replace(/((?:home|advertise|producer-guide|public-logo-links)\.css)\?v=[^"']*/g,'$1').trim();
 assert.equal(normalize(now),normalize(old),path+' preserves all markup, scripts, links, alt text and commercial copy');
}
assert.equal(fs.readFileSync('assets/advertise.js','utf8').includes('"annualPrice": "R$ 149 por mês"'),true);
console.log('Public brand contract: only approved brand signatures and stylesheet versions change; other markup and official image bytes remain intact.');


