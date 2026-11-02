# Asistente de ayuda para AxSoft (gratis, sin IA)

Un chat flotante ("Ayuda", abajo a la derecha) que responde dudas de uso del sistema.
No usa IA ni servicios externos: busca en una lista de 148 preguntas y respuestas que vos controlás,
escritas a partir de las pantallas reales del sistema (todas las secciones).
Sabe en qué pantalla está el usuario y le sugiere las dudas más comunes de ahí.

## Instalación (3 pasos)

1. Copiá la carpeta `backend` de este paquete **sobre** la `backend` de tu sistema
   (elegí "combinar" / "reemplazar archivos"; no borra nada tuyo, solo agrega 4 archivos).
2. Abrí una terminal en tu carpeta `backend` y ejecutá:

       node instalar-ayuda.js

   Agrega 2 líneas a `src/views/partials/scripts.ejs` y registra la ruta en `src/app.js`.
   Guarda copia de cada archivo (`.bak-ayuda`). Se puede correr más de una vez sin problema.
3. Reiniciá el sistema (`pm2 restart NOMBRE` o `npm start`).

## Archivos nuevos

| Archivo | Para qué |
|---|---|
| `src/public/js/ayuda-base.js` | **Las preguntas y respuestas. Es el que editás.** |
| `src/public/js/ayuda-bot.js` | El chat (no hace falta tocarlo) |
| `src/routes/ayuda.routes.js` | Guarda las preguntas que el bot no supo responder |
| `instalar-ayuda.js` | Instalador |

## Cómo agregar o corregir una respuesta

Abrí `ayuda-base.js`, copiá una entrada y cambiá los textos:

    { id: 'mi-pregunta', modulo: 'ventas',
      q: '¿Cómo hago tal cosa?',
      kw: ['palabras', 'que usaria', 'la gente', 'sinonimos'],
      a: 'La respuesta. Podés usar <b>negrita</b> y <br> para saltos de línea.',
      link: ['Ir a la pantalla', '/ruta'] },

Después reiniciá el sistema. (El navegador toma el cambio solo, sin que nadie borre el caché.)
Cuantos más sinónimos pongas en `kw`, mejor entiende cómo preguntan tus usuarios.

## Ver qué preguntan y el bot no supo responder

Entrando como administrador: `tu-sistema/api/ayuda/pendientes`
Muestra las preguntas más repetidas. Esas son las que conviene agregar a `ayuda-base.js`.

## Pendientes antes de mostrárselo a los usuarios

- Probá el asistente con el sistema abierto y compará 10-15 respuestas con lo que realmente ves en pantalla.
- Revisá cada respuesta en `ayuda-base.js` y corregí lo que no coincida con tu sistema.
- En la entrada `gen-soporte` completá tu WhatsApp / mail de soporte (hay un comentario marcando dónde).

## Mantenimiento

- Si cambiás o agregás una función en el sistema, actualizá la respuesta correspondiente en `ayuda-base.js`.
- Revisá cada tanto `/api/ayuda/pendientes`: las preguntas que más se repiten ahí son las que faltan agregar.
- Si ya tenías instalada una versión anterior, alcanza con reemplazar `ayuda-base.js` y reiniciar el sistema.
