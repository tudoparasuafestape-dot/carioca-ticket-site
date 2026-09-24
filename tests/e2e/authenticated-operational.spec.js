const { test, expect } = require('@playwright/test');

const BRANCH_MODE = process.env.CT_BRANCH_MODE === '1';
const EVENT_ID = 'EVT-11102026-RODA-DE-SAMBA-ESTILO-CARIOCA-9397A2FD';
const STORAGE = 'CT_PORTAL_PRODUTOR_PROD_SESSION_V1';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zs3sAAAAASUVORK5CYII=';

function portalSession() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    usuario: {
      id: 'USR-E2E',
      nome: 'Operador Homologacao',
      email: 'homologacao@example.invalid'
    },
    produtores: [
      {
        id: 'PROD-E2E',
        nomeFantasia: 'Produtor Homologacao',
        perfil: 'ADMIN',
        eventos: [
          {
            id: EVENT_ID,
            nome: 'Roda de Samba Estilo Carioca',
            data: '11/10/2026',
            horario: '15h às 22h',
            local: 'Vevets Recepções',
            cidade: 'Jaboatão dos Guararapes',
            uf: 'PE',
            status: 'ATIVO',
            capacidade: 400
          }
        ]
      }
    ]
  };
}

function centralContext(token) {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    token,
    usuario: {
      id: 'USR-E2E',
      nome: 'Operador Homologacao'
    },
    eventos: [
      {
        id: EVENT_ID,
        nome: 'Roda de Samba Estilo Carioca',
        data: '11/10/2026',
        horario: '15h às 22h',
        local: 'Vevets Recepções',
        cidade: 'Jaboatão dos Guararapes',
        uf: 'PE',
        produtorId: 'PROD-E2E',
        perfil: 'ADMIN',
        modulosPermitidos: [
          'CHECKIN',
          'CONSULTA_INGRESSOS',
          'PORTAL_PRODUTOR',
          'USUARIOS',
          'VENDAS',
          'BAR',
          'EVENTOS',
          'FORNECEDORES',
          'CRM',
          'FINANCEIRO',
          'RELATORIOS',
          'COMISSOES'
        ]
      }
    ],
    modulosPermitidosGerais: [
      'CHECKIN',
      'CONSULTA_INGRESSOS',
      'PORTAL_PRODUTOR',
      'USUARIOS',
      'VENDAS',
      'BAR',
      'EVENTOS',
      'FORNECEDORES',
      'CRM',
      'FINANCEIRO',
      'RELATORIOS',
      'COMISSOES'
    ]
  };
}

function acessosFixture() {
  return {
    sucesso: true,
    produtores: [
      {
        id: 'PROD-E2E',
        nomeFantasia: 'Produtor Homologacao',
        perfil: 'ADMINISTRADOR',
        perfisEditaveis: ['ADMINISTRADOR','FINANCEIRO','COMISSIONADO','CHECKIN_PORTARIA','BAR'],
        usuarios: [
          {
            usuarioId: 'USR-E2E',
            nome: 'Operador Homologacao',
            email: 'homologacao@example.invalid',
            whatsapp: '',
            perfil: 'PRODUTOR_TITULAR',
            statusVinculo: 'ATIVO',
            editavel: false
          }
        ]
      }
    ]
  };
}

function painelFixture() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    painel: {
      evento: {
        nome: 'Roda de Samba Estilo Carioca',
        data: '11/10/2026',
        horario: '15h às 22h',
        local: 'Vevets Recepções',
        cidade: 'Jaboatão dos Guararapes',
        uf: 'PE'
      },
      resumo: {
        receita: 'R$ 0,00',
        ingressosValidos: 0,
        presentes: 0,
        vagasRestantes: 400,
        ingressosPagos: 0,
        cortesias: 0,
        ticketMedio: 'R$ 0,00',
        capacidade: 400,
        percentualOcupacao: 0,
        pendentes: 0,
        cancelados: 0,
        totalIngressos: 0,
        percentualCheckin: 0
      },
      checkinsRecentes: [],
      atualizadoEm: '20/09/2026 08:00:00'
    }
  };
}

function vendasFixture() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    eventoIdSolicitado: EVENT_ID,
    eventoIdUtilizado: EVENT_ID,
    origemEvento: 'URL',
    evento: {
      id: EVENT_ID,
      nome: 'Roda de Samba Estilo Carioca',
      data: '11/10/2026',
      horario: '15h às 22h',
      local: 'Vevets Recepções',
      cidade: 'Jaboatão dos Guararapes',
      uf: 'PE',
      capacidade: 400,
      status: 'ATIVO'
    },
    tipos: [
      {
        id: 'TIPO-IND',
        nome: 'Individual',
        descricao: 'Ingresso individual',
        preco: 'R$ 25,00',
        precoNumero: 25,
        capacidadePorVenda: 1
      }
    ],
    lotes: [
      {
        id: 'LOTE-1',
        tipoId: 'TIPO-IND',
        nome: 'Pré-venda',
        preco: 'R$ 25,00',
        precoNumero: 25
      }
    ],
    formasPagamento: ['PIX', 'DINHEIRO'],
    resumoHoje: {
      quantidade: 0,
      faturamento: 'R$ 0,00',
      pagos: 0,
      cortesias: 0
    },
    resumoEvento: {
      vendas: 0,
      acessos: 0,
      faturamento: 'R$ 0,00',
      cortesias: 0
    },
    atualizadoEm: '20/09/2026 08:00:00'
  };
}


function consultaFixture() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    mensagem: '1 ingresso encontrado.',
    total: 1,
    filtroEvento: {
      eventoId: EVENT_ID,
      eventoNome: 'Roda de Samba Estilo Carioca',
      pesquisarTodos: false
    },
    filtroStatus: {
      status: '',
      statusClasse: '',
      statusNome: ''
    },
    atualizadoEm: '20/09/2026 09:10:00',
    ingressos: [
      {
        id: '1',
        nome: 'Cliente Homologacao',
        telefone: '(81) 99999-0001',
        tipo: 'Individual',
        codigo: 'CT-E2E-CONSULTA',
        status: 'VALIDO',
        statusClasse: 'VALIDO',
        dataCompra: '20/09/2026 09:00:00',
        dataCheckin: '',
        valorPago: 'R$ 25,00',
        vendaId: 'VENDA-E2E-CONSULTA',
        ingressoCompartilhamentoUrl: '/ingresso/?codigo=CT-E2E-CONSULTA&sig=TESTE',
        ingressoUrl: '/ingresso/?codigo=CT-E2E-CONSULTA&sig=TESTE',
        whatsappUrl: 'https://wa.me/5581999990001',
        pdfUrl: ''
      }
    ]
  };
}


function barFixture() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    versao: '1.6.0',
    evento: {
      id: EVENT_ID,
      nome: 'Roda de Samba Estilo Carioca',
      data: '11/10/2026',
      horario: '15h às 22h',
      local: 'Vevets Recepções'
    },
    produtos: [
      {
        produtoId: 'PRD-E2E',
        eventoId: EVENT_ID,
        categoria: 'BEBIDA',
        produto: 'Produto Homologacao',
        unidade: 'UN',
        custoUnitario: 5,
        precoVenda: 10,
        estoqueMinimo: 5,
        status: 'ATIVO',
        observacao: ''
      }
    ],
    resumo: {
      sucesso: true,
      evento: {
        id: EVENT_ID,
        nome: 'Roda de Samba Estilo Carioca',
        data: '11/10/2026',
        horario: '15h às 22h',
        local: 'Vevets Recepções'
      },
      itens: [
        {
          produtoId: 'PRD-E2E',
          produto: 'Produto Homologacao',
          categoria: 'BEBIDA',
          estoqueInicial: 20,
          reposicoes: 0,
          estoqueFinalContado: 15,
          quantidadeVendida: 5,
          faturamento: 50,
          estoqueCritico: false
        }
      ],
      totais: {
        produtos: 1,
        quantidadeVendida: 5,
        faturamento: 50,
        resultadoOperacional: 25
      },
      fechamento: {
        pronto: true,
        produtosPendentes: 0,
        operacaoFechada: false
      }
    },
    movimentacoes: [
      {
        movimentoId: 'MOV-E2E',
        produtoId: 'PRD-E2E',
        produto: 'Produto Homologacao',
        tipo: 'ESTOQUE_INICIAL',
        quantidade: 20,
        responsavel: 'Operador Homologacao',
        observacao: '',
        status: 'ATIVO',
        criadoEm: '20/09/2026 08:00:00'
      }
    ]
  };
}


function eventosFixture() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    eventos: [
      {
        id: EVENT_ID,
        nome: 'Roda de Samba Estilo Carioca',
        data: '11/10/2026',
        horario: '15h às 22h',
        local: 'Vevets Recepções',
        cidade: 'Jaboatão dos Guararapes',
        uf: 'PE',
        status: 'ATIVO',
        ativo: true,
        publicacao: {
          publicado: true,
          prontoPublicar: true,
          checkoutUrl: '/checkout/?evento=' + EVENT_ID
        }
      }
    ],
    total: 1,
    eventoAtivo: {
      id: EVENT_ID,
      nome: 'Roda de Samba Estilo Carioca',
      data: '11/10/2026',
      horario: '15h às 22h',
      local: 'Vevets Recepções',
      cidade: 'Jaboatão dos Guararapes',
      uf: 'PE'
    },
    publicados: 1
  };
}


function fornecedoresContextFixture() {
  return {
    sucesso: true,
    produtores: [
      {
        id: 'PROD-E2E',
        nomeFantasia: 'Produtor Homologacao',
        perfil: 'ADMINISTRADOR',
        eventos: [
          {
            id: EVENT_ID,
            nome: 'Roda de Samba Estilo Carioca',
            data: '11/10/2026',
            status: 'ATIVO'
          }
        ]
      }
    ],
    statusPagamento: ['PENDENTE', 'PARCIAL', 'PAGO', 'CANCELADO'],
    versaoModulo: '1.0.0'
  };
}

function fornecedoresListFixture() {
  return {
    sucesso: true,
    produtorId: 'PROD-E2E',
    eventoId: EVENT_ID,
    total: 1,
    statusPagamento: ['PENDENTE', 'PARCIAL', 'PAGO', 'CANCELADO'],
    vinculos: [
      {
        vinculoId: 'FVE-E2E',
        fornecedorId: 'FOR-E2E',
        produtorId: 'PROD-E2E',
        eventoId: EVENT_ID,
        servico: 'Seguranca',
        valorContratado: 450,
        statusPagamento: 'PENDENTE',
        status: 'ATIVO',
        fornecedor: {
          fornecedorId: 'FOR-E2E',
          nomeRazao: 'Fornecedor Homologacao',
          nomeFantasia: 'Fornecedor Homologacao',
          categoria: 'Seguranca',
          responsavel: 'Responsavel Homologacao',
          email: 'fornecedor@example.invalid',
          whatsapp: '81999990000',
          status: 'ATIVO'
        },
        evento: {
          id: EVENT_ID,
          nome: 'Roda de Samba Estilo Carioca',
          data: '11/10/2026',
          status: 'ATIVO'
        }
      }
    ]
  };
}


function crmContextFixture() {
  return {
    sucesso: true,
    produtores: [
      {
        id: 'PROD-E2E',
        nomeFantasia: 'Produtor Homologacao',
        perfil: 'ADMINISTRADOR',
        eventos: [
          {
            id: EVENT_ID,
            nome: 'Roda de Samba Estilo Carioca',
            data: '11/10/2026',
            status: 'ATIVO'
          }
        ]
      }
    ],
    higieneNomes: null,
    versaoModulo: '1.0.0'
  };
}

function crmSearchFixture() {
  return {
    sucesso: true,
    produtorId: 'PROD-E2E',
    eventoId: EVENT_ID,
    termo: '',
    total: 1,
    clientes: [
      {
        clienteId: 'CLI-E2E',
        nome: 'Cliente Homologacao',
        whatsapp: '81999990001',
        email: 'cliente@example.invalid',
        cidade: 'Jaboatao dos Guararapes',
        uf: 'PE',
        status: 'ATIVO',
        totalEventos: 1,
        totalIngressos: 2,
        totalCompras: 1,
        totalAcompanhamentos: 1,
        valorTotalNumero: 50,
        valorTotal: 'R$ 50,00',
        totalRelacoes: 2,
        ultimaMovimentacao: '20/09/2026 09:00:00',
        relacoes: [
          {
            relacaoId: 'REL-E2E',
            eventoId: EVENT_ID,
            eventoNome: 'Roda de Samba Estilo Carioca',
            vendaId: 'VENDA-E2E',
            ingressoId: 'ING-E2E',
            codigoIngresso: 'CT-E2E',
            papel: 'COMPRADOR',
            valorAtribuido: 'R$ 50,00',
            status: 'ATIVA'
          }
        ]
      }
    ],
    versaoModulo: '1.0.0'
  };
}


function financeiroFixture() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    modulo: 'FINANCEIRO',
    evento: {
      id: EVENT_ID,
      nome: 'Roda de Samba Estilo Carioca',
      data: '11/10/2026',
      horario: '15h às 22h',
      local: 'Vevets Recepções',
      cidade: 'Jaboatão dos Guararapes',
      uf: 'PE',
      capacidade: 400
    },
    produtorId: 'PROD-E2E',
    resumo: {
      totalRegistros: 5,
      vendasConfirmadas: 3,
      acessosConfirmados: 4,
      vendasPendentes: 1,
      vendasCanceladas: 1,
      vendasEstornadas: 0,
      receitaNumero: 90,
      receita: 'R$ 90,00',
      ticketMedioNumero: 30,
      ticketMedio: 'R$ 30,00',
      pagamentos: [
        { chave: 'PIX', quantidade: 2, valorNumero: 65, valor: 'R$ 65,00' },
        { chave: 'DINHEIRO', quantidade: 1, valorNumero: 25, valor: 'R$ 25,00' }
      ],
      tipos: [
        { chave: 'INDIVIDUAL', quantidade: 2, valorNumero: 50, valor: 'R$ 50,00' },
        { chave: 'CASADINHA', quantidade: 1, valorNumero: 40, valor: 'R$ 40,00' }
      ],
      origens: [
        { chave: 'CENTRAL DE VENDAS', quantidade: 3, valorNumero: 90, valor: 'R$ 90,00' }
      ],
      lotes: [],
      evolucao: [
        { data: '20/09/2026', timestamp: 1, vendas: 3, acessos: 4, receitaNumero: 90, receita: 'R$ 90,00' }
      ]
    },
    somenteLeitura: true,
    versaoModulo: '1.0.0',
    atualizadoEm: '20/09/2026 09:15:00'
  };
}

function financeiroProdutorFixture() {
  const f = financeiroFixture();
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    somenteLeitura: false,
    podeMovimentar: true,
    perfil: 'ADMINISTRADOR',
    evento: f.evento,
    resumo: {
      receitaConfirmadaNumero: 90,
      receitaConfirmada: 'R$ 90,00',
      recebidoEventoNumero: 65,
      recebidoEvento: 'R$ 65,00',
      aReceberEventoNumero: 25,
      aReceberEvento: 'R$ 25,00',
      saldoContaAsaasDisponivel: true,
      saldoContaAsaasNumero: 180,
      saldoContaAsaas: 'R$ 180,00',
      saldoContaEscopo: 'CONTA_ASAAS_PRODUTOR',
      saquesReservadosNumero: 0,
      saquesReservados: 'R$ 0,00',
      taxasCtPendentesNumero: 0,
      taxasCtPendentes: 'R$ 0,00'
    },
    politica: {
      taxaAntecipacaoCtPercentual: 2.5,
      taxaAntecipacaoModo: 'LEDGER_CT',
      saqueModo: 'SOLICITACAO_INTERNA',
      saqueMovimentaDinheiroAutomaticamente: false,
      saldoContaIncluiTodosEventos: true
    },
    antecipacoesElegiveis: [],
    historico: [],
    diagnostico: { saldoErro: '' },
    atualizadoEm: '22/09/2026 00:30:00',
    versaoModulo: '1.0.0'
  };
}


function relatoriosFixture() {
  const f = financeiroFixture();
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    modulo: 'RELATORIOS',
    evento: f.evento,
    produtorId: f.produtorId,
    vendas: f.resumo,
    ingressos: {
      total: 4,
      ativos: 4,
      validos: 2,
      pendentes: 0,
      presentes: 2,
      cancelados: 0,
      taxaCheckin: 50
    },
    somenteLeitura: true,
    versaoModulo: '1.0.0',
    atualizadoEm: '20/09/2026 09:15:00'
  };
}


function comissoesFixture() {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    eventoId: EVENT_ID,
    evento: {
      id: EVENT_ID,
      nome: 'Roda de Samba Estilo Carioca',
      data: '11/10/2026',
      horario: '15h às 22h',
      local: 'Vevets Recepções',
      cidade: 'Jaboatão dos Guararapes',
      uf: 'PE'
    },
    produtorId: 'PROD-E2E',
    comissionados: [
      {
        usuarioId: 'USR-COM-E2E',
        nome: 'Comissionado Homologacao',
        email: 'comissionado@example.invalid',
        whatsapp: '81999990002',
        perfil: 'COMISSIONADO'
      }
    ],
    tipos: [
      { id: 'TIPO-IND', nome: 'Individual' }
    ],
    lotes: [
      { id: 'LOTE-1', nome: 'Pré-venda', tipoId: 'TIPO-IND' }
    ],
    regras: [
      {
        regraId: 'COMREG-E2E',
        usuarioComissionadoId: 'USR-COM-E2E',
        tipoRegra: 'PERCENTUAL',
        valorRegra: 5,
        tipoIngressoId: '',
        loteId: '',
        status: 'ATIVO',
        observacao: 'Regra homologacao',
        beneficiarioNome: 'Comissionado Homologacao',
        cpfCnpjInformado: true,
        pixTipo: 'CPF',
        pixConfigurado: true
      }
    ],
    resumo: {
      regras: 1,
      lancamentos: 2,
      totalAReceberNumero: 2.5,
      totalAReceber: 'R$ 2,50'
    },
    tiposRegra: [
      { id: 'PERCENTUAL', nome: 'Percentual sobre o valor da venda' },
      { id: 'FIXO_POR_VENDA', nome: 'Valor fixo por venda' },
      { id: 'FIXO_POR_ACESSO', nome: 'Valor fixo por acesso/ingresso' }
    ],
    pagamentoAutomatico: {
      habilitado: false,
      motivo: 'PAGAMENTO_AUTOMATICO_AINDA_NAO_HOMOLOGADO'
    },
    versaoModulo: '1.0.0'
  };
}

function centralContextComissionado(token) {
  return {
    sucesso: true,
    autenticado: true,
    autorizado: true,
    token,
    usuario: {
      id: 'USR-COM-E2E',
      nome: 'Comissionado Homologacao'
    },
    eventos: [
      {
        id: EVENT_ID,
        nome: 'Roda de Samba Estilo Carioca',
        data: '11/10/2026',
        horario: '15h às 22h',
        local: 'Vevets Recepções',
        cidade: 'Jaboatão dos Guararapes',
        uf: 'PE',
        produtorId: 'PROD-E2E',
        perfil: 'COMISSIONADO',
        modulosPermitidos: [
          'CONSULTA_INGRESSOS',
          'VENDAS_PROPRIAS',
          'COMISSOES_PROPRIAS'
        ]
      }
    ],
    modulosPermitidosGerais: [
      'CONSULTA_INGRESSOS',
      'VENDAS_PROPRIAS',
      'COMISSOES_PROPRIAS'
    ]
  };
}

function comissionadoFixture() {
  const base = vendasFixture();
  return {
    ...base,
    modulo: 'VENDAS_PROPRIAS',
    formasPagamento: ['PIX', 'DINHEIRO', 'CARTÃO', 'TRANSFERÊNCIA', 'OUTRO'],
    vendedor: {
      usuarioId: 'USR-COM-E2E',
      nome: 'Comissionado Homologacao',
      perfil: 'COMISSIONADO'
    },
    resumoHoje: {
      quantidade: 1,
      faturamento: 'R$ 25,00',
      pagos: 1,
      cortesias: 0
    },
    resumoEvento: {
      vendas: 2,
      quantidade: 2,
      acessos: 2,
      faturamento: 'R$ 50,00',
      cortesias: 0
    },
    minhasVendas: {
      totalRegistros: 2,
      vendasConfirmadas: 2,
      acessosConfirmados: 2,
      valorVendidoNumero: 50,
      valorVendido: 'R$ 50,00',
      canceladas: 0,
      estornadas: 0,
      recentes: [
        {
          id: 'VENDA-COM-E2E-1',
          compradorNome: 'Cliente Proprio Homologacao',
          compradorWhatsappMascarado: '•••• 0001',
          tipoNome: 'Individual',
          loteNome: 'Pré-venda',
          quantidadeVendas: 1,
          quantidadeAcessos: 1,
          valorTotalNumero: 25,
          valorTotal: 'R$ 25,00',
          formaPagamento: 'PIX',
          status: 'CONFIRMADA',
          criadoEm: '20/09/2026 09:30:00'
        }
      ]
    },
    comissao: {
      configurada: true,
      calculada: true,
      regraId: 'COMREG-E2E',
      tipo: 'PERCENTUAL',
      valorRegra: 5,
      tipoIngressoId: '',
      loteId: '',
      beneficiario: {
        nome: 'Comissionado Homologacao',
        pixTipo: 'CPF',
        pixConfigurado: true
      },
      mensagem: 'Regra de comissão ativa.',
      resumo: {
        lancamentos: 2,
        aReceberNumero: 2.5,
        aReceber: 'R$ 2,50',
        pagoNumero: 1,
        pago: 'R$ 1,00'
      }
    }
  };
}

async function installMock(page, state) {
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    const params = new URLSearchParams(request.postData() || '');
    const requestId = String(params.get('ctMinhaCariocaRequestId') || '');
    const action = String(params.get('ctMinhaCariocaAction') || '');
    const method = String(params.get('metodo') || '');

    let args = [];
    try {
      args = JSON.parse(params.get('argsJson') || '[]');
      if (!Array.isArray(args)) args = [];
    } catch (_) {
      args = [];
    }

    let resultado = null;
    let ok = true;
    let erro = '';

    try {
      if (action === 'portalRpc') {
        switch (method) {
          case 'ctCentralAcessoObterCapacidadesPROD':
            resultado = {
              sucesso: true,
              loginEmailSenha: { habilitado: true },
              cadastro: { habilitado: true },
              recuperacaoSenha: { habilitado: true },
              google: { habilitado: false }
            };
            break;

          case 'ctMarcaOficialObterDataUriPROD':
            resultado = ONE_PIXEL_PNG;
            break;

          case 'ctCentralAcessoObterFirebaseConfigPROD':
            resultado = { sucesso: false };
            break;

          case 'ctPortalProdutorRestaurarSessaoIsoladaPROD':
            expect(String(args[0] || '')).toBe(state.token);
            resultado = portalSession();
            break;

          case 'ctPortalProdutorCarregarCatalogoEventosPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[1] || '')).toBe('PROD-E2E');
            resultado = {
              sucesso: true,
              autenticado: true,
              autorizado: true,
              produtorId: 'PROD-E2E',
              eventos: portalSession().produtores[0].eventos
            };
            break;


          case 'ctPortalProdutorCarregarPainelIsoladoPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[2] || '')).toBe(EVENT_ID);
            resultado = painelFixture();
            break;

          case 'ctCentralOperacionalCriarHandoffPROD': {
            expect(String(args[0] || '')).toBe(state.token);
            const destino = String(args[1] || '');
            resultado = {
              sucesso: true,
              handoff: 'HANDOFF_' + destino + '_ABCDEFGHIJKLMNOPQRSTUVWXYZ',
              destino,
              expiraEm: '2099-01-01T00:00:00.000Z'
            };
            break;
          }

          case 'ctConsultaIngressosOperacionalPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[1] || '')).toBe(EVENT_ID);
            resultado = consultaFixture();
            break;

          case 'ctCheckinOperacionalCriarCredencialPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[1] || '')).toBe(EVENT_ID);
            resultado = {
              sucesso: true,
              autorizado: true,
              credencial: 'CHECKIN_E2E_CREDENCIAL_SEGURA_ABCDEFGHIJKLMNOPQRSTUVWXYZ',
              expiraEm: '2099-01-01T00:00:00.000Z'
            };
            break;

          case 'ctCentralVendasCarregarSeguraPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[1] || '')).toBe(EVENT_ID);
            resultado = vendasFixture();
            break;

          case 'ctCentralVendasConfirmarSeguraPROD':
            state.transactionCalls += 1;
            throw new Error('Teste nao deve confirmar venda.');

          case 'ctCariocaBarCarregarSeguraPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[1] || '')).toBe(EVENT_ID);
            resultado = barFixture();
            break;

          case 'ctCariocaBarSalvarProdutoSeguraPROD':
          case 'ctCariocaBarRegistrarMovimentacaoSeguraPROD':
          case 'ctCariocaBarRegistrarVendaDiretaSeguraPROD':
          case 'ctCariocaBarRegistrarCustoSeguraPROD':
          case 'ctCariocaBarFecharSeguraPROD':
          case 'ctCariocaBarReabrirSeguraPROD':
          case 'ctCariocaBarEstornarMovimentacaoSeguraPROD':
          case 'ctCariocaBarCorrigirMovimentacaoSeguraPROD':
            state.barMutationCalls += 1;
            throw new Error('Teste nao deve alterar o Carioca Bar.');

          case 'ctEventosOperacionalListarSeguraPROD': {
            expect(String(args[0] || '')).toBe(state.token);
            const base = eventosFixture();
            if (state.createdEvent) {
              base.eventos.push(state.createdEvent);
              base.total = base.eventos.length;
            }
            resultado = base;
            break;
          }

          case 'ctEventosOperacionalContextoCadastroSeguraPROD':
            expect(String(args[0] || '')).toBe(state.token);
            resultado = {
              sucesso: true,
              autenticado: true,
              autorizado: true,
              produtores: [
                {
                  produtorId: 'PROD-E2E',
                  nomeFantasia: 'Produtor Homologacao'
                }
              ],
              origensComerciais: [
                { id: 'PRODUTOR', nome: 'Produtor / relacionamento existente' }
              ],
              statusInicial: 'RASCUNHO',
              regras: {}
            };
            break;

          case 'ctEventosOperacionalCriarSeguraPROD': {
            state.eventMutationCalls += 1;
            if (state.allowEventCreate !== true) {
              throw new Error('Teste nao deve alterar Eventos.');
            }
            expect(String(args[0] || '')).toBe(state.token);
            const payload = args[1] || {};
            expect(String(payload.produtorId || '')).toBe('PROD-E2E');
            expect(String(payload.nome || '')).toBe('Evento Homologacao Rascunho');
            expect(String(payload.data || '')).toBe('2026-10-30');
            expect(String(payload.local || '')).toBe('Local Homologacao');
            expect(String(payload.origemComercial || '')).toBe('PRODUTOR');
            state.createdEvent = {
              id:'EVT-30102026-E2E',
              nome:'Evento Homologacao Rascunho',
              data:'30/10/2026',
              horario:'18:00 às 23:00',
              local:'Local Homologacao',
              cidade:'Jaboatão dos Guararapes',
              uf:'PE',
              status:'RASCUNHO',
              ativo:false,
              publicacao:{
                publicado:false,
                prontoPublicar:false,
                pendencias:['A autorização de risco/financeiro para publicação ainda está pendente.']
              }
            };
            resultado = {
              sucesso:true,
              jaExistia:false,
              mensagem:'Evento cadastrado como rascunho.',
              evento:state.createdEvent,
              governanca:{
                eventoId:state.createdEvent.id,
                produtorId:'PROD-E2E',
                riscoStatus:'PENDENTE_ANALISE',
                publicacaoAutorizada:false
              }
            };
            break;
          }

          case 'ctEventosOperacionalPublicarSeguraPROD':
          case 'ctEventosOperacionalFecharSeguraPROD':
          case 'ctEventosOperacionalAtualizarStatusSeguraPROD':
            state.eventPublicationCalls = (state.eventPublicationCalls || 0) + 1;
            throw new Error('Teste nao deve publicar ou alterar status de Eventos.');

          case 'ctFornecedoresGestaoCarregarPROD':
            expect(String(args[0] || '')).toBe(state.token);
            resultado = fornecedoresContextFixture();
            break;

          case 'ctFornecedoresGestaoListarPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[1] || '')).toBe('PROD-E2E');
            expect(String(args[2] || '')).toBe(EVENT_ID);
            resultado = fornecedoresListFixture();
            break;

          case 'ctFornecedoresGestaoCadastrarEVincularPROD':
          case 'ctFornecedoresGestaoAtualizarPagamentoPROD':
          case 'ctFornecedoresGestaoRemoverVinculoPROD':
            state.supplierMutationCalls += 1;
            throw new Error('Teste nao deve alterar Fornecedores.');

          case 'ctPublicoClientesCarregarPROD':
            expect(String(args[0] || '')).toBe(state.token);
            resultado = crmContextFixture();
            break;

          case 'ctPublicoClientesBuscarPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[1] || '')).toBe('PROD-E2E');
            expect(String(args[2] || '')).toBe(EVENT_ID);
            resultado = crmSearchFixture();
            break;

          case 'ctGestaoAcessosCarregarPROD':
            expect(String(args[0] || '')).toBe(state.token);
            resultado = acessosFixture();
            break;

          case 'ctFinanceiroEventoCarregarPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[1] || '')).toBe(EVENT_ID);
            resultado = financeiroFixture();
            break;

          case 'ctFinanceiroProdutorPainelPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[1] || '')).toBe(EVENT_ID);
            resultado = financeiroProdutorFixture();
            break;

          case 'ctFinanceiroProdutorSimularAntecipacaoPROD':
          case 'ctFinanceiroProdutorSolicitarAntecipacaoPROD':
          case 'ctFinanceiroProdutorSolicitarSaquePROD':
          case 'ctFinanceiroProdutorCancelarSaquePROD':
            throw new Error('Teste de navegacao nao deve movimentar o financeiro.');

          case 'ctRelatoriosEventoCarregarPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[1] || '')).toBe(EVENT_ID);
            resultado = relatoriosFixture();
            break;

          case 'ctComissoesEventoCarregarPROD':
            expect(String(args[0] || '')).toBe(state.token);
            expect(String(args[1] || '')).toBe(EVENT_ID);
            resultado = comissoesFixture();
            break;

          case 'ctComissoesEventoSalvarRegraPROD':
          case 'ctComissoesEventoDesativarRegraPROD':
            state.commissionMutationCalls += 1;
            throw new Error('Teste nao deve alterar regras de comissao.');

          case 'logoutUsuarioCT2':
            resultado = { sucesso: true };
            break;

          default:
            resultado = {
              sucesso: false,
              mensagem: 'Metodo nao previsto no E2E autenticado: ' + method
            };
        }
      } else if (action === 'centralConsumirHandoff') {
        resultado = {
          sucesso: true,
          autenticado: true,
          autorizado: true,
          token: state.token,
          expiraEm: '2099-01-01T00:00:00.000Z'
        };
      } else if (action === 'centralRestaurarSessao') {
        expect(String(params.get('token') || '')).toBe(state.token);
        resultado = centralContext(state.token);
      } else if (action === 'centralLogout') {
        resultado = { sucesso: true };
      } else {
        ok = false;
        erro = 'Acao nao prevista no E2E autenticado: ' + action;
      }
    } catch (e) {
      ok = false;
      erro = e && e.message ? e.message : String(e);
      resultado = null;
    }

    const payload = JSON.stringify({
      ctMinhaCariocaPost: true,
      id: requestId,
      ok,
      resultado,
      erro
    }).replace(/</g, '\\u003c');

    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        '<!doctype html><html><body>' +
        '<script>window.top.postMessage(' + payload + ', "*");<\/script>' +
        '</body></html>'
    });
  });
}


async function installComissionadoMock(page, state) {
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    const params = new URLSearchParams(request.postData() || '');
    const requestId = String(params.get('ctMinhaCariocaRequestId') || '');
    const action = String(params.get('ctMinhaCariocaAction') || '');
    const method = String(params.get('metodo') || '');

    let args = [];
    try {
      args = JSON.parse(params.get('argsJson') || '[]');
      if (!Array.isArray(args)) args = [];
    } catch (_) {
      args = [];
    }

    let resultado = null;
    let ok = true;
    let erro = '';

    try {
      if (action === 'portalRpc') {
        if (method === 'ctComissionadoCarregarPROD') {
          expect(String(args[0] || '')).toBe(state.token);
          expect(String(args[1] || '')).toBe(EVENT_ID);
          resultado = comissionadoFixture();
        } else if (method === 'ctComissionadoConfirmarVendaPROD') {
          state.transactionCalls += 1;
          throw new Error('Teste nao deve confirmar venda do comissionado.');
        } else if (method === 'logoutUsuarioCT2') {
          resultado = { sucesso: true };
        } else {
          resultado = {
            sucesso: false,
            mensagem: 'Metodo nao previsto no E2E comissionado: ' + method
          };
        }
      } else if (action === 'centralRestaurarSessao') {
        expect(String(params.get('token') || '')).toBe(state.token);
        resultado = centralContextComissionado(state.token);
      } else if (action === 'centralLogout') {
        resultado = { sucesso: true };
      } else {
        ok = false;
        erro = 'Acao nao prevista no E2E comissionado: ' + action;
      }
    } catch (e) {
      ok = false;
      erro = e && e.message ? e.message : String(e);
      resultado = null;
    }

    const payload = JSON.stringify({
      ctMinhaCariocaPost: true,
      id: requestId,
      ok,
      resultado,
      erro
    }).replace(/</g, '\\u003c');

    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body:
        '<!doctype html><html><body>' +
        '<script>window.top.postMessage(' + payload + ', "*");<\/script>' +
        '</body></html>'
    });
  });
}

async function seedSession(page, token) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
      sessionStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: STORAGE,
      value: {
        token,
        expiraEm: '2099-01-01T00:00:00.000Z'
      }
    }
  );
}

async function expectNoTechnicalVisibleLinks(page) {
  const hrefs = await page.locator('a[href]').evaluateAll(els =>
    els.map(el => el.getAttribute('href') || '')
  );

  expect(
    hrefs.filter(href =>
      /script\.google\.com|googleusercontent\.com|github\.io/i.test(href)
    )
  ).toEqual([]);
}

test.describe('Jornada operacional autenticada', () => {
  test.skip(!BRANCH_MODE, 'Executa localmente na branch sem usar credenciais reais.');

  test('Cadastro do produtor preserva codigo de indicacao sem criar conta', async ({ page }) => {
    const state = {
      token: 'CT-E2E-TOKEN-NAO-REAL',
      transactionCalls: 0,
      barMutationCalls: 0,
      eventMutationCalls: 0,
      supplierMutationCalls: 0,
      commissionMutationCalls: 0
    };

    await installMock(page, state);
    await page.goto('/produtor/?ref=PARCEIROE2E', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#showRegisterButton')).toBeVisible({ timeout: 15000 });
    await page.locator('#showRegisterButton').click();
    await expect(page.locator('#registerAuthView')).toBeVisible();
    await expect(page.locator('#registerReferralCode')).toHaveValue('PARCEIROE2E');
    await expect(page.locator('#registerReferralHint')).toBeVisible();
    await expect(page.locator('#registerReferralHint')).toContainText('Parceiro Carioca Ticket');
  });

  test('Produtor autorizado cria evento somente como RASCUNHO e aguarda Master', async ({ page }) => {
    const state = {
      token: 'CT-E2E-TOKEN-NAO-REAL',
      transactionCalls: 0,
      barMutationCalls: 0,
      eventMutationCalls: 0,
      eventPublicationCalls: 0,
      supplierMutationCalls: 0,
      commissionMutationCalls: 0,
      allowEventCreate: true,
      createdEvent: null
    };

    await installMock(page, state);
    await seedSession(page, state.token);

    await page.goto('/eventos-v2/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /^Eventos$/i })).toBeVisible({ timeout: 15000 });
    await page.locator('#botaoNovoEvento').click();
    await expect(page.locator('#modalNovoEvento')).toBeVisible();

    await expect(page.locator('#campoProdutorId')).toHaveValue('PROD-E2E');
    await page.locator('#campoNome').fill('Evento Homologacao Rascunho');
    await page.locator('#campoData').fill('2026-10-30');
    await page.locator('#campoHorarioInicio').fill('18:00');
    await page.locator('#campoHorarioFim').fill('23:00');
    await page.locator('#campoLocal').fill('Local Homologacao');
    await page.locator('#campoEndereco').fill('Rua Teste, 100');
    await page.locator('#campoCidade').fill('Jaboatão dos Guararapes');
    await page.locator('#campoUf').fill('PE');
    await page.locator('#campoCapacidade').fill('300');

    await page.locator('#botaoSalvarEvento').click();
    await expect.poll(() => state.eventMutationCalls).toBe(1);
    await expect(page.locator('#mensagemCadastro')).toContainText('rascunho');
    await expect.poll(() => state.createdEvent && state.createdEvent.status).toBe('RASCUNHO');
    await expect.poll(() => state.createdEvent && state.createdEvent.publicacao.prontoPublicar).toBe(false);
    expect(state.eventPublicationCalls).toBe(0);

    await expect(page.getByText('Evento Homologacao Rascunho').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('RASCUNHO').last()).toBeVisible();
    await expect(page.getByRole('button', { name: /Verificar e publicar vendas/i }).last()).toBeVisible();
    expect(state.eventPublicationCalls).toBe(0);
  });

  test('Portal -> Central -> Vendas -> Bar -> voltar -> logout sem transacao', async ({ page }) => {
    const state = {
      token: 'CT-E2E-TOKEN-NAO-REAL',
      transactionCalls: 0,
      barMutationCalls: 0,
      eventMutationCalls: 0,
      supplierMutationCalls: 0,
      commissionMutationCalls: 0
    };

    await installMock(page, state);
    await seedSession(page, state.token);

    await page.goto('/produtor/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#portalView')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#helloName')).toContainText('Operador Homologacao');
    await expect(page.locator('#eventPickerButton')).toBeVisible();

    await page.locator('#eventPickerButton').click();
    await page.locator('.event-picker-option').filter({
      hasText: 'Roda de Samba Estilo Carioca'
    }).click();
    await expect(page.locator('#dashboard')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#eventName')).toHaveText('Roda de Samba Estilo Carioca');

    const centralLink = page.locator('#centralMobileLink');
    await expect(centralLink).toHaveAttribute('href', /\/central\/#ct_handoff=/);
    await expect(page.locator('#accessManagementLink')).toHaveAttribute(
      'href',
      /\/acessos\/#ct_handoff=/
    );
    await expectNoTechnicalVisibleLinks(page);

    /*
     * O Portal usa a URL absoluta oficial por seguranca. Na homologacao da
     * branch preservamos path/hash do handoff, mas mantemos a navegacao no
     * servidor local para testar exatamente o codigo candidato.
     */
    const centralHref = await centralLink.getAttribute('href');
    const centralUrl = new URL(centralHref);
    await page.goto(
      centralUrl.pathname + centralUrl.search + centralUrl.hash,
      { waitUntil: 'domcontentloaded' }
    );
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#eventSelect')).toHaveValue(EVENT_ID);

    const vendas = page.locator('#mVendas');
    const bar = page.locator('#mBar');

    await expect(vendas).toHaveAttribute(
      'href',
      new RegExp('/vendas/\\?evento=' + EVENT_ID)
    );
    await expect(vendas).toHaveAttribute('aria-disabled', 'false');

    await expect(bar).toHaveAttribute(
      'href',
      new RegExp('/bar/\\?evento=' + EVENT_ID)
    );
    await expect(bar).toHaveAttribute('aria-disabled', 'false');

    await expect(page.locator('#mEventos')).toHaveAttribute('href', '/eventos-v2/');
    await expect(page.locator('#mEventos')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.locator('#mFornecedores')).toHaveAttribute(
      'href',
      new RegExp('/fornecedores/\\?evento=' + EVENT_ID)
    );
    await expect(page.locator('#mFornecedores')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.locator('#mCRM')).toHaveAttribute(
      'href',
      new RegExp('/crm/\\?evento=' + EVENT_ID)
    );
    await expect(page.locator('#mCRM')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.locator('#mFinanceiro')).toHaveAttribute(
      'href',
      new RegExp('/financeiro/\\?evento=' + EVENT_ID)
    );
    await expect(page.locator('#mFinanceiro')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.locator('#mRelatorios')).toHaveAttribute(
      'href',
      new RegExp('/relatorios/\\?evento=' + EVENT_ID)
    );
    await expect(page.locator('#mRelatorios')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.locator('#mComissoes')).toHaveAttribute(
      'href',
      new RegExp('/comissoes/\\?evento=' + EVENT_ID)
    );
    await expect(page.locator('#mComissoes')).toHaveAttribute('aria-disabled', 'false');

    await expect(page.locator('#mCheckin')).toHaveAttribute('href', '#');
    await expect(page.locator('#mConsulta')).toHaveAttribute('href', /\/consulta\//);
    await expectNoTechnicalVisibleLinks(page);

    await page.locator('#mConsulta').click();
    await expect(page).toHaveURL(/\/consulta\/\?evento=/);
    await expect(page.getByRole('heading', { name: /Consulta de Ingressos/i })).toBeVisible({
      timeout: 15000
    });
    await expect(page.locator('#eventName')).toHaveText('Roda de Samba Estilo Carioca');
    await page.locator('#term').fill('Cliente Homologacao');
    await page.locator('#searchButton').click();
    await expect(page.locator('#results')).toContainText('Cliente Homologacao');
    await expect(page.locator('#results')).toContainText('CT-E2E-CONSULTA');
    await expectNoTechnicalVisibleLinks(page);

    await page.getByRole('link', { name: /Central Mobile/i }).click();
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });

    await vendas.click();
    await expect(page).toHaveURL(/\/vendas\/\?evento=/);
    await expect(
      page.getByText('Roda de Samba Estilo Carioca').first()
    ).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#formularioVenda')).toBeVisible();
    await expect(page.getByRole('link', { name: /Voltar para a Central/i })).toHaveAttribute(
      'href',
      '/central/'
    );
    await expectNoTechnicalVisibleLinks(page);
    expect(state.transactionCalls).toBe(0);

    await page.getByRole('link', { name: /Voltar para a Central/i }).click();
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });

    await page.locator('#mBar').click();
    await expect(page).toHaveURL(/\/bar\/\?evento=/);
    await expect(page.locator('#app')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#eventName')).toHaveText('Roda de Samba Estilo Carioca');
    await expect(page.locator('#sProdutos')).toHaveText('1');
    await expect(page.locator('#productsWrap')).toContainText('Produto Homologacao');
    await expect(page.getByRole('link', { name: /Central Mobile/i })).toHaveAttribute(
      'href',
      '/central/'
    );
    await expectNoTechnicalVisibleLinks(page);
    expect(state.barMutationCalls).toBe(0);

    await page.getByRole('link', { name: /Central Mobile/i }).click();
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });

    await page.locator('#mEventos').click();
    await expect(page).toHaveURL(/\/eventos-v2\//);
    await expect(page.getByRole('heading', { name: /^Eventos$/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Roda de Samba Estilo Carioca').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('link', { name: /Central Mobile/i })).toHaveAttribute('href', '/central/');
    await expectNoTechnicalVisibleLinks(page);
    expect(state.eventMutationCalls).toBe(0);
    expect(state.supplierMutationCalls).toBe(0);

    await page.getByRole('link', { name: /Central Mobile/i }).click();
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });

    await page.locator('#mFornecedores').click();
    await expect(page).toHaveURL(/\/fornecedores\/\?evento=/);
    await expect(page.locator('#app')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Fornecedor Homologacao').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#sTotal')).toHaveText('1');
    await expect(page.getByRole('link', { name: /Central Mobile/i })).toHaveAttribute('href', '/central/');
    await expectNoTechnicalVisibleLinks(page);
    expect(state.supplierMutationCalls).toBe(0);

    await page.getByRole('link', { name: /Central Mobile/i }).click();
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });

    await page.locator('#mCRM').click();
    await expect(page).toHaveURL(/\/crm\/\?evento=/);
    await expect(page.locator('#app')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Cliente Homologacao').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#count')).toContainText('1 cliente');
    await expect(page.getByRole('link', { name: /Central Mobile/i })).toHaveAttribute('href', '/central/');
    await expectNoTechnicalVisibleLinks(page);

    await page.getByRole('button', { name: /Ver ficha/i }).click();
    await expect(page.locator('#drawerBack')).toHaveClass(/show/);
    await expect(page.locator('#drawerBody')).toContainText('CT-E2E');

    await page.getByRole('button', { name: '✕' }).click();
    await page.getByRole('link', { name: /Central Mobile/i }).click();
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });

    await page.locator('#mFinanceiro').click();
    await expect(page).toHaveURL(/\/financeiro\/\?evento=/);
    await expect(page.locator('#app')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#revenue')).toHaveText('R$ 90,00');
    await expect(page.locator('#received')).toHaveText('R$ 65,00');
    await expect(page.locator('#receivable')).toHaveText('R$ 25,00');
    await expect(page.locator('#asaasBalance')).toHaveText('R$ 180,00');
    await expect(page.getByRole('link', { name: /Central$/i })).toHaveAttribute('href', '/central/');
    await expect(page.locator('body')).toContainText(/taxa CT 2,5%/i);
    await expect(page.locator('body')).toContainText(/Nenhuma transferência Pix\/TED é executada automaticamente/i);
    await expectNoTechnicalVisibleLinks(page);

    await page.getByRole('link', { name: /Central$/i }).click();
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });

    await page.locator('#mRelatorios').click();
    await expect(page).toHaveURL(/\/relatorios\/\?evento=/);
    await expect(page.locator('#app')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#tickets')).toHaveText('4');
    await expect(page.locator('#present')).toHaveText('2');
    await expect(page.locator('#checkRate')).toContainText('50');
    await expect(page.getByRole('link', { name: /Central Mobile/i })).toHaveAttribute('href', '/central/');
    await expectNoTechnicalVisibleLinks(page);

    await page.getByRole('link', { name: /Central Mobile/i }).click();
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });

    await page.locator('#mComissoes').click();
    await expect(page).toHaveURL(/\/comissoes\/\?evento=/);
    await expect(page.locator('#app')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#eventName')).toHaveText('Roda de Samba Estilo Carioca');
    await expect(page.locator('#rulesCount')).toHaveText('1');
    await expect(page.locator('#entriesCount')).toHaveText('2');
    await expect(page.locator('#amountDue')).toHaveText('R$ 2,50');
    await expect(page.locator('#rules')).toContainText('Comissionado Homologacao');
    await expect(page.locator('#rules')).toContainText('5%');
    await expect(page.locator('#rules')).toContainText('Chave Pix configurada');
    await expect(page.locator('body')).toContainText(/pagamento automático ainda permanece desativado/i);
    await expectNoTechnicalVisibleLinks(page);
    expect(state.commissionMutationCalls).toBe(0);

    await page.getByRole('link', { name: /Central Mobile/i }).click();
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });

    await page.locator('#logout').click();
    await expect(page).toHaveURL(/\/produtor\//, { timeout: 10000 });
    await expect(page.locator('#loginView')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#portalView')).toHaveClass(/hidden/);

    const stored = await page.evaluate(key => ({
      local: localStorage.getItem(key),
      session: sessionStorage.getItem(key)
    }), STORAGE);

    expect(stored.local).toBeNull();
    expect(stored.session).toBeNull();
    expect(state.transactionCalls).toBe(0);
    expect(state.barMutationCalls).toBe(0);
    expect(state.eventMutationCalls).toBe(0);
    expect(state.supplierMutationCalls).toBe(0);
    expect(state.commissionMutationCalls).toBe(0);
  });

  test('Central -> Usuarios e Permissoes -> Sair sem rota escondida', async ({ page }) => {
    const state = {
      token: 'CT-E2E-TOKEN-ACESSOS',
      transactionCalls: 0,
      barMutationCalls: 0,
      eventMutationCalls: 0,
      supplierMutationCalls: 0,
      commissionMutationCalls: 0
    };

    await installMock(page, state);
    await seedSession(page, state.token);

    await page.goto('/central/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#mAcessos')).toHaveAttribute('aria-disabled', 'false');

    await page.locator('#mAcessos').click();
    await expect(page).toHaveURL(/\/acessos\//);
    await expect(page.getByRole('heading', { name: /Usuários e Permissões/i })).toBeVisible();
    await expect(page.locator('#lista')).toContainText('Operador Homologacao', { timeout: 15000 });
    await expect(page.getByRole('link', { name: 'Central Mobile' })).toHaveAttribute('href', '/central/');
    await expect(page.getByRole('link', { name: 'Portal do Produtor' })).toHaveAttribute('href', '/produtor/');
    await expect(page.locator('#logoutButton')).toBeVisible();
    await expectNoTechnicalVisibleLinks(page);

    await page.locator('#logoutButton').click();
    await expect(page).toHaveURL(/\/produtor\//, { timeout: 10000 });
    await expect(page.locator('#loginView')).toBeVisible({ timeout: 15000 });

    const stored = await page.evaluate(key => ({
      local: localStorage.getItem(key),
      session: sessionStorage.getItem(key)
    }), STORAGE);
    expect(stored.local).toBeNull();
    expect(stored.session).toBeNull();
  });

  test('Comissionado -> Central -> Minhas Vendas sem acesso às vendas gerais', async ({ page }) => {
    const state = {
      token: 'CT-E2E-COMISSIONADO-NAO-REAL',
      transactionCalls: 0
    };

    await installComissionadoMock(page, state);
    await seedSession(page, state.token);

    await page.goto('/central/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#eventSelect')).toHaveValue(EVENT_ID);

    await expect(page.locator('#mVendas')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#mComissionado')).toHaveAttribute('aria-disabled', 'false');
    await expect(page.locator('#mComissionado')).toHaveAttribute(
      'href',
      new RegExp('/comissionado/\\?evento=' + EVENT_ID)
    );

    await expect(page.locator('#mPortal')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#mAcessos')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#mFinanceiro')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#mRelatorios')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#mComissoes')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#mConsulta')).toHaveAttribute('aria-disabled', 'false');
    await expectNoTechnicalVisibleLinks(page);

    await page.locator('#mComissionado').click();
    await expect(page).toHaveURL(/\/comissionado\/\?evento=/);
    await expect(page.getByRole('heading', { name: /Minhas Vendas/i }).first()).toBeVisible({
      timeout: 15000
    });
    await expect(page.getByText('Roda de Samba Estilo Carioca').first()).toBeVisible();
    await expect(page.locator('#formularioVenda')).toBeVisible();
    await expect(page.locator('#resumoEventoVendas')).toHaveText('2');
    await expect(page.locator('#resumoEventoFaturamento')).toHaveText('R$ 50,00');
    await expect(page.locator('#listaMinhasVendas')).toContainText('Cliente Proprio Homologacao');
    await expect(page.locator('#comissaoMensagem')).toContainText('Regra ativa: 5% sobre a venda.');
    await expect(page.locator('#comissaoMensagem')).toContainText('A receber: R$ 2,50.');
    await expect(page.locator('#comissaoMensagem')).toContainText('Pago: R$ 1,00.');
    await expect(page.locator('#comissaoMensagem')).toContainText('Pix configurado (CPF).');

    const pagamentos = await page.locator('#formaPagamento option').allTextContents();
    expect(pagamentos.join('|').toUpperCase()).not.toContain('CORTESIA');
    await expectNoTechnicalVisibleLinks(page);
    expect(state.transactionCalls).toBe(0);

    await page.getByRole('link', { name: /Voltar para a Central/i }).click();
    await expect(page).toHaveURL(/\/central\//);
    await expect(page.locator('#central')).toBeVisible({ timeout: 15000 });

    await page.locator('#logout').click();
    await expect(page).toHaveURL(/\/produtor\//, { timeout: 10000 });
    expect(state.transactionCalls).toBe(0);
  });

});
