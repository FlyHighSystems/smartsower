/* ===== Tela dividida: a página atual à esquerda (editando) e outra página à direita para consultar.
   Do lado direito dá para selecionar e copiar/arrastar texto, ou trazer um bloco inteiro para onde está o cursor. ===== */
const Split = {
  on: false, id: null,
  load() { try { return JSON.parse(localStorage.getItem('ss-split') || '{}'); } catch (e) { return {}; } },
  save() { try { localStorage.setItem('ss-split', JSON.stringify({ on: this.on, id: this.id, w: this.w })); } catch (e) { } },
  init() {
    const v = this.load(); this.w = v.w || 42; this.id = v.id || null;
    this.pane = el('section', { id: 'split-pane', hidden: true });
    $('#editor')?.after(this.pane);
    document.documentElement.style.setProperty('--split-w', this.w + '%');
    this._restore = !!v.on;
  },
  restore() { if (this._restore && this.id && App.sermons.get(this.id) && this.id !== App.cur?.id) this.open(this.id, true); this._restore = false; },
  toggle() { if (this.on) this.close(); else if (this.id && App.sermons.get(this.id) && this.id !== App.cur?.id) this.open(this.id); else this.pick(); },
  close() { this.on = false; this.pane.hidden = true; document.body.classList.remove('split-on'); this.save(); this.sync(); },
  open(id, quiet) {
    const s = App.sermons.get(id); if (!s) return;
    this.on = true; this.id = id; this.pane.hidden = false; document.body.classList.add('split-on'); this.save();
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
  render() {
    const s = App.sermons.get(this.id); const P = this.pane; P.innerHTML = '';
    if (!s) { this.close(); return; }
    const grip = el('div', { class: 'split-grip', title: 'Arraste para ajustar · duplo clique volta ao padrão' });
    grip.addEventListener('dblclick', () => { this.w = 42; document.documentElement.style.setProperty('--split-w', '42%'); this.save(); });
    grip.addEventListener('pointerdown', e => {
      e.preventDefault(); grip.setPointerCapture(e.pointerId); const main = $('.main').getBoundingClientRect();
      const mv = ev => { this.w = clamp(Math.round((main.right - ev.clientX) / main.width * 100), 22, 70); document.documentElement.style.setProperty('--split-w', this.w + '%'); AddFloat.update?.(); };
      const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); this.save(); };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
    });
    const head = el('div', { class: 'split-head' },
      el('div', { class: 'split-t' }, el('b', { text: s.title || 'Sem título' }), el('span', { class: 'muted small', text: this.where(s) })),
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
  bring(b) {
    if (!App.cur) return; if (typeof Shared !== 'undefined' && !Shared.canEdit(App.cur)) return UI.toast('A página da esquerda é somente leitura.');
    const c = structuredClone(b); delete c.id; delete c.marks;
    const nb = App.insertBlock(c.type, c);
    if (nb) UI.toast(`Bloco “${(BLOCK_TYPES[b.type] || BLOCK_TYPES.text).label}” trazido para “${App.cur.title || 'esta página'}”.`);
  },
  swap() { const other = this.id, cur = App.cur?.id; if (!cur) return; App.flush(); this._swapping = true; App.open(other); this._swapping = false; this.id = cur; this.save(); this.render(); },
  /* a página da direita foi apagada ou é a mesma da esquerda */
  afterOpen() { if (!this.on || this._swapping) return; if (this.id === App.cur?.id || !App.sermons.get(this.id)) { this.close(); UI.toast('A tela dividida foi fechada (era a mesma página).'); } },
};
