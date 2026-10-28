# Herminho: recebimentos de ingressos — Draft

Paired backend review: https://github.com/tudoparasuafestape-dot/carioca-ticket/pull/377

This site-only draft is based on main b0a62241133788634594c0fda8239bd2cf0598aa. It does not include PR230 or change public checkout, cover, commercial policy, finance RPC contracts or workflows.

Exact Herminho producer/event + server marker are required to display centralized receipts. Ticket registration is separate from a future producer payment account: no subaccount/activation buttons are required for this ticket model. This screen does not publish sales or approve risk. Producer dashboard shows frozen gross/CT fee/net, never account-wide balance or a withdrawable amount. Invalid/reconciliation-pending compositions cannot inflate net. Existing ERA and other producers retain their UI and controls.

Validation:17 offline UX checks; existing12 ERA regression groups; two new Playwright scenarios run only under existing branch-isolated/mock fixtures, in both existing desktop/mobile CI projects, with screenshots. No browser/provider/finance calls were executed locally. No credentials, accounts, actual payments, transfers or financial approvals are created. Existing workflows and permissions are unchanged.

Do not merge or deploy without separate approval and paired backend review. Production backend393 is not repository backend main. Actual event/policy readiness and opening sales are separate decisions. The specific ticket view does not add a dedicated suspension UI; server financial-block/event controls remain enforced.
