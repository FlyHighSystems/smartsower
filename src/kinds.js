/* ===== Tipo da página (cadernos de ministração): sermão, devocional, estudo…
   O mesmo tipo é usado pela revisão com IA e pelo filtro "Tipo" que junta as páginas
   de todas as seções do caderno. ===== */
const PAGE_KINDS = [
  ['sermao', 'Sermão', '🎤', '#7719aa', 'Ministração longa, para o culto'],
  ['devocional', 'Devocional', '🌅', '#c27c0e', 'Texto curto de edificação'],
  ['estudo', 'Estudo', '📖', '#0f6cbd', 'Estudo bíblico / ensino'],
  ['celula', 'Célula / PG', '👥', '#107c10', 'Palavra para pequeno grupo'],
  ['insight', 'Insight', '💡', '#b4009e', 'Ideia, anotação, semente de mensagem'],
  ['outro', 'Outro', '📝', '#605e5c', 'Qualquer outro tipo'],
];
// tempo de cada tipo: [como medir, minutos padrão]
const KIND_TIME = { sermao: ['fala', 40], estudo: ['fala', 50], celula: ['fala', 20], devocional: ['leitura', 5], insight: ['nenhum', 0], outro: ['fala', 0] };
const READ_WPM = 200; // leitura silenciosa em português (conservador)
const PageKinds = {
  timeMode(s) { return KIND_TIME[this.eff(s)]?.[0] || 'fala'; },
  userSetDur(s) { return s.durSet === true || (s.durSet === undefined && !!s.duration && s.duration !== 40); }, // páginas antigas: 40 era o padrão de toda página
  planned(s) { if (Book.is(s)) return s.duration || 0; if (this.userSetDur(s)) return s.duration || 0; const k = KIND_TIME[this.eff(s)]; return k ? k[1] : (s.duration || 0); },
  readMin(s) { return Estimate.ofBlocks(s.blocks, 1 / READ_WPM).minutes; },
  timeText(s) { // o que vai para a revisão com IA
    const m = this.timeMode(s), p = this.planned(s);
    if (m === 'nenhum') return '';
    if (m === 'leitura') return `Tempo de leitura estimado: ≈ ${Estimate.fmt(this.readMin(s))}${p ? ` (meta: até ${p} min de leitura)` : ''}. É um texto para LER, não uma pregação: não avalie duração de culto.`;
    return (p ? `Duração planejada: ${p} min` : '') + `${p ? ' · ' : ''}tempo falado estimado: ≈ ${Estimate.fmt(Estimate.sermon(s).minutes)}`;
  },
  paintTime(s) {
    const L = $('#s-dur-label'), I = $('#s-duration'); if (!L || !I) return; const m = this.timeMode(s);
    L.hidden = m === 'nenhum'; L.firstChild.textContent = m === 'leitura' ? 'Leitura até ' : 'Duração ';
    L.title = m === 'leitura' ? 'Meta de tempo de leitura (devocional)' : 'Tempo planejado para ministrar';
    const p = this.planned(s); if (document.activeElement !== I) I.value = p || '';
  },

  get(id) { return PAGE_KINDS.find(k => k[0] === id); },
  of(s) { return !Book.is(s) && this.get(s.kind) ? s.kind : null; },
  guess(s) { if (Book.is(s)) return null; const n = stripAccents((App.meta.sections.find(x => x.id === s.sec)?.name || '').toLowerCase()); return /devoc/.test(n) ? 'devocional' : /estud/.test(n) ? 'estudo' : /celula|\bpg\b|pequeno/.test(n) ? 'celula' : /insight|ideia/.test(n) ? 'insight' : /serm|ministra|prega/.test(n) ? 'sermao' : null; },
  eff(s) { return this.of(s) || this.guess(s); },
  badge(s) {
    const k = this.get(this.eff(s)); if (!k) return null; const g = !this.of(s);
    return el('span', { class: 'pk-badge' + (g ? ' guess' : ''), style: { '--pk': k[3] }, title: g ? `${k[1]} (pelo nome da seção — abra a página e escolha o tipo para confirmar)` : k[1], text: k[2] + ' ' + k[1] });
  },
  set(s, id) { const was = this.timeMode(s); s.kind = id || undefined; if (!id) delete s.kind; if (!this.userSetDur(s) || was !== this.timeMode(s)) { s.durSet = false; s.duration = this.planned(s); } App.touch(s); if (App.cur === s) { this.paintTime(s); App.updateEstimate(); } },
  // ── criar página já com o tipo
  addMenu(anchor) {
    $('.mk-menu')?.remove();
    const box = el('div', { class: 'mk-menu pk-menu' }, el('div', { class: 'muted small', style: { padding: '4px 10px' }, text: 'Nova página — o que vai ser?' }),
      ...PAGE_KINDS.map(([id, label, ic, color, hint]) => el('button', { class: 'mk-item', onclick: () => { box.remove(); try { localStorage.setItem('ss-last-kind', id); } catch (e) { } App.newSermon({ kind: id, duration: KIND_TIME[id][1], durSet: false }); } },
        el('span', { class: 'pk-ic', style: { color }, text: ic }), el('span', { class: 'mk-l', text: label }), el('kbd', { text: hint }))),
      el('button', { class: 'mk-item muted', onclick: () => { box.remove(); App.newSermon(); } }, el('span', { class: 'pk-ic', text: '▫' }), el('span', { class: 'mk-l', text: 'Sem tipo' }), el('kbd', { text: 'decido depois' })));
    document.body.append(box); const r = anchor.getBoundingClientRect();
    box.style.left = Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, r.left)) + 'px'; box.style.top = Math.min(r.bottom + 4, innerHeight - box.offsetHeight - 8) + 'px';
    setTimeout(() => { const off = e => { if (!box.contains(e.target)) { box.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
  },
  // ── filtro por tipo no caderno inteiro
  filterKey() { return 'ss-kindf-' + (App.meta.currentNb || ''); },
  filter() { try { const v = localStorage.getItem(this.filterKey()) || ''; return v === 'none' || this.get(v) ? v : ''; } catch (e) { return ''; } },
  setFilter(v) { try { v ? localStorage.setItem(this.filterKey(), v) : localStorage.removeItem(this.filterKey()); } catch (e) { } App.renderPages(); },
  nbPages() { const secs = App.meta.sections.filter(x => x.nb === App.meta.currentNb); return secs.flatMap(sec => App.sectionSermons(sec.id)); },
  filtered(v) { return this.nbPages().filter(s => v === 'none' ? !this.eff(s) : this.eff(s) === v); },
  renderBar() {
    const bar = $('#kind-bar'); if (!bar) return;
    const nb = App.meta.notebooks.find(n => n.id === App.meta.currentNb);
    if (!nb || Book.isNb(nb)) { bar.hidden = true; return; }
    const pages = this.nbPages(), count = id => pages.filter(s => id === 'none' ? !this.eff(s) : this.eff(s) === id).length, cur = this.filter();
    bar.hidden = false; bar.innerHTML = '';
    const chip = (id, txt, n, color) => el('button', { class: 'pk-chip' + (cur === id ? ' on' : ''), style: color ? { '--pk': color } : null, title: id ? 'Mostrar só este tipo, de todas as seções do caderno' : 'Voltar para a seção', onclick: () => this.setFilter(cur === id ? '' : id) }, txt, n != null ? el('small', { text: ' ' + n }) : null);
    bar.append(chip('', 'Seção', null));
    for (const [id, label, ic, color] of PAGE_KINDS) { const n = count(id); if (n || cur === id) bar.append(chip(id, ic + ' ' + label, n, color)); }
    const nn = count('none'); if (nn && pages.length > nn) bar.append(chip('none', '▫ Sem tipo', nn));
  },
  // ── seletor no cabeçalho da página
  headSelect(s) {
    const sel = el('select', { id: 's-kind', title: 'O que é esta página — usado no filtro "Tipo" e na revisão com IA' },
      el('option', { value: '', text: '— sem tipo —' }), ...PAGE_KINDS.map(([id, label, ic]) => el('option', { value: id, text: ic + ' ' + label, selected: s.kind === id })));
    sel.onchange = () => { this.set(s, sel.value); App.renderPages(); };
    const g = !this.of(s) && this.guess(s); if (g) sel.append(el('option', { value: '', text: '', hidden: true })), sel.title += ` · pelo nome da seção, parece: ${this.get(g)[1]}`;
    return el('label', { class: 'pk-head' }, 'Tipo ', sel);
  },
  // ── ação em massa (modo Selecionar)
  bulkButton(ids, n) {
    return el('button', { class: 'btn sm', text: 'Tipo…', disabled: !n, onclick: e => {
      $('.mk-menu')?.remove();
      const box = el('div', { class: 'mk-menu pk-menu' }, el('div', { class: 'muted small', style: { padding: '4px 10px' }, text: `Marcar ${n} página(s) como:` }),
        ...PAGE_KINDS.map(([id, label, ic, color]) => el('button', { class: 'mk-item', onclick: () => { box.remove(); for (const i of ids()) { const s = App.sermons.get(i); if (s && !Book.is(s)) this.set(s, id); } App.flush(); App.renderPages(); if (App.cur) App.renderEditor(); UI.toast(`${n} página(s) marcada(s) como ${label}`); } }, el('span', { class: 'pk-ic', style: { color }, text: ic }), el('span', { class: 'mk-l', text: label }))),
        el('button', { class: 'mk-item', onclick: () => { box.remove(); for (const i of ids()) { const s = App.sermons.get(i); if (s && !Book.is(s)) this.set(s, ''); } App.flush(); App.renderPages(); } }, el('span', { class: 'pk-ic', text: '▫' }), el('span', { class: 'mk-l', text: 'Tirar o tipo' })));
      document.body.append(box); const r = e.currentTarget.getBoundingClientRect();
      box.style.left = Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, r.left)) + 'px'; box.style.top = Math.min(r.bottom + 4, innerHeight - box.offsetHeight - 8) + 'px';
      setTimeout(() => { const off = ev => { if (!box.contains(ev.target)) { box.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
    } });
  }
};
