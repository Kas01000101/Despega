import fs from 'node:fs';
const chat=fs.readFileSync('src/dashboard/nova-chat.js','utf8');
const dashboard=fs.readFileSync('src/dashboard/dashboard.js','utf8');
const edge=fs.readFileSync('supabase/functions/despega-ai/index.ts','utf8');
const html=fs.readFileSync('index.html','utf8');
const checks=[
 ['chat module linked',html.includes('./src/dashboard/nova-chat.js')],
 ['separate chat state',chat.includes('despegaNovaChatSession')&&chat.includes('despegaNovaChatMessages')],
 ['chat backend mode',edge.includes('modeRaw === "chat"')],
 ['no audio requirement for chat',edge.includes('mode !== "chat" && !audio')],
 ['chat rate limit independent',edge.includes('CHAT_RATE_LIMIT_PER_MINUTE')&&edge.includes('allowChatRequest')],
 ['chat tables persistence',edge.includes('nova_chat_sessions')&&edge.includes('nova_chat_messages')&&edge.includes('nova_chat_diagnostics')],
 ['skills/experience rule',edge.includes('HABILIDAD =')&&edge.includes('EXPERIENCIA =')],
 ['rich chat schema',edge.includes('message_type')&&edge.includes('referenced_resource_ids')&&edge.includes('motivation')&&edge.includes('cards')],
 ['verified catalog context',dashboard.includes("verification:{status:'verified'")&&chat.includes('verification:o.verification&&o.verification.status')],
 ['route context',dashboard.includes('getRoute:function()')&&chat.includes('route:route')],
 ['idempotency metadata',edge.includes('findExistingChatReply')&&edge.includes('reply_to_message_id')&&edge.includes('metadata')],
 ['timeout',chat.includes('CHAT_TIMEOUT_MS=18000')],
 ['retry',chat.includes('novaRetry')],
 ['new conversation',chat.includes('newConversation')],
 ['context controlled',chat.includes('buildContext')&&chat.includes("goals:values(profile,'goals')")&&chat.includes("experience:values(profile,'experience')")]
];
let failed=0;for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failed++;}if(failed)process.exit(1);
