
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('src/styles/dashboard.css','utf8');
const js=fs.readFileSync('src/dashboard/dashboard.js','utf8');
const checks=[
  ['dashboard mount',html.includes('id="despegaDashboardApp"')],
  ['dashboard css linked',html.includes('./src/styles/dashboard.css')],
  ['dashboard js linked',html.includes('./src/dashboard/dashboard.js')],
  ['five views',['home','route','opportunities','progress','profile'].every(v=>js.includes(v))],
  ['skills and experience separate',js.includes("list(profile,'skills')")&&js.includes("list(profile,'experience')")],
  ['nova launcher',js.includes('ddNovaLauncher')&&css.includes('.dd-nova-launcher')],
  ['no sidebar help card',!js.includes('¿Necesitas ayuda?')],
  ['no hardcoded 64 percent',!js.includes('64% completado')],
  ['route progress computed',js.includes('completedRoute/routeSteps.length')],
  ['saved opportunities persisted',js.includes('despegaSavedOpportunities')]
];
let failed=0;
for(const [name,ok] of checks){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)failed++;}
if(failed)process.exit(1);
