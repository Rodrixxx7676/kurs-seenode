# Imágenes del portafolio

Aquí van las capturas de los trabajos que se muestran en la sección
**Trabajos** de la portada (`/#trabajos`).

## Cómo añadir un trabajo

1. Guarda la imagen en esta carpeta, por ejemplo `barberia-luna.jpg`.
   - Proporción **4:3** (por ejemplo 1600×1200). Se recorta sola si no calza.
   - Formato `.jpg` o `.webp`. Pesa menos de 300 KB si puedes.
2. Abre `public/index.html`, busca la sección `id="trabajos"` y en la tarjeta
   que quieras cambia estas tres cosas:
   - `src="/images/trabajos/placeholder.svg"` → `src="/images/trabajos/barberia-luna.jpg"`
   - el `alt=""` → una descripción real de lo que se ve en la captura
   - el título, la etiqueta y el texto de la tarjeta
3. Si el trabajo tiene enlace público, pon la URL en el `href` de la tarjeta.
   Si no lo tiene, borra el `<a class="trabajo-link">…</a>` de esa tarjeta.

Para añadir **más** trabajos, copia un bloque `<article class="trabajo-card">`
entero y pégalo dentro de `<div class="trabajos-grid">`. La rejilla se acomoda
sola.

`placeholder.svg` es solo el marcador de posición: no lo borres mientras
queden tarjetas sin imagen propia.
