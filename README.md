# Too Dark to Cook

Web de recetas de Salva. Las recetas se escriben en Notion (base de datos **Recipes**) y la web se construye sola a partir de ahí.

- **Web:** [Astro](https://astro.build), estática.
- **Contenido:** Notion. Solo salen las recetas con la casilla **Publicar** marcada.
- **Alojamiento:** Vercel.

## Probarla en Codespaces

1. Abre el repo en Codespaces (botón verde **Code** › Codespaces).
2. Crea el archivo `.env` copiando `.env.example` y pega tu clave de Notion en `NOTION_TOKEN`.
   El `.env` nunca se sube a GitHub.
3. En la terminal:

   ```bash
   npm install
   npm run dev
   ```

4. Codespaces te ofrece abrir el puerto 4321: ahí está la web.

Sin `.env` también arranca: usa las recetas guardadas en `src/data/recetas.json`.

## Cómo funciona

- `scripts/fetch-notion.mjs` lee Notion, convierte cada receta y la guarda en `src/data/recetas.json`.
  Se ejecuta solo antes de `npm run dev` y `npm run build`. También a mano: `npm run notion`.
- **Fotos:**
  1. La portada de la receta en Notion (subida o enlazada). Si no tiene, la primera foto subida dentro de la receta.
  2. Si no, se usa la foto antigua de WordPress (`public/img/wp/`, a partir del campo **Foto WP**).
  3. Si no hay ninguna, sale un hueco de "Foto pendiente".
  4. El resto de fotos que pongas dentro de la receta en Notion salen en una galería **Fotos**, debajo de los pasos (con su pie de foto, si tiene).
- **Estructura de una receta en Notion:** un título `## Ingredientes` con una lista, y un título `## Elaboración` (o `Preparación` / `Pasos`) con una lista.
  Cualquier otro título `##` (por ejemplo "Lo que aprendí haciéndola") sale como tarjeta aparte.
  Si una receta no tiene esa estructura, se muestra como texto corrido.

## Campos de Notion que usa la web

| Campo | Para qué |
| --- | --- |
| Name | Título |
| Publicar | Si está marcado, sale en la web |
| Categoría web | Categorías (Entradas, Main menu, Masas…) |
| Serie | "Cocina curiosa": sale en la serie con su número |
| Descripción corta | Frase de la portada y de Google |
| Fecha original | Orden de las recetas (si está vacía, se usa la fecha de creación) |
| Foto WP | Foto antigua de WordPress |

## Publicar en Vercel

1. En Vercel: **Add New › Project** › importa `toodarktocook`. Detecta Astro solo.
2. En **Environment Variables** añade `NOTION_TOKEN` con tu clave.
3. **Deploy**.

### Que se actualice sola

1. En Vercel › proyecto › **Settings › Git › Deploy Hooks**: crea uno (nombre `notion`, rama `main`) y copia la URL.
2. En GitHub › repo › **Settings › Secrets and variables › Actions** › **New repository secret**: nombre `VERCEL_DEPLOY_HOOK`, valor la URL.
3. Listo: la web se reconstruye cada noche. Para publicar al momento: GitHub › **Actions** › **Publicar web** › **Run workflow**.
