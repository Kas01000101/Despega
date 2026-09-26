# Nova Audio — Acceptance Tests

Branch: `feat/main-consolidation-nova`

## Invariants

- One physical recording = one `recordingId`.
- One logical recording may produce at most one persisted `nova_turn`.
- TTS and microphone capture are mutually exclusive.
- Transcription is literal and isolated from profile/history/question context.
- Only `transcription_quality = "good"` can reach semantic analysis.
- Profile fields must carry literal evidence from the current transcript.
- If semantic labels are not lexically supported, the literal evidence is preserved instead of an inferred label.
- Stale recording/request results never update UI, profile, history, chips, or dimensions.

## Required cases

### 1. Postres
Say: "Me gusta preparar postres y me gustaría aprender repostería."

Expected:
- transcript contains "postres" and "repostería";
- accepted interests/goals are evidence-backed;
- forbidden unless spoken: programación, tecnología, desarrollo web, software.

### 2. Minimal answer
Say: "Diseño."

Expected:
- speech_detected = true;
- transcription_quality = good;
- transcript = "Diseño." or equivalent literal punctuation;
- accepted as a valid short answer.

### 3. Silence
Say nothing.

Expected:
- NO_SPEECH_DETECTED;
- no semantic analysis;
- no chips;
- no useful answer increment;
- no profile mutation.

### 4. Environmental noise
Use fan/keyboard/movement noise without intelligible speech.

Expected:
- NO_SPEECH_DETECTED, AUDIO_INAUDIBLE, or TRANSCRIPTION_UNCERTAIN;
- no semantic analysis;
- no profile mutation.

### 5. Natural pause
Say: "Me gusta... preparar postres."

Expected:
- one recordingId;
- pause does not prematurely split the answer;
- one transcript.

### 6. Long answer
Speak for 10–15 seconds.

Expected:
- one recordingId;
- one Blob;
- one logical POST;
- one transcript;
- one nova_turn.

### 7. Double click
Double-click microphone rapidly.

Expected:
- one active MediaRecorder;
- no duplicate send;
- no duplicate nova_turn.

### 8. Duplicate beginListeningTurn
Trigger listening twice while already listening.

Expected:
- existing VAD remains valid;
- current listenTurnToken is not invalidated by the duplicate call.

### 9. Nova TTS echo
While Nova is speaking, inspect capture state.

Expected:
- MediaRecorder OFF;
- MediaStream OFF;
- VAD OFF;
- listening starts only after TTS ends plus post-TTS guard.

### 10. Leave Step 3
Leave Step 3 during recording, processing, or TTS.

Expected:
- zero active tracks;
- recorder inactive;
- VAD stopped;
- AudioContext closed;
- timers cleared;
- request invalidated;
- stale result ignored.

### 11. Stale HTTP response
Simulate request A slower than request B.

Expected:
- response A cannot update UI/profile/history after its recordingId is no longer active.

### 12. Network retry
Send recordingId ABC, lose network, reconnect.

Expected:
- retry uses recordingId ABC;
- database contains at most one nova_turn for (session_id, ABC).

### 13. Evidence gate
Transcript: "Me gustan los postres."

Expected:
- any accepted value must have evidence literally present in transcript;
- unsupported semantic labels are replaced by literal evidence or dropped;
- programming/robotics/web design/sales cannot appear without evidence.

### 14. Gender barrier
Say: "Me interesa mecánica, pero me siento insegura porque soy mujer."

Expected:
- interest evidence for mecánica;
- contextual/gender barrier evidence preserved;
- no negative skill inference;
- no recommendation to abandon the interest.

### 15. Cross-turn contamination
Turn 1: "Me gusta preparar postres."
Turn 2: "También me gusta dibujar."

Expected:
- history may preserve validated previous facts;
- current-turn evidence comes only from current transcript;
- no unrelated domain appears because it exists in examples/history.

## Promotion gate

Do not merge to `main` until all 15 cases pass on the Vercel Preview connected to the hardened Supabase Edge Function.
