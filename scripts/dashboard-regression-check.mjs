
import fs from 'node:fs';
const js=fs.readFileSync('src/dashboard/dashboard.js','utf8');
const home=js.slice(js.indexOf('function renderHome'),js.indexOf('function routeStep'));
const profile=js.slice(js.indexOf('function renderProfile'),js.indexOf('function renderAll'));
const assertions=[
  ['home excludes profile detail',!home.includes('Barreras detectadas')],
  ['profile owns Nova content',profile.includes('Lo que detectó Nova')],
  ['search exists',js.includes('id="ddSearch"')&&js.includes('filteredCatalog')],
  ['save exists',js.includes('toggleSaved')&&js.includes('data-dd-save')],
  ['details exist',js.includes('openDetails')&&js.includes('despegaViewedOpportunities')],
  ['four route stages',['Conoce tu punto de partida','Fortalece habilidades','Explora oportunidades','Postula y avanza'].every(x=>js.includes(x))],
  ['progress data driven',js.includes('m.routeProgress')&&js.includes('m.viewedCount')&&js.includes('m.savedCount')],
  ['Nova contextual nav',js.includes('data-dd-nova-go="profile"')&&js.includes('data-dd-nova-go="opportunities"')],
  ['no decision wording',!js.includes('Nova te recomienda')]
];
let failed=0;
for(const [name,ok] of assertions){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failed++;}
if(failed)process.exit(1);
