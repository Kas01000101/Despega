import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const edge = fs.readFileSync(new URL('../supabase/functions/despega-ai/index.ts', import.meta.url), 'utf8');

const checks = [
  ['frontend request timeout 40s', html.includes('requestTimeoutMs: 40000')],
  ['frontend watchdog 43s', html.includes('processingWatchdogMs: 43000')],
  ['VAD natural-pause window 2.8s', html.includes('vadSilenceMs: 2800')],
  ['VAD continuation hysteresis 0.58', html.includes('vadContinueRatio: 0.58')],
  ['dimension clarification map exists', html.includes('NOVA_CLARIFICATIONS')],
  ['asked-count persistence exists', html.includes('despegaInterviewAskedCount')],
  ['quality retry announces rerecord', html.includes('quality_retry_after_notice')],
  ['separate transcription state', html.includes("processing_transcription")],
  ['separate analysis state', html.includes("processing_analysis")],
  ['analysis-only retry exists', html.includes('retryAnalysisFromTranscript')],
  ['pending transcript manual fallback exists', html.includes('retryPendingAnalysis')],
  ['processed id only after accepted', html.includes('if (accepted) {\n        interview.processedRecordingIds.add(recordingId);')],
  ['principal question counter exists', html.includes('mainQuestionsAsked')],
  ['clarification counter exists', html.includes('clarificationsAsked')],
  ['backend transcribe mode', edge.includes('mode === "transcribe"')],
  ['backend analyze mode', edge.includes('mode === "analyze"')],
  ['backend transcript override', edge.includes('transcript_override')],
  ['backend transcription timeout 6/8', edge.includes('transcriptionFast: 6000') && edge.includes('transcriptionFallback: 8000')],
  ['backend analysis timeout 5/6', edge.includes('analysisFast: 5000') && edge.includes('analysisFallback: 6000')],
  ['backend quality-first transcription', edge.includes('label: "primary_quality"') && edge.includes('{ model: MODEL, timeoutMs: GEMINI_TIMEOUTS.transcriptionFallback')],
  ['backend explicit control fallback', edge.includes('detectExplicitControlIntent')],
  ['backend split-pipeline rate ceiling', edge.includes('RATE_LIMIT_PER_MINUTE = 30')],
  ['backend strict interests coverage', edge.includes('if (!nonAnswer && result.interests.length > 0)')],
  ['backend skill-vs-experience contract', edge.includes('DISTINCIÓN OBLIGATORIA ENTRE HABILIDAD Y EXPERIENCIA')],
  ['analysis errors preserve transcript', edge.includes('transcription_quality: transcriptionQuality')],
  ['state version gate exists', html.includes('NOVA_STATE_VERSION = 3') && html.includes('ensureNovaStateVersion()')],
  ['dimension attempts exist', html.includes('despegaDimensionAttempts') && html.includes('clarificationAsked')],
  ['exhausted dimensions are excluded', html.includes("!interview.dimensionAttempts?.[dimension]?.exhausted")],
  ['VAD calibrates before recorder starts', html.indexOf('const vadReady = await waitForVadReady') < html.indexOf('recorder.start();', html.indexOf('const vadReady = await waitForVadReady'))],
  ['voice diagnostic metadata sent', html.includes("form.append('stop_reason'") && html.includes("form.append('noise_floor'")],
  ['backend independent uncertain STT retry', edge.includes('independent_quality_retry') && edge.includes('preferFallback: true')],
  ['backend persistent voice diagnostics', edge.includes('.from("nova_voice_diagnostics")')],
  ['turn persistence includes question id', edge.includes('question_id: args.questionId')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
console.log(`PASS  ${checks.length}/${checks.length} Nova static acceptance checks`);
