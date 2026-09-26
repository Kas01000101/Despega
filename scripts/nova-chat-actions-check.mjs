import fs from 'node:fs';
const chat=fs.readFileSync('src/dashboard/nova-chat.js','utf8');
const edge=fs.readFileSync('supabase/functions/despega-ai/index.ts','utf8');
const expected=['navigate','open_opportunity','open_resource','open_external_verified','show_route_step'];
const checks=[
 ['all action types declared',expected.every(x=>edge.includes('"'+x+'"'))&&expected.every(x=>chat.includes("'"+x+"'"))],
 ['server action sanitizer',edge.includes('sanitizeChatActions(parsed.actions, availableOpportunityIds, availableRouteIds)')],
 ['server card sanitizer',edge.includes('sanitizeChatCards(parsed.cards, availableOpportunityIds, availableRouteIds)')],
 ['client action sanitizer',chat.includes('sanitizeClientActions(data.actions)')],
 ['client card sanitizer',chat.includes('sanitizeClientCards(data.cards)')],
 ['opportunity action uses dashboard API',chat.includes("type==='open_opportunity'&&api.openOpportunity")],
 ['route action navigates safely',chat.includes("type==='show_route_step'")&&chat.includes("api.navigate('route')")],
 ['verified external action never trusts model URL',chat.includes('api.getVerifiedUrl(target)')]
];
let failed=0;for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failed++;}if(failed)process.exit(1);
