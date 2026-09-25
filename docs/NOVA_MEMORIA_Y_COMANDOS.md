# Nova — memoria conversacional y comandos de voz

## Memoria
Nova conserva un historial reciente con pregunta, transcripción, resumen, reacción y conceptos detectados. El audio no se conserva como memoria permanente.

## Intenciones
Antes de extraer perfil, el backend clasifica el turno como:
- `answer`
- `repeat_question`
- `repeat_example`
- `explain_question`
- `pause`
- `skip_question`

Las intenciones de control no modifican el perfil.

## Ejemplos
- “Repítela” → Nova repite la pregunta actual.
- “No entendí” → Nova reformula la misma pregunta.
- “Repite el ejemplo” → Nova repite el ejemplo.
- “Quiero parar un rato” → Nova pausa.
- “Salta esta pregunta” → Nova pregunta por otra dimensión.

## Privacidad
La integración usa `store:false` con Gemini. La memoria del MVP se administra en DESPEGA+ y se envía explícitamente al backend.

## Secreto
Configurar en Supabase Edge Functions > Secrets:

`GEMINI_API_KEY`

Nunca guardar la clave en HTML, localStorage, IndexedDB, GitHub o variables `VITE_*`.
