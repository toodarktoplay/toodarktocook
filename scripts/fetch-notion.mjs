// Lee las recetas marcadas con "Publicar" en la base de datos Recipes de Notion
// y las guarda en src/data/recetas.json, que es lo que usa la web.
// Las fotos subidas a Notion se descargan a public/img/notion/ porque
// los enlaces de Notion caducan al cabo de un rato.
//
// Sin NOTION_TOKEN no hace nada y la web usa el recetas.json que ya hay.

import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
await loadDotEnv(path.join(root, '.env'));

const TOKEN = process.env.NOTION_TOKEN;
const DATA_SOURCE = process.env.NOTION_DATA_SOURCE_ID || '29d53bd9-551c-8124-bd05-000b40821807';
const DATABASE = process.env.NOTION_DATABASE_ID || '29d53bd9551c8104a660e4a5649a2bd4';
const OUT_JSON = path.join(root, 'src/data/recetas.json');
const IMG_DIR = path.join(root, 'public/img/notion');
const WP_DIR = path.join(root, 'public/img/wp');

if (!TOKEN) {
  console.log('[notion] Sin NOTION_TOKEN: uso las recetas que ya hay en src/data/recetas.json');
  process.exit(0);
}

let apiVersion = '2025-09-03';

async function notion(method, url, body) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch('https://api.notion.com/v1' + url, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Notion-Version': apiVersion,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      await sleep(1000 * (attempt + 1));
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`[notion] ${method} ${url} → ${res.status} ${json.message || ''}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }
  throw new Error('[notion] Demasiadas peticiones, inténtalo de nuevo');
}

async function queryAll() {
  const filter = { property: 'Publicar', checkbox: { equals: true } };
  const run = async (url) => {
    const pages = [];
    let cursor;
    do {
      const r = await notion('POST', url, { filter, page_size: 100, start_cursor: cursor });
      pages.push(...r.results);
      cursor = r.has_more ? r.next_cursor : undefined;
    } while (cursor);
    return pages;
  };
  try {
    return await run(`/data_sources/${DATA_SOURCE}/query`);
  } catch (e) {
    if (![400, 404].includes(e.status)) throw e;
    // API antigua: consulta por base de datos
    apiVersion = '2022-06-28';
    return await run(`/databases/${DATABASE}/query`);
  }
}

async function children(id) {
  const out = [];
  let cursor;
  do {
    const q = cursor ? `?page_size=100&start_cursor=${cursor}` : '?page_size=100';
    const r = await notion('GET', `/blocks/${id}/children${q}`);
    out.push(...r.results);
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor);
  return out;
}

const plain = (rt = []) => rt.map((t) => t.plain_text).join('').trim();

function slugify(s) {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function prop(page, name) {
  return page.properties?.[name];
}

function toBlocks(raw) {
  const blocks = [];
  let firstFileImage = null;
  const images = [];
  for (const b of raw) {
    const d = b[b.type];
    switch (b.type) {
      case 'heading_1':
      case 'heading_2':
        blocks.push({ t: 'h2', text: plain(d.rich_text).replace(/:$/, '') });
        break;
      case 'heading_3':
        blocks.push({ t: 'h3', text: plain(d.rich_text).replace(/:$/, '') });
        break;
      case 'bulleted_list_item':
      case 'to_do':
        blocks.push({ t: 'li', text: plain(d.rich_text) });
        break;
      case 'numbered_list_item':
        blocks.push({ t: 'oli', text: plain(d.rich_text) });
        break;
      case 'paragraph':
      case 'quote':
      case 'callout': {
        const text = plain(d.rich_text);
        if (!text) break;
        if (/^(ingredientes|preparaci[oó]n|elaboraci[oó]n|pasos):?$/i.test(text)) {
          blocks.push({ t: 'h2', text: text.replace(/:$/, '') });
        } else {
          blocks.push({ t: 'p', text });
        }
        break;
      }
      case 'image':
        if (!firstFileImage && d.type === 'file') firstFileImage = d.file.url;
        if (d.type === 'file' || d.type === 'external') {
          images.push({ url: d[d.type].url, caption: plain(d.caption) });
        }
        break;
      default:
        break;
    }
  }
  return { blocks, firstFileImage, images };
}

async function download(url, slug) {
  let ext = path.extname(new URL(url).pathname).toLowerCase();
  if (!/^\.(jpe?g|png|webp|gif|avif)$/.test(ext)) ext = '.jpg';
  const file = `${slug}${ext}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[notion] No pude bajar la foto de ${slug}`);
  await fs.writeFile(path.join(IMG_DIR, file), Buffer.from(await res.arrayBuffer()));
  return `/img/notion/${file}`;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.mkdir(IMG_DIR, { recursive: true });
  const pages = await queryAll();
  console.log(`[notion] ${pages.length} recetas marcadas para publicar`);

  const recetas = [];
  const used = new Set();
  for (const page of pages) {
    const title = plain(prop(page, 'Name')?.title);
    if (!title) continue;
    let slug = slugify(title);
    while (used.has(slug)) slug += '-2';
    used.add(slug);

    const { blocks, firstFileImage, images } = toBlocks(await children(page.id));

    // Foto: la que subas a Notion (portada o primera imagen) manda sobre la vieja de WordPress
    // Orden: portada de Notion (subida o enlazada) → primera foto subida dentro de la receta
    let photo = null;
    let fotoPrincipal = null;
    const coverUrl = page.cover ? page.cover[page.cover.type]?.url : null;
    for (const url of [coverUrl, firstFileImage]) {
      if (!url || photo) continue;
      try {
        photo = await download(url, slug);
        fotoPrincipal = url;
      } catch (e) {
        console.warn(e.message);
      }
    }
    if (!photo) {
      const wp = plain(prop(page, 'Foto WP')?.rich_text);
      if (wp) {
        const rel = wp.replace(/\.[a-z]+$/i, '.jpg');
        if (await exists(path.join(WP_DIR, rel))) photo = `/img/wp/${rel}`;
      }
    }

    // Resto de fotos de dentro de la receta: salen en la galería, debajo de los pasos.
    // La que ya se usa como foto principal no se repite.
    const gallery = [];
    for (const [i, img] of images.entries()) {
      if (img.url === fotoPrincipal) continue;
      try {
        gallery.push({ src: await download(img.url, `${slug}-${i + 1}`), caption: img.caption });
      } catch (e) {
        console.warn(e.message);
      }
    }

    recetas.push({
      id: page.id,
      slug,
      title,
      desc: plain(prop(page, 'Descripción corta')?.rich_text),
      cats: (prop(page, 'Categoría web')?.multi_select || []).map((o) => o.name),
      serie: prop(page, 'Serie')?.select?.name || null,
      serieNum: null,
      date: prop(page, 'Fecha original')?.date?.start || page.created_time.slice(0, 10),
      photo,
      gallery,
      blocks,
    });
  }

  // Número dentro de la serie, por orden de fecha
  const serie = recetas.filter((r) => r.serie).sort((a, b) => a.date.localeCompare(b.date));
  serie.forEach((r, i) => (r.serieNum = i + 1));

  recetas.sort((a, b) => b.date.localeCompare(a.date));
  await fs.writeFile(OUT_JSON, JSON.stringify(recetas, null, 1));
  console.log(`[notion] Guardadas ${recetas.length} recetas en src/data/recetas.json`);
}

async function loadDotEnv(file) {
  try {
    const txt = await fs.readFile(file, 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
