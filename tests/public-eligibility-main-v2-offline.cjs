'use strict';
// Explicit Node-only suite. No npm lifecycle, browser, server, CLI Google or live RPC.
const {spawnSync}=require('node:child_process'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),GUARD=path.join(__dirname,'helpers/offline-network-guard.cjs');
const jobs=[
 [['--test','tests/public-catalog-clock.test.cjs','tests/public-event-expiry.mjs','tests/temporal-integrated-pages.test.cjs','tests/temporal-pr222-coexistence.test.cjs','tests/temporal-browser-fixtures.test.cjs','tests/public-eligibility-main-v2-invariants.test.cjs','tests/public-i18n.runtime.cjs','tests/institutional-language.runtime.cjs'],{}],
 [['tests/checkout-era-beauty.dom.js'],{}],
 [['tests/checkout-language.dom.cjs'],{}],
 [['tests/checkout-language.dom.cjs'],{CT_LOCALE_ROUTE:'checkout-v2'}]
];
for(const [args,extra]of jobs){console.log('OFFLINE_NODE '+args.join(' '));const env={...process.env,...extra,NODE_OPTIONS:'--require='+GUARD};const result=spawnSync(process.execPath,['--require',GUARD,...args],{cwd:ROOT,env,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);}
console.log('PUBLIC_ELIGIBILITY_MAIN_V2_OFFLINE_OK; no browser, deployed-site, cache or backend-runtime homologation.');
