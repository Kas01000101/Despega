# 🚀 Despega+

Despega+ es un prototipo web de orientación educativa y laboral para jóvenes. El flujo recopila datos básicos y situación actual, y luego usa **Nova**, un agente conversacional por voz, para conocer objetivos, intereses, habilidades, experiencia y barreras antes de construir una ruta personalizada.

## Estado actual

- Login y registro visual.
- Paso 1: datos personales + ubicación geográfica.
- Paso 2: nivel educativo, situación de estudio y trabajo.
- Paso 3: Nova, agente conversacional por voz con memoria de corto plazo.
- Comandos conversacionales previstos: repetir pregunta, repetir ejemplo, explicar, pausar y saltar.
- Backend preparado como Supabase Edge Function (`despega-ai`).
- Gemini API Key **no se almacena en el repositorio**.
- TTS preparado para integrar Kokoro; el navegador puede actuar como fallback mientras se despliega el servicio.

## Arquitectura

```text
Navegador
├─ UI Despega+
├─ MediaRecorder
├─ memoria temporal / IndexedDB
└─ Supabase Edge Function: despega-ai
      └─ Gemini
          ├─ intención conversacional
          ├─ transcripción / comprensión
          ├─ extracción de perfil
          └─ siguiente pregunta adaptativa
```

## Ejecutar localmente

No abras el micrófono desde `file://` si tu navegador lo bloquea. Sirve el proyecto por HTTP local:

```bash
python -m http.server 5500
```

Luego abre:

```text
http://localhost:5500
```

## Configurar Gemini

En Supabase:

1. Abre **Edge Functions → Secrets**.
2. Crea el secreto `GEMINI_API_KEY`.
3. Pega ahí tu clave de Google AI Studio.
4. No la copies dentro de `index.html`, `.env` versionado ni GitHub.

La función está en:

```text
supabase/functions/despega-ai/index.ts
```

## Seguridad

Nunca subir al repositorio:

- `GEMINI_API_KEY`
- claves `service_role` / secret de Supabase
- archivos `.env` reales

## Estructura

```text
.
├── index.html
├── assets/
├── docs/
├── supabase/
│   └── functions/
│       └── despega-ai/
├── .env.example
├── .gitignore
└── README.md
```
