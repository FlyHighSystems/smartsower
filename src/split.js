/* ===== Tela dividida: a página atual à esquerda (editando) e outra página à direita para consultar.
   Do lado direito dá para selecionar e copiar/arrastar texto, ou trazer um bloco inteiro para onde está o cursor. ===== */
const Split = {
  on: false, id: null,
  load() { try { return JSON.parse(localStorage.getItem('ss-split') || '{}'); } catch (e) { return {}; } },
  save() { try { localStorage.setItem('ss-split', JSON.stringify({ on: this.on, id: this.id, w: this.w, mode: this.mode })); } catch (e) { } },
  init() {
    const v = this.load(); this.w = v.w || 42; this.id = v.id || null; this.mode = v.mode || 'page';
    this.pane = el('section', { id: 'split-pane', hidden: true });
    $('#editor')?.after(this.pane);
    document.documentElement.style.setProperty('--split-w', this.w + '%');
    this._restore = !!v.on;
  },
  restore() { if (this._restore && this.mode === 'archive') { this.openArchive(true); this._restore = false; return; } if (this._restore && this.id && App.sermons.get(this.id) && this.id !== App.cur?.id) this.open(this.id, true); this._restore = false; },
  toggle() { if (this.on) this.close(); else if (this.id && App.sermons.get(this.id) && this.id !== App.cur?.id) this.open(this.id); else this.pick(); },
  close() { this.on = false; this.pane.hidden = true; document.body.classList.remove('split-on'); this.save(); this.sync(); },
  open(id, quiet) {
    const s = App.sermons.get(id); if (!s) return;
    this.mode = 'page'; this.on = true; this.id = id; this.pane.hidden = false; document.body.classList.add('split-on'); this.save();
    if (!quiet && innerWidth < 1700 && innerWidth >= 900) document.body.classList.add('nav-collapsed');   // dá espaço para as duas páginas
    this.render(); this.sync(); AddFloat.update?.();
    if (!quiet && innerWidth < 900) UI.toast('Tela estreita: a página abre por cima. Use ✕ para voltar.');
  },
  sync() { typeof ViewTab !== 'undefined' && ViewTab.sync(); typeof Focus !== 'undefined' && Focus.syncHud?.(); },
  where(s) { const sec = App.meta.sections.find(x => x.id === s.sec), nb = sec && App.meta.notebooks.find(n => n.id === sec.nb); return [nb?.name, sec?.name].filter(Boolean).join(' › '); },
  /* escolher a página: busca por título em todos os cadernos, recentes primeiro */
  pick() {
    const q = el('input', { type: 'search', class: 'sp-q', placeholder: 'Buscar página pelo título ou caderno…' });
    const list = el('div', { class: 'split-list' });
    const all = [...App.sermons.values()].filter(s => !s.deleted && s.id !== App.cur?.id).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    const norm = t => (t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const paint = () => {
      const k = norm(q.value).split(/\s+/).filter(Boolean); list.innerHTML = '';
      const hits = all.filter(s => { const h = norm((s.title || '') + ' ' + this.where(s)); return k.every(w => h.includes(w)); }).slice(0, 60);
      if (!hits.length) list.append(el('p', { class: 'muted', text: 'Nenhuma página encontrada.' }));
      for (const s of hits) list.append(el('button', { class: 'on-item', onclick: () => { m.close(); this.open(s.id); } }, el('b', { text: s.title || 'Sem título' }), el('span', { class: 'muted small', text: this.where(s) })));
    };
    q.oninput = paint;
    const m = UI.modal({ title: '◫ Abrir uma página ao lado', body: el('div', { class: 'split-pick' }, q, list) });
    paint(); setTimeout(() => q.focus(), 50);
  },
  blockEl(b) {
    const T = BLOCK_TYPES[b.type] || BLOCK_TYPES.text;
    let body;
    if (b.type === 'image') body = el('img', { src: b.src, alt: '' });
    else if (b.type === 'ink') body = el('div', { class: 'muted small', text: '✎ Desenho' });
    else if (b.type === 'verse') { body = el('div', {}, el('div', { class: 'spl-ref', text: [b.ref, b.version ? Bible.info(b.version)?.short : b.verLabel].filter(Boolean).join(' · ') }), el('div', { class: 'spl-vt', html: b.html || '' })); }
    else body = el('div', { html: b.html || '' });
    const bring = el('button', { class: 'spl-bring', title: 'Trazer este bloco para a página da esquerda, logo abaixo do cursor', text: '⇠ Trazer' });
    bring.addEventListener('pointerdown', e => e.preventDefault());
    bring.onclick = () => this.bring(b);
    return el('div', { class: `spl-b spl-${b.type}${isCallout(b.type) ? ' spl-call' : ''}`, style: isCallout(b.type) ? { '--bc': blockColor(b.type) } : null },
      el('div', { class: 'spl-tag', text: T.label }), bring, body);
  },
  /* 📚 Acervo ao lado: blocos dos sermões para trazer ao capítulo, um a um */
  openArchive(quiet) {
    this.mode = 'archive'; this.on = true; this.pane.hidden = false; document.body.classList.add('split-on'); this.save();
    if (!quiet && innerWidth < 1700 && innerWidth >= 900) document.body.classList.add('nav-collapsed');
    this.render(); this.sync(); AddFloat.update?.();
  },
  grip() {
    const grip = el('div', { class: 'split-grip', title: 'Arraste para ajustar · duplo clique volta ao padrão' });
    grip.addEventListener('dblclick', () => { this.w = 42; document.documentElement.style.setProperty('--split-w', '42%'); this.save(); });
    grip.addEventListener('pointerdown', e => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId); const main = $('.main').getBoundingClientRect();
      const mv = ev => { this.w = clamp(Math.round((main.right - ev.clientX) / main.width * 100), 22, 70); document.documentElement.style.setProperty('--split-w', this.w + '%'); AddFloat.update?.(); };
      const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); this.save(); };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
    });
    return grip;
  },
  renderArchive() {
    const P = this.pane; P.innerHTML = '';
    const pool = Archive.pool();
    const q = el('input', { type: 'search', class: 'inp spa-q', placeholder: 'Procurar nos sermões (tema, palavra, ilustração…)', value: this._aq || '' });
    const only = el('input', { type: 'checkbox', checked: this._aonly ?? true });
    const list = el('div', { class: 'split-body spa-list' });
    const paint = () => {
      this._aq = q.value; this._aonly = only.checked;
      const terms = q.value.trim() ? Search.terms(q.value) : [];
      let items = terms.length ? pool.filter(x => terms.every(t => x.n.includes(t))) : only.checked ? pool.filter(x => x.mk) : pool;
      items.sort((a, b) => (b.mk - a.mk) || (b.s.date || '').localeCompare(a.s.date || ''));
      list.innerHTML = '';
      if (!items.length) list.append(el('p', { class: 'muted', text: only.checked && !terms.length ? 'Nenhum bloco marcado com 📚 “Para o livro” ainda. Marque blocos nos seus sermões (🏷 ou Alt+0), desmarque o filtro ou procure acima.' : 'Nada encontrado.' }));
      for (const x of items.slice(0, 150)) {
        const bring = el('button', { class: 'spl-bring', title: 'Trazer para baixo do cursor', text: '⇠ Trazer' });
        bring.addEventListener('pointerdown', e => e.preventDefault()); bring.onclick = () => { this.bring(x.b, x.s); paint(); };
        const src = el('button', { class: 'btn link sm spa-src', title: 'Abrir este sermão inteiro ao lado', text: `${x.s.title || 'Sem título'}${x.s.date ? ' · ' + new Date(x.s.date + 'T12:00').toLocaleDateString(DL()) : ''} ↗`, onclick: () => this.open(x.s.id) });
        const used = App.cur && x.b.usedIn?.includes(App.cur.id);
        list.append(el('div', { class: `spl-b spl-${x.b.type}${isCallout(x.b.type) ? ' spl-call' : ''}`, style: isCallout(x.b.type) ? { '--bc': blockColor(x.b.type) } : null },
          el('div', { class: 'spl-tag', text: (BLOCK_TYPES[x.b.type]?.label || x.b.type) + (x.mk ? ' · 📚' : '') + (used ? ' · ✓ já neste capítulo' : x.b.usedIn?.length ? ' · já usado no livro' : '') }), bring,
          x.b.type === 'verse' ? el('div', {}, el('div', { class: 'spl-ref', text: x.b.ref || '' }), el('div', { class: 'spl-vt', html: x.b.html || '' })) : el('div', { html: x.b.html || '' }),
          src));
      }
    };
    q.oninput = debounce(paint, 200); only.onchange = paint;
    const head = el('div', { class: 'split-head' },
      el('div', { class: 'split-t' }, el('b', { text: '📚 Acervo de sermões' }), el('span', { class: 'muted small', text: 'Traga blocos para o texto da esquerda' })),
      el('button', { class: 'icon-btn sm', title: 'Abrir em janela (marcar vários de uma vez)', text: '☑', onclick: () => App.cur && Archive.modal(App.cur) }),
      el('button', { class: 'icon-btn sm', title: 'Abrir uma página ao lado', text: '⇄', onclick: () => this.pick() }),
      el('button', { class: 'icon-btn sm', title: 'Fechar', text: '✕', onclick: () => this.close() }));
    P.append(this.grip(), head, el('div', { class: 'spa-f' }, q, el('label', { class: 'sl-ck small' }, only, ' Só marcados 📚 “Para o livro” (a busca ignora este filtro)')), list);
    paint(); setTimeout(() => innerWidth >= 900 && !q.value && q.focus({ preventScroll: true }), 50);
  },
  render() {
    if (this.mode === 'archive') return this.renderArchive();
    const s = App.sermons.get(this.id); const P = this.pane; P.innerHTML = '';
    if (!s) { this.close(); return; }
    const grip = this.grip();
    const head = el('div', { class: 'split-head' },
      el('div', { class: 'split-t' }, el('b', { text: s.title || 'Sem título' }), el('span', { class: 'muted small', text: this.where(s) })),
      Book.is(App.cur) ? el('button', { class: 'icon-btn sm', title: 'Voltar ao acervo de sermões', text: '📚', onclick: () => this.openArchive(true) }) : null,
      el('button', { class: 'icon-btn sm', title: 'Escolher outra página', text: '⇄', onclick: () => this.pick() }),
      el('button', { class: 'icon-btn sm', title: 'Trocar de lado: editar esta e consultar a outra', text: '⇆', onclick: () => this.swap() }),
      el('button', { class: 'icon-btn sm', title: 'Atualizar', text: '⟳', onclick: () => this.render() }),
      el('button', { class: 'icon-btn sm', title: 'Fechar a tela dividida', text: '✕', onclick: () => this.close() }));
    const body = el('div', { class: 'split-body' });
    if (s.passage) body.append(el('div', { class: 'spl-pass muted small', text: '📖 ' + s.passage }));
    (s.blocks || []).forEach(b => body.append(this.blockEl(b)));
    if (!(s.blocks || []).length) body.append(el('p', { class: 'muted', text: 'Página vazia.' }));
    body.append(el('p', { class: 'muted small spl-tip', text: 'Dica: selecione um trecho e arraste para o texto da esquerda, ou copie (Ctrl+C). “⇠ Trazer” copia o bloco inteiro para baixo do cursor.' }));
    P.append(grip, head, body);
  },
  bring(b, src) {
    if (!App.cur) return; if (typeof Shared !== 'undefined' && !Shared.canEdit(App.cur)) return UI.toast('A página da esquerda é somente leitura.');
    src ||= App.sermons.get(this.id);
    const book = Book.is(App.cur) && src && !Book.is(src);
    const c = book ? Archive.adapt(b) : structuredClone(b); delete c.id; delete c.marks; delete c.usedIn;
    if (book) Archive.markUsed(src, b, App.cur);
    const nb = App.insertBlock(c.type, c);
    if (nb) UI.toast(`Bloco “${(BLOCK_TYPES[b.type] || BLOCK_TYPES.text).label}” trazido para “${App.cur.title || 'esta página'}”.`);
  },
  swap() { const other = this.id, cur = App.cur?.id; if (!cur) return; App.flush(); this._swapping = true; App.open(other); this._swapping = false; this.id = cur; this.save(); this.render(); },
  /* a página da direita foi apagada ou é a mesma da esquerda */
  afterOpen() { if (!this.on || this._swapping) return; if (this.mode === 'archive') { this.renderArchive(); return; } if (this.id === App.cur?.id || !App.sermons.get(this.id)) { this.close(); UI.toast('A tela dividida foi fechada (era a mesma página).'); } },
};

/* ===== Páginas recentes: histórico das páginas abertas neste aparelho + troca rápida (Ctrl+K) ===== */
const Recent = {
  MAX: 40,
  list() { try { return JSON.parse(localStorage.getItem('ss-recent') || '[]'); } catch (e) { return []; } },
  add(id) {
    if (!id) return; const L = this.list().filter(x => x.id !== id); L.unshift({ id, t: Date.now() });
    try { localStorage.setItem('ss-recent', JSON.stringify(L.slice(0, this.MAX))); } catch (e) { }
  },
  ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`; const h = Math.round(m / 60); if (h < 24) return `há ${h} h`;
    const d = Math.round(h / 24); return d === 1 ? 'ontem' : d < 7 ? `há ${d} dias` : new Date(t).toLocaleDateString(DL());
  },
  init() {
    const add = $('#page-add');
    if (add && !$('#page-recent')) add.before(el('button', { id: 'page-recent', class: 'btn sm', title: 'Páginas recentes (Ctrl+K)', text: '🕘', onclick: () => this.open() }));
    document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); this.open(); } });
  },
  open() {
    if (this.m) return;
    const norm = t => (t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const q = el('input', { type: 'search', class: 'inp rc-q', placeholder: 'Digite para buscar em todas as páginas…' });
    const list = el('div', { class: 'rc-list' }); let items = [], sel = 0;
    const go = (s, side) => { m.close(); side ? Split.open(s.id) : App.open(s.id); };
    const paint = () => {
      const k = norm(q.value).split(/\s+/).filter(Boolean);
      if (k.length) items = [...App.sermons.values()].filter(s => { if (s.id === App.cur?.id) return false; const h = norm((s.title || '') + ' ' + Split.where(s)); return k.every(w => h.includes(w)); })
        .sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 40).map(s => ({ s, t: null }));
      else items = this.list().map(x => ({ s: App.sermons.get(x.id), t: x.t })).filter(x => x.s && x.s.id !== App.cur?.id);
      sel = Math.min(sel, Math.max(0, items.length - 1)); list.innerHTML = '';
      list.append(el('div', { class: 'rc-h muted small', text: k.length ? `${items.length} página(s)` : 'Abertas recentemente neste aparelho' }));
      if (!items.length) list.append(el('p', { class: 'muted', text: k.length ? 'Nenhuma página com esse nome.' : 'Ainda não há páginas recentes.' }));
      items.forEach((x, i) => {
        const side = el('button', { class: 'icon-btn sm rc-side', title: 'Abrir ao lado (tela dividida)', text: '◫', onclick: e => { e.stopPropagation(); go(x.s, true); } });
        const row = el('div', { class: 'rc-item' + (i === sel ? ' on' : ''), onclick: () => go(x.s), onmouseenter: () => { sel = i; list.querySelectorAll('.rc-item').forEach((r, j) => r.classList.toggle('on', j === i)); } },
          el('div', { class: 'rc-main' }, el('b', { text: x.s.title || 'Sem título' }), el('span', { class: 'muted small', text: Split.where(x.s) })),
          x.t ? el('span', { class: 'muted small rc-t', text: this.ago(x.t) }) : null, side);
        list.append(row);
      });
    };
    q.oninput = () => { sel = 0; paint(); };
    q.onkeydown = e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length); paint(); list.querySelector('.rc-item.on')?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); go(items[sel].s, e.shiftKey); }
      else if (e.key === 'Escape') { e.preventDefault(); m.close(); }
    };
    const m = this.m = UI.modal({ title: '🕘 Páginas recentes', body: el('div', { class: 'rc' }, q, list, el('p', { class: 'muted small rc-tip', text: '↑↓ escolhe · Enter abre · Shift+Enter ou ◫ abre ao lado · Ctrl+K de qualquer lugar' })), onClose: () => { this.m = null; } });
    paint(); setTimeout(() => q.focus(), 50);
  },
};
