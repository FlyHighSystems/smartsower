/* ===================================================================
   MODO LIVRO — cadernos do tipo "livro": partes (seções), capítulos (páginas),
   trechos (subpáginas), metas de palavras, situação, quadro, notas de rodapé,
   referências ABNT, exportação do manuscrito, acervo dos sermões, histórico.
   =================================================================== */
const BOOK_STATUS = [['ideia', 'Ideia', '#8a8886'], ['rascunho', 'Rascunho', '#c25e00'], ['revisando', 'Revisando', '#0f6cbd'], ['pronto', 'Pronto', '#107c10']];
/* tipos de página do livro: [id, rótulo, onde fica no livro] — 'plan' não entra no manuscrito */
const BOOK_KINDS = [['capitulo', 'Capítulo', 'body'], ['roteiro', 'Roteiro', 'plan'], ['prefacio', 'Prefácio', 'front'], ['apresentacao', 'Apresentação', 'front'], ['nota', 'Nota do autor', 'front'],
  ['introducao', 'Introdução', 'body'], ['conclusao', 'Conclusão', 'back'], ['posfacio', 'Posfácio', 'back'], ['apendice', 'Apêndice', 'back']];
/* tipos de parte (seções do livro) */
const PART_KINDS = [['parte', 'Parte', '📚', 'Agrupa capítulos e ganha página própria (“Parte I — …”)'], ['front', 'Abertura', '✒️', 'Prefácio, apresentação, introdução: antes dos capítulos, sem número'],
  ['back', 'Encerramento', '📎', 'Conclusão, posfácio, apêndices: depois dos capítulos, sem número'], ['plan', 'Planejamento', '🧭', 'Roteiros, pesquisa, rascunhos soltos: não vai para o manuscrito']];
const ROMAN = n => { const v = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let o = ''; for (const [k, r] of v) while (n >= k) { o += r; n -= k; } return o; };
const fmtN = n => (n || 0).toLocaleString('pt-BR');

const Book = {
  nbOf(secId) { const sec = App.meta.sections.find(x => x.id === secId); return sec && App.meta.notebooks.find(n => n.id === sec.nb); },
  isNb(nb) { return nb?.kind === 'book'; },
  is(s) { return !!s && this.isNb(this.nbOf(s.sec)); },
  cur() { const nb = App.meta.notebooks.find(n => n.id === App.meta.currentNb); return this.isNb(nb) ? nb : null; },
  info(nb) { nb.book ||= {}; const b = nb.book; b.subtitle ??= ''; b.author ??= ''; b.goal ??= 50000; b.dedication ??= ''; b.epigraph ??= ''; b.epigraphRef ??= ''; b.copyright ??= ''; b.about ??= ''; b.thanks ??= ''; b.refs ||= []; return b; },
  parts(nb) { return App.meta.sections.filter(x => x.nb === nb.id); },
  secKind(sec) { return sec?.kind || 'parte'; },
  realParts(nb) { return this.parts(nb).filter(p => this.secKind(p) === 'parte'); },
  partMenu(anchor) {
    $('.mk-menu')?.remove(); const nb = this.cur(); if (!nb) return;
    const box = el('div', { class: 'mk-menu bk-kinds' }, el('div', { class: 'muted small', style: { padding: '4px 10px' }, text: 'Nova parte do livro:' }),
      ...PART_KINDS.map(([id, label, ic, tip]) => el('button', { class: 'mk-item', title: tip, onclick: async () => {
        box.remove(); const n = await UI.ask('Nova ' + label.toLowerCase(), id === 'parte' ? '' : label, id === 'parte' ? 'Ex.: A semente' : ''); if (!n) return;
        const sec = { id: uid(), nb: nb.id, name: n, color: '#8e562e', kind: id };
        /* abertura entra antes das outras partes; o resto, no fim */
        if (id === 'front') { const i = App.meta.sections.findIndex(x => x.nb === nb.id); App.meta.sections.splice(i < 0 ? App.meta.sections.length : i, 0, sec); } else App.meta.sections.push(sec);
        App.meta.currentSec = sec.id; App.saveMeta(); App.renderNav(); } },
        el('span', { class: 'bk-ki', text: ic }), el('span', { class: 'mk-l' }, el('b', { text: label }), el('div', { class: 'muted small', text: tip })))));
    document.body.append(box); const r = anchor.getBoundingClientRect();
    box.style.left = Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, r.left)) + 'px'; box.style.top = Math.min(innerHeight - box.offsetHeight - 8, r.bottom + 4) + 'px';
    setTimeout(() => { const off = e => { if (!box.contains(e.target)) { box.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
  },
  secBadge(sec) {
    if (!this.isNb(App.meta.notebooks.find(n => n.id === sec.nb))) return null;
    const k = this.secKind(sec); if (k === 'parte') { const i = this.realParts(App.meta.notebooks.find(n => n.id === sec.nb)).indexOf(sec); return el('span', { class: 'sec-kind', title: 'Parte numerada', text: ROMAN(i + 1) }); }
    const K = PART_KINDS.find(x => x[0] === k); return el('span', { class: 'sec-kind', title: K[3], text: K[2] });
  },
  /* todos os capítulos em ordem, com número (só os de primeiro nível) */
  chapters(nb) {
    const out = []; let n = 0;
    for (const part of this.parts(nb)) { let parent = null; for (const s of App.sectionSermons(part.id)) {
      const top = !(s.level > 0); if (top) parent = s; const kind = this.kind(s), pk = this.secKind(part);
      const plan = pk === 'plan' || kind === 'roteiro' || (!top && parent && this.kind(parent) === 'roteiro');
      out.push({ part, s, top, kind, plan, num: top && kind === 'capitulo' && pk === 'parte' && !plan ? ++n : null }); } }
    return out;
  },
  numOf(s) { const nb = this.nbOf(s.sec); return nb ? this.chapters(nb).find(c => c.s.id === s.id)?.num : null; },
  plain(s) {
    return s.blocks.filter(b => b.type !== 'ink' && b.type !== 'image').map(b => htmlToText(b.html || '')).join('\n');
  },
  words(s) { return (this.plain(s).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length; },
  bookWords(nb) { return this.chapters(nb).filter(c => !c.plan).reduce((n, c) => n + this.words(c.s), 0); },
  kind(s) { return this.meta(s).kind || 'capitulo'; },
  kindLabel(s) { return (BOOK_KINDS.find(k => k[0] === this.kind(s)) || BOOK_KINDS[0])[1]; },
  /* menu do ＋ no livro: escolher o tipo da página */
  addMenu(anchor) {
    $('.mk-menu')?.remove();
    const box = el('div', { class: 'mk-menu bk-kinds' }, el('div', { class: 'muted small', style: { padding: '4px 10px' }, text: 'Nova página do livro:' }),
      ...BOOK_KINDS.map(([id, label, where]) => el('button', { class: 'mk-item', onclick: () => { box.remove(); this.newPage(id); } },
        el('span', { class: 'bk-ki', text: { capitulo: '📄', roteiro: '🧭', prefacio: '✒️', apresentacao: '🤝', nota: '📝', introducao: '🚪', conclusao: '🏁', posfacio: '🕊️', apendice: '📎' }[id] }),
        el('span', { class: 'mk-l', text: label }), el('kbd', { text: where === 'plan' ? 'não vai para o livro' : where === 'front' ? 'antes dos capítulos' : where === 'back' ? 'depois dos capítulos' : '' }))));
    document.body.append(box); const r = anchor.getBoundingClientRect();
    box.style.left = Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, r.left)) + 'px'; box.style.top = (r.bottom + 4) + 'px';
    setTimeout(() => { const off = e => { if (!box.contains(e.target)) { box.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
  },
  newPage(kind = 'capitulo') {
    const label = (BOOK_KINDS.find(k => k[0] === kind) || BOOK_KINDS[0])[1];
    const data = { ...this.blankChapter(), title: kind === 'capitulo' ? 'Novo capítulo' : kind === 'roteiro' ? 'Roteiro do livro' : label };
    data.book = { ...data.book, kind, status: kind === 'roteiro' ? 'ideia' : 'rascunho' };
    if (kind === 'roteiro') {
      const B = (type, html) => ({ id: uid(), type, html });
      data.blocks = [B('subhead', 'Tese central'), B('text', '<i>A ideia do livro numa frase.</i>'), B('subhead', 'Para quem é'), B('text', ''), B('subhead', 'Promessa ao leitor'), B('text', '<i>O que o leitor vai ter/ser/fazer ao terminar.</i>'),
        B('subhead', 'Capítulos'), B('text', '<ol><li>Título do capítulo — do que ele trata</li><li>Título do capítulo — do que ele trata</li></ol>'), B('subhead', 'Ilustrações e histórias guardadas'), B('text', '')];
    }
    App.newSermon(data);
  },
  /* ✦ resumo do capítulo pela IA (quando você terminar de escrever) */
  async aiSynopsis(s, syn, fit, btn) {
    const prov = AI.has('claude') ? 'claude' : AI.has('gemini') ? 'gemini' : null;
    if (!prov) return UI.toast('Configure a chave da IA em ✦ Revisar › ⚙ Chaves e modelos.');
    const text = s.blocks.filter(b => b.type !== 'ink' && b.type !== 'image').map(b => (b.type === 'subhead' ? '## ' : b.type === 'verse' ? '> ' : '') + htmlToText(b.html || '') + (b.type === 'verse' && b.ref ? ` (${b.ref})` : '')).filter(x => x.trim()).join('\n\n');
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words < 60) return UI.toast('Escreva um pouco mais do capítulo antes de gerar o resumo.');
    const old = syn.value; if (old.trim() && !await UI.confirm('Gerar resumo', 'O resumo atual será trocado pelo da IA (dá para desfazer).', 'Gerar')) return;
    const nb = this.nbOf(s.sec), part = App.meta.sections.find(x => x.id === s.sec);
    const sys = `Você escreve a sinopse de um capítulo de livro cristão, em português do Brasil.
Regras: 1 ou 2 frases, no máximo 45 palavras. Diga do que o capítulo trata e aonde ele leva o leitor (a verdade central e o movimento do capítulo). Fiel ao texto: não invente nada que não esteja nele. Tom do autor, sem adjetivos de propaganda, sem "Neste capítulo" no início, sem aspas, sem markdown. Responda só com a sinopse.`;
    const user = `Livro: ${this.info(nb).title || nb.name}${part ? `\nParte: ${part.name}` : ''}\nCapítulo: ${s.title || ''}\n\nTexto do capítulo:\n${text.slice(0, 16000)}`;
    btn.disabled = true; const lbl = btn.textContent; btn.textContent = '✦ Gerando…';
    try {
      let out = String(await AI.ask(prov, sys, user, { json: false, maxTokens: 400 })).trim().replace(/^["“”']+|["“”']+$/g, '').replace(/^(sinopse|resumo)\s*:\s*/i, '').replace(/\s+/g, ' ');
      if (!out) throw new Error('A IA não respondeu');
      syn.value = out; this.meta(s).synopsis = out; fit(); App.touch(s);
      UI.toast('✦ Resumo gerado — ajuste à vontade', { label: 'Desfazer', fn: () => { syn.value = old; this.meta(s).synopsis = old; fit(); App.touch(s); } });
    } catch (e) { UI.toast('Não consegui gerar o resumo: ' + e.message); }
    finally { btn.disabled = false; btn.textContent = lbl; }
  },
  /* ===== Roteiro → partes e capítulos =====
     Lê o roteiro como árvore (Parte → Capítulo → tópicos), mostra uma prévia para você ajustar
     e cria uma parte do livro para cada Parte, com os capítulos em ordem e os tópicos dentro. */
  isPartLine(t) { return /^(parte|part|livro|se[cç][aã]o|movimento|bloco|unidade|m[oó]dulo|ato)\s*([0-9ivxlc]+|um|dois|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|primeir|segund|terceir|quart|quint)\b/i.test(t) || /^[IVXLC]+\s*[.)\-–—:]\s+\S/.test(t); },
  isChapLine(t) { return /^(cap[ií]tulo|cap\.?)\s*[0-9ivxlc]+/i.test(t); },
  outlineLines(s) {
    const T = b => htmlToText(b.html || '').trim();
    const skip = /^(tese|para quem|p[uú]blico|promessa|ilustra|hist[oó]rias|notas|refer[eê]ncias|ideias soltas|pesquisa)/i;
    let start = s.blocks.findIndex(b => b.type === 'subhead' && /cap[ií]tulos|estrutura|sum[aá]rio|esbo[cç]o|partes|[ií]ndice/i.test(T(b)));
    const lines = []; let inScope = start < 0;
    s.blocks.forEach((b, i) => {
      if (b.type === 'subhead') {
        const t = T(b); if (!t) return;
        if (i === start) { inScope = true; return; }
        if (skip.test(t)) { inScope = false; return; }
        if (start >= 0 && i > start && !this.isPartLine(t) && !this.isChapLine(t)) { inScope = false; return; }
        if (inScope || this.isPartLine(t) || this.isChapLine(t)) { inScope = true; lines.push({ t, d: -1, head: true }); }
        return;
      }
      if (!inScope || b.type !== 'text' || !b.html) return;
      const d = document.createElement('div'); d.innerHTML = b.html;
      const walk = (node, depth) => {
        for (const n of node.childNodes) {
          if (n.nodeType === 3) { n.data.split('\n').forEach(x => { x = x.trim(); if (x) lines.push({ t: x, d: depth + (/^[-•*▪◦·]\s/.test(x) ? 1 : 0) }); }); continue; }
          if (n.nodeType !== 1) continue; const tag = n.tagName;
          if (tag === 'UL' || tag === 'OL') { walk(n, depth + 1); continue; }
          if (tag === 'LI') { const own = [...n.childNodes].filter(c => !(c.nodeType === 1 && /^(UL|OL)$/.test(c.tagName))).map(c => c.textContent).join('').trim(); if (own) lines.push({ t: own, d: depth }); [...n.children].filter(c => /^(UL|OL)$/.test(c.tagName)).forEach(c => walk(c, depth + 1)); continue; }
          if (tag === 'BLOCKQUOTE') { walk(n, depth + 1); continue; }
          if (tag === 'BR') continue;
          if (/^(DIV|P|H[1-6])$/.test(tag) && ![...n.children].some(c => /^(UL|OL|DIV|P|BLOCKQUOTE)$/.test(c.tagName))) { const x = n.textContent.trim(); const ind = (parseFloat(n.style?.marginLeft || 0) > 0 ? 1 : 0) + (/^[-•*▪◦·]\s/.test(x) ? 1 : 0); if (x) lines.push({ t: x, d: depth + ind }); continue; }
          walk(n, depth);
        }
      };
      walk(d, 0);
    });
    return lines.map(l => ({ ...l, t: l.t.replace(/^\s*(\d+[.)]|[-•*▪◦·])\s*/, '').trim() })).filter(l => l.t && !/^t[ií]tulo do cap[ií]tulo/i.test(l.t));
  },
  classify(lines) {
    const hasPart = lines.some(l => this.isPartLine(l.t)), explicit = lines.some(l => this.isChapLine(l.t));
    const depths = lines.filter(l => !l.head && !this.isPartLine(l.t)).map(l => l.d); const minD = depths.length ? Math.min(...depths) : 0;
    let partD = null;
    return lines.map(l => {
      if (this.isPartLine(l.t) || (l.head && !this.isChapLine(l.t))) { partD = l.d; return { ...l, as: 'part' }; }
      if (this.isChapLine(l.t)) return { ...l, as: 'chap' };
      if (explicit) return { ...l, as: 'topic' }; // quando o roteiro diz “Capítulo N”, o resto é tópico
      const chapD = hasPart && partD != null && partD >= 0 ? partD + 1 : minD;
      return { ...l, as: l.d <= chapD ? 'chap' : 'topic' };
    });
  },
  splitTitle(t) {
    t = t.replace(/^(cap[ií]tulo|cap\.?)\s*[0-9ivxlc]+\s*[.:\-–—]?\s*/i, '');
    const m = t.split(/\s+[—–-]\s+|:\s+/); return { title: (m.shift() || '').trim(), syn: m.join(' — ').trim() };
  },
  partName(t) { const m = t.replace(/^(parte|part|livro|se[cç][aã]o|bloco|unidade|m[oó]dulo|ato)\s*([0-9ivxlc]+|\S+)\s*[.:\-–—]?\s*/i, '').replace(/^[IVXLC]+\s*[.)\-–—:]\s+/, '').trim(); return m || t; },
  fromOutline(s) {
    const nb = this.nbOf(s.sec); const raw = this.outlineLines(s);
    if (!raw.length) return UI.toast('Não achei a lista do roteiro. Escreva em “Capítulos” — uma linha por capítulo (e “Parte 1 — …” para as partes).');
    let rows = this.classify(raw);
    const body = el('div', { class: 'ol' }); const m = UI.modal({ title: '➜ Criar capítulos a partir do roteiro', body, wide: true });
    const exist = new Map(this.chapters(nb).map(c => [(c.s.title || '').trim().toLowerCase(), c.s]));
    const draw = () => {
      body.innerHTML = '';
      const nP = rows.filter(r => r.as === 'part').length, nC = rows.filter(r => r.as === 'chap').length;
      body.append(el('p', { class: 'muted small', text: 'Confira como li o seu roteiro. Ajuste cada linha se precisar: Parte vira uma parte do livro, Capítulo vira uma página, Tópico entra dentro do capítulo acima.' }));
      const list = el('div', { class: 'ol-list' });
      rows.forEach((r, i) => {
        const sel = el('select', { class: 'ol-as ' + r.as, onchange: e => { r.as = e.target.value; draw(); } }, ...[['part', 'Parte'], ['chap', 'Capítulo'], ['topic', 'Tópico'], ['skip', 'Ignorar']].map(([v, t]) => el('option', { value: v, text: t, selected: r.as === v })));
        const st = r.as === 'chap' ? this.splitTitle(r.t) : null, dup = st && exist.has(st.title.toLowerCase());
        list.append(el('div', { class: 'ol-row ' + r.as }, sel, el('span', { class: 'ol-t', style: { paddingLeft: (r.as === 'topic' ? 28 : r.as === 'chap' ? 12 : 0) + 'px' } },
          r.as === 'part' ? el('b', { text: '📂 ' + this.partName(r.t) }) : r.as === 'chap' ? el('span', {}, el('b', { text: '📄 ' + st.title }), st.syn ? el('span', { class: 'muted', text: ' — ' + st.syn }) : '', dup ? el('span', { class: 'ol-dup', text: ' já existe — vai para o lugar certo, com o texto que você já escreveu' }) : '') : el('span', { class: r.as === 'skip' ? 'muted ol-skip' : 'muted', text: (r.as === 'topic' ? '• ' : '') + r.t }))));
      });
      body.append(list, el('div', { class: 'ol-sum' }, el('b', { text: `${nP ? nP + ' parte(s) · ' : ''}${nC} capítulo(s)` }), nP ? ' — cada Parte vira uma parte do livro (seção), com os capítulos dela.' : ` — vão para “${this.outlineTarget(s, nb).name}”.`),
        el('div', { class: 'row-btns' }, el('button', { class: 'btn primary', text: 'Criar', disabled: !nC, onclick: () => { m.close(); this.buildOutline(s, nb, rows, exist); } })));
    };
    draw();
  },
  outlineTarget(s, nb) { const here = App.meta.sections.find(x => x.id === s.sec); return this.secKind(here) === 'plan' ? (this.realParts(nb)[0] || here) : here; },
  buildOutline(s, nb, rows, exist) {
    const made = [], newSecs = [], renamed = [], moved = [], seq = {}; let part = null, chap = null, topics = [];
    const flush = () => {
      if (!chap) return;
      if (topics.length) {
        const lv = topics.map(t => t.d), base = Math.min(...lv); let html = '<ul>', cur = base;
        for (const t of topics) { while (t.d > cur) { html += '<ul>'; cur++; } while (t.d < cur) { html += '</ul>'; cur--; } html += `<li>${esc(t.t)}</li>`; }
        while (cur > base) { html += '</ul>'; cur--; } html += '</ul>';
        chap.blocks = [{ id: uid(), type: 'subhead', html: 'Tópicos do roteiro' }, { id: uid(), type: 'text', html }, { id: uid(), type: 'text', html: '' }];
      }
      chap = null; topics = [];
    };
    const targetFor = () => part || this.outlineTarget(s, nb);
    for (const r of rows) {
      if (r.as === 'skip') continue;
      if (r.as === 'part') {
        flush(); const name = this.partName(r.t);
        part = App.meta.sections.find(x => x.nb === nb.id && this.secKind(x) === 'parte' && x.name.trim().toLowerCase() === name.toLowerCase());
        if (!part) { const empty = App.meta.sections.find(x => x.nb === nb.id && this.secKind(x) === 'parte' && !App.sectionSermons(x.id).length && /^cap[ií]tulos$/i.test(x.name)); if (empty && !newSecs.length && !renamed.length) { renamed.push([empty, empty.name]); empty.name = name; part = empty; } else { part = { id: uid(), nb: nb.id, name, color: nb.color || '#8e562e', kind: 'parte' }; App.meta.sections.push(part); newSecs.push(part.id); } }
        continue;
      }
      if (r.as === 'chap') {
        flush(); const { title, syn } = this.splitTitle(r.t); if (!title) continue;
        const sec = targetFor(); this.ensureOrder(sec.id);
        const old = exist.get(title.toLowerCase());
        if (old) { if (!moved.some(x => x[0] === old)) { moved.push([old, old.sec, old.order, old.level]); old.sec = sec.id; old.level = 0; old.order = (seq[sec.id] = (seq[sec.id] ?? -1) + 1); if (syn && !old.book?.synopsis) Book.meta(old).synopsis = syn; App.touch(old); } continue; }
        chap = { ...blankSermon(sec.id), ...this.blankChapter(), title, order: (seq[sec.id] = (seq[sec.id] ?? -1) + 1) };
        chap.book = { kind: 'capitulo', status: 'ideia', goal: 0, synopsis: syn };
        App.sermons.set(chap.id, chap); made.push(chap); exist.set(title.toLowerCase(), chap); continue;
      }
      if (r.as === 'topic' && chap) topics.push(r);
    }
    flush();
    for (const [secId, last] of Object.entries(seq)) { let k = last; for (const x of App.sectionSermons(secId)) if (!made.includes(x) && !moved.some(m => m[0] === x)) { x.order = ++k; App.touch(x); } }
    made.forEach(c => App.touch(c)); App.saveMeta(); App.flush(); App.renderNav();
    const nParts = new Set(made.map(c => c.sec)).size;
    const msg = [made.length ? `${made.length} capítulo(s) criado(s)` : '', moved.length ? `${moved.length} reorganizado(s)` : ''].filter(Boolean).join(' e ');
    UI.toast(msg ? `${msg}${nParts > 1 ? ` em ${nParts} partes` : ''}.` : 'Nada a fazer: o roteiro já está igual ao livro.',
      msg ? { label: 'Desfazer', fn: () => { for (const [x, sec, order, level] of moved) { x.sec = sec; x.order = order; x.level = level; App.touch(x); } for (const c of made) { App.sermons.delete(c.id); DB.del('sermons', c.id); Cloud.tomb(c.id); } App.meta.sections = App.meta.sections.filter(x => !newSecs.includes(x.id)); renamed.forEach(([x, n]) => x.name = n); App.saveMeta(); App.renderNav(); App.open(s.id); UI.toast('Desfeito'); } } : undefined);
  },
  meta(s) { s.book ||= {}; s.book.status ||= 'rascunho'; s.book.goal ??= 0; s.book.synopsis ??= ''; return s.book; },
  status(s) { return BOOK_STATUS.find(x => x[0] === this.meta(s).status) || BOOK_STATUS[1]; },
  blankChapter() { return { title: 'Novo capítulo', date: '', passage: '', duration: 0, blocks: [{ id: uid(), type: 'text', html: '' }], book: { status: 'rascunho', goal: 0, synopsis: '' } }; },
  pageSub(s) {
    const st = this.status(s), num = this.numOf(s), w = this.words(s), top = !(s.level > 0), k = this.kind(s);
    return el('div', { class: 'page-sub bk-sub' }, el('span', { class: 'bk-dot', style: { background: st[2] }, title: st[1] }),
      [num ? 'Cap. ' + num : k === 'roteiro' ? '🧭 Roteiro' : top || k !== 'capitulo' ? this.kindLabel(s) : 'Trecho', fmtN(w) + ' pal.' + (this.meta(s).goal ? ' / ' + fmtN(this.meta(s).goal) : '')].join(' · '));
  },
  navLabels() {
    const b = !!this.cur();
    const pa = $('#page-add'); if (pa) { pa.textContent = b ? '＋ Nova ▾' : '＋ Página ▾'; pa.title = b ? 'Novo capítulo, roteiro, prefácio…' : 'Nova página: sermão, devocional, estudo…'; pa.onclick = b ? e => this.addMenu(e.currentTarget) : e => PageKinds.addMenu(e.currentTarget); }
    const sa = $('#sec-add'); if (sa) { sa.textContent = b ? '＋ Nova parte ▾' : '＋ Adicionar seção'; sa.className = b ? 'btn sm primary sec-add-bk' : 'btn link'; sa.onclick = b ? e => this.partMenu(e.currentTarget) : sa._orig || sa.onclick; }
    let bb = $('#book-open');
    if (b && !bb) { bb = el('button', { class: 'btn sm', id: 'book-open', title: 'Visão geral, quadro, dados, referências e exportação do livro', text: '📖 Livro', onclick: () => this.open() }); $('.page-tools')?.prepend(bb); }
    if (bb) bb.hidden = !b;
  },
  /* garante ordem manual nas partes do livro */
  ensureOrder(secId) {
    const l = App.sectionSermons(secId); if (l.some(x => x.order != null)) return;
    l.forEach((x, i) => { x.order = i; App.touch(x); });
  },
  create(name) {
    const nb = { id: uid(), name, kind: 'book', color: '#8e562e', book: {} }; this.info(nb);
    App.meta.notebooks.push(nb);
    const plan = { id: uid(), nb: nb.id, name: 'Planejamento', color: '#8e562e', kind: 'plan' }, sec = { id: uid(), nb: nb.id, name: 'Capítulos', color: '#8e562e', kind: 'parte' };
    App.meta.sections.push(plan, sec);
    App.meta.currentNb = nb.id; App.meta.currentSec = plan.id; App.saveMeta(); App.renderNav();
    this.newPage('roteiro');
  },

  /* ---------- cabeçalho do capítulo no editor ---------- */
  renderHead(s, ed) {
    const m = this.meta(s), nb = this.nbOf(s.sec), num = this.numOf(s);
    const secOpts = App.meta.sections.filter(x => x.nb === nb.id).map(x => `<option value="${x.id}" ${x.id === s.sec ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    const head = el('div', { class: 's-head bk-head' });
    head.innerHTML = `
      <div class="bk-kicker">${num ? 'Capítulo ' + num : !(s.level > 0) || this.kind(s) !== 'capitulo' ? this.kindLabel(s) : 'Trecho'} · ${esc(nb.name)}${this.kind(s) === 'roteiro' ? ' · não entra no manuscrito' : ''}</div>
      <input id="s-title" class="s-title" value="${esc(s.title)}" placeholder="Título">
      <div class="bk-syn-row"><textarea id="bk-syn" class="bk-syn" rows="1" placeholder="Resumo do capítulo em uma ou duas linhas (aparece no quadro e ajuda a IA)">${esc(m.synopsis)}</textarea>${this.kind(s) === 'roteiro' ? '' : '<button class="btn sm bk-syn-ai" id="bk-syn-ai" title="A IA lê o capítulo e escreve o resumo em uma ou duas linhas">✦ Gerar resumo</button>'}</div>
      <div class="s-meta">
        <label>Tipo <select id="bk-kind">${BOOK_KINDS.map(([id, l]) => `<option value="${id}" ${this.kind(s) === id ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Situação <select id="bk-status">${BOOK_STATUS.map(([id, l]) => `<option value="${id}" ${m.status === id ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Meta <input id="bk-goal" type="number" min="0" step="500" value="${m.goal || ''}" placeholder="palavras" style="width:6.5em"></label>
        <span class="bk-count" id="bk-count"></span>
        <label>Parte <select id="s-sec">${secOpts}</select></label>
        <span class="s-actions">
          <button class="btn sm" id="bk-book" title="Visão geral, quadro, dados, referências e exportação">📖 Livro</button>
          <button class="btn sm ai-btn" id="s-review" title="Editor de livro e leitor beta com IA">✦ Revisar</button>
          <button class="btn sm" id="s-hist" title="Versões anteriores deste capítulo">🕘 Versões</button>
          <button class="btn sm" id="s-move" title="Mover ou copiar">⇢ Mover/Copiar</button>
          <button class="btn sm" id="s-tr" title="Criar uma cópia traduzida para inglês ou espanhol">🌐 Traduzir</button>
          <button class="btn sm" id="s-dup" title="Duplicar">Duplicar</button>
          <button class="btn sm danger-text" id="s-del" title="Excluir">Excluir</button>
        </span>
      </div>`;
    ed.append(head);
    const syn = $('#bk-syn'); const fit = () => { syn.style.height = 'auto'; syn.style.height = syn.scrollHeight + 'px'; }; setTimeout(fit, 0);
    syn.oninput = () => { m.synopsis = syn.value; fit(); App.touch(); };
    const sai = $('#bk-syn-ai'); if (sai) sai.onclick = () => this.aiSynopsis(s, syn, fit, sai);
    $('#s-title').oninput = e => { s.title = e.target.value; App.touch(); const p = $(`#page-list .page[data-id="${s.id}"] .page-title`); if (p) p.textContent = s.title || 'Sem título'; };
    $('#s-title').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const f = $('#blocks .b-body'); f && f.focus(); } };
    $('#bk-status').onchange = e => { m.status = e.target.value; App.touch(); App.renderPages(); };
    $('#bk-kind').onchange = e => { m.kind = e.target.value; App.touch(); App.renderPages(); App.renderEditor(); };
    $('#bk-goal').oninput = e => { m.goal = +e.target.value || 0; App.touch(); this.updateCount(); };
    $('#s-sec').onchange = e => { s.sec = e.target.value; s.level = 0; this.ensureOrder(s.sec); s.order = App.sectionSermons(s.sec).length; App.meta.currentSec = s.sec; App.touch(); App.saveMeta(); App.renderNav(); App.renderEditor(); };
    $('#bk-book').onclick = () => this.open();
    $('#s-review').onclick = () => { App.flush(); Review.open(s); };
    $('#s-hist').onclick = () => { App.flush(); History.open(s); };
    $('#s-move').onclick = async () => { const r = await SectionPicker.pick(`“${s.title}”`, true); if (r) App.moveSermons([s.id], r.sec, r.copy); };
    $('#s-dup').onclick = () => App.duplicateSermon(); $('#s-tr').onclick = () => Translate.open(s);
    $('#s-del').onclick = () => App.deleteSermon();
    this.updateCount();
  },
  updateCount: debounce(function () {
    const s = App.cur, c = $('#bk-count'); if (!s || !c || !Book.is(s)) return;
    const w = Book.words(s), g = Book.meta(s).goal;
    c.innerHTML = ''; c.append(el('b', { text: fmtN(w) }), ' palavras' + (g ? ` de ${fmtN(g)}` : ''));
    if (g) c.append(el('span', { class: 'bk-bar' }, el('i', { style: { width: Math.min(100, w / g * 100) + '%', background: w >= g ? '#107c10' : 'var(--accent)' } })));
    const row = $(`#page-list .page[data-id="${s.id}"] .bk-sub`); if (row) row.replaceWith(Book.pageSub(s));
    Footnotes.renderList();
  }, 400),
  addBar(s) {
    return el('div', { class: 'add-bar' }, el('span', { class: 'muted', text: 'Adicionar:' }),
      ...[['text', 'Texto'], ['subhead', 'Intertítulo'], ['verse', 'Versículo'], ['quote', 'Destaque'], ['image', 'Imagem'], ['ink', 'Desenho']].map(([t, l]) =>
        el('button', { class: 'chip t-' + t, 'data-t': t, text: '+ ' + l, onclick: () => App.insertBlock(t) })),
      el('button', { class: 'chip', text: '¹ Nota de rodapé', title: 'Inserir nota no ponto do cursor (Ctrl+Alt+N)', onmousedown: e => e.preventDefault(), onclick: () => Footnotes.insert() }),
      el('button', { class: 'chip bk-arch', text: '📚 Do acervo', title: 'Trazer blocos dos seus sermões para este capítulo', onclick: () => Archive.open(s) }),
      this.kind(s) === 'roteiro' ? el('button', { class: 'chip primary-chip', text: '➜ Criar capítulos a partir do roteiro', title: 'Cada item da lista “Capítulos” (Título — resumo) vira uma página de capítulo', onclick: () => this.fromOutline(s) }) : null);
  },

  /* ---------- painel do livro ---------- */
  open(tab = 'geral') {
    const nb = this.cur() || this.nbOf(App.cur?.sec); if (!this.isNb(nb)) return;
    App.flush();
    const body = el('div', { class: 'bk-panel' }); const tabs = el('div', { class: 'bk-tabs' }); const pane = el('div', { class: 'bk-pane' });
    body.append(tabs, pane);
    const T = [['geral', 'Visão geral'], ['quadro', 'Quadro'], ['dados', 'Dados do livro'], ['refs', 'Referências'], ['coer', 'Repetições e coerência'], ['export', 'Exportar']];
    const m = UI.modal({ title: '📖 ' + nb.name, body, wide: true }); m.box.classList.add('xl');
    const go = t => { tab = t; tabs.innerHTML = ''; tabs.append(...T.map(([id, l]) => el('button', { class: 'bk-tab' + (id === t ? ' on' : ''), text: l, onclick: () => go(id) }))); pane.innerHTML = ''; this['tab_' + t](pane, nb, m, go); };
    go(tab);
    return m;
  },
  tab_geral(P, nb, m) {
    const B = this.info(nb), ch = this.chapters(nb), total = this.bookWords(nb);
    const pct = B.goal ? Math.min(100, Math.round(total / B.goal * 100)) : 0;
    const counts = Object.fromEntries(BOOK_STATUS.map(([id]) => [id, ch.filter(c => c.num && this.meta(c.s).status === id).length]));
    P.append(el('div', { class: 'bk-prog' },
      el('div', { class: 'bk-big' }, el('b', { text: fmtN(total) }), ` palavras${B.goal ? ' de ' + fmtN(B.goal) : ''}`),
      B.goal ? el('div', { class: 'bk-bar big' }, el('i', { style: { width: pct + '%' } })) : null,
      el('div', { class: 'muted small', text: `${ch.filter(c => c.num).length} capítulos · ` + BOOK_STATUS.map(([id, l]) => `${counts[id]} ${l.toLowerCase()}`).join(' · ') + (B.goal ? ` · ${pct}% da meta` : '') + ` · ~${Math.max(1, Math.round(total / 250))} páginas de livro` })));
    const tbl = el('table', { class: 'bk-tbl' }, el('tr', {}, el('th', { text: 'Capítulo' }), el('th', { text: 'Situação' }), el('th', { text: 'Palavras' })));
    const multi = this.parts(nb).length > 1; let lastPart = null;
    for (const c of ch) {
      if (multi && c.part !== lastPart) { lastPart = c.part; tbl.append(el('tr', { class: 'bk-part' }, el('td', { colspan: 3, text: c.part.name }))); }
      const st = this.status(c.s), w = this.words(c.s), g = this.meta(c.s).goal;
      tbl.append(el('tr', { class: c.top ? '' : 'bk-sub-row', onclick: () => { m.close(); App.open(c.s.id); } },
        el('td', {}, el('b', { text: c.num ? `${c.num}. ` : c.top ? (c.kind === 'roteiro' ? '🧭 ' : '') : '↳ ' }), c.s.title || 'Sem título', !c.num && c.top && c.kind !== 'capitulo' ? el('span', { class: 'bk-kt', text: this.kindLabel(c.s) }) : null, this.meta(c.s).synopsis ? el('div', { class: 'muted small', text: this.meta(c.s).synopsis }) : null),
        el('td', {}, el('span', { class: 'bk-st', style: { '--c': st[2] }, text: st[1] })),
        el('td', {}, fmtN(w) + (g ? ' / ' + fmtN(g) : ''), g ? el('span', { class: 'bk-bar' }, el('i', { style: { width: Math.min(100, w / g * 100) + '%' } })) : null)));
    }
    P.append(tbl);
    /* versões da Bíblia usadas (para conferir as regras de citação antes de publicar) */
    const vers = {};
    for (const c of ch) for (const b of c.s.blocks) if (b.type === 'verse') {
      const k = b.version ? (Bible.info(b.version)?.short || b.version) : (b.verLabel || 'sem versão'); const d = document.createElement('div'); d.innerHTML = b.html || '';
      const n = Math.max(1, d.querySelectorAll('sup').length); (vers[k] ||= { q: 0, v: 0 }); vers[k].q++; vers[k].v += n;
    }
    if (Object.keys(vers).length) P.append(el('h4', { text: 'Versões da Bíblia citadas' }),
      el('ul', { class: 'bk-vers' }, ...Object.entries(vers).map(([k, x]) => el('li', {}, el('b', { text: k }), ` — ${x.v} versículo(s) em ${x.q} citação(ões)`))),
      el('p', { class: 'muted small', text: 'Antes de publicar, confira a política de citação da editora que detém cada versão: as versões modernas costumam ter limite de versículos e exigem a linha de crédito na página de direitos.' }));
  },
  tab_quadro(P, nb, m, go) {
    P.append(el('p', { class: 'muted small', text: 'Arraste os cartões para reorganizar o livro (entre partes também). Subpáginas acompanham o capítulo. Toque no título para abrir.' }));
    const board = el('div', { class: 'bk-board' }); P.append(board);
    let drag = null;
    const groups = sec => { const l = App.sectionSermons(sec.id); const g = []; l.forEach(s => { if (!(s.level > 0) || !g.length) g.push([s]); else g.at(-1).push(s); }); return g; };
    const commit = (fromSec, toSec, grp, idx) => {
      [fromSec, toSec].forEach(id => this.ensureOrder(id));
      const src = groups({ id: fromSec }).filter(g => g[0] !== grp[0]);
      const dst = fromSec === toSec ? src : groups({ id: toSec });
      dst.splice(Math.max(0, Math.min(idx, dst.length)), 0, grp);
      const apply = (list, sec) => list.flat().forEach((x, i) => { if (x.order !== i || x.sec !== sec) { x.order = i; x.sec = sec; App.touch(x); } });
      apply(dst, toSec); if (fromSec !== toSec) apply(src, fromSec);
      grp[0].level = 0; App.flush(); App.renderNav(); go('quadro');
    };
    for (const part of this.parts(nb)) {
      const col = el('div', { class: 'bk-col' }, el('div', { class: 'bk-col-h', text: part.name }));
      const gs = groups(part);
      const zone = idx => { const z = el('div', { class: 'bk-drop' }); z.addEventListener('dragover', e => { if (drag) { e.preventDefault(); z.classList.add('on'); } }); z.addEventListener('dragleave', () => z.classList.remove('on')); z.addEventListener('drop', e => { e.preventDefault(); z.classList.remove('on'); if (drag) commit(drag.sec, part.id, drag.grp, idx); }); return z; };
      col.append(zone(0));
      gs.forEach((g, i) => {
        const s = g[0], st = this.status(s), num = this.numOf(s);
        const card = el('div', { class: 'bk-card' + (this.kind(s) === 'roteiro' ? ' plan' : ''), draggable: 'true', style: { '--c': st[2] } },
          el('div', { class: 'bk-card-n', text: `${num ? 'Cap. ' + num : this.kindLabel(s)} · ${st[1]}` }),
          el('div', { class: 'bk-card-t', text: s.title || 'Sem título', onclick: () => { m.close(); App.open(s.id); } }),
          this.meta(s).synopsis ? el('div', { class: 'bk-card-s', text: this.meta(s).synopsis }) : el('div', { class: 'bk-card-s muted', text: 'sem resumo' }),
          el('div', { class: 'bk-card-w', text: fmtN(g.reduce((n, x) => n + this.words(x), 0)) + ' palavras' + (g.length > 1 ? ` · ${g.length - 1} trecho(s)` : '') }));
        card.addEventListener('dragstart', e => { drag = { sec: part.id, grp: g }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); card.classList.add('dragging'); });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); drag = null; });
        col.append(card, zone(i + 1));
      });
      board.append(col);
    }
    board.append(el('button', { class: 'bk-col bk-add', text: '＋ Nova parte', onclick: async () => {
      const n = await UI.ask('Nova parte do livro', '', 'Ex.: Parte II — A colheita'); if (!n) return;
      App.meta.sections.push({ id: uid(), nb: nb.id, name: n, color: '#8e562e' }); App.saveMeta(); App.renderNav(); go('quadro'); } }));
  },
  tab_dados(P, nb) {
    const B = this.info(nb); const save = debounce(() => App.saveMeta(), 500);
    const f = (label, key, o = {}) => { const i = el(o.area ? 'textarea' : 'input', { class: 'inp', rows: o.rows || 3, type: o.type || 'text', placeholder: o.ph || '' }); i.value = key === 'name' ? nb.name : (B[key] ?? ''); i.oninput = () => { if (key === 'name') { nb.name = i.value; App.renderNav(); } else B[key] = o.type === 'number' ? +i.value || 0 : i.value; save(); }; return [el('label', { class: 'lbl', text: label }), i]; };
    P.append(el('div', { class: 'bk-form' },
      el('div', {}, ...f('Título do livro', 'name'), ...f('Subtítulo', 'subtitle'), ...f('Autor (como sai na capa)', 'author', { ph: 'Ex.: Daniel Rezende' }),
        ...f('Meta do livro (palavras)', 'goal', { type: 'number', ph: '50000' }),
        el('p', { class: 'muted small', text: 'Referência: livros cristãos de ensino costumam ter de 35 a 60 mil palavras (≈150 a 240 páginas em 14×21).' }),
        ...f('Página de direitos (ficha, ISBN, créditos das versões da Bíblia…)', 'copyright', { area: true, rows: 4 })),
      el('div', {}, ...f('Dedicatória', 'dedication', { area: true }), ...f('Epígrafe', 'epigraph', { area: true }), ...f('Autor/referência da epígrafe', 'epigraphRef', { ph: 'Ex.: Mateus 13:52' }),
        ...f('Agradecimentos', 'thanks', { area: true }), ...f('Sobre o autor', 'about', { area: true }))));
  },
  tab_refs(P, nb) { Refs.render(P, nb); },
  tab_coer(P, nb) { BookAI.render(P, nb); },
  tab_export(P, nb) { BookExport.render(P, nb); }
};

/* ===================== NOTAS DE RODAPÉ ===================== */
const Footnotes = {
  esc(t) { return String(t || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); },
  make(note = '') { const s = document.createElement('sup'); s.className = 'fn'; s.contentEditable = 'false'; s.setAttribute('data-note', note); return s; },
  insert() {
    const sel = getSelection(); const body = sel.rangeCount && sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest('#blocks .b-body[contenteditable]');
    if (!body) { UI.toast('Clique no texto, no ponto onde a nota deve ficar.'); return; }
    const r = sel.getRangeAt(0); r.collapse(false);
    const sup = this.make(''); r.insertNode(sup); r.setStartAfter(sup); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
    body.dispatchEvent(new Event('input', { bubbles: true }));
    this.edit(sup);
  },
  number(sup) { return [...document.querySelectorAll('#blocks sup.fn')].indexOf(sup) + 1; },
  edit(sup) {
    $('.fn-pop')?.remove();
    const body = sup.closest('.b-body'); const ta = el('textarea', { class: 'inp', rows: 4, placeholder: 'Texto da nota (fonte, comentário, referência…)' }); ta.value = sup.getAttribute('data-note') || '';
    const save = () => { sup.setAttribute('data-note', ta.value.trim()); body?.dispatchEvent(new Event('input', { bubbles: true })); this.renderList(); };
    ta.oninput = save;
    const back = () => { box.remove(); if (!body || !sup.isConnected) return; body.focus(); const r = document.createRange(); r.setStartAfter(sup); r.collapse(true); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); };
    ta.addEventListener('keydown', e => { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); back(); } });
    const nb = Book.nbOf(App.cur?.sec); const refs = nb ? Book.info(nb).refs : [];
    const page = el('input', { class: 'inp', placeholder: 'p.', style: { width: '5em' } });
    const pick = el('select', { class: 'inp' }, el('option', { value: '', text: refs.length ? '📚 Citar obra das referências…' : 'Sem obras cadastradas (📖 Livro › Referências)' }), ...refs.map((r, i) => el('option', { value: i, text: Refs.short(r) })));
    pick.onchange = () => { const r = refs[+pick.value]; if (!r) return; ta.value = (ta.value ? ta.value.trim() + ' ' : '') + Refs.abnt(r).text + (page.value ? ` p. ${page.value.trim()}.` : ''); pick.value = ''; save(); };
    const box = el('div', { class: 'fn-pop' }, el('div', { class: 'fn-h' }, el('b', { text: 'Nota ' + this.number(sup) }),
      el('button', { class: 'btn link danger-text', text: 'Excluir nota', onclick: () => { sup.remove(); body?.dispatchEvent(new Event('input', { bubbles: true })); box.remove(); this.renderList(); } }),
      el('button', { class: 'btn sm primary', text: 'Pronto', title: 'Ctrl+Enter', onclick: () => back() })), ta, el('div', { class: 'fn-cite' }, pick, page));
    document.body.append(box);
    const r = sup.getBoundingClientRect(); box.style.left = Math.max(8, Math.min(innerWidth - 380, r.left - 20)) + 'px'; box.style.top = (r.bottom + 250 > innerHeight ? Math.max(8, r.top - 250) : r.bottom + 6) + 'px';
    setTimeout(() => ta.focus(), 0);
    setTimeout(() => { const off = e => { if (!box.contains(e.target) && e.target !== sup) { box.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
  },
  renderList() {
    const host = $('#fn-list'); const sups = [...document.querySelectorAll('#blocks sup.fn')];
    if (!sups.length) { host?.remove(); return; }
    let h = host; if (!h) { h = el('div', { id: 'fn-list', class: 'fn-list' }); $('#blocks')?.after(h); }
    h.innerHTML = ''; h.append(el('h4', { text: 'Notas' }), el('ol', {}, ...sups.map(s => el('li', { onclick: () => { s.scrollIntoView({ behavior: 'smooth', block: 'center' }); this.edit(s); } }, s.getAttribute('data-note') || el('i', { class: 'muted', text: '(nota vazia — toque para escrever)' })))));
  },
  init() {
    document.addEventListener('click', e => { const s = e.target.closest && e.target.closest('#blocks sup.fn'); if (s) { e.preventDefault(); this.edit(s); } });
    document.addEventListener('keydown', e => { if (e.ctrlKey && e.altKey && (e.key === 'n' || e.key === 'N')) { e.preventDefault(); this.insert(); } });
    const rb = $('#rb-fn'); if (rb) { rb.onmousedown = e => e.preventDefault(); rb.onclick = () => this.insert(); }
  }
};

/* ===================== REFERÊNCIAS (ABNT) ===================== */
const Refs = {
  TYPES: [['livro', 'Livro'], ['capitulo', 'Capítulo de livro'], ['artigo', 'Artigo de revista'], ['site', 'Página da internet']],
  /* "Sobrenome, Nome; Sobrenome2, Nome2" → "SOBRENOME, Nome; SOBRENOME2, Nome2" */
  authors(a) {
    const list = String(a || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const [sn, ...rest] = x.split(','); return rest.length ? `${sn.trim().toUpperCase()}, ${rest.join(',').trim()}` : (() => { const p = x.split(/\s+/); return p.length > 1 ? `${p.pop().toUpperCase()}, ${p.join(' ')}` : x.toUpperCase(); })(); });
    return list.length > 3 ? list[0] + ' et al.' : list.join('; ');
  },
  abnt(r) {
    const A = this.authors(r.autor), parts = []; let html = '';
    const t = r.titulo || 'Sem título', sub = r.subtitulo ? ': ' + r.subtitulo : '';
    const ed = r.edicao ? ` ${String(r.edicao).replace(/\D/g, '') || r.edicao}. ed.` : '';
    const imp = [r.cidade || '[S. l.]', r.editora || '[s. n.]'].join(': ') + ', ' + (r.ano || '[s. d.]') + '.';
    if (r.tipo === 'artigo') { html = `${esc(A)}. ${esc(t + sub)}. <b>${esc(r.revista || '')}</b>, ${esc(r.cidade || '')}${r.volume ? ', v. ' + esc(r.volume) : ''}${r.paginas ? ', p. ' + esc(r.paginas) : ''}, ${esc(r.ano || '')}.`; }
    else if (r.tipo === 'capitulo') { html = `${esc(A)}. ${esc(t + sub)}. In: ${esc(this.authors(r.org))} (org.). <b>${esc(r.obra || '')}</b>.${esc(ed)} ${esc(imp.slice(0, -1))}${r.paginas ? ', p. ' + esc(r.paginas) : ''}.`; }
    else if (r.tipo === 'site') { html = `${esc(A || (r.editora || '').toUpperCase())}. <b>${esc(t)}</b>${esc(sub)}. ${esc(r.cidade ? r.cidade + ', ' : '')}${esc(r.ano || '')}. Disponível em: ${esc(r.url || '')}. Acesso em: ${esc(r.acesso || '')}.`; }
    else html = `${esc(A)}. <b>${esc(t)}</b>${esc(sub)}.${esc(ed)} ${esc(imp)}`;
    html = html.replace(/\s+/g, ' ').replace(/\.\./g, '.').trim();
    const d = document.createElement('div'); d.innerHTML = html; return { html, text: d.textContent };
  },
  short(r) { return `${(String(r.autor || '').split(/[;,]/)[0] || '').trim()} — ${r.titulo || 'Sem título'}${r.ano ? ' (' + r.ano + ')' : ''}`; },
  sorted(nb) { return [...Book.info(nb).refs].sort((a, b) => this.abnt(a).text.localeCompare(this.abnt(b).text, 'pt-BR')); },
  render(P, nb) {
    const B = Book.info(nb);
    const list = el('div', { class: 'rf-list' });
    const paint = () => {
      list.innerHTML = '';
      if (!B.refs.length) list.append(el('p', { class: 'muted', text: 'Nenhuma obra ainda. Cadastre os livros e artigos que você cita: eles viram notas com um toque (botão ¹ Nota › Citar obra) e entram na lista de Referências do manuscrito.' }));
      for (const r of this.sorted(nb)) list.append(el('div', { class: 'rf-item' }, el('div', { class: 'rf-t', html: this.abnt(r).html }),
        el('button', { class: 'btn link', text: 'Editar', onclick: () => form(r) }),
        el('button', { class: 'btn link danger-text', text: 'Excluir', onclick: async () => { if (!await UI.confirm('Excluir obra', 'Remover esta obra das referências? (As notas já escritas continuam no texto.)')) return; B.refs = B.refs.filter(x => x !== r); App.saveMeta(); paint(); } })));
    };
    const form = (r = null) => {
      const isNew = !r; r = r ? { ...r } : { id: uid(), tipo: 'livro' };
      const F = {}; const box = el('div', { class: 'rf-form' }); const prev = el('div', { class: 'rf-prev' });
      const upd = () => { prev.innerHTML = this.abnt(r).html; };
      const inp = (k, label, ph = '') => { const i = el('input', { class: 'inp', value: r[k] || '', placeholder: ph }); i.oninput = () => { r[k] = i.value; upd(); }; F[k] = el('label', { class: 'rf-f' }, el('span', { text: label }), i); return F[k]; };
      const tipo = el('select', { class: 'inp' }, ...this.TYPES.map(([v, l]) => el('option', { value: v, text: l, selected: r.tipo === v })));
      const show = () => { const t = r.tipo; for (const [k, ts] of Object.entries({ org: ['capitulo'], obra: ['capitulo'], revista: ['artigo'], volume: ['artigo'], paginas: ['artigo', 'capitulo'], url: ['site'], acesso: ['site'], edicao: ['livro', 'capitulo'] })) F[k].hidden = !ts.includes(t); };
      tipo.onchange = () => { r.tipo = tipo.value; show(); upd(); };
      box.append(el('label', { class: 'rf-f' }, el('span', { text: 'Tipo' }), tipo),
        inp('autor', 'Autor(es)', 'Sobrenome, Nome; Sobrenome, Nome'), inp('titulo', 'Título'), inp('subtitulo', 'Subtítulo'),
        inp('org', 'Organizador(es) da obra', 'Sobrenome, Nome'), inp('obra', 'Título da obra'), inp('revista', 'Revista'), inp('volume', 'Volume'),
        inp('edicao', 'Edição', 'Ex.: 3'), inp('cidade', 'Cidade', 'Ex.: São Paulo'), inp('editora', 'Editora', 'Ex.: Vida Nova'), inp('ano', 'Ano'),
        inp('paginas', 'Páginas', 'Ex.: 45-67'), inp('url', 'Endereço (URL)'), inp('acesso', 'Acesso em', 'Ex.: 18 nov. 2026'),
        el('div', { class: 'rf-f wide' }, el('span', { text: 'Como fica (ABNT)' }), prev));
      show(); upd();
      UI.modal({ title: isNew ? 'Nova obra' : 'Editar obra', body: box, wide: true, actions: [{ label: 'Salvar', primary: true, onClick: () => {
        if (!r.titulo) { UI.toast('Informe pelo menos o título.'); return false; }
        if (isNew) B.refs.push(r); else Object.assign(B.refs.find(x => x.id === r.id) || {}, r);
        App.saveMeta(); paint(); } }] });
    };
    P.append(el('div', { class: 'row-btns' }, el('button', { class: 'btn primary', text: '＋ Nova obra', onclick: () => form() })), list,
      el('p', { class: 'muted small', text: 'Formato baseado na NBR 6023 (ABNT). Confira os casos especiais (traduções, obras antigas, Bíblias) com a sua editora.' }));
    paint();
  }
};

/* ===================== ACERVO: do sermão ao capítulo ===================== */
const Archive = {
  /* blocos de todos os sermões (não-livro), com a marca 📚 “Para o livro” */
  pool() {
    const pool = [];
    for (const s of App.sermons.values()) { if (Book.is(s)) continue; s.blocks.forEach(b => { if (b.type === 'ink' || b.type === 'image') return; const t = (b.ref ? b.ref + ' — ' : '') + htmlToText(b.html || ''); if (t.trim()) pool.push({ s, b, t, n: Search.norm(t), mk: b.marks?.includes('book') }); }); }
    return pool;
  },
  /* como um bloco de sermão entra num capítulo de livro */
  adapt(b) { const nb = structuredClone(b); nb.id = uid(); delete nb.marks; delete nb.usedIn; if (nb.type === 'point') nb.type = 'subhead'; else if (!['text', 'verse', 'quote', 'subhead', 'image', 'ink'].includes(nb.type)) nb.type = 'text'; return nb; },
  markUsed(src, b, target) { (b.usedIn ||= []).includes(target.id) || b.usedIn.push(target.id); App.touch(src); },
  open(target) { Split.openArchive(); },
  /* versão em janela: marcar vários e inserir de uma vez */
  modal(target) {
    const pool = this.pool();
    const sel = new Set(); const list = el('div', { class: 'ar-list' }); const q = el('input', { class: 'inp', placeholder: 'Procurar em todos os sermões (tema, palavra, ilustração…)' });
    const only = el('input', { type: 'checkbox', checked: true });
    const paint = () => {
      const terms = q.value.trim() ? Search.terms(q.value) : [];
      let items = pool.filter(x => (!only.checked || x.mk || terms.length) && terms.every(t => x.n.includes(t)));
      if (!terms.length && only.checked) items = pool.filter(x => x.mk);
      items.sort((a, b) => (b.mk - a.mk) || (b.s.date || '').localeCompare(a.s.date || ''));
      list.innerHTML = '';
      if (!items.length) list.append(el('p', { class: 'muted pad', text: only.checked && !terms.length ? 'Nenhum bloco marcado com 📚 "Para o livro" ainda. Marque blocos nos seus sermões (🏷 ou Alt+0) ou procure acima.' : 'Nada encontrado.' }));
      for (const x of items.slice(0, 200)) {
        const used = x.b.usedIn?.length ? '  · já usado no livro' : '';
        list.append(el('label', { class: 'ar-item' + (sel.has(x) ? ' on' : '') }, el('input', { type: 'checkbox', checked: sel.has(x), onchange: e => { e.target.checked ? sel.add(x) : sel.delete(x); e.target.closest('.ar-item').classList.toggle('on', e.target.checked); cnt.textContent = sel.size ? `${sel.size} selecionado(s)` : ''; } }),
          el('span', { class: 'ar-body' }, el('span', { class: 'ar-type', text: (BLOCK_TYPES[x.b.type]?.label || x.b.type) + (x.mk ? ' · 📚' : '') }), el('span', { class: 'ar-t', text: x.t.slice(0, 320) + (x.t.length > 320 ? '…' : '') }),
            el('span', { class: 'ar-src', text: `${x.s.title || 'Sem título'}${x.s.date ? ' · ' + new Date(x.s.date + 'T12:00').toLocaleDateString(DL()) : ''}${used}` }))));
      }
    };
    const cnt = el('span', { class: 'muted small' });
    q.oninput = debounce(paint, 200); only.onchange = paint;
    const body = el('div', { class: 'ar' }, q, el('label', { class: 'sl-ck' }, only, ' Só os blocos marcados 📚 “Para o livro” (procurar ignora este filtro)'), list);
    UI.modal({ title: '📚 Trazer do acervo de sermões', body, wide: true, actions: [{ label: 'Inserir no capítulo', primary: true, onClick: () => {
      if (!sel.size) { UI.toast('Selecione pelo menos um bloco.'); return false; }
      const at = target.blocks.findIndex(b => b.id === App.focusId); let pos = at >= 0 ? at + 1 : target.blocks.length;
      for (const x of [...sel]) {
        target.blocks.splice(pos++, 0, this.adapt(x.b)); this.markUsed(x.s, x.b, target);
      }
      App.touch(target); App.renderEditor(); UI.toast(`${sel.size} bloco(s) trazido(s). Agora é reescrever para a linguagem do livro.`);
    } }] });
    setTimeout(() => q.focus(), 50); cnt && body.append(cnt); paint();
  }
};

/* ===================== HISTÓRICO DE VERSÕES ===================== */
const History = {
  last: new Map(),
  key(s) { return JSON.stringify([s.title, s.blocks.map(b => [b.type, b.html, b.ref])]); },
  async list(id) { return (await DB.get('history', id)) || []; },
  async snap(s, reason = 'auto') {
    if (!s) return; const k = this.key(s); const arr = await this.list(s.id);
    if (arr.length && arr[0].k === k) return;
    arr.unshift({ at: Date.now(), reason, title: s.title, blocks: structuredClone(s.blocks), words: Book.words(s), k });
    /* guarda tudo das últimas 24 h (até 40), depois 1 por dia, até 120 versões */
    const now = Date.now(), keep = [], days = new Set();
    for (const v of arr) { if (now - v.at < 864e5 && keep.length < 40) { keep.push(v); continue; } const d = new Date(v.at).toDateString(); if (!days.has(d)) { days.add(d); keep.push(v); } }
    await DB.put('history', s.id, keep.slice(0, 120));
  },
  /* chamado a cada alteração: no máximo uma versão a cada 5 min por página */
  tick(s) { const t = this.last.get(s.id) || 0; if (Date.now() - t > 5 * 60e3) { this.last.set(s.id, Date.now()); this.snap(s, 'auto'); } },
  blocksText(blocks) { return blocks.map(b => (b.ref ? b.ref + ' ' : '') + htmlToText(b.html || '') || (b.type === 'ink' ? '[desenho]' : b.type === 'image' ? '[imagem]' : '')).filter(Boolean); },
  /* diferença por parágrafo e, dentro do parágrafo, por palavra */
  diff(a, b) {
    const lcs = (x, y) => { const n = x.length, m = y.length; if (n * m > 4e6) return null; const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1)); for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]); const out = []; let i = 0, j = 0; while (i < n && j < m) { if (x[i] === y[j]) { out.push(['=', x[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', x[i++]]); else out.push(['+', y[j++]]); } while (i < n) out.push(['-', x[i++]]); while (j < m) out.push(['+', y[j++]]); return out; };
    const ops = lcs(a, b) || [...a.map(x => ['-', x]), ...b.map(x => ['+', x])];
    const box = el('div', { class: 'hs-diff' });
    for (let k = 0; k < ops.length; k++) {
      const [o, t] = ops[k];
      if (o === '-' && ops[k + 1]?.[0] === '+') { const w = lcs(t.split(/(\s+)/), ops[k + 1][1].split(/(\s+)/)); const p = el('p', {}); if (w) for (const [oo, tt] of w) p.append(oo === '=' ? tt : el(oo === '-' ? 'del' : 'ins', { text: tt })); else p.append(el('del', { text: t }), el('ins', { text: ops[k + 1][1] })); box.append(p); k++; continue; }
      box.append(o === '=' ? el('p', { class: 'hs-same', text: t }) : el('p', {}, el(o === '-' ? 'del' : 'ins', { text: t })));
    }
    return box;
  },
  async open(s) {
    await this.snap(s, 'ao abrir o histórico');
    const arr = await this.list(s.id);
    const left = el('div', { class: 'hs-list' }), right = el('div', { class: 'hs-view' });
    const cur = this.blocksText(s.blocks);
    const show = v => {
      left.querySelectorAll('.hs-v').forEach(x => x.classList.toggle('on', x._v === v));
      right.innerHTML = '';
      right.append(el('div', { class: 'row-btns' }, el('b', { text: new Date(v.at).toLocaleString(DL()) }),
        el('span', { class: 'muted small', text: 'Vermelho: só existia nesta versão · Verde: só existe agora' }),
        el('button', { class: 'btn sm primary', text: '↺ Restaurar esta versão', onclick: async () => {
          if (!await UI.confirm('Restaurar versão', 'Voltar o texto para esta versão? A versão atual fica guardada no histórico.', 'Restaurar')) return;
          await this.snap(s, 'antes de restaurar'); s.blocks = structuredClone(v.blocks); s.title = v.title; App.touch(s); App.flush(); App.renderNav(); App.renderEditor(); m.close(); UI.toast('Versão restaurada.'); } }),
        el('button', { class: 'btn sm', text: 'Copiar o texto desta versão', onclick: () => Share.copyText(this.blocksText(v.blocks).join('\n\n')) })),
        this.diff(this.blocksText(v.blocks), cur));
    };
    if (arr.length < 2) left.append(el('p', { class: 'muted small', text: 'As versões são guardadas automaticamente enquanto você escreve (no máximo uma a cada 5 minutos) e ficam neste aparelho.' }));
    arr.forEach((v, i) => { const prev = arr[i + 1]; const d = prev ? v.words - prev.words : 0;
      const it = el('button', { class: 'hs-v', onclick: () => show(v) }, el('b', { text: new Date(v.at).toLocaleString(DL(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }),
        el('span', { class: 'muted small', text: `${fmtN(v.words)} pal.${d ? ` (${d > 0 ? '+' : ''}${fmtN(d)})` : ''}${i === 0 ? ' · atual' : ''}` })); it._v = v; left.append(it); });
    const m = UI.modal({ title: '🕘 Versões — ' + (s.title || 'Sem título'), body: el('div', { class: 'hs' }, left, right), wide: true }); m.box.classList.add('xl');
    if (arr[1]) show(arr[1]); else if (arr[0]) show(arr[0]);
  }
};

/* ===================== EXPORTAÇÃO DO MANUSCRITO ===================== */
const BookExport = {
  opts: { fmt: 'docx', size: 'a4', front: true, toc: true, refs: true, about: true, onlyReady: false, capLabel: true },
  render(P, nb) {
    const o = this.opts; const B = Book.info(nb);
    const ck = (k, label) => { const i = el('input', { type: 'checkbox', checked: !!o[k], onchange: () => { o[k] = i.checked; } }); return el('label', { class: 'sl-ck' }, i, ' ' + label); };
    const chips = (k, list) => { const box = el('div', { class: 'sl-chips' }); const paint = () => box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === o[k])); list.forEach(([v, l, t]) => box.append(el('button', { class: 'chip', 'data-v': v, text: l, title: t || '', onclick: () => { o[k] = v; paint(); } }))); paint(); return box; };
    const out = el('p', { class: 'muted small' });
    P.append(el('div', { class: 'bk-form' }, el('div', {},
      el('label', { class: 'lbl', text: 'Formato' }), chips('fmt', [['docx', 'Word (.docx)', 'Para a editora e o revisor; sumário e notas de rodapé de verdade'], ['epub', 'E-book (.epub)', 'Para Amazon KDP, Google Play Livros, Apple Books'], ['pdf', 'PDF / imprimir', 'Prova de leitura']]),
      el('label', { class: 'lbl', text: 'Página (Word e PDF)' }), chips('size', [['a4', 'A4 — manuscrito', 'Times 12, espaço 1,5: padrão para enviar a editoras'], ['14x21', '14 × 21 cm — livro', 'Formato comum de livro no Brasil']]),
      ck('capLabel', 'Escrever “Capítulo N” acima do título'), ck('onlyReady', 'Só capítulos marcados como Pronto')),
      el('div', {}, el('label', { class: 'lbl', text: 'Incluir' }), ck('front', 'Folha de rosto, direitos, dedicatória, epígrafe e agradecimentos (o que estiver preenchido em Dados do livro)'),
        ck('toc', 'Sumário'), ck('refs', `Referências (${B.refs.length} obra(s))`), ck('about', 'Sobre o autor'),
        el('p', { class: 'muted small', text: 'No Word, as notas saem como notas de rodapé do próprio Word. No e-book e no PDF, como notas no fim de cada capítulo.' }))),
      el('div', { class: 'row-btns' }, el('button', { class: 'btn primary', text: '⇩ Gerar manuscrito', onclick: async e => {
        e.target.disabled = true; out.textContent = 'Montando o livro…';
        try { App.flush(); const r = await this[o.fmt](nb, o); out.textContent = r || 'Pronto ✓'; } catch (err) { console.error(err); out.textContent = 'Erro: ' + err.message; } finally { e.target.disabled = false; } } }), out));
  },
  list(nb, o) { const ch = Book.chapters(nb).filter(c => !c.plan); return o.onlyReady ? ch.filter(c => { const top = c.top ? c : null; const parent = top || [...ch].reverse().find(x => x.top && ch.indexOf(x) < ch.indexOf(c)); return Book.meta(parent.s).status === 'pronto'; }) : ch; },
  /* blocos de um capítulo → itens neutros {k:'p'|'h'|'q'|'verse'|'img', html, ref} */
  items(s) {
    const out = [];
    for (const b of s.blocks) {
      if (b.type === 'ink') { if (b.ink?.strokes?.length) { const v = { hr: inkContentHR(b.ink), strokes: b.ink.strokes }; out.push({ k: 'img', src: inkToDataURL(v, 1200, '#ffffff'), w: 600, h: 600 * v.hr }); } continue; }
      if (b.type === 'mind' && b.mind) { const im = Mind.png(b.mind); out.push({ k: 'img', src: im.src, w: Math.min(600, im.w), h: Math.round(im.h * Math.min(600, im.w) / im.w) }); continue; }
      if (b.type === 'image') { if (b.src) out.push({ k: 'img', src: b.src, cap: b.html }); continue; }
      if (!htmlToText(b.html || '') && !b.ref) continue;
      if (b.type === 'subhead' || b.type === 'point') out.push({ k: 'h', html: b.html });
      else if (b.type === 'verse') out.push({ k: 'verse', html: b.html, ref: (b.ref || '') + (b.version ? ', ' + (Bible.info(b.version)?.short || '') : b.verLabel ? ', ' + b.verLabel : '') });
      else if (b.type === 'quote') out.push({ k: 'q', html: b.html });
      else out.push({ k: 'p', html: b.html });
    }
    return out;
  },
  front(nb) { const B = Book.info(nb); return { title: nb.name, sub: B.subtitle, author: B.author, ded: B.dedication, epi: B.epigraph, epiRef: B.epigraphRef, copy: B.copyright, thanks: B.thanks, about: B.about }; },
  file(nb, ext) { return safeName(nb.name || 'livro') + ' — manuscrito ' + todayISO() + '.' + ext; },

  /* ---------- Word ---------- */
  async docx(nb, o) {
    const F = this.front(nb), X = t => esc(t), notes = [], media = []; let imgN = 0;
    const run = (t, f = {}) => { const pr = [f.b && '<w:b/>', f.i && '<w:i/>', f.u && '<w:u w:val="single"/>', f.sup && '<w:vertAlign w:val="superscript"/>', f.caps && '<w:caps/>', f.sz && `<w:sz w:val="${f.sz}"/>`].filter(Boolean).join(''); return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${X(t)}</w:t></w:r>`; };
    const P = (runs, st = 'Normal', extra = '') => `<w:p><w:pPr><w:pStyle w:val="${st}"/>${extra}</w:pPr>${runs}</w:p>`;
    const br = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    const fnRef = text => { notes.push(text); return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${notes.length}"/></w:r>`; };
    const inline = (html, base = {}) => {
      const d = document.createElement('div'); d.innerHTML = html || ''; const paras = []; let runs = '';
      const end = (st, jc) => { if (runs.trim()) paras.push([runs, st, jc]); runs = ''; };
      const walk = (n, f) => { for (const c of n.childNodes) {
        if (c.nodeType === 3) { if (c.nodeValue) runs += run(c.nodeValue.replace(/\s+/g, ' '), f); continue; } if (c.nodeType !== 1) continue;
        const t = c.tagName, nf = { ...f };
        if (t === 'SUP' && c.classList.contains('fn')) { runs += fnRef(c.getAttribute('data-note') || ''); continue; }
        if (t === 'BR') { runs += '<w:r><w:br/></w:r>'; continue; }
        if (t === 'B' || t === 'STRONG') nf.b = 1; if (t === 'I' || t === 'EM') nf.i = 1; if (t === 'U') nf.u = 1; if (t === 'SUP') nf.sup = 1;
        const st = c.getAttribute('style') || ''; if (/bold|[6-9]00/.test(st)) nf.b = 1; if (/italic/.test(st)) nf.i = 1;
        if (t === 'UL' || t === 'OL') { end(); let k = 0; for (const li of c.children) { runs = run(t === 'OL' ? `${++k}. ` : '•  ', nf); walk(li, nf); end('Lista'); } continue; }
        if (t === 'DIV' || t === 'P' || t === 'LI') { end(); walk(c, nf); const al = (c.style?.textAlign || '').toLowerCase(); end(undefined, { center: 'center', right: 'right', justify: 'both', left: 'left' }[al]); continue; }
        walk(c, nf);
      } };
      walk(d, base); end(); return paras;
    };
    const image = async (src, w, h) => {
      src = await new Promise(r => { if (/^data:image\/(png|jpeg)/.test(src)) return r(src); const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); r(c.toDataURL('image/png')); }; i.onerror = () => r(null); i.src = src; });
      if (!src) return '';
      if (!w) [w, h] = await new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r([600, 400]); i.src = src; });
      const { bytes, mime } = dataURLtoBytes(src); const ext = mime === 'image/jpeg' ? 'jpeg' : 'png'; const n = ++imgN;
      media.push({ name: `word/media/img${n}.${ext}`, data: bytes, id: `rIdImg${n}`, ext });
      const maxW = (o.size === 'a4' ? 15 : 10.5) * 360000; let cx = Math.round(w * 9525), cy = Math.round(h * 9525); if (cx > maxW) { cy = Math.round(cy * maxW / cx); cx = maxW; }
      return `<w:p><w:pPr><w:pStyle w:val="Imagem"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Imagem ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="img${n}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    };
    let body = '';
    if (o.front) {
      body += P(run(F.title), 'Title') + (F.sub ? P(run(F.sub), 'Subtitle') : '') + (F.author ? P(run(F.author), 'Autor') : '') + br;
      if (F.copy) body += F.copy.split('\n').map(l => P(run(l), 'Direitos')).join('') + br;
      if (F.ded) body += P('', 'Normal', '<w:spacing w:before="4000"/>') + F.ded.split('\n').map(l => P(run(l, { i: 1 }), 'Dedicatoria')).join('') + br;
      if (F.epi) body += P('', 'Normal', '<w:spacing w:before="4000"/>') + F.epi.split('\n').map(l => P(run(l, { i: 1 }), 'Epigrafe')).join('') + (F.epiRef ? P(run(F.epiRef), 'EpigrafeRef') : '') + br;
    }
    if (o.toc) body += P(run('Sumário'), 'TituloSemNumero') + `<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>Clique com o botão direito aqui e escolha “Atualizar campo” para montar o sumário.</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
    if (o.front && F.thanks) body += P(run('Agradecimentos'), 'TituloSemNumero', '<w:pageBreakBefore/>') + F.thanks.split(/\n+/).map(l => P(run(l))).join('');
    const list = this.list(nb, o); const multi = Book.realParts(nb).length > 1; let lastPart = null, pn = 0;
    for (const c of list) {
      if (multi && c.part !== lastPart && Book.secKind(c.part) === 'parte') { lastPart = c.part; body += P(run(`Parte ${ROMAN(Book.realParts(nb).indexOf(c.part) + 1)}`, { caps: 1 }), 'ParteN', '<w:pageBreakBefore/>') + P(run(c.part.name), 'Parte', '<w:outlineLvl w:val="0"/>'); }
      const lvl = multi ? 1 : 0;
      if (c.top) { const lab = o.capLabel && c.num; if (lab) body += P(run(`Capítulo ${c.num}`), 'CapituloN', '<w:pageBreakBefore/>'); body += P(run(c.s.title || 'Sem título'), 'Capitulo', `${lab ? '' : '<w:pageBreakBefore/>'}<w:outlineLvl w:val="${lvl}"/>`); }
      else body += P(run(c.s.title || ''), 'Intertitulo');
      let first = true;
      for (const it of this.items(c.s)) {
        if (it.k === 'img') { body += await image(it.src, it.w, it.h); if (it.cap) body += P(run(htmlToText(it.cap), { i: 1 }), 'Legenda'); continue; }
        if (it.k === 'h') { body += P(run(htmlToText(it.html)), 'Intertitulo'); first = true; continue; }
        const st = it.k === 'verse' || it.k === 'q' ? 'Citacao' : first ? 'PrimeiroParagrafo' : 'Normal';
        const paras = inline(it.html, it.k === 'q' ? { i: 1 } : {});
        paras.forEach(([r, s2, jc], i) => { const isLast = i === paras.length - 1; body += P(r + (it.k === 'verse' && isLast && it.ref ? run(` (${it.ref})`) : ''), s2 || st, jc ? `<w:ind w:firstLine="0"/><w:jc w:val="${jc}"/>` : ''); });
        first = it.k !== 'p';
      }
    }
    if (o.refs && Book.info(nb).refs.length) { body += P(run('Referências'), 'TituloSemNumero', '<w:pageBreakBefore/>'); for (const r of Refs.sorted(nb)) body += P(inline(Refs.abnt(r).html).map(x => x[0]).join(''), 'Referencia'); }
    if (o.about && F.about) body += P(run('Sobre o autor'), 'TituloSemNumero', '<w:pageBreakBefore/>') + F.about.split(/\n+/).map(l => P(run(l))).join('');
    const pg = o.size === 'a4' ? '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1134" w:bottom="1134" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/>' : '<w:pgSz w:w="7938" w:h="11906"/><w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>';
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>${pg}<w:titlePg/></w:sectPr></w:body></w:document>`;
    const fnXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes ${NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${notes.map((t, i) => `<w:footnote w:id="${i + 1}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> ${X(t)}</w:t></w:r></w:p></w:footnote>`).join('')}</w:footnotes>`;
    const a4 = o.size === 'a4', font = a4 ? 'Times New Roman' : 'Georgia', sz = a4 ? 24 : 22, line = a4 ? 360 : 300;
    const S = (id, name, ppr = '', rpr = '', type = 'paragraph', extra = '') => `<w:style w:type="${type}" w:styleId="${id}"${id === 'Normal' ? ' w:default="1"' : ''}><w:name w:val="${name}"/>${type === 'paragraph' && id !== 'Normal' ? '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>' : ''}${extra}<w:qFormat/>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}</w:style>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/><w:sz w:val="${sz}"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>`
      + S('Normal', 'Normal', '<w:ind w:firstLine="709"/><w:jc w:val="both"/>')
      + S('PrimeiroParagrafo', 'Primeiro parágrafo', '<w:ind w:firstLine="0"/><w:jc w:val="both"/>')
      + S('Lista', 'Lista', '<w:ind w:left="709" w:firstLine="0"/>')
      + S('Title', 'Title', '<w:spacing w:before="3600" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>', '<w:b/><w:sz w:val="52"/>')
      + S('Subtitle', 'Subtitle', '<w:spacing w:after="600"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>', '<w:i/><w:sz w:val="30"/>')
      + S('Autor', 'Autor', '<w:spacing w:before="1200"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>', '<w:caps/><w:sz w:val="26"/>')
      + S('Direitos', 'Direitos', '<w:ind w:firstLine="0"/><w:spacing w:line="240" w:lineRule="auto"/>', '<w:sz w:val="18"/>')
      + S('Dedicatoria', 'Dedicatória', '<w:ind w:left="3969" w:firstLine="0"/><w:jc w:val="right"/>')
      + S('Epigrafe', 'Epígrafe', '<w:ind w:left="3969" w:firstLine="0"/><w:jc w:val="both"/>')
      + S('EpigrafeRef', 'Epígrafe — referência', '<w:ind w:left="3969" w:firstLine="0"/><w:jc w:val="right"/><w:spacing w:before="120"/>', '<w:sz w:val="20"/>')
      + S('TituloSemNumero', 'Título sem número', '<w:spacing w:before="1200" w:after="480"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>', '<w:b/><w:caps/><w:sz w:val="28"/>')
      + S('ParteN', 'Parte — número', '<w:spacing w:before="4000" w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>', '<w:sz w:val="26"/>')
      + S('Parte', 'Parte', '<w:spacing w:after="240"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/>', '<w:b/><w:sz w:val="40"/>')
      + S('CapituloN', 'Capítulo — número', '<w:spacing w:before="1800" w:after="120"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:keepNext/>', '<w:caps/><w:sz w:val="22"/>')
      + S('Capitulo', 'Capítulo', '<w:spacing w:after="720"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:keepNext/>', '<w:b/><w:sz w:val="36"/>')
      + S('Intertitulo', 'Intertítulo', '<w:spacing w:before="360" w:after="120"/><w:ind w:firstLine="0"/><w:keepNext/>', '<w:b/>')
      + S('Citacao', 'Citação', '<w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/><w:ind w:left="2268" w:firstLine="0"/><w:jc w:val="both"/>', `<w:sz w:val="${sz - 4}"/>`)
      + S('Imagem', 'Imagem', '<w:spacing w:before="120" w:after="60"/><w:ind w:firstLine="0"/><w:jc w:val="center"/>')
      + S('Legenda', 'Legenda', '<w:ind w:firstLine="0"/><w:jc w:val="center"/>', '<w:sz w:val="18"/>')
      + S('Referencia', 'Referência', '<w:spacing w:after="240" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/>')
      + S('FootnoteText', 'footnote text', '<w:spacing w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="both"/>', '<w:sz w:val="20"/>')
      + S('FootnoteReference', 'footnote reference', '', '<w:vertAlign w:val="superscript"/>', 'character')
      + S('Rodape', 'Rodapé', '<w:ind w:firstLine="0"/><w:jc w:val="center"/>', '<w:sz w:val="18"/>')
      + S('TOC1', 'toc 1', '<w:spacing w:before="120"/><w:ind w:firstLine="0"/>') + S('TOC2', 'toc 2', '<w:ind w:left="360" w:firstLine="0"/>')
      + '</w:styles>';
    const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p><w:pPr><w:pStyle w:val="Rodape"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
    const settings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="709"/><w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
    const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="${R}styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="${R}settings" Target="settings.xml"/><Relationship Id="rIdFootnotes" Type="${R}footnotes" Target="footnotes.xml"/><Relationship Id="rIdFooter" Type="${R}footer" Target="footer1.xml"/>${media.map(m => `<Relationship Id="${m.id}" Type="${R}image" Target="${m.name.replace('word/', '')}"/>`).join('')}</Relationships>`;
    const W = 'application/vnd.openxmlformats-officedocument.wordprocessingml.';
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="${W}document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${W}styles+xml"/><Override PartName="/word/settings.xml" ContentType="${W}settings+xml"/><Override PartName="/word/footnotes.xml" ContentType="${W}footnotes+xml"/><Override PartName="/word/footer1.xml" ContentType="${W}footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
    const root = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(F.title)}</dc:title><dc:creator>${X(F.author)}</dc:creator><dc:language>pt-BR</dc:language></cp:coreProperties>`;
    const zip = zipStore([{ name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: root }, { name: 'docProps/core.xml', data: core }, { name: 'word/document.xml', data: doc }, { name: 'word/styles.xml', data: styles }, { name: 'word/settings.xml', data: settings }, { name: 'word/footnotes.xml', data: fnXml }, { name: 'word/footer1.xml', data: footer }, { name: 'word/_rels/document.xml.rels', data: rels }, ...media.map(m => ({ name: m.name, data: m.data }))]);
    await saveFile(this.file(nb, 'docx'), new Blob([zip], { type: W + 'document' }));
    return `Pronto ✓ ${list.filter(c => c.num).length} capítulo(s), ${notes.length} nota(s). Ao abrir no Word, aceite “atualizar campos” para montar o sumário.`;
  },

  /* ---------- HTML do livro (base do EPUB e do PDF) ---------- */
  chapterHTML(c, notesOut) {
    const box = document.createElement('div');
    for (const it of this.items(c.s)) {
      if (it.k === 'img') { const f = el('figure', {}, el('img', { src: it.src, alt: '' })); if (it.cap) f.append(el('figcaption', { text: htmlToText(it.cap) })); box.append(f); continue; }
      if (it.k === 'h') { box.append(el('h3', { text: htmlToText(it.html) })); continue; }
      const d = el('div', { html: sanitizeHTML(it.html || '') });
      d.querySelectorAll('sup.fn').forEach(s => { notesOut.push(s.getAttribute('data-note') || ''); const n = notesOut.length; const a = el('a', { class: 'nref', href: `#n${c.s.id}-${n}`, id: `r${c.s.id}-${n}`, text: String(n) }); a.setAttribute('epub:type', 'noteref'); const sup = el('sup', {}, a); s.replaceWith(sup); });
      if (it.k === 'verse' || it.k === 'q') { const bq = el('blockquote', { class: it.k }, ...d.childNodes); if (it.ref) bq.append(el('span', { class: 'vref', text: ` (${it.ref})` })); box.append(bq); }
      else { if (!d.querySelector('div,p,ul,ol')) box.append(el('p', {}, ...d.childNodes)); else { d.querySelectorAll(':scope > div').forEach(x => { const p = el('p', {}, ...x.childNodes); x.replaceWith(p); }); box.append(...d.childNodes); } }
    }
    return box;
  },
  notesHTML(c, notes) {
    if (!notes.length) return null;
    const sec = el('section', { class: 'notas' }, el('h4', { text: 'Notas' }));
    notes.forEach((t, i) => { const a = el('aside', { id: `n${c.s.id}-${i + 1}` }, el('a', { href: `#r${c.s.id}-${i + 1}`, text: (i + 1) + '. ' }), t); a.setAttribute('epub:type', 'footnote'); sec.append(a); });
    return sec;
  },
  CSS: `body{font-family:Georgia,"Times New Roman",serif;line-height:1.55;margin:0 4%;text-align:justify;hyphens:auto}
h1{text-align:center;font-size:1.7em;margin:1.5em 0 1.2em;line-height:1.2}h2.parte{text-align:center;font-size:1.8em;margin-top:30%}.capn{text-align:center;text-transform:uppercase;letter-spacing:.15em;font-size:.85em;margin-top:3em;color:#555}
h3{font-size:1.1em;margin:1.6em 0 .5em;text-align:left}p{margin:0;text-indent:1.5em}h1+p,h3+p,blockquote+p,figure+p,.capn+h1+p{text-indent:0}
blockquote{margin:1em 0 1em 2.5em;font-size:.95em}blockquote.q{font-style:italic}.vref{white-space:nowrap}
figure{margin:1.2em 0;text-align:center}figure img{max-width:100%}figcaption{font-size:.85em;font-style:italic}
sup a{text-decoration:none}.notas{margin-top:2.5em;border-top:1px solid #999;padding-top:.6em;font-size:.85em}.notas aside{margin:.3em 0}.notas h4{font-size:.9em;text-transform:uppercase;letter-spacing:.1em}
.rosto{text-align:center;margin-top:30%}.rosto h1{font-size:2.2em}.rosto .sub{font-style:italic;font-size:1.2em}.rosto .autor{margin-top:3em;text-transform:uppercase;letter-spacing:.1em}
.ded,.epi{margin:40% 0 0 40%;font-style:italic;text-align:right}.epi .ref{font-style:normal;font-size:.9em;margin-top:.6em}.direitos{font-size:.8em;text-align:left;white-space:pre-wrap}
.refs p{text-indent:0;text-align:left;margin:0 0 .8em}.toc ol{list-style:none;padding:0}.toc li{margin:.3em 0}`,

  /* ---------- EPUB ---------- */
  async epub(nb, o) {
    const F = this.front(nb), id = 'urn:uuid:' + (nb.id + '-0000-4000-8000-000000000000').slice(0, 36);
    const ser = new XMLSerializer();
    const xhtml = (title, inner, type = '') => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="pt-BR" lang="pt-BR"><head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" href="style.css"/></head><body${type ? ` epub:type="${type}"` : ''}>${inner}</body></html>`;
    const xml = node => [...node.childNodes].map(n => ser.serializeToString(n)).join('').replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '');
    const files = [], spine = [], toc = []; const imgs = []; let ni = 0;
    const fixImgs = async box => { for (const img of box.querySelectorAll('img')) { const src = img.getAttribute('src'); try { const { bytes, mime } = dataURLtoBytes(src.startsWith('data:') ? src : await new Promise((r, j) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); r(c.toDataURL('image/jpeg', .9)); }; i.onerror = j; i.src = src; })); const ext = mime === 'image/png' ? 'png' : 'jpg'; const name = `img/i${++ni}.${ext}`; imgs.push({ name, data: bytes, mime: ext === 'png' ? 'image/png' : 'image/jpeg' }); img.setAttribute('src', name); img.setAttribute('alt', ''); } catch (e) { img.remove(); } } };
    const add = (name, title, inner, inToc = true, type = '') => { files.push({ name, data: xhtml(title, inner, type), title }); spine.push(name); if (inToc) toc.push([name, title]); };
    if (o.front) {
      add('rosto.xhtml', F.title, `<section class="rosto" epub:type="titlepage"><h1>${esc(F.title)}</h1>${F.sub ? `<p class="sub">${esc(F.sub)}</p>` : ''}${F.author ? `<p class="autor">${esc(F.author)}</p>` : ''}</section>`, false);
      if (F.copy) add('direitos.xhtml', 'Direitos', `<section class="direitos" epub:type="copyright-page">${esc(F.copy)}</section>`, false);
      if (F.ded) add('dedicatoria.xhtml', 'Dedicatória', `<section class="ded" epub:type="dedication">${esc(F.ded).replace(/\n/g, '<br/>')}</section>`, false);
      if (F.epi) add('epigrafe.xhtml', 'Epígrafe', `<section class="epi" epub:type="epigraph">${esc(F.epi).replace(/\n/g, '<br/>')}${F.epiRef ? `<p class="ref">${esc(F.epiRef)}</p>` : ''}</section>`, false);
      if (F.thanks) add('agradecimentos.xhtml', 'Agradecimentos', `<h1>Agradecimentos</h1>${F.thanks.split(/\n+/).map(l => `<p>${esc(l)}</p>`).join('')}`);
    }
    const list = this.list(nb, o); const multi = Book.realParts(nb).length > 1; let lastPart = null, pn = 0, k = 0;
    for (const c of list) {
      if (multi && c.part !== lastPart && Book.secKind(c.part) === 'parte') { lastPart = c.part; pn = Book.realParts(nb).indexOf(c.part) + 1; add(`parte${pn}.xhtml`, `Parte ${ROMAN(pn)} — ${c.part.name}`, `<section epub:type="part"><p class="capn">Parte ${ROMAN(pn)}</p><h2 class="parte">${esc(c.part.name)}</h2></section>`); }
      const notes = []; const box = this.chapterHTML(c, notes); await fixImgs(box); const nh = this.notesHTML(c, notes);
      const head = c.top ? `${o.capLabel && c.num ? `<p class="capn">Capítulo ${c.num}</p>` : ''}<h1>${esc(c.s.title || 'Sem título')}</h1>` : `<h1>${esc(c.s.title || '')}</h1>`;
      add(`cap${++k}.xhtml`, c.num ? `${c.num}. ${c.s.title}` : c.s.title, `<section epub:type="chapter">${head}${xml(box)}${nh ? ser.serializeToString(nh).replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '') : ''}</section>`, c.top);
    }
    if (o.refs && Book.info(nb).refs.length) add('referencias.xhtml', 'Referências', `<section class="refs" epub:type="bibliography"><h1>Referências</h1>${Refs.sorted(nb).map(r => `<p>${ser.serializeToString(el('span', { html: Refs.abnt(r).html })).replace(/ xmlns="[^"]+"/g, '')}</p>`).join('')}</section>`);
    if (o.about && F.about) add('autor.xhtml', 'Sobre o autor', `<h1>Sobre o autor</h1>${F.about.split(/\n+/).map(l => `<p>${esc(l)}</p>`).join('')}`);
    const nav = xhtml('Sumário', `<nav epub:type="toc" id="toc" class="toc"><h1>Sumário</h1><ol>${toc.map(([f, t]) => `<li><a href="${f}">${esc(t)}</a></li>`).join('')}</ol></nav>`);
    const opf = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="pt-BR"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${id}</dc:identifier><dc:title>${esc(F.title)}</dc:title>${F.author ? `<dc:creator>${esc(F.author)}</dc:creator>` : ''}<dc:language>pt-BR</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${files.map((f, i) => `<item id="f${i}" href="${f.name}" media-type="application/xhtml+xml"/>`).join('')}${imgs.map((m, i) => `<item id="m${i}" href="${m.name}" media-type="${m.mime}"/>`).join('')}</manifest><spine>${o.toc ? '<itemref idref="nav"/>' : ''}${files.map((f, i) => `<itemref idref="f${i}"/>`).join('')}</spine></package>`;
    const zip = zipStore([{ name: 'mimetype', data: 'application/epub+zip' }, { name: 'META-INF/container.xml', data: '<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
      { name: 'OEBPS/content.opf', data: opf }, { name: 'OEBPS/nav.xhtml', data: nav }, { name: 'OEBPS/style.css', data: this.CSS }, ...files.map(f => ({ name: 'OEBPS/' + f.name, data: f.data })), ...imgs.map(m => ({ name: 'OEBPS/' + m.name, data: m.data }))]);
    await saveFile(this.file(nb, 'epub'), new Blob([zip], { type: 'application/epub+zip' }));
    return `Pronto ✓ e-book com ${list.filter(c => c.num).length} capítulo(s). Antes de publicar, confira no Kindle Previewer ou no app de livros.`;
  },

  /* ---------- PDF (impressão do navegador) ----------
     Formato de livro: margens espelhadas, número de página no rodapé (sem número na capa,
     dedicatória e aberturas de parte), título do livro no alto, sumário com partes, capítulos
     e números de página (calculados medindo o texto com as mesmas medidas da página). */
  pdfGeom(o) {
    const a4 = o.size === 'a4';
    return a4 ? { w: 210, h: 297, top: 25, bottom: 22, inner: 30, outer: 20, fs: '12pt' } : { w: 140, h: 210, top: 18, bottom: 18, inner: 20, outer: 15, fs: '10.5pt' };
  },
  pdfRules(prefix, o) {
    const G = this.pdfGeom(o);
    return `${prefix}{font-family:Georgia,"Times New Roman",serif;font-size:${G.fs};line-height:1.5;color:#111}${prefix} .pb{break-before:page}${prefix} .nonum{page:nonum}
${prefix} .toc h1{margin-top:0}${prefix} .toc-part{font-weight:bold;margin:1em 0 .3em;text-indent:0;display:flex;gap:.4em}${prefix} .toc-i{display:flex;align-items:baseline;gap:.4em;margin:.25em 0;text-indent:0;text-align:left}
${prefix} .toc-i .t{flex:0 1 auto}${prefix} .toc-i .lead{flex:1 1 auto;border-bottom:1px dotted #777;transform:translateY(-.25em);min-width:1em}${prefix} .toc-i .n,${prefix} .toc-part .n{flex:0 0 auto;min-width:1.6em;text-align:right}${prefix} .toc-part .lead{flex:1}
${prefix} h1,${prefix} h2,${prefix} h3,${prefix} h4{color:#111!important}${prefix} .capn{color:#555!important}${prefix} [style*="text-align"]{text-indent:0!important}${prefix} .toc-i.sub{padding-left:1.4em;font-size:.95em}${prefix} figure{break-inside:avoid}${prefix} h1,${prefix} h3{break-after:avoid}
${this.CSS.replace(/body\{[^}]*\}/, '').replace(/(^|\})\s*([^{}@]+)\{/g, (m0, a, sel) => a + sel.split(',').map(x => prefix + ' ' + x.trim()).join(',') + '{')}`;
  },
  async pdf(nb, o) {
    const F = this.front(nb), P = $('#print-area'), G = this.pdfGeom(o); P.innerHTML = ''; P.className = 'bk-print ' + (o.size === 'a4' ? 'a4' : 'b14');
    let st = $('#bk-print-css'); if (!st) { st = el('style', { id: 'bk-print-css' }); document.head.append(st); }
    const num = 'content:counter(page);font-family:Georgia,serif;font-size:9pt;color:#444', head = `content:"${String(F.title || '').replace(/["\\]/g, '')}";font-family:Georgia,serif;font-size:8pt;font-style:italic;color:#777`;
    st.textContent = `@media print{@page{size:${G.w}mm ${G.h}mm;margin:${G.top}mm ${G.outer}mm ${G.bottom}mm ${G.inner}mm;@bottom-center{${num}}}
@page :left{margin-left:${G.outer}mm;margin-right:${G.inner}mm;@top-left{${head}}}@page :right{margin-left:${G.inner}mm;margin-right:${G.outer}mm;@top-right{${head}}}
@page nonum{@bottom-center{content:none}@top-left{content:none}@top-right{content:none}}
${this.pdfRules('#print-area.bk-print', o)}}`;
    const pb = (...k) => el('div', { class: 'pb' }, ...k), nonum = (...k) => el('div', { class: 'pb nonum' }, ...k);
    if (o.front) {
      P.append(el('div', { class: 'nonum' }, el('div', { class: 'rosto' }, el('h1', { text: F.title }), F.sub ? el('p', { class: 'sub', text: F.sub }) : '', F.author ? el('p', { class: 'autor', text: F.author }) : '')));
      if (F.copy) P.append(nonum(el('div', { class: 'direitos', text: F.copy })));
      if (F.ded) P.append(nonum(el('div', { class: 'ded', text: F.ded })));
      if (F.epi) P.append(nonum(el('div', { class: 'epi' }, F.epi, F.epiRef ? el('p', { class: 'ref', text: F.epiRef }) : '')));
    }
    const list = this.list(nb, o), parts = Book.realParts(nb), multi = parts.length > 1;
    // sumário: partes e capítulos, com espaço para o número da página
    let toc = null; const tocRefs = [];
    if (o.toc) {
      toc = el('div', { class: 'toc' }, el('h1', { text: 'Sumário' })); let lp = null;
      for (const c of list) {
        if (!c.top) continue;
        if (multi && c.part !== lp && Book.secKind(c.part) === 'parte') { lp = c.part; const n = el('span', { class: 'n' }); toc.append(el('p', { class: 'toc-part' }, el('span', { text: `Parte ${ROMAN(parts.indexOf(c.part) + 1)} — ${c.part.name}` }), el('span', { class: 'lead' }), n)); tocRefs.push(['part', c.part.id, n]); }
        const n = el('span', { class: 'n' }); toc.append(el('p', { class: 'toc-i' + (multi && Book.secKind(c.part) === 'parte' ? ' sub' : '') }, el('span', { class: 't', text: c.num ? `${o.capLabel ? 'Capítulo ' + c.num + ' — ' : c.num + '. '}${c.s.title || ''}` : c.s.title || '' }), el('span', { class: 'lead' }), n)); tocRefs.push(['cap', c.s.id, n]);
      }
      P.append(nonum(toc));
    }
    if (o.front && F.thanks) P.append(pb(el('h1', { text: 'Agradecimentos' }), ...F.thanks.split(/\n+/).map(l => el('p', { text: l }))));
    let lastPart = null;
    for (const c of list) {
      if (multi && c.part !== lastPart && Book.secKind(c.part) === 'parte') { lastPart = c.part; const pp = nonum(el('p', { class: 'capn', text: 'Parte ' + ROMAN(parts.indexOf(c.part) + 1) }), el('h2', { class: 'parte', text: c.part.name })); pp.dataset.mark = 'part:' + c.part.id; P.append(pp); }
      const notes = []; const box = this.chapterHTML(c, notes);
      const sec = c.top ? pb(o.capLabel && c.num ? el('p', { class: 'capn', text: 'Capítulo ' + c.num }) : '', el('h1', { text: c.s.title || '' })) : el('div', {}, el('h3', { text: c.s.title || '' }));
      sec.dataset.mark = 'cap:' + c.s.id;
      sec.append(...box.childNodes); const nh = this.notesHTML(c, notes); if (nh) sec.append(nh); P.append(sec);
    }
    if (o.refs && Book.info(nb).refs.length) P.append(pb(el('div', { class: 'refs' }, el('h1', { text: 'Referências' }), ...Refs.sorted(nb).map(r => el('p', { html: Refs.abnt(r).html })))));
    if (o.about && F.about) P.append(pb(el('h1', { text: 'Sobre o autor' }), ...F.about.split(/\n+/).map(l => el('p', { text: l }))));
    if (toc) { for (const [, , n] of tocRefs) n.textContent = '000'; for (let k = 0; k < 2; k++) { const pages = this.paginate(P, o); for (const [t, id, n] of tocRefs) n.textContent = pages[t + ':' + id] || ''; } }
    const old = document.title; document.title = safeName(F.title);
    setTimeout(() => { window.print(); document.title = old; P.className = ''; }, 200);
    return 'Na janela de impressão, escolha “Salvar como PDF” (tamanho e margens já vêm certos; deixe “Margens: padrão” e desmarque “Cabeçalhos e rodapés”).';
  },
  /* mede o livro com as mesmas medidas da página e devolve o número da página onde começa cada parte/capítulo */
  paginate(P, o) {
    const G = this.pdfGeom(o), mm = 96 / 25.4, W = (G.w - G.inner - G.outer) * mm, H = (G.h - G.top - G.bottom) * mm;
    let ms = $('#bk-measure-css'); if (!ms) { ms = el('style', { id: 'bk-measure-css' }); document.head.append(ms); }
    ms.textContent = this.pdfRules('.bk-measure', o) + `.bk-measure{position:absolute;left:-99999px;top:0;width:${W}px;visibility:hidden}.bk-measure .pb{break-before:auto}.bk-measure>*{display:flow-root}`;
    const M = el('div', { class: 'bk-measure' }); M.innerHTML = P.innerHTML; document.body.append(M);
    const out = {}; let page = 0, used = 0;
    const lh = parseFloat(getComputedStyle(M).lineHeight) || 20;
    for (const ch of M.children) {
      const forced = ch.classList.contains('pb') || page === 0;
      if (forced) { page++; used = 0; }
      if (ch.dataset.mark) out[ch.dataset.mark] = page;
      const h = ch.getBoundingClientRect().height;
      if (used + h <= H) used += h;
      else { let rem = h - (H - used); const full = Math.ceil(rem / (H - lh)); page += full; used = rem - (full - 1) * (H - lh); }
    }
    M.remove(); return out;
  }
};

/* ===================== IA DE LIVRO + REPETIÇÕES ===================== */
const BookAI = {
  /* trechos repetidos entre capítulos (sem IA): sequências de 9 palavras iguais */
  repeats(nb) {
    const N = 9, seen = new Map(), hits = new Map();
    const ch = Book.chapters(nb).filter(c => !c.plan);
    ch.forEach(c => {
      const words = Search.norm(Book.plain(c.s)).match(/[\p{L}\p{N}]+/gu) || [];
      const local = new Set();
      for (let i = 0; i + N <= words.length; i++) {
        const k = words.slice(i, i + N).join(' '); if (local.has(k)) continue; local.add(k);
        const prev = seen.get(k); if (prev && prev.c !== c) { const key = prev.c.s.id + '|' + c.s.id; (hits.get(key) || hits.set(key, { a: prev.c, b: c, n: 0, sample: k }).get(key)).n++; } else if (!prev) seen.set(k, { c });
      }
    });
    return [...hits.values()].sort((x, y) => y.n - x.n);
  },
  render(P, nb) {
    const rep = this.repeats(nb);
    P.append(el('h4', { text: 'Trechos repetidos entre capítulos (verificação automática, sem IA)' }));
    if (!rep.length) P.append(el('p', { class: 'muted', text: 'Nenhum trecho de 9+ palavras se repete entre capítulos. ✓' }));
    else P.append(el('ul', { class: 'rv-list' }, ...rep.slice(0, 30).map(r => el('li', {}, el('b', { text: `${this.lab(r.a)} e ${this.lab(r.b)}` }), ` — ${r.n} trecho(s) em comum, ex.: “…${r.sample}…”`,
      el('button', { class: 'btn link', text: 'abrir', onclick: () => { $('.modal-bg .modal-head .icon-btn')?.click(); App.open(r.b.s.id); Search && ($('#page-search').value = r.sample.split(' ').slice(0, 4).join(' '), $('#page-search').oninput()); } })))));
    P.append(el('h4', { text: 'Análise do livro inteiro com IA' }),
      el('p', { class: 'muted small', text: 'A IA lê os capítulos (ou um resumo, se o livro for muito grande) e aponta: ilustrações e argumentos repetidos, contradições, lacunas, ordem dos capítulos e o arco do livro.' }));
    const out = el('div', {}); const provs = ['gemini', 'claude'].filter(p => AI.has(p));
    if (!provs.length) { P.append(el('p', { class: 'on-log', text: 'Configure uma chave de IA em ✦ Revisar › ⚙ Chaves e modelos.' })); return; }
    P.append(el('div', { class: 'row-btns' }, ...provs.map(p => el('button', { class: 'btn' + (p === provs[0] ? ' primary' : ''), text: `✦ Analisar com ${p === 'claude' ? 'Claude' : 'Gemini'}`, onclick: async e => {
      e.target.disabled = true; out.innerHTML = ''; out.append(el('p', { class: 'muted', text: 'Lendo o livro… (pode levar 1 a 2 minutos)' }));
      try { const r = await this.analyze(nb, p, rep); nb.book.lastAnalysis = { at: Date.now(), p, r }; App.saveMeta(); this.show(out, r, p); }
      catch (err) { out.innerHTML = ''; out.append(el('p', { class: 'on-log', text: '⚠ ' + err.message })); } finally { e.target.disabled = false; } } }))), out);
    const L = nb.book?.lastAnalysis; if (L) { out.append(el('p', { class: 'muted small', text: `Última análise: ${new Date(L.at).toLocaleString(DL())} (${L.p === 'claude' ? 'Claude' : 'Gemini'})` })); this.show(out, L.r, L.p, true); }
  },
  lab(c) { return c.num ? `Cap. ${c.num}` : `“${c.s.title}”`; },
  async analyze(nb, p, rep) {
    const all = Book.chapters(nb), ch = all.filter(c => !c.plan), plan = all.filter(c => c.plan).map(c => Book.plain(c.s)).join('\n').slice(0, 8000); let total = 0; const full = ch.map(c => { const t = Book.plain(c.s); total += t.length; return [c, t]; });
    const LIM = p === 'gemini' ? 600000 : 300000;
    const parts = full.map(([c, t]) => `### ${this.lab(c)} — ${c.s.title}${Book.meta(c.s).synopsis ? `\nResumo do autor: ${Book.meta(c.s).synopsis}` : ''}\n${total > LIM ? t.slice(0, Math.floor(LIM / ch.length)) + (t.length > LIM / ch.length ? '\n[…capítulo resumido…]' : '') : t}`).join('\n\n');
    const sys = `Você é um editor de livros cristãos de não ficção (português do Brasil), experiente em desenvolvimento editorial. Contexto da igreja do autor: ${AI.cfg().church}
Analise o LIVRO INTEIRO e responda SOMENTE com JSON:
{"arco":"2-4 frases: qual é a promessa do livro e se ela é cumprida do começo ao fim",
 "repeticoes":[{"onde":"Cap. X e Cap. Y","o_que":"ilustração/argumento/frase repetida","sugestao":"..."}],
 "contradicoes":[{"onde":"...","o_que":"...","sugestao":"..."}],
 "lacunas":["tema prometido e não desenvolvido, passo que falta no argumento…"],
 "ordem":["sugestões de reordenar, juntar ou dividir capítulos (diga quais e por quê)"],
 "capitulos":[{"cap":"Cap. N","nota":0,"comentario":"uma frase"}]}
Seja específico e honesto; não elogie à toa; notas de 0 a 10.`;
    const user = `Livro: "${nb.name}"${Book.info(nb).subtitle ? ' — ' + Book.info(nb).subtitle : ''}\n${plan ? 'ROTEIRO/PLANO DO AUTOR (compare o livro com o que ele planejou e diga onde o texto se afastou do plano):\n' + plan + '\n\n' : ''}Repetições literais já detectadas pelo app: ${rep.slice(0, 15).map(r => `${this.lab(r.a)}/${this.lab(r.b)}: "${r.sample}"`).join('; ') || 'nenhuma'}\n\n${parts}`;
    return AI.parseJSON(await AI.ask(p, sys, user, { maxTokens: 8000 }));
  },
  show(out, r, p, keep = false) {
    if (!keep) out.innerHTML = '';
    const L = (t, arr, f) => { if (arr?.length) out.append(el('h4', { text: t }), el('ul', { class: 'rv-list' }, ...arr.map(x => el('li', {}, f(x))))); };
    if (r.arco) out.append(el('div', { class: 'rv-sum' }, el('b', { text: 'Arco do livro: ' }), r.arco));
    L('Repetições', r.repeticoes, x => el('span', {}, el('b', { text: (x.onde || '') + ': ' }), x.o_que || '', x.sugestao ? el('div', { class: 'rv-sug', text: '→ ' + x.sugestao }) : null));
    L('Contradições', r.contradicoes, x => el('span', {}, el('b', { text: (x.onde || '') + ': ' }), x.o_que || '', x.sugestao ? el('div', { class: 'rv-sug', text: '→ ' + x.sugestao }) : null));
    L('Lacunas', r.lacunas, x => x); L('Ordem dos capítulos', r.ordem, x => x);
    L('Capítulo a capítulo', r.capitulos, x => el('span', {}, el('span', { class: 'rv-nota n' + Math.round((+x.nota || 0) / 2.5), text: x.nota ?? '–' }), ' ', el('b', { text: x.cap + ': ' }), x.comentario || ''));
  }
};

/* ===================== LISTA DE CADERNOS (como no OneNote) =====================
   Fixada: vira uma coluna à esquerda. Solta: abre como menu flutuante. */
const NbPanel = {
  /* nomes dos dois grupos de cadernos (o usuário pode renomear; vai junto com a conta) */
  gname(k) { return App.meta.groupNames?.[k] || (k === 'book' ? 'Livros' : k === 'shared' ? 'Compartilhados comigo' : 'Sermões'); },
  async renameGroup(k) {
    const n = await UI.ask('Renomear grupo', this.gname(k), k === 'book' ? 'Ex.: Livros, Escrita' : 'Ex.: Ministério, Pregações e devocionais'); if (!n?.trim()) return;
    (App.meta.groupNames ||= {})[k] = n.trim(); App.saveMeta(); App.renderNav();
  },
  pinned() { try { return localStorage.getItem('ss-nb-pin') === '1'; } catch (e) { return false; } },
  setPinned(v) { try { localStorage.setItem('ss-nb-pin', v ? '1' : '0'); } catch (e) { } document.body.classList.toggle('nb-pinned', v); this.close(); this.render(); },
  switchTo(id) {
    App.goNotebook(id);
    if (!this.pinned()) this.close();
  },
  init() {
    const head = $('#nb-pane .pane-head'); if (!head || $('#nb-btn')) return;
    $('#nb-select').hidden = true;
    this.btn = el('button', { id: 'nb-btn', class: 'nb-btn', title: 'Cadernos', onclick: e => { e.stopPropagation(); this.pinned() && innerWidth > 980 ? this.col.querySelector('.nbc-row.on')?.scrollIntoView({ block: 'nearest' }) : this.toggle(); } });
    head.prepend(this.btn);
    this.col = el('nav', { id: 'nb-col', 'aria-label': 'Cadernos' }); $('#nb-pane').before(this.col);
    document.body.classList.toggle('nb-pinned', this.pinned());
    document.addEventListener('pointerdown', e => { if (this.col.classList.contains('fly') && !this.col.contains(e.target) && !this.btn.contains(e.target)) this.close(); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    this.render();
  },
  toggle() { this.col.classList.contains('fly') ? this.close() : this.openFly(); },
  openFly() {
    this.render(); const r = this.btn.getBoundingClientRect();
    this.col.classList.add('fly'); this.col.style.top = (r.bottom + 4) + 'px'; this.col.style.left = Math.max(6, r.left) + 'px';
  },
  close() { if (!this.col) return; this.col.classList.remove('fly'); this.col.style.top = this.col.style.left = ''; },
  render() {
    if (!this.col) return;
    const m = App.meta, cur = m.notebooks.find(n => n.id === m.currentNb);
    this.btn.innerHTML = ''; this.btn.append(el('span', { class: 'nb-ic', text: Book.isNb(cur) ? '📖' : '🎤' }), el('span', { class: 'nb-name', text: cur?.name || 'Cadernos' }), el('span', { class: 'nb-car', text: this.pinned() ? '' : '▾' }));
    const pin = this.pinned();
    this.col.innerHTML = '';
    this.col.append(el('div', { class: 'nbc-head' }, el('b', { text: 'Cadernos' }),
      el('button', { class: 'icon-btn sm', title: 'Novo caderno', text: '＋', onclick: () => { this.close(); $('#nb-add').click(); } }),
      el('button', { class: 'icon-btn sm nbc-pin' + (pin ? ' on' : ''), title: pin ? 'Desafixar (vira menu flutuante)' : 'Fixar como coluna', text: '📌', onclick: () => this.setPinned(!pin) })));
    const count = nb => { const secs = new Set(m.sections.filter(s => s.nb === nb.id).map(s => s.id)); let n = 0; for (const s of App.sermons.values()) if (secs.has(s.sec)) n++; return n; };
    const group = (k, list) => {
      if (!list.length) return;
      const g = el('div', { class: 'nbc-group', title: 'Duplo clique para renomear' }, el('span', { text: this.gname(k) }),
        el('button', { class: 'icon-btn sm nbc-ren', title: 'Renomear grupo', text: '✎', onclick: e => { e.stopPropagation(); this.renameGroup(k); } }));
      g.ondblclick = () => this.renameGroup(k); this.col.append(g);
      for (const nb of list) {
        const row = el('div', { class: 'nbc-row' + (nb.id === m.currentNb ? ' on' : ''), draggable: 'true', 'data-id': nb.id, title: nb.name, onclick: () => this.switchTo(nb.id) },
          el('span', { class: 'nb-ic', text: nb.foreign || nb.shared ? '👥' : Book.isNb(nb) ? '📖' : '🎤' }), el('span', { class: 'nbc-name', text: nb.name, title: nb.foreign ? `Caderno de ${nb.foreign.ownerName || ''}` : nb.name }), el('span', { class: 'nbc-n', text: count(nb) }),
          el('button', { class: 'icon-btn sm', title: 'Opções do caderno', text: '⋯', onclick: e => { e.stopPropagation(); if (nb.id !== m.currentNb) this.switchTo(nb.id); this.close(); App.notebookMenu(); } }));
        row.addEventListener('dragstart', e => { this.drag = nb.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', nb.id); });
        row.addEventListener('dragover', e => { if (!this.drag || this.drag === nb.id) return; e.preventDefault(); const r = row.getBoundingClientRect(); row.classList.toggle('d-after', e.clientY > r.top + r.height / 2); row.classList.toggle('d-before', e.clientY <= r.top + r.height / 2); });
        row.addEventListener('dragleave', () => row.classList.remove('d-after', 'd-before'));
        row.addEventListener('drop', e => { e.preventDefault(); const after = row.classList.contains('d-after'); row.classList.remove('d-after', 'd-before');
          const a = m.notebooks.findIndex(x => x.id === this.drag); if (a < 0) return; const [x] = m.notebooks.splice(a, 1); let i = m.notebooks.findIndex(y => y.id === nb.id); if (after) i++; m.notebooks.splice(i, 0, x); this.drag = null; App.saveMeta(); App.renderNav(); });
        row.addEventListener('dragend', () => { this.drag = null; });
        bindContextMenu(row, () => { if (nb.id !== m.currentNb) this.switchTo(nb.id); this.close(); App.notebookMenu(); });
        this.col.append(row);
      }
    };
    group('ser', m.notebooks.filter(n => !n.foreign && !Book.isNb(n))); group('book', m.notebooks.filter(n => !n.foreign && Book.isNb(n))); group('shared', m.notebooks.filter(n => n.foreign));
  }
};
