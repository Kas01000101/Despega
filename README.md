# 🚀 Despega+

Despega+ es un prototipo web de orientación educativa y laboral para jóvenes. El flujo recopila datos personales y situación actual, y luego utiliza **Nova**, un agente conversacional por voz, para conocer objetivos, intereses, habilidades, experiencia y barreras antes de construir una ruta personalizada.

## Estado del MVP

- Login y registro visual.
- Paso 1: datos personales + ubicación geográfica.
- Paso 2: nivel educativo, situación de estudio y trabajo.
- Paso 3: Nova con conversación por voz, memoria de corto plazo, VAD y escucha automática.
- El micrófono funciona como respaldo manual; el flujo normal intenta detectar inicio y fin de voz automáticamente.
- Comandos: repetir pregunta, repetir ejemplo, explicar, pausar y saltar.
- Backend en un proyecto Supabase exclusivo de DESPEGA.
- Persistencia de sesiones, perfiles y turnos.
- `GEMINI_API_KEY` solo existe como secreto del backend.

## Arquitectura

```text
Navegador
├─ index.html
├─ SpeechSynthesis / TTS
├─ MediaRecorder
├─ AudioContext + AnalyserNode (VAD)
├─ memoria temporal / IndexedDB
└─ Supabase DESPEGA
      ├─ Edge Function: despega-ai
      ├─ profiles
      ├─ nova_sessions
      ├─ nova_turns
      └─ Gemini
          ├─ comprensión del audio
          ├─ intención conversacional
          ├─ extracción de perfil
          └─ seguimiento semántico
```

## Supabase del MVP

- **Proyecto:** DESPEGA
- **Project ref:** `ojmiuvlrffbojvofegad`
- **Región:** `sa-east-1`
- **Edge Function:** `despega-ai`
- **Tablas:** `profiles`, `nova_sessions`, `nova_turns`
- **RLS:** activado
- El navegador no escribe directamente en PostgreSQL.

El esquema reproducible vive en:

```text
supabase/migrations/20260925_create_nova_mvp.sql
```

## Ejecutar localmente

El micrófono requiere HTTPS o localhost. No abras el archivo directamente con `file://`.

```bash
python -m http.server 5500
```

Luego abre:

```text
http://localhost:5500/
```

## Configurar Gemini

En Supabase → Edge Functions → Secrets:

```text
GEMINI_API_KEY
```

Opcionales:

```text
GEMINI_MODEL
ALLOWED_ORIGINS
```

Nunca colocar `GEMINI_API_KEY` ni `SUPABASE_SERVICE_ROLE_KEY` en HTML, localStorage, IndexedDB o GitHub.

## Flujo objetivo de Nova

```text
Nova habla
→ TTS termina correctamente
→ micrófono se activa
→ VAD detecta voz
→ VAD detecta silencio final
→ MediaRecorder se detiene
→ despega-ai
→ Gemini
→ persistencia
→ Nova responde
→ siguiente turno
```

Si el TTS falla, Nova **no debe activar la escucha automática**. La pregunta permanece visible y el usuario puede continuar manualmente.
