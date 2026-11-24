# Aviso para produtores na página inicial

Proposta isolada de produção, ainda não publicada. A cópia de index tem como base a home publicada pelo PR #274, não o index antigo da branch principal. O script independente entra como assets/producer-welcome.js. Não aplicar com um deploy geral a partir da árvore de main ou misturar com o PR #275. Se #275 entrar antes, recompor o mesmo delta sobre a base que estiver no ar; validar arquivos atuais da agenda, checkout, consentimento e todas as mudanças do pacote.

- Desktop: aviso discreto no canto abaixo do conteúdo, sem janela modal, respeitando o espaço reservado pelo banner de cookies existente.
- Celular e telas baixas: cartão no fluxo da página, acima da agenda; não sobrepõe ações.
- Botão “Conheça a plataforma” leva à seção de produtores da própria home.
- Fecha no X ou pelo Escape com foco no aviso. Uma exibição por sessão de aba quando o navegador permite sessionStorage.
- Nenhuma consulta extra de agenda, cookies, telemetria, alteração de checkout ou mudança no tempo limite. O script é assíncrono e não é dependência da agenda.
- Português, inglês, espanhol e chinês acompanham a seleção de idioma que já existe na home.

Validação local: quatro testes de comportamento e isolamento. Não é validação visual ao vivo.
