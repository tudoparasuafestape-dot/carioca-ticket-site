# Jornada do Produtor — Pacote de pré-produção 24/09/2026

Branch: `preprod/produtor-jornada-completa-20260924`
Não publicar antes da homologação completa.

O site deve convergir para:
- /produtor/ como entrada autenticada;
- /produtor/solicitar/ para onboarding;
- /eventos-v2/ para gestão de eventos;
- /produtor/financeiro/ como centro financeiro canônico;
- /produtor/solicitacoes/ para decisões Master de onboarding;
- /backoffice/carioca-pay/ para decisões Master de antecipação;
- /backoffice/ como hub com links/badges das pendências.

Regras financeiras em pré-produção:
- mínimo para antecipação: R$ 500,00;
- taxa: 3,5%;
- reserva de segurança: 20% enquanto vigente;
- repasse normal: D+3 úteis sem taxa de antecipação;
- nenhuma movimentação/provider na homologação.

A rota legada /financeiro/ não pode permitir antecipação direta via provider. Deve orientar o usuário ao fluxo canônico da Conta Carioca Pay.


## Fluxos Master adicionados
- /backoffice/carioca-pay/produtores/ — ativação financeira de produção com referência opaca, validação somente leitura e aceite explícito.
- /backoffice/eventos/ — análise de governança dos eventos novos; aprovação não publica vendas.
- /backoffice/ — links e badges centralizados para pendências de produtores, financeiro e eventos.

## Regra de navegação
Produtor aprovado pode navegar e configurar. Venda/publicação permanece bloqueada até o financeiro estar pronto e a governança do evento ter sido autorizada.
