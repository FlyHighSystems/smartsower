/* ===== Bíblia: fontes, download, armazenamento offline e consulta ===== */
const GH = 'https://raw.githubusercontent.com/';
const BIBLE_SOURCES = [
  { id: 'blivre', short: 'BLIVRE', name: 'Bíblia Livre (Almeida 1819, rev. 2018)', license: 'CC BY 4.0 — © Diego Santos, Mario Sérgio e Marco Teles. Reprodução permitida com citação da fonte e dos autores.', open: true,
    urls: [GH + 'midvash/bible-data/main/versions/pt/almeida-livre/almeida-livre.json'],
    perBook: GH + 'midvash/bible-data/main/versions/pt/almeida-livre/books/{OSIS}.json' },
  { id: 'acf', short: 'ACF', name: 'Almeida Corrigida Fiel', license: '© Sociedade Bíblica Trinitariana do Brasil — somente uso pessoal.', urls: [GH + 'thiagobodruk/biblia/master/json/acf.json'] },
  { id: 'arc', short: 'ARC', name: 'Almeida Revista e Corrigida', license: '© Sociedade Bíblica do Brasil — somente uso pessoal.', urls: [GH + 'maatheusgois/bible/main/versions/pt-br/arc.json'] },
  { id: 'nvi', short: 'NVI', name: 'Nova Versão Internacional', license: '© Biblica, Inc. — somente uso pessoal.', urls: [GH + 'thiagobodruk/biblia/master/json/nvi.json'] },
  { id: 'web', short: 'WEB', lang: 'en', open: true, name: 'World English Bible — inglês moderno', license: 'Domínio público.', urls: [GH + 'midvash/bible-data/main/versions/en/web/web.json'], perBook: GH + 'midvash/bible-data/main/versions/en/web/books/{OSIS}.json' },
  { id: 'kjv', short: 'KJV', lang: 'en', open: true, name: 'King James Version — inglês clássico', license: 'Domínio público.', urls: [GH + 'midvash/bible-data/main/versions/en/kjv/kjv.json'], perBook: GH + 'midvash/bible-data/main/versions/en/kjv/books/{OSIS}.json' },
  { id: 'rvr', short: 'RVR', lang: 'es', name: 'Reina-Valera — espanhol', license: 'Reina-Valera (edição de domínio público disponível em thiagobodruk/bible) — use para estudo e ministração.', urls: [GH + 'thiagobodruk/bible/master/json/es_rvr.json'] },
  { id: 'aa', short: 'AA', name: 'Almeida Revisada Imprensa Bíblica', license: '© Imprensa Bíblica Brasileira — somente uso pessoal.', urls: [GH + 'thiagobodruk/biblia/master/json/aa.json'] },
];

/* Converte formatos conhecidos para: books[0..65] = [capítulo][versículo] = texto */
function normalizeBible(json) {
  if (json && json.format === 'pulpito-bible' && Array.isArray(json.books)) return json.books;
  const verseArr = verses => { const a = []; (verses || []).forEach((v, i) => { if (typeof v === 'string') a[i] = v; else if (v) a[(v.number || v.verse || i + 1) - 1] = v.text ?? v.t ?? ''; }); return a; };
  const chapArr = chapters => (chapters || []).map(c => Array.isArray(c) ? verseArr(c) : verseArr(c.verses));
  if (json && Array.isArray(json.books)) {           // midvash/bible-data e similares
    const out = new Array(66).fill(null);
    json.books.forEach((b, i) => { const id = b.bookId || b.id || (i + 1); if (id >= 1 && id <= 66) out[id - 1] = chapArr(b.chapters); });
    if (out.some(Boolean)) return out;
  }
  if (Array.isArray(json) && json.length && json[0] && json[0].chapters) { // thiagobodruk/biblia e similares
    return json.slice(0, 66).map(b => chapArr(b.chapters));
  }
  if (json && json.book && json.chapters) return null; // arquivo de um único livro (tratado à parte)
  throw new Error('Formato de Bíblia não reconhecido');
}

const Bible = {
  cache: {}, installed: [],
  async init() { this.installed = (await DB.get('kv', 'bibles')) || []; BiblePane.refreshVersions(); },
  has(id) { return this.installed.some(b => b.id === id); },
  current() { const v = App.meta.bibleVersion; if (v && this.has(v)) return v; return this.installed[0]?.id || null; },
  info(id) { return this.installed.find(b => b.id === id) || BIBLE_SOURCES.find(b => b.id === id); },
  async load(id) {
    if (!id) return null;
    if (this.cache[id]) return this.cache[id];
    const d = await DB.get('bibles', id); if (d) this.cache[id] = d.books; return this.cache[id] || null;
  },
  async fetchJSON(url, onProgress) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = +res.headers.get('content-length') || 0;
    let text;
    if (res.body && onProgress) {
      const reader = res.body.getReader(); const chunks = []; let got = 0;
      for (; ;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(total ? got / total : null, got); }
      text = new TextDecoder('utf-8').decode(await new Blob(chunks).arrayBuffer());
    } else text = await res.text();
    return JSON.parse(text.replace(/^﻿/, ''));
  },
  async download(src, onProgress) {
    let books = null, lastErr;
    for (const url of src.urls) {
      try { books = normalizeBible(await this.fetchJSON(url, onProgress)); if (books) break; } catch (e) { lastErr = e; console.warn(url, e); }
    }
    if (!books && src.perBook) { // alternativa: livro por livro
      books = new Array(66).fill(null);
      for (const b of BOOKS) {
        onProgress && onProgress(b.id / 66, 0, b.name);
        try { const j = await this.fetchJSON(src.perBook.replace('{OSIS}', b.osis)); books[b.id - 1] = normalizeBible({ books: [{ bookId: b.id, chapters: j.chapters }] })[b.id - 1]; } catch (e) { lastErr = e; }
      }
      if (!books.some(Boolean)) books = null;
    }
    if (!books) throw lastErr || new Error('Falha no download');
    await this.store({ id: src.id, short: src.short, name: src.name, license: src.license }, books);
  },
  async store(info, books) {
    await DB.put('bibles', info.id, { ...info, books });
    this.cache[info.id] = books;
    this.installed = this.installed.filter(b => b.id !== info.id).concat([{ ...info, verses: books.reduce((n, b) => n + (b ? b.reduce((m, c) => m + c.length, 0) : 0), 0) }]);
    await DB.put('kv', 'bibles', this.installed);
    if (!App.meta.bibleVersion) { App.meta.bibleVersion = info.id; App.saveMeta(); }
    BiblePane.refreshVersions();
    App.fillMissingVerses();
  },
  async importFile(file) {
    const json = JSON.parse((await file.text()).replace(/^﻿/, ''));
    const books = normalizeBible(json);
    if (!books) throw new Error('Arquivo contém só um livro; use um arquivo da Bíblia completa.');
    const base = file.name.replace(/\.json$/i, '');
    const name = (await UI.ask('Nome desta versão', json.name || base)) || base;
    const short = (await UI.ask('Sigla', (json.abbreviation || base).toUpperCase().slice(0, 8))) || base.toUpperCase().slice(0, 8);
    await this.store({ id: 'u-' + stripAccents(short).toLowerCase().replace(/\W/g, ''), short, name, license: 'Importada pelo usuário' }, books);
  },
  async remove(id) {
    await DB.del('bibles', id); delete this.cache[id];
    this.installed = this.installed.filter(b => b.id !== id); await DB.put('kv', 'bibles', this.installed);
    if (App.meta.bibleVersion === id) { App.meta.bibleVersion = this.installed[0]?.id || null; App.saveMeta(); }
    BiblePane.refreshVersions();
  },
  /* Retorna {label, verses:[[n, texto]]} */
  async lookup(refStr, version) {
    const r = typeof refStr === 'string' ? parseRef(refStr) : refStr;
    if (!r) return { error: 'Referência não reconhecida' };
    version = version || this.current();
    const books = await this.load(version);
    if (!books) return { error: 'Nenhuma Bíblia baixada', r };
    const ch = books[r.book - 1]?.[r.ch - 1];
    if (!ch) return { error: 'Capítulo não encontrado nesta versão', r };
    const verses = [];
    const ranges = r.ranges.length ? r.ranges : [[1, ch.length]];
    for (const [a, z] of ranges) for (let v = a; v <= Math.min(z, ch.length); v++) if (ch[v - 1] != null) verses.push([v, ch[v - 1]]);
    if (!verses.length) return { error: 'Versículo não encontrado', r };
    return { label: refLabel(r, typeof App !== 'undefined' ? App.cur?.lang : null), verses, r, version };
  },
  versesHTML(verses) { return verses.length === 1 ? esc(verses[0][1]) : verses.map(([n, t]) => `<sup>${n}</sup>${esc(t)}`).join(' '); },
  async search(q, version, limit = 300) {
    const books = await this.load(version || this.current()); if (!books) return [];
    const nq = stripAccents(q.toLowerCase()); const out = [];
    for (let b = 0; b < 66 && out.length < limit; b++) {
      const bk = books[b]; if (!bk) continue;
      for (let c = 0; c < bk.length && out.length < limit; c++) for (let v = 0; v < bk[c].length; v++) {
        const t = bk[c][v]; if (t && stripAccents(t.toLowerCase()).includes(nq)) { out.push({ book: b + 1, ch: c + 1, v: v + 1, t }); if (out.length >= limit) break; }
      }
    }
    return out;
  },
  // Busca por frase ou palavras (sem acento, qualquer ordem). Frase exata vem primeiro.
  async searchWords(q, version, limit = 120) {
    const books = await this.load(version || this.current()); if (!books) return null;
    const norm = t => stripAccents(String(t).toLowerCase()).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const nq = norm(q), words = nq.split(' ').filter(w => w.length > 1 || nq.length <= 2); if (!nq) return [];
    const exact = [], loose = [];
    for (let b = 0; b < 66; b++) {
      const bk = books[b]; if (!bk) continue;
      for (let c = 0; c < bk.length; c++) for (let v = 0; v < bk[c].length; v++) {
        const t = bk[c][v]; if (!t) continue; const n = ' ' + norm(t) + ' ';
        if (n.includes(nq)) { if (exact.length < limit) exact.push({ book: b + 1, ch: c + 1, v: v + 1, t, exact: true }); }
        else if (words.length > 1 && loose.length < limit && words.every(w => n.includes(w))) loose.push({ book: b + 1, ch: c + 1, v: v + 1, t });
      }
    }
    return Object.assign(exact.concat(loose).slice(0, limit), { total: exact.length + loose.length, words, exactCount: exact.length });
  },
  // marca as palavras buscadas no texto (ignora acentos)
  highlight(text, words) {
    let h = esc(text); if (!words?.length) return h;
    const plain = stripAccents(h.toLowerCase()); const marks = [];
    for (const w of words) { const ww = stripAccents(w); let i = 0; while ((i = plain.indexOf(ww, i)) >= 0) { marks.push([i, i + ww.length]); i += ww.length; } }
    marks.sort((a, b) => a[0] - b[0]); let out = '', last = 0;
    for (const [a, z] of marks) { if (a < last) continue; out += h.slice(last, a) + '<mark>' + h.slice(a, z) + '</mark>'; last = z; }
    return out + h.slice(last);
  }
};

/* ===== Painel lateral da Bíblia ===== */
const BiblePane = {
  sel: new Set(), lastClick: null,
  open() { $('#bible-pane').hidden = false; document.body.classList.add('bible-open'); this.render(); },
  close() { $('#bible-pane').hidden = true; document.body.classList.remove('bible-open'); },
  toggle() { $('#bible-pane').hidden ? this.open() : this.close(); },
  refreshVersions() {
    const s = $('#bp-version'); if (!s) return;
    const cur = Bible.current();
    s.innerHTML = Bible.installed.map(b => `<option value="${b.id}" ${b.id === cur ? 'selected' : ''}>${esc(b.short)} — ${esc(b.name)}</option>`).join('') || '<option value="">(nenhuma versão)</option>';
    $$('.verse-version').forEach(sel => App.fillVersionSelect(sel, sel.value));
    if (!$('#bible-pane').hidden) this.render();
  },
  async render() {
    const box = $('#bp-verses'); const ver = Bible.current();
    $('#bp-attrib').textContent = ver ? (Bible.info(ver)?.license || '') : '';
    if (!ver) {
      box.innerHTML = '';
      box.append(el('div', { class: 'bp-empty' },
        el('p', { text: 'Nenhuma Bíblia instalada neste dispositivo.' }),
        el('button', { class: 'btn primary', text: 'Baixar Bíblia Livre (≈4 MB)', onclick: () => BibleManager.downloadOne(BIBLE_SOURCES[0]) }),
        el('p', { class: 'muted', text: 'Depois do download ela funciona offline.' }),
        el('button', { class: 'btn', text: 'Outras versões…', onclick: () => BibleManager.open() })));
      return;
    }
    const bs = $('#bp-book'), cs = $('#bp-chapter');
    const books = await Bible.load(ver);
    const nav = App.meta.bibleNav ||= { book: 43, ch: 3 };
    if (!bs.options.length) bs.innerHTML = BOOKS.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
    bs.value = nav.book;
    const bk = books[nav.book - 1] || [];
    cs.innerHTML = bk.map((_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
    cs.value = Math.min(nav.ch, bk.length || 1);
    const ch = bk[nav.ch - 1] || [];
    box.innerHTML = '';
    if (!ch.length) { box.append(el('p', { class: 'muted pad', text: 'Este livro não está nesta versão.' })); return; }
    box.append(el('h4', { class: 'bp-title', text: `${BOOKS[nav.book - 1].name} ${nav.ch}` }));
    ch.forEach((t, i) => {
      if (t == null) return;
      const v = i + 1;
      const row = el('div', { class: 'bp-v' + (this.sel.has(v) ? ' sel' : ''), 'data-v': v }, el('sup', { text: v }), document.createTextNode(' ' + t));
      row.addEventListener('click', e => this.toggleVerse(v, e.shiftKey));
      box.append(row);
    });
    if (nav.v) { const r = box.querySelector(`[data-v="${nav.v}"]`); r && r.scrollIntoView({ block: 'center' }); nav.v = null; }
    this.updateActions();
  },
  toggleVerse(v, shift) {
    if (shift && this.lastClick) { const [a, b] = [Math.min(this.lastClick, v), Math.max(this.lastClick, v)]; for (let i = a; i <= b; i++) this.sel.add(i); }
    else this.sel.has(v) ? this.sel.delete(v) : this.sel.add(v);
    this.lastClick = v;
    $$('#bp-verses .bp-v').forEach(r => r.classList.toggle('sel', this.sel.has(+r.dataset.v)));
    this.updateActions();
  },
  selectionRef() {
    if (!this.sel.size) return null;
    const vs = [...this.sel].sort((a, b) => a - b); const ranges = [];
    for (const v of vs) { const l = ranges[ranges.length - 1]; if (l && v === l[1] + 1) l[1] = v; else ranges.push([v, v]); }
    const nav = App.meta.bibleNav; return { book: nav.book, ch: nav.ch, ranges };
  },
  updateActions() { const r = this.selectionRef(); $('#bp-insert').disabled = !r; $('#bp-copy').disabled = !r; $('#bp-study').disabled = !r; $('#bp-sel-label').textContent = r ? refLabel(r) : 'Toque nos versículos para selecionar'; },
  go(book, ch, v) { App.meta.bibleNav = { book, ch, v }; this.sel.clear(); if (v) this.sel.add(v); App.saveMeta(); this.render(); },
  async insert() {
    const r = this.selectionRef(); if (!r) return;
    const res = await Bible.lookup(r);
    if (res.error) return UI.toast(res.error);
    App.insertBlock('verse', { ref: res.label, version: res.version, html: Bible.versesHTML(res.verses) });
    UI.toast('Versículo inserido: ' + res.label);
  },
  async copy() {
    const r = this.selectionRef(); const res = await Bible.lookup(r); if (res.error) return;
    const txt = `${res.verses.map(([n, t]) => (res.verses.length > 1 ? n + ' ' : '') + t).join(' ')} (${res.label} ${Bible.info(res.version).short})`;
    try { await navigator.clipboard.writeText(txt); UI.toast('Copiado'); } catch (e) { UI.toast('Não foi possível copiar'); }
  },
  async searchBox(q) {
    q = q.trim(); if (!q) return;
    const r = parseRef(q);
    if (r) { this.go(r.book, r.ch, r.ranges[0]?.[0]); if (r.ranges.length) { this.sel.clear(); for (const [a, z] of r.ranges) for (let v = a; v <= z; v++) this.sel.add(v); this.render(); } return; }
    const box = $('#bp-verses'); box.innerHTML = '<p class="muted pad">Pesquisando…</p>';
    const res = await Bible.search(q);
    box.innerHTML = '';
    box.append(el('h4', { class: 'bp-title', text: `${res.length >= 300 ? '300+' : res.length} resultado(s) para “${q}”` }));
    const rx = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
    for (const it of res) {
      const row = el('div', { class: 'bp-v' }, el('b', { text: `${BOOKS[it.book - 1].abbr} ${it.ch}:${it.v} ` }));
      row.insertAdjacentHTML('beforeend', esc(it.t).replace(rx, '<mark>$1</mark>'));
      row.addEventListener('click', () => this.go(it.book, it.ch, it.v));
      box.append(row);
    }
  },
  bind() {
    $('#bp-close').onclick = () => this.close();
    $('#bp-version').onchange = e => { App.meta.bibleVersion = e.target.value; App.saveMeta(); this.render(); };
    $('#bp-book').onchange = e => this.go(+e.target.value, 1);
    $('#bp-chapter').onchange = e => this.go(App.meta.bibleNav.book, +e.target.value);
    $('#bp-prev').onclick = () => { const n = App.meta.bibleNav; if (n.ch > 1) this.go(n.book, n.ch - 1); else if (n.book > 1) this.go(n.book - 1, 999); };
    $('#bp-next').onclick = async () => { const n = App.meta.bibleNav; const books = await Bible.load(Bible.current()); const len = books?.[n.book - 1]?.length || 1; if (n.ch < len) this.go(n.book, n.ch + 1); else if (n.book < 66) this.go(n.book + 1, 1); };
    $('#bp-search').onkeydown = e => { if (e.key === 'Enter') this.searchBox(e.target.value); };
    $('#bp-go').onclick = () => this.searchBox($('#bp-search').value);
    $('#bp-insert').onclick = () => this.insert();
    $('#bp-copy').onclick = () => this.copy();
    $('#bp-study').onclick = () => { const r = this.selectionRef(); if (r) StrongUI.open(r); };
    $('#bp-manage').onclick = () => BibleManager.open();
  }
};
// Ajusta capítulo 999 (= último)
const _go = BiblePane.go.bind(BiblePane);
BiblePane.go = async function (book, ch, v) {
  if (ch === 999) { const b = await Bible.load(Bible.current()); ch = b?.[book - 1]?.length || 1; }
  _go(book, ch, v);
};

/* ===== Gerenciador de versões ===== */
const BibleManager = {
  open() {
    const body = el('div', { class: 'bm' });
    const draw = () => {
      body.innerHTML = '';
      body.append(el('p', { class: 'muted', text: 'As versões ficam guardadas neste dispositivo e funcionam offline. Versões marcadas “uso pessoal” têm direitos autorais: use-as só para você e sua equipe.' }));
      for (const s of BIBLE_SOURCES) {
        const inst = Bible.has(s.id);
        body.append(el('div', { class: 'bm-row' },
          el('div', {}, el('b', { text: `${s.short} — ${s.name}` }), s.open ? el('span', { class: 'pill ok', text: 'licença livre' }) : el('span', { class: 'pill', text: 'uso pessoal' }), el('div', { class: 'muted small', text: s.license })),
          inst ? el('button', { class: 'btn', text: 'Remover', onclick: async () => { await Bible.remove(s.id); draw(); } })
            : el('button', { class: 'btn primary', text: 'Baixar', onclick: async () => { await this.downloadOne(s); draw(); } })));
      }
      for (const u of Bible.installed.filter(b => b.id.startsWith('u-'))) {
        body.append(el('div', { class: 'bm-row' }, el('div', {}, el('b', { text: `${u.short} — ${u.name}` }), el('div', { class: 'muted small', text: 'Importada de arquivo' })),
          el('button', { class: 'btn', text: 'Remover', onclick: async () => { await Bible.remove(u.id); draw(); } })));
      }
      body.append(el('div', { class: 'bm-row' }, el('div', {}, el('b', { text: 'Importar arquivo JSON' }), el('div', { class: 'muted small', text: 'Aceita os formatos do bible-data (midvash), thiagobodruk/biblia e semelhantes.' })),
        el('button', { class: 'btn', text: 'Escolher arquivo…', onclick: async () => { const [f] = await pickFiles('.json,application/json'); if (!f) return; try { await Bible.importFile(f); UI.toast('Versão importada'); draw(); } catch (e) { UI.toast(e.message); } } })));
    };
    draw();
    UI.modal({ title: 'Versões da Bíblia', body, wide: true });
  },
  async downloadOne(src) {
    const bar = el('div', { class: 'progress' }, el('div'));
    const label = el('p', { class: 'muted', text: 'Conectando…' });
    const m = UI.modal({ title: 'Baixando ' + src.short, body: el('div', {}, label, bar) });
    try {
      await Bible.download(src, (frac, bytes, bookName) => {
        if (frac != null) bar.firstChild.style.width = (frac * 100).toFixed(0) + '%';
        label.textContent = bookName ? 'Baixando ' + bookName + '…' : (bytes ? (bytes / 1048576).toFixed(1) + ' MB recebidos' : 'Baixando…');
      });
      m.close(); UI.toast(src.short + ' instalada — disponível offline');
    } catch (e) {
      m.close();
      UI.modal({ title: 'Não foi possível baixar', body: `<p>${esc(e.message)}</p><p class="muted">Verifique a internet. Se o problema continuar, baixe o arquivo JSON da versão no computador e use <b>Importar arquivo JSON</b>.</p>`, actions: [{ label: 'OK', primary: true }] });
    }
  }
};
