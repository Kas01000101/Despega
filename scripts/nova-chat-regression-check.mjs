
import fs from 'node:fs';
const chat=fs.readFileSync('src/dashboard/nova-chat.js','utf8');
const edge=fs.readFileSync('supabase/functions/despega-ai/index.ts','utf8');
const checks=[
 ['no automatic profile writes',!chat.includes("localStorage.setItem('despegaAIProfile'")],
 ['no invented URLs',edge.includes('No generes URLs')],
 ['no best-choice language',edge.includes('no presentes una opción como "la mejor"')],
 ['missing data rule',edge.includes('Si falta un dato')],
 ['history bounded',chat.includes('slice(-12)')&&edge.includes('MAX_CHAT_HISTORY_TURNS = 12')],
 ['navigation validated',chat.includes("allowedViews=new Set(['home','route','opportunities','progress','profile'])")],
 ['opportunity refs validated',edge.includes('availableOpportunityIds.has(id)')],
 ['chat independent from interview state',!chat.includes('dimensionAttempts')&&!chat.includes('startRealRecording')]
];
let failed=0;for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failed++;}if(failed)process.exit(1);
