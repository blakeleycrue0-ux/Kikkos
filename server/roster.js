// Importa una plantilla pegada como texto (formato típico de acta: «7  APELLIDOS, NOMBRE»).
const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'van', 'von', 'da', 'di', 'el', 'y']);

function titleCase(w) {
  return w.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

/** «GONZALEZ VAN LOENEN, SAVANNAH» -> «Savannah Gonzalez» */
export function displayName(full) {
  const clean = full.replace(/\s+/g, ' ').trim();
  const i = clean.indexOf(',');
  if (i < 0) return titleCase(clean);
  const surnames = clean.slice(0, i).trim().split(' ');
  const given = clean.slice(i + 1).trim().split(' ')[0] || '';
  const first = [];
  for (const w of surnames) {
    first.push(w);
    if (!PARTICLES.has(w.toLowerCase())) break;
  }
  return titleCase(`${given} ${first.join(' ')}`.trim());
}

export function parseRoster(text) {
  const roster = [];
  const staff = {};
  let section = 'sub';
  const seen = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}️]/gu, '').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (/^titulares\b/i.test(line)) { section = 'starter'; continue; }
    if (/^suplentes\b/i.test(line)) { section = 'sub'; continue; }
    if (/^sustituciones\b/i.test(line)) break; // lo que sigue son cambios del partido, no jugadoras
    let m;
    if ((m = /^entrenador(?:a)?\s*:\s*(.+)$/i.exec(line))) { staff.coach = displayName(m[1]); continue; }
    if ((m = /^(?:del\.?\s*equipo|delegad[oa](?:\s+de\s+equipo)?)\s*:\s*(.+)$/i.exec(line))) { staff.delegate = displayName(m[1]); continue; }
    if ((m = /^(\d{1,3})[\s.\t;:-]+(.+)$/.exec(line))) {
      if (/\(\d+'?\)/.test(m[2])) continue; // «(61') NOMBRE»: línea de un cambio
      const number = m[1];
      if (seen.has(number)) continue;
      seen.add(number);
      const full = m[2].replace(/[×✕✖]/g, '').trim().toUpperCase();
      roster.push({ number, full, name: displayName(full), starter: section === 'starter' });
    }
  }
  roster.sort((a, b) => Number(a.number) - Number(b.number));
  return { roster, staff };
}
