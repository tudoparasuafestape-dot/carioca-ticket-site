'use strict';
// Defense in depth for this explicit local runner. App VMs separately expose
// only fake Google/Sheets/cache/provider adapters; no live tokens are read.
const deny=name=>function(){throw new Error('OFFLINE_NETWORK_FORBIDDEN:'+name);};
for(const [module,names] of Object.entries({
 'node:http':['request','get','createServer'],
 'node:https':['request','get','createServer'],
 'node:net':['connect','createConnection','createServer'],
 'node:tls':['connect','createServer'],
 'node:dgram':['createSocket']
}))for(const name of names)require(module)[name]=deny(module+'.'+name);
require('node:net').Socket.prototype.connect=deny('Socket.connect');
globalThis.fetch=deny('fetch');globalThis.WebSocket=deny('WebSocket');
