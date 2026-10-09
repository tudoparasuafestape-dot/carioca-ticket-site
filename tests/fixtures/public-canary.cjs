'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const EVENT = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zs3sAAAAASUVORK5CYII=';
function catalog() {
  return { sucesso: true, evento: { id: EVENT, nome: 'Roda de Samba Estilo Carioca', data: '11/10/2026', horario: '15h',
    local: 'LOCAL SINTETICO', cidade: 'Recife', uf: 'PE' },
    visual: { capaUrl: '', posterUrl: '', midiaTipo: 'IMAGEM', descricaoCurta: 'Fixture isolada', categoria: 'Fixture', realizacao: 'Equipe de teste' },
    menorPreco: 'R$ 25,00',
    tipos: [{ id: 'TIPO-EBD1F87D', nome: 'Individual', capacidadePorVenda: 1, lotes: [
      { id: 'LOTE-E2D1C48C', nome: 'Lote de teste', preco: 'R$ 25,00', precoNumero: 25, quantidadeLimitada: false, disponiveis: 100 }
    ] }], identidadeCliente: { identificadorPrincipal: 'WHATSAPP', whatsappObrigatorio: true, emailObrigatorio: false } };
}
const capabilities = { sucesso: true, loginEmailSenha: { habilitado: true }, cadastro: { habilitado: true },
  recuperacaoSenha: { habilitado: true }, google: { habilitado: false }, autenticacao: { firebase: { habilitado: true } } };
const firebaseConfig = { apiKey: 'LOCAL-FIXTURE-NOT-A-KEY', projectId: 'local-fixture', authDomain: 'localhost' };
const zeroArgs = result => args => { assert.deepEqual(args, []); return structuredClone(result); };
function createFixtures() {
  const handlers = {
    'portalRpc:ctCentralAcessoObterCapacidadesPROD': zeroArgs(capabilities),
    'portalRpc:ctCentralAcessoObterFirebaseConfigPROD': zeroArgs({ sucesso: true, firebaseConfig }),
    'portalRpc:ctCentralAcessoBootstrapPROD': zeroArgs({ sucesso: true, capacidades: capabilities, firebaseConfig, cacheTtlSegundos: 600 }),
    'portalRpc:ctMarcaOficialObterDataUriPROD': args => { assert(['DESKTOP', 'MOBILE'].includes(args[0])); return PIXEL; },
    'publicRpc:ctEventosPublicosListarPROD': zeroArgs({ sucesso: true, eventos: [{ ...catalog().evento,
      visual: { capaUrl: '/assets/carioca-ticket-logo.png', descricaoCurta: 'Fixture local' },
      links: { evento: '/evento/?evento=' + EVENT, comprar: '/checkout/?evento=' + EVENT } }], total: 1 }),
    'publicRpc:ctEventoPublicoCarregarPROD': args => { assert.equal(args[0], EVENT); return catalog(); },
    'publicRpc:ctCheckoutPublicoCarregarEventoPROD': args => { assert.equal(args[0], EVENT); return catalog(); },
    'publicRpc:ctCuponsPublicoValidarSeguroPROD': args => {
      const p = args[0]; assert.equal(p.eventoId, EVENT); assert.equal(p.tipoId, 'TIPO-EBD1F87D'); assert.equal(p.loteId, 'LOTE-E2D1C48C');
      if (p.codigo === 'CTCANARIOINEXISTENTE') return { sucesso: true, valido: false, mensagem: 'Cupom não encontrado.' };
      assert.equal(p.codigo, '30ANOSSEMRAZAO');
      return { sucesso: true, valido: false, mensagem: 'Este cupom expirou.' };
    },
    'publicRpc:ctPoliticaComercialPreviewPublicoPROD': args => {
      const p = args[0]; assert.equal(p.eventoId, EVENT);
      return { sucesso: true, revisao: 'FIXTURE', resumoPublico: { subtotalIngressos: p.precoUnitario * p.quantidade,
        totalComprador: p.precoUnitario * p.quantidade, taxaComprador: 0, adicionaisComprador: 0, pagadorTaxa: 'PRODUTOR' } };
    },
    'publicRpc:ctParceiroOnboardingConfigPublicaPROD': zeroArgs({ sucesso: true,
      programa: { parceiroPercentual: 1, taxaServicoPercentual: 10, antecipacaoMaxPercentual: 80, antecipacaoTaxaMinPercentual: 3.5 },
      documentos: [], materiais: [ { titulo: 'Tabela Comercial para Produtores', url: '/parceiro/programa/', tipo: 'COMERCIAL' },
        { titulo: 'Regulamento do Programa', url: '/parceiro/regulamento/', tipo: 'DOCUMENTO' } ] }),
    'publicRpc:ctParceiroOnboardingConsultarAtivacaoPROD': args => {
      assert.equal(args[0], 'CT-E2E-TOKEN-DEFINITIVAMENTE-INVALIDO');
      return { sucesso: true, valida: false, codigo: 'ATIVACAO_INVALIDA_OU_UTILIZADA' };
    },
    'publicRpc:ctAnalyticsMasterRegistrarLotePublicoPROD': (args, state) => {
      assert.equal(args.length, 1); assert(Array.isArray(args[0]));
      for (const event of args[0]) {
        assert(['HOME', 'EVENTOS', 'EVENTO', 'CHECKOUT'].includes(event.pagina));
        assert(Object.keys(event).every(k => ['pagina', 'sessaoId', 'eventoId', 'origem', 'referrerHost', 'dispositivo'].includes(k)));
        assert.equal(typeof event.sessaoId, 'string');
        state.telemetry.push({ pagina: event.pagina, origem: event.origem, destination: 'local-capture' });
      }
      return { sucesso: true, registrados: 0, codigo: 'LOCAL_TEST_CAPTURE' };
    }
  };
  const resources = {
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap': { contentType: 'text/css',
      body: '/* Explicit local fixture: legal-document tests use the system font fallback. */' },
    'https://cariocaticket.com.br/assets/carioca-ticket-logo.png': { contentType: 'image/png', body: fs.readFileSync(path.resolve(__dirname, '../../assets/carioca-ticket-logo.png')) },
    'https://cariocaticket.com.br/assets/carioca-ticket-simbolo.png': { contentType: 'image/png', body: fs.readFileSync(path.resolve(__dirname, '../../assets/carioca-ticket-simbolo.png')) },
    'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js': { contentType: 'text/javascript',
      body: 'window.Html5Qrcode=class {start(){throw new Error("CAMERA_NOT_ALLOWED_IN_PUBLIC_FIXTURE")}stop(){return Promise.resolve()}}; window.Html5QrcodeSupportedFormats={QR_CODE:0};' },
    'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js': { contentType: 'text/javascript',
      body: 'export const initializeApp=c=>({config:c}); export const getApps=()=>[];' },
    'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js': { contentType: 'text/javascript', body: `
      export const browserSessionPersistence={}; export const getAuth=()=>({currentUser:null});
      export const setPersistence=async()=>{};
      const forbidden=()=>{throw new Error('AUTH_MUTATION_NOT_ALLOWED_IN_PUBLIC_FIXTURE')};
      export const signInWithEmailAndPassword=forbidden,createUserWithEmailAndPassword=forbidden,
      sendEmailVerification=forbidden,verifyBeforeUpdateEmail=forbidden,updateProfile=forbidden,
      getIdToken=forbidden,deleteUser=forbidden,signOut=forbidden,reload=forbidden;
    ` }
  };
  return { handlers, resources };
}
module.exports = { createFixtures, EVENT };
