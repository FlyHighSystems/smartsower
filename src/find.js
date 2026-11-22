/* ===== Aba Pesquisar: busca no app inteiro (palavras, "frase exata", tipo, caderno, período) =====
   Os resultados ocupam a área do editor; ao abrir um resultado, uma barra no topo volta para a lista. */
const FindView = {
  active: false, ran: false,
  st: { q: '', where: 'all', kind: '', period: '', titles: false, sort: 'rel' },
  load() { try { Object.assign(this.st, JSON.parse(localStorage.getItem('ss-find') || '{}'), { q: this.st.q }); } catch (e) { } },
  save() { try { const { q, ...rest } = this.st; localStorage.setItem('ss-find', JSON.stringify(rest)); } catch (e) { } },
  pool() {
    const m = App.meta, w = this.st.where; let list = [...App.sermons.values()];
    if (w.startsWith('nb:')) { const secs = new Set(m.sections.filter(x => x.nb === w.slice(3)).map(x => x.id)); list = list.filter(s => secs.has(s.sec)); }
    else if (w === 'sec') list = list.filter(s => s.sec === m.currentSec);
    else if (w === 'shared') list = list.filter(s => Shared.inShared(s));
    else if (w === 'withme') list = list.filter(s => Shared.nbOfPage(s)?.foreign);
    else { const ok = new Set(m.sections.map(x => x.id)); list = list.filter(s => ok.has(s.sec)); }
    const k = this.st.kind;
    if (k === 'book') list = list.filter(s => Book.is(s)); else if (k === 'none') list = list.filter(s => !Book.is(s) && !PageKinds.of(s)); else if (k) list = list.filter(s => PageKinds.of(s) === k);
    const p = this.st.period;
    if (p) { const now = new Date(), from = p === 'year' ? `${now.getFullYear()}-01-01` : new Date(now - (+p) * 864e5).toISOString().slice(0, 10); list = list.filter(s => (s.date || '') >= from); }
    return list;
  },
  run() {
    const ts = Search.terms(this.st.q), out = [];
    for (const s of this.pool()) {
      const d = Search.doc(s);
      if (!ts.length) { out.push({ s, d, ts, hits: 0, score: 0 }); continue; }
      let score = 0, hits = 0, ok = true;
      for (const t of ts) { const a = Search.count(d.nt, t), b = this.st.titles ? 0 : Search.count(d.nr, t); if (!a && !b) { ok = false; break; } score += a * 10 + b; hits += a + b; }
      if (ok) out.push({ s, d, ts, hits, score });
    }
    const byDate = (a, b) => (b.s.date || '').localeCompare(a.s.date || '') || (b.s.updated || 0) - (a.s.updated || 0);
    return out.sort(this.st.sort === 'date' || !ts.length ? byDate : (a, b) => b.score - a.score || byDate(a, b));
  },
  show() {
    if (!this.active) { this.active = true; this.load(); }
    $$('.rtab').forEach(x => x.classList.toggle('on', x.dataset.tab === 'find')); $$('.rpanel').forEach(p => p.hidden = p.dataset.panel !== 'find');
    if (window.innerWidth < 980) document.body.classList.add('nav-collapsed');
    this.render(true);
  },
  hide() { if (!this.active) return; this.active = false; CSS.highlights?.delete('ss-find'); App.renderEditor(); },
  render(focus) {
    App.inkSurfaces.forEach(i => i.destroy()); App.inkSurfaces = [];
    const ed = $('#editor-inner'); ed.innerHTML = ''; const st = this.st;
    const q = el('input', { class: 'inp fv-q', type: 'search', value: st.q, placeholder: 'Palavras ou "uma frase exata"…', enterkeyhint: 'search' });
    const opt = (v, t, cur) => el('option', { value: v, text: t, selected: v === cur });
    const where = el('select', { class: 'inp', title: 'Onde procurar' }, opt('all', '📚 Todo o app', st.where), opt('sec', '📄 Só a seção aberta', st.where),
      opt('shared', '👥 Todos os compartilhados', st.where), opt('withme', '👥 Compartilhados comigo', st.where),
      ...App.meta.notebooks.map(n => opt('nb:' + n.id, (n.foreign || n.shared ? '👥 ' : Book.isNb(n) ? '📖 ' : '🎤 ') + n.name, st.where)));
    const kind = el('select', { class: 'inp', title: 'Tipo de página' }, opt('', 'Todos os tipos', st.kind), ...PAGE_KINDS.map(([id, l, ic]) => opt(id, ic + ' ' + l, st.kind)), opt('none', '▫ Sem tipo', st.kind), opt('book', '📖 Páginas de livro', st.kind));
    const period = el('select', { class: 'inp', title: 'Período (pela data da página)' }, opt('', 'Qualquer data', st.period), opt('30', 'Últimos 30 dias', st.period), opt('90', 'Últimos 3 meses', st.period), opt('365', 'Últimos 12 meses', st.period), opt('year', 'Este ano', st.period));
    const sort = el('select', { class: 'inp', title: 'Ordem' }, opt('rel', 'Mais relevantes', st.sort), opt('date', 'Mais recentes', st.sort));
    const titles = el('label', { class: 'fv-chk' }, el('input', { type: 'checkbox', checked: st.titles }), ' Só nos títulos');
    const out = el('div', { class: 'fv-results' });
    const go = () => {
      Object.assign(st, { q: q.value.trim(), where: where.value, kind: kind.value, period: period.value, sort: sort.value, titles: titles.firstChild.checked }); this.save();
      out.innerHTML = ''; const filt = st.kind || st.period || st.where !== 'all';
      if (!st.q && !filt) { out.append(el('div', { class: 'fv-help muted' }, el('p', { html: 'Digite palavras (em qualquer ordem) ou <b>"uma frase exata"</b> entre aspas. Acentos não importam.' }), el('p', { text: 'Ou escolha só um tipo — por exemplo “🌅 Devocional” — para ver todas as devocionais do app, de todos os cadernos.' }))); return; }
      if ((st.where === 'shared' && !App.meta.notebooks.some(n => n.shared || n.foreign)) || (st.where === 'withme' && !App.meta.notebooks.some(n => n.foreign))) {
        out.append(el('div', { class: 'fv-help muted' }, el('p', { text: st.where === 'withme' ? 'Ninguém compartilhou um caderno com você ainda. Quando compartilharem, as páginas aparecem aqui.' : 'Você ainda não tem cadernos compartilhados. Abra uma página e toque em “👥 Compartilhar”, ao lado do Tipo.' }))); return;
      }
      const res = this.run(); const total = res.reduce((n, r) => n + r.hits, 0);
      out.append(el('div', { class: 'fv-sum' }, el('b', { text: res.length ? `${res.length} página${res.length > 1 ? 's' : ''}` : 'Nada encontrado' }), st.q && res.length ? ` · ${total} ocorrência${total > 1 ? 's' : ''}` : '', !res.length && st.where !== 'all' ? ' — tente “Todo o app”.' : ''));
      for (const r of res.slice(0, 300)) {
        const s = r.s, row = el('button', { class: 'fv-row' + (App.cur?.id === s.id ? ' cur' : ''), onclick: () => this.openResult(s.id) },
          el('div', { class: 'fv-top' }, el('b', { class: 'fv-title', text: s.title || 'Sem título' }), r.hits ? el('span', { class: 'sr-n', text: r.hits }) : null),
          el('div', { class: 'fv-meta' }, PageKinds.badge(s), Translate.langBadge(s), Shared.inShared(s) ? el('span', { class: 'lang-badge', title: 'Caderno compartilhado', text: Shared.isAuthor(s) ? '👥' : '👥 de ' + Shared.authorName(s) }) : null, el('span', { text: [Search.where(s), s.date ? new Date(s.date + 'T12:00').toLocaleDateString('pt-BR') : ''].filter(Boolean).join(' · ') })),
          r.ts.length ? Search.snippet(r.d, r.ts) : el('div', { class: 'page-sub sr-snip', text: (s.passage ? s.passage + ' · ' : '') + r.d.raw.slice(0, 110) }));
        out.append(row);
      }
      if (res.length > 300) out.append(el('p', { class: 'muted small', text: `Mostrando 300 de ${res.length}. Refine a busca.` }));
    };
    let t; q.oninput = () => { clearTimeout(t); t = setTimeout(go, 200); }; q.onkeydown = e => { if (e.key === 'Enter') { clearTimeout(t); go(); q.blur(); } };
    for (const c of [where, kind, period, sort]) c.onchange = go; titles.firstChild.onchange = go;
    ed.append(el('div', { class: 'fv' },
      el('div', { class: 'fv-head' }, el('h2', { text: '🔎 Pesquisar' }), el('button', { class: 'btn sm', text: '✕ Fechar', title: 'Voltar para a página', onclick: () => { $('.rtab[data-tab="home"]').click(); } })),
      q, el('div', { class: 'fv-filters' }, where, kind, period, sort, titles), out));
    go(); if (focus && !matchMedia('(pointer:coarse)').matches) setTimeout(() => { q.focus(); q.select(); }, 30);
  },
  openResult(id) {
    this.active = false; this.ran = true; this._opening = true; try { App.open(id); } finally { this._opening = false; }
    const ts = Search.terms(this.st.q); setTimeout(() => Search.highlight(ts), 60);
  },
  // barra no topo da página aberta a partir da pesquisa
  backBar() {
    if (!this.ran) return null; const st = this.st;
    const label = st.q ? `“${st.q}”` : (PageKinds.get(st.kind)?.[1] || 'pesquisa');
    return el('div', { class: 'fv-back' }, el('button', { class: 'btn sm', text: `← Resultados de ${label}`, onclick: () => this.show() }), el('button', { class: 'icon-btn sm', text: '✕', title: 'Esconder', onclick: e => { this.ran = false; CSS.highlights?.delete('ss-find'); e.currentTarget.parentElement.remove(); } }));
  }
};
