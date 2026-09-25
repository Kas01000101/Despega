# 🚀 Despega+

Despega+ es un prototipo web de orientación educativa y laboral para jóvenes. El flujo recopila datos personales y situación actual, y luego utiliza **Nova**, un agente conversacional por voz, para conocer objetivos, intereses, habilidades, experiencia y barreras antes de construir una ruta personalizada.

## Estado actual

- Login y registro visual.
- Paso 1: datos personales + ubicación geográfica.
- Paso 2: nivel educativo, situación de estudio y trabajo.
- Paso 2 corregido para conservar proporciones consistentes entre ilustración y formulario.
- Paso 3: Nova, agente conversacional por voz con memoria de corto plazo.
- Comandos de Nova: repetir pregunta, repetir ejemplo, explicar, pausar y saltar.
- Backend preparado como Supabase Edge Function `despega-ai`.
- La `GEMINI_API_KEY` **no se almacena en el repositorio**.

## Arquitectura

```text
Navegador
├─ index.html (frontend standalone)
├─ MediaRecorder
├─ memoria temporal / IndexedDB
└─ Supabase Edge Function: despega-ai
      └─ Gemini
          ├─ intención conversacional
          ├─ comprensión del audio
          ├─ extracción de perfil
          └─ siguiente pregunta adaptativa
```

## Estructura del repositorio

```text
.
├── index.html
├── README.md
├── .gitignore
├── .env.example
├── docs/
│   ├── NOVA_COMPORTAMIENTO.md
│   └── NOVA_MEMORIA_Y_COMANDOS.md
└── supabase/
    ├── config.toml
    └── functions/
        └── despega-ai/
            ├── index.ts
            └── deno.json
```

## Ejecutar localmente

Para usar el micrófono, sirve la aplicación por HTTP local en lugar de abrirla con `file://`:

```bash
python -m http.server 5500
```

Luego abre:

```text
http://localhost:5500/
```

## Configurar Gemini

En Supabase:

1. Abre **Edge Functions → Secrets**.
2. Crea el secreto `GEMINI_API_KEY`.
3. Pega ahí la clave de Google AI Studio.
4. No copies la clave dentro de `index.html`, GitHub ni archivos `.env` versionados.

Opcionalmente puedes definir:

```text
GEMINI_MODEL
```

## Seguridad

Nunca subir:

- `GEMINI_API_KEY`
- claves secretas de Supabase
- `service_role`
- archivos `.env` reales

El archivo `.env.example` contiene únicamente los nombres de variables, sin valores.
