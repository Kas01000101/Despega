# Nova — memoria conversacional y comandos de voz

## Memoria
Nova conserva un historial reciente con pregunta, transcripción, resumen, reacción y conceptos detectados. El audio no se conserva como memoria permanente.

El frontend envía únicamente una ventana corta del historial reciente y el perfil acumulado. El backend mantiene además `memory_summary` para conservar contexto sin crecer indefinidamente.

## Persistencia del MVP
Supabase DESPEGA persiste:
- `profiles`: perfil acumulado + onboarding;
- `nova_sessions`: estado y resumen de la sesión;
- `nova_turns`: turnos procesados.

Los silencios, timeouts sin voz y ruido sin respuesta no deben crear turnos.

## Intenciones
Antes de extraer perfil, el backend clasifica el turno como:
- `answer`
- `repeat_question`
- `repeat_example`
- `explain_question`
- `pause`
- `skip_question`

Las intenciones de control no modifican el perfil ni cuentan como respuesta útil.

## Ejemplos
- “Repítela” → Nova repite la pregunta actual.
- “No entendí” → Nova reformula la misma pregunta.
- “Repite el ejemplo” → Nova repite el ejemplo.
- “Quiero parar un rato” → Nova pausa, desactiva auto-listen y libera el micrófono.
- “Salta esta pregunta” → Nova cambia a otra dimensión pendiente.

## Privacidad
- No guardar audio de forma permanente en Supabase para este MVP.
- No registrar audio base64 completo en logs.
- No exponer claves privadas en el navegador.
- El historial local se reinicia al comenzar una nueva sesión de onboarding.

## Secretos
Configurar en Supabase Edge Functions > Secrets:

`GEMINI_API_KEY`

Opcionales:

`GEMINI_MODEL`
`ALLOWED_ORIGINS`

Nunca guardar `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ni otros secretos en HTML, localStorage, IndexedDB, GitHub o bundles públicos.
