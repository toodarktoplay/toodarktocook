import data from '../data/recetas.json';

export const CATEGORIAS = ['Entradas', 'Main menu', 'Asiático', 'Masas', 'Salsas', 'Brunch', 'Juice', 'Postres'];

// Colores de la casa
export const C = {
  verde: '#34503A',
  tomate: '#E8573B',
  mostaza: '#EDB547',
  crema: '#F6EEDD',
  tinta: '#1E1B17',
};

const CARD_COLORS = [C.tomate, C.crema, C.mostaza, C.crema];

export function slugify(s) {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const recetas = [...data].sort((a, b) => b.date.localeCompare(a.date));

export function cardColor(i) {
  return CARD_COLORS[i % CARD_COLORS.length];
}

export function categoriasConRecetas() {
  return CATEGORIAS.filter((c) => recetas.some((r) => r.cats.includes(c)));
}

export function porCategoria(cat) {
  return recetas.filter((r) => r.cats.includes(cat));
}

export function serie() {
  return recetas.filter((r) => r.serie).sort((a, b) => (a.serieNum ?? 0) - (b.serieNum ?? 0));
}

export function destacada() {
  const s = serie();
  return s.length ? s[s.length - 1] : recetas[0];
}

// Agrupa los bloques en listas y separa ingredientes / pasos / resto
export function secciones(blocks) {
  const out = { intro: [], ingredientes: [], pasos: [], extra: [] };
  let actual = out.intro;
  let extraActual = null;
  for (const b of blocks) {
    if (b.t === 'h2') {
      if (/ingred/i.test(b.text)) {
        actual = out.ingredientes;
        continue;
      }
      if (/elabor|prepar|pasos|c[oó]mo/i.test(b.text)) {
        actual = out.pasos;
        continue;
      }
      extraActual = { title: b.text, items: [] };
      out.extra.push(extraActual);
      actual = extraActual.items;
      continue;
    }
    actual.push(b);
  }
  const estructurada = out.ingredientes.length > 0 && out.pasos.length > 0;
  return {
    estructurada,
    intro: agrupar(out.intro),
    ingredientes: agrupar(out.ingredientes),
    pasos: agrupar(out.pasos),
    extra: out.extra.map((e) => ({ title: e.title, items: agrupar(e.items) })),
    todo: agrupar(blocks),
  };
}

function agrupar(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.t === 'li' || b.t === 'oli') {
      const tipo = b.t === 'li' ? 'ul' : 'ol';
      const last = out[out.length - 1];
      if (last && last.t === tipo) last.items.push(b.text);
      else out.push({ t: tipo, items: [b.text] });
    } else {
      out.push(b);
    }
  }
  return out;
}
