/* ===== Livros da Bíblia (ordem canônica protestante, 66 livros) ===== */
const BOOKS = [
  ['Gênesis', 'Gn', 'Gen'], ['Êxodo', 'Êx', 'Exod'], ['Levítico', 'Lv', 'Lev'], ['Números', 'Nm', 'Num'], ['Deuteronômio', 'Dt', 'Deut'],
  ['Josué', 'Js', 'Josh'], ['Juízes', 'Jz', 'Judg'], ['Rute', 'Rt', 'Ruth'], ['1 Samuel', '1Sm', '1Sam'], ['2 Samuel', '2Sm', '2Sam'],
  ['1 Reis', '1Rs', '1Kgs'], ['2 Reis', '2Rs', '2Kgs'], ['1 Crônicas', '1Cr', '1Chr'], ['2 Crônicas', '2Cr', '2Chr'], ['Esdras', 'Ed', 'Ezra'],
  ['Neemias', 'Ne', 'Neh'], ['Ester', 'Et', 'Esth'], ['Jó', 'Jó', 'Job'], ['Salmos', 'Sl', 'Ps'], ['Provérbios', 'Pv', 'Prov'],
  ['Eclesiastes', 'Ec', 'Eccl'], ['Cantares', 'Ct', 'Song'], ['Isaías', 'Is', 'Isa'], ['Jeremias', 'Jr', 'Jer'], ['Lamentações', 'Lm', 'Lam'],
  ['Ezequiel', 'Ez', 'Ezek'], ['Daniel', 'Dn', 'Dan'], ['Oséias', 'Os', 'Hos'], ['Joel', 'Jl', 'Joel'], ['Amós', 'Am', 'Amos'],
  ['Obadias', 'Ob', 'Obad'], ['Jonas', 'Jn', 'Jonah'], ['Miquéias', 'Mq', 'Mic'], ['Naum', 'Na', 'Nah'], ['Habacuque', 'Hc', 'Hab'],
  ['Sofonias', 'Sf', 'Zeph'], ['Ageu', 'Ag', 'Hag'], ['Zacarias', 'Zc', 'Zech'], ['Malaquias', 'Ml', 'Mal'],
  ['Mateus', 'Mt', 'Matt'], ['Marcos', 'Mc', 'Mark'], ['Lucas', 'Lc', 'Luke'], ['João', 'Jo', 'John'], ['Atos', 'At', 'Acts'],
  ['Romanos', 'Rm', 'Rom'], ['1 Coríntios', '1Co', '1Cor'], ['2 Coríntios', '2Co', '2Cor'], ['Gálatas', 'Gl', 'Gal'], ['Efésios', 'Ef', 'Eph'],
  ['Filipenses', 'Fp', 'Phil'], ['Colossenses', 'Cl', 'Col'], ['1 Tessalonicenses', '1Ts', '1Thess'], ['2 Tessalonicenses', '2Ts', '2Thess'],
  ['1 Timóteo', '1Tm', '1Tim'], ['2 Timóteo', '2Tm', '2Tim'], ['Tito', 'Tt', 'Titus'], ['Filemom', 'Fm', 'Phlm'], ['Hebreus', 'Hb', 'Heb'],
  ['Tiago', 'Tg', 'Jas'], ['1 Pedro', '1Pe', '1Pet'], ['2 Pedro', '2Pe', '2Pet'], ['1 João', '1Jo', '1John'], ['2 João', '2Jo', '2John'],
  ['3 João', '3Jo', '3John'], ['Judas', 'Jd', 'Jude'], ['Apocalipse', 'Ap', 'Rev']
].map(([name, abbr, osis], i) => ({ id: i + 1, name, abbr, osis }));

/* Nomes dos livros em inglês e espanhol (páginas traduzidas e texto colado de outros apps) */
const BOOK_NAMES = {
  en: ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Songs','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'],
  es: ['Génesis','Éxodo','Levítico','Números','Deuteronomio','Josué','Jueces','Rut','1 Samuel','2 Samuel','1 Reyes','2 Reyes','1 Crónicas','2 Crónicas','Esdras','Nehemías','Ester','Job','Salmos','Proverbios','Eclesiastés','Cantares','Isaías','Jeremías','Lamentaciones','Ezequiel','Daniel','Oseas','Joel','Amós','Abdías','Jonás','Miqueas','Nahúm','Habacuc','Sofonías','Hageo','Zacarías','Malaquías','Mateo','Marcos','Lucas','Juan','Hechos','Romanos','1 Corintios','2 Corintios','Gálatas','Efesios','Filipenses','Colosenses','1 Tesalonicenses','2 Tesalonicenses','1 Timoteo','2 Timoteo','Tito','Filemón','Hebreos','Santiago','1 Pedro','2 Pedro','1 Juan','2 Juan','3 Juan','Judas','Apocalipsis'],
};
const BookIndex = (() => {
  const exact = new Map();      // chave com acento -> id
  const plain = new Map();      // chave sem acento -> id
  const norm = s => String(s).toLowerCase().replace(/[\s.]/g, '');
  const add = (k, id, accentOnly) => { const n = norm(k); if (!exact.has(n)) exact.set(n, id); const p = stripAccents(n); if (!accentOnly && !plain.has(p)) plain.set(p, id); };
  // Convenção brasileira: "Jó" = livro de Jó; "Jo" = João.
  add('jó', 18, true); add('job', 18); add('jo', 43);
  const extra = {
    1: ['gen', 'gên'], 2: ['ex', 'exo', 'êx', 'exodo'], 3: ['lev'], 4: ['num'], 5: ['deut', 'dt'], 6: ['jos', 'josue'], 7: ['juiz', 'jui'], 8: ['rut'],
    19: ['sal', 'salmo', 'sl', 'slm'], 20: ['prov', 'pr'], 21: ['ecl', 'ecles', 'coh'], 22: ['cant', 'cantico', 'canticos', 'cânticos', 'cantaresdesalomao', 'canticodoscanticos', 'ct'],
    23: ['isa'], 24: ['jer'], 25: ['lam'], 26: ['eze', 'ezeq'], 27: ['dan'], 28: ['ose', 'oseias'], 30: ['amo'], 31: ['oba', 'abd', 'abdias'], 32: ['jon'],
    33: ['miq', 'miqueias'], 35: ['hab'], 36: ['sof'], 37: ['age'], 38: ['zac'], 39: ['mal'],
    40: ['mat', 'mt'], 41: ['mar', 'mc', 'mr'], 42: ['luc', 'lc'], 43: ['joao', 'jo'], 44: ['at', 'atos', 'ato'], 45: ['rom', 'rm'], 48: ['gal'], 49: ['efe'],
    50: ['fil', 'filip', 'fl'], 51: ['col'], 56: ['tit'], 57: ['file', 'filem', 'filemon', 'filemon'], 58: ['heb'], 59: ['tia', 'tiag'], 65: ['jud'], 66: ['apoc', 'apo', 'ap', 'revelacao']
  };
  const numbered = { 9: ['sm', 'sam'], 10: ['sm', 'sam'], 11: ['rs', 'reis', 're'], 12: ['rs', 'reis', 're'], 13: ['cr', 'cron', 'crônicas'], 14: ['cr', 'cron', 'crônicas'],
    46: ['co', 'cor', 'corintios'], 47: ['co', 'cor', 'corintios'], 52: ['ts', 'tes', 'tess'], 53: ['ts', 'tes', 'tess'], 54: ['tm', 'tim'], 55: ['tm', 'tim'],
    60: ['pe', 'ped', 'pd'], 61: ['pe', 'ped', 'pd'], 62: ['jo', 'joao'], 63: ['jo', 'joao'], 64: ['jo', 'joao'] };
  for (const b of BOOKS) { add(b.name, b.id); add(b.abbr, b.id); add(b.osis, b.id); }
  // Nomes em inglês (texto colado do YouVersion e de outros apps)
  BOOK_NAMES.en.forEach((n, i) => { if (!exact.has(n.toLowerCase().replace(/[\s.]/g, ''))) add(n, i + 1); });
  BOOK_NAMES.es.forEach((n, i) => { if (!exact.has(norm(n)) && !plain.has(stripAccents(norm(n)))) add(n, i + 1); });
  add('psalm', 19); add('songofsolomon', 22);
  for (const [id, arr] of Object.entries(extra)) arr.forEach(k => add(k, +id));
  for (const [id, arr] of Object.entries(numbered)) { const n = BOOKS[id - 1].name[0]; arr.forEach(k => add(n + k, +id)); }
  function find(raw) {
    let s = String(raw).trim().toLowerCase();
    s = s.replace(/^(iii|ii|i)\s+/, m => ({ 'iii': '3', 'ii': '2', 'i': '1' }[m.trim()]))
      .replace(/^(primeira|primeiro|1ª|1º)\s+/, '1').replace(/^(segunda|segundo|2ª|2º)\s+/, '2').replace(/^(terceira|terceiro|3ª|3º)\s+/, '3');
    const n = norm(s);
    if (exact.has(n)) return exact.get(n);
    const p = stripAccents(n);
    if (plain.has(p)) return plain.get(p);
    if (p.length >= 3) { // prefixo do nome completo
      for (const b of BOOKS) if (stripAccents(norm(b.name)).startsWith(p)) return b.id;
    }
    return null;
  }
  return { find };
})();

/* Interpreta referências como "Jo 3:16-18", "1 Co 13", "Sl 23.1", "Rm 8:28,31" */
function parseRef(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^((?:[1-3]|i{1,3})?\s*[a-zà-ÿ][a-zà-ÿ.\s]*?)\s*(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?((?:\s*,\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?)*))?\s*$/i);
  if (!m) return null;
  const book = BookIndex.find(m[1]); if (!book) return null;
  const ch = +m[2];
  const ranges = [];
  if (m[3]) {
    ranges.push([+m[3], m[4] ? +m[4] : +m[3]]);
    if (m[5]) for (const part of m[5].split(',').map(x => x.trim()).filter(Boolean)) { const [a, b] = part.split(/[-–]/).map(x => +x.trim()); ranges.push([a, b || a]); }
  }
  return { book, ch, ranges };
}
function refLabel(r, lang) {
  if (!r) return '';
  const b = BOOKS[r.book - 1];
  let s = `${(lang && BOOK_NAMES[lang]?.[r.book - 1]) || b.name} ${r.ch}`;
  if (r.ranges && r.ranges.length) s += ':' + r.ranges.map(([a, z]) => a === z ? a : `${a}-${z}`).join(',');
  return s;
}
/* Encontra referências dentro de texto corrido (com dois-pontos/ponto, p.ex. "Jo 3:16") */
const REF_IN_TEXT = /(?:\b[1-3]\s?|\b(?:I{1,3})\s)?[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{1,16}\.?\s\d{1,3}[:.]\d{1,3}(?:\s?[-–]\s?\d{1,3})?(?:\s?,\s?\d{1,3}(?:[-–]\d{1,3})?)*/g;
