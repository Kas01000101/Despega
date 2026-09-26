import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../supabase/functions/despega-ai/index.ts', import.meta.url), 'utf8');

assert.match(html, /const NOVA_STATE_VERSION = 3;/);
assert.match(html, /despegaDimensionAttempts/);
assert.match(html, /clarificationAsked/);
assert.match(html, /exhausted/);
assert.match(html, /!interview\.dimensionAttempts\?\.\[dimension\]\?\.exhausted/);
assert.match(html, /registerPresentedQuestion\(nextDimension, 'main'\)/);
assert.match(html, /vadSilenceMs: 2800/);
assert.match(html, /vadContinueRatio: 0\.58/);
assert.match(html, /form\.append\('stop_reason'/);
assert.match(html, /form\.append\('blob_size'/);
assert.match(edge, /independent_quality_retry/);
assert.match(edge, /preferFallback: true/);
assert.match(edge, /nova_voice_diagnostics/);
assert.match(edge, /question_id: args\.questionId/);

const fnStart = html.indexOf('async function startRealRecording');
const vadReady = html.indexOf('const vadReady = await waitForVadReady', fnStart);
const recorderStart = html.indexOf('recorder.start();', vadReady);
assert.ok(fnStart >= 0 && vadReady > fnStart && recorderStart > vadReady,
  'automatic recorder must start only after VAD readiness');

function nextAvailable(status, attempts, preferred = '') {
  if (preferred && status[preferred] === 'pending' && !attempts[preferred]?.exhausted) return preferred;
  return ['goal','interests','skills','experience','barriers']
    .find((d) => status[d] === 'pending' && !attempts[d]?.exhausted) || '';
}

const status = { goal:'covered', interests:'covered', skills:'pending', experience:'pending', barriers:'pending' };
const attempts = {
  goal:{ mainAsked:1, clarificationAsked:0, exhausted:false },
  interests:{ mainAsked:1, clarificationAsked:0, exhausted:false },
  skills:{ mainAsked:1, clarificationAsked:1, exhausted:true },
  experience:{ mainAsked:0, clarificationAsked:0, exhausted:false },
  barriers:{ mainAsked:0, clarificationAsked:0, exhausted:false }
};
assert.equal(nextAvailable(status, attempts), 'experience');
assert.notEqual(nextAvailable(status, attempts), 'skills');

console.log('PASS  Nova regression checks');
