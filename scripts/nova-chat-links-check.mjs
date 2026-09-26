import fs from 'node:fs';
const chat=fs.readFileSync('src/dashboard/nova-chat.js','utf8');
const dashboard=fs.readFileSync('src/dashboard/dashboard.js','utf8');
const edge=fs.readFileSync('supabase/functions/despega-ai/index.ts','utf8');
const checks=[
 ['catalog stores official URLs',dashboard.includes("source:{name:")&&dashboard.includes("application:{url:")],
 ['only verified entries resolve',dashboard.includes("verification.status==='verified'")&&dashboard.includes('if(!isVerifiedOpportunity(o))return')],
 ['expired item cannot enter active catalog',dashboard.includes("status:'expired'")&&dashboard.includes('function activeCatalog(){return catalog.filter(isVerifiedOpportunity);}')],
 ['chat receives no URL field',chat.includes('source_name:o.source&&o.source.name')&&!chat.includes('source_url:o.source')],
 ['LLM forbidden to generate URL',edge.includes('NUNCA escribas ni inventes una URL')],
 ['external action resolves by ID',chat.includes("type==='open_external_verified'")&&chat.includes('api.getVerifiedUrl(target)')],
 ['external links isolated',chat.includes("window.open(url,'_blank','noopener,noreferrer')")],
 ['click tracked',chat.includes("trackEvent('link_click'")&&edge.includes('link_click_count')]
];
let failed=0;for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failed++;}if(failed)process.exit(1);
