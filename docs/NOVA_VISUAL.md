# Nova 2.0 — Guía visual y reglas de implementación

## 1. Objetivo

Nova debe percibirse como un **asistente digital juvenil, moderno, tecnológico y confiable**, coherente con una plataforma de orientación educativa y laboral.

La dirección visual buscada es:

**IA moderna + orientación + cercanía + simplicidad.**

Nova no debe parecer una mascota infantil, juguete, emoji, personaje kawaii ni aplicación para niños pequeños.

---

## 2. Regla visual principal

> **El rostro de Nova está compuesto exclusivamente por dos ojos blancos ovalados y sólidos. Nova no tiene boca, pupilas, cejas ni otros elementos faciales. En reposo se muestran los dos ojos; cuando Nova está hablando, la señal principal pasa a ser el aro/halo activo.**

Esta regla es obligatoria en todas las variantes del avatar.

---

## 3. Forma principal

Nova mantiene el concepto de **esfera/orb flotante**.

Debe ser:

- circular;
- limpia;
- ligeramente volumétrica;
- sin brazos;
- sin piernas;
- sin orejas;
- sin cuerpo adicional;
- sin accesorios de personaje.

El objetivo es que se perciba como un **núcleo de IA**.

---

## 4. Rostro

### 4.1 Ojos

Nova tendrá exactamente **dos ojos blancos ovalados y sólidos**.

No deben incluir:

- pupilas;
- iris;
- reflejos internos;
- brillos tipo anime;
- bordes negros;
- pestañas;
- cejas;
- geometría kawaii, brillos o deformaciones expresivas.

### 4.2 Boca

Nova **no tiene boca**.

No debe existir:

- sonrisa;
- lengua;
- dientes;
- boca negra;
- boca rosada;
- gesto facial.

### 4.3 Proporciones

Tomando el diámetro del orb como 100%:

- ancho de cada ojo: **8–10%** del núcleo;
- alto de cada ojo: **12–15%** del núcleo;
- separación visual entre ojos: **14–18%**;
- posición vertical: **47–51%** del orb.

Los ojos deben quedar centrados y ligeramente por encima del centro vertical.

---

## 5. Color

Paleta base recomendada:

- rosa energético: `#F06BB9`;
- violeta: `#B95CFF`;
- azul-violeta: `#7667F8`;
- cyan: `#4DCFE8`;
- blanco para ojos.

Gradiente sugerido:

```text
rosa suave → violeta → azul-violeta → cyan
```

El rosa puede tener presencia visible como luz o acento tecnológico, especialmente en la zona superior del orb y en trazos externos. Nunca debe convertirse en mejillas, rubor ni otro rasgo facial.

---

## 6. Iluminación y volumen

Permitido:

- brillo superior suave;
- luz ambiental difusa;
- glow exterior tenue;
- sombra interna delicada;
- highlight pequeño y difuso.

No permitido:

- highlights blancos grandes;
- glitter;
- destellos anime;
- corazones;
- brillos caricaturescos;
- rubor;
- mejillas.

---

## 7. Contorno y halo

No utilizar borde grueso.

Referencia recomendada:

```text
borde blanco translúcido: 1–2 px
opacidad: 20–35%
```

El halo exterior debe ser limpio y tecnológico.

Máximo recomendado:

- 1 halo principal;
- 1 arco secundario tenue;
- 1 grupo muy pequeño de trazos/accent strokes externos.

Los trazos pueden usar rosa, violeta o cyan y moverse lentamente. No deben parecer orejas, cejas, corazones, signos de emoción ni adornos kawaii.

El halo comunica **actividad digital**, no emoción.

---

## 8. Elementos que deben eliminarse

Eliminar completamente:

- boca;
- ojos kawaii;
- pupilas;
- reflejos dentro de los ojos;
- mejillas;
- líneas rosadas laterales;
- signos de emoción;
- gotitas;
- rayitas;
- corazones;
- sparkles grandes;
- adornos de personaje.

La actividad debe comunicarse mediante motion y luz.

---

## 9. Tipografía y etiqueta

Mantener **Poppins**.

### Nombre

```css
font-family: "Poppins", sans-serif;
font-weight: 600;
```

Texto:

```text
Nova
```

Evitar emojis o decoraciones junto al nombre.

### Subtítulo

Opciones válidas:

- `Asistente de orientación`
- `Lista para ayudarte`
- `Tu guía personalizada`
- `Lista para conocerte` durante onboarding

Referencia:

```css
font-size: 14px;
font-weight: 400; /* o 500 */
color: #667085;
```

---

### Regla de transición ojos ↔ aro

- **Nova en reposo / lista / escuchando:** se reconocen los dos ojos blancos ovalados.
- **Nova hablando:** aparece el aro/halo de actividad como señal principal de voz.
- El aro no debe permanecer encendido con la misma intensidad cuando Nova está inactiva.
- Nunca se añaden palabras, boca, pupilas o expresiones faciales para representar estados.

## 10. Estados visuales

Los ojos mantienen siempre la misma geometría.

### IDLE

- orb estable;
- glow mínimo;
- ojos blancos;
- float opcional muy leve.

### LISTENING

- ojos blancos visibles;
- actividad del núcleo muy sutil;
- sin convertir el halo exterior en el estado dominante.

### PROCESSING

- micro pulso;
- rotación lenta del halo;
- desplazamiento sutil del gradiente.

### SPEAKING

- el aro/halo exterior se vuelve el indicador principal de voz;
- los ojos dejan de ser el elemento dominante durante la locución;
- expansión muy leve del halo y pulso controlado;
- sin boca animada ni texto dentro del orb.

### PAUSED

- glow reducido;
- movimiento detenido o casi detenido.

### ERROR

- no convertir toda Nova en roja;
- reducir temporalmente actividad;
- utilizar mensaje textual claro o indicador externo discreto.

---

## 11. Animaciones permitidas

Permitido:

- float de 2–4 px;
- `scale(1 → 1.02)`;
- pulse;
- glow breathing;
- halo expansion;
- microinclinación;
- desplazamiento suave del gradiente.

Duración recomendada:

```text
2–4 segundos
```

Las animaciones deben ser lentas y elegantes.

---

## 12. Animaciones prohibidas

No utilizar:

- saltos;
- rebotes grandes;
- squash & stretch;
- guiños;
- crecimiento exagerado de ojos;
- caras emocionales;
- corazones;
- confeti;
- movimientos frenéticos;
- animación de boca.

---

## 13. Tamaños recomendados

### Onboarding

- desktop amplio: **170–180 px** de contenedor;
- laptop compacta: **150–160 px**;
- tablet: **132–148 px**;
- mobile: **116–128 px**.

El núcleo del orb debe conservar aproximadamente un **70–73%** del diámetro total del contenedor.

### Chatbot

- header: **40–48 px**;
- launcher: **52–60 px**.

Todas las variantes deben conservar las mismas proporciones faciales.

---

## 14. Launcher

El launcher debe mostrar únicamente una versión reducida del orb.

Características:

- botón circular;
- nuevo avatar minimalista;
- sombra sutil;
- glow fino;
- sin texto permanente;
- sin halo complejo;
- hover discreto.

Hover sugerido:

```css
transform: scale(1.04);
```

---

## 15. Cabecera del panel de chat

Estructura recomendada:

```text
┌──────────────────────────────────────┐
│ (Nova)  Nova                     ×   │
│         Asistente de orientación     │
├──────────────────────────────────────┤
```

El avatar no debe ocupar una porción excesiva del panel.

---

## 16. Burbujas y panel

### Nova

- fondo suave;
- contraste alto;
- bordes redondeados sobrios;
- espaciado limpio;
- tipografía Poppins;
- sin decoraciones infantiles.

### Usuario

- color de marca;
- contraste suficiente;
- padding consistente;
- alineación clara.

El panel debe sentirse como una interfaz SaaS moderna.

---

## 17. Dirección estética

Acercarse a:

```text
AI orb
digital assistant
minimal interface
soft glassmorphism
modern SaaS
youth technology platform
```

Alejarse de:

```text
kawaii mascot
anime character
children app
cute robot
emoji
cartoon
toy
```

---

## 18. Assets previstos

Cuando el frontend esté modularizado:

```text
src/
├── assets/
│   └── nova/
│       ├── nova-idle.svg
│       ├── nova-listening.svg
│       ├── nova-processing.svg
│       ├── nova-speaking.svg
│       └── nova-paused.svg
│
├── components/
│   └── chatbot/
│       ├── ChatbotLauncher.js
│       ├── ChatbotPanel.js
│       ├── ChatHeader.js
│       └── NovaAvatar.js
│
└── styles/
    ├── chatbot.css
    └── nova-avatar.css
```

No duplicar rostros distintos por estado. Las variantes deben compartir la misma geometría base y cambiar únicamente halo/motion.

---

## 19. Criterios de aceptación

Antes de aprobar cualquier implementación de Nova 2.0 debe verificarse:

- [ ] El rostro tiene exactamente dos círculos blancos.
- [ ] No existe boca.
- [ ] No existen pupilas.
- [ ] No existen reflejos internos en los ojos.
- [ ] No existen cejas ni pestañas.
- [ ] No existen mejillas o rubor.
- [ ] No existen adornos kawaii.
- [ ] Los estados se comunican con halo, luz o movimiento.
- [ ] Nova tiene movimiento continuo y sutil cuando está activa.
- [ ] En onboarding, Nova es perceptiblemente más grande que la versión anterior.
- [ ] El launcher mantiene proporciones correctas.
- [ ] El avatar no se deforma en responsive.
- [ ] El panel se percibe juvenil y profesional.
- [ ] La interfaz mantiene coherencia con Despega+.

---

## 20. Orden de implementación

1. Mantener esta guía como fuente de verdad.
2. Modularizar Nova fuera del `index.html`.
3. Crear componente `NovaAvatar`.
4. Crear asset base.
5. Implementar estados visuales por CSS.
6. Reemplazar avatar en onboarding.
7. Reemplazar avatar en launcher.
8. Reemplazar avatar en header.
9. Refinar panel y burbujas.
10. Validar desktop, tablet y mobile.
11. Ejecutar QA visual y funcional.

---

## 21. Restricción de implementación

Hasta que Nova esté separada del `index.html`, no debe introducirse un segundo sistema visual paralelo dentro del monolito.

El rediseño debe implementarse una sola vez sobre la arquitectura modular para evitar duplicación, inconsistencias y retrabajo.
