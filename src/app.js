/* ===== Estado, navegação (cadernos/seções/páginas) e editor ===== */
const BLOCK_TYPES = {
  point: { label: 'Ponto', ph: 'Título do ponto' },
  subhead: { label: 'Intertítulo', ph: 'Intertítulo' },
  text: { label: 'Texto', ph: 'Escreva aqui… (cole do OneNote, Word etc.)' },
  verse: { label: 'Versículo', ph: 'Texto do versículo' },
  illus: { label: 'Ilustração', ph: 'Conte a ilustração…' },
  app: { label: 'Aplicação', ph: 'Como isso se aplica à vida da igreja?' },
  quote: { label: 'Frase-chave', ph: 'A frase que a igreja deve levar para casa' },
  intro: { label: 'Introdução', ph: 'Como você vai abrir a mensagem? (gancho, história, pergunta)' },
  concl: { label: 'Conclusão', ph: 'Fechamento, apelo, oração final' },
  ink: { label: 'Desenho' },
  mind: { label: 'Mapa mental' },
  image: { label: 'Imagem' },
};
/* Blocos de destaque (com rótulo e cor). Inclui os tipos criados pelo usuário. */
const CALLOUTS = ['intro', 'illus', 'app', 'quote', 'concl'];
const CALLOUT_COLORS = { intro: '#4f6bed', illus: '#c25e00', app: '#107c10', quote: '#008575', concl: '#b4009e' };
const isCallout = t => CALLOUTS.includes(t) || String(t).startsWith('c_');
const blockColor = t => CALLOUT_COLORS[t] || (App.meta?.customTypes || []).find(c => c.id === t)?.color || '#8a8886';
const TEXT_TYPES = () => ['point', 'subhead', 'text', ...CALLOUTS, ...(App.meta?.customTypes || []).map(c => c.id)];
function registerCustomTypes() {
  for (const k of Object.keys(BLOCK_TYPES)) if (k.startsWith('c_')) delete BLOCK_TYPES[k];
  for (const c of App.meta.customTypes || []) BLOCK_TYPES[c.id] = { label: c.label, ph: c.ph || 'Escreva aqui…' };
}
const SECTION_COLORS = ['#7719aa', '#0f6cbd', '#c239b3', '#107c10', '#c25e00', '#008575', '#b4009e', '#4f6bed', '#986f0b', '#a4262c'];

const App = {
  meta: null, sermons: new Map(), cur: null, focusId: null, inkSurfaces: [], lastInk: null, scroller: null,
  ink: { tool: 'pen', color: '#1b1b1b', hlColor: '#ffd400', size: 2.2, finger: false },

  /* abertura blindada: se uma parte falhar, o resto abre e o erro aparece num aviso */
  bootErrors: [], step: 'início',
  safe(name, fn) { try { fn(); } catch (e) { console.error(name, e); this.bootErrors.push(`${name}: ${e.message}`); } },
  async init() {
    this.bootT = Date.now(); Gate.early(); Boot.watch();
    if (/[?&]v=\d/.test(location.search)) { history.replaceState(null, '', location.pathname + location.hash); }
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._hiddenAt = Date.now(); else if (Date.now() - (this._hiddenAt || Date.now()) > 120000) { this.bootT = Date.now(); this._typed = false; } });
    this.step = 'banco local'; Splash.set('Abrindo o banco de dados…', 10); await DB.init();
    this.step = 'lendo seus cadernos'; Splash.set('Lendo seus cadernos…', 22); this.meta = (await DB.get('kv', 'meta')) || this.seedMeta();
    for (const s of await DB.all('sermons')) this.sermons.set(s.id, s);
    if (!this.sermons.size) { const w = welcomeSermon(this.meta.sections[0].id); this.sermons.set(w.id, w); await DB.put('sermons', w.id, w); this.meta.currentSermon = w.id; }
    await this.saveMeta();
    Splash.set(null, 35, `${this.meta.notebooks.length} caderno(s) · ${this.sermons.size} página(s)`);
    this.scroller = $('#editor');
    this.meta.customTypes ||= []; registerCustomTypes();
    this.step = 'montando a tela'; Splash.set('Montando a tela…', 45); this.safe('Theme', () => Theme.init()); this.safe('Ribbon', () => Ribbon.bind()); this.safe('BiblePane', () => BiblePane.bind()); this.safe('bindNav', () => this.bindNav());
    this.step = 'Bíblias'; Splash.set('Carregando as Bíblias…', 58); try { await Promise.race([Bible.init(), new Promise(r => setTimeout(r, 5000))]); } catch (e) { this.bootErrors.push('Bible: ' + e.message); }
    this.step = 'cadernos'; Splash.set('Organizando cadernos e seções…', 66); this.safe('renderNav', () => this.renderNav());
    this.step = 'nuvem'; Splash.set('Conectando à nuvem…', 74); await Cloud.init();
    if (Gate.need()) await Gate.wait();
    const first = this.sermons.get(this.meta.currentSermon) || this.sectionSermons(this.meta.currentSec)[0] || [...this.sermons.values()][0];
    this.step = 'abrindo a página'; Splash.set('Abrindo sua última página…', 88); try { first ? this.open(first.id, true) : this.renderEditor(); } catch (e) { this.bootErrors.push('abrir página: ' + e.message); try { this.renderEditor(); } catch (e2) { } }
    this.safe('Split', () => Split.restore());
    this.booted = true; Boot.done();
    if (DB.volatile) UI.toast('Atenção: armazenamento local indisponível aqui. Faça backup (Exportar › Backup).');
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.flush(); UI.toast('Salvo'); }
      if (e.key === 'F5' && !Reader.active) { e.preventDefault(); Reader.open(this.cur); }
      const inText = e.target.closest && e.target.closest('[contenteditable], input, textarea, select');
      const inSel = inText && e.target.matches?.('#page-list input[type=checkbox]');
      if ((!inText || inSel) && this.selMode && this.sel?.size && (e.key === 'Delete' || e.key === 'Backspace') && !$('.modal')) { e.preventDefault(); this._bulkDel?.click(); }
      if ((!inText || inSel) && this.selMode && e.key === 'Escape' && !$('.modal')) { this.selMode = false; this.sel = new Set(); this.renderPages(); }
      if (this.cur && !Reader.active && e.ctrlKey && e.altKey && (e.key === ']' || e.key === '[')) { e.preventDefault(); this.indentPage(this.cur.id, e.key === ']' ? 1 : -1); }
      if (this.cur && !Reader.active && !inText && e.altKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); this.movePage(this.cur.id, e.key === 'ArrowUp' ? -1 : 1); }
    });
    const saveAll = () => { this.flush(); DB.put('kv', 'meta', this.meta); };
    window.addEventListener('beforeunload', saveAll); window.addEventListener('pagehide', saveAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) Share.flushLive?.(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveAll(); });
  },
  seedMeta() {
    const nb = { id: uid(), name: 'Ministrações', color: '#7719aa' };
    const secs = ['Sermões', 'Estudos', 'Devocionais'].map((n, i) => ({ id: uid(), nb: nb.id, name: n, color: SECTION_COLORS[i] }));
    return { notebooks: [nb], sections: secs, currentNb: nb.id, currentSec: secs[0].id, currentSermon: null, bibleVersion: null, bibleNav: { book: 43, ch: 3 } };
  },
  saveMeta() {
    // marca mudança só quando muda algo que sincroniza (cadernos, seções, tipos, temas)
    try { const P = Cloud.metaPayload(); if (P.follow) P.follow = { ...P.follow, last: 0 }; const sig = JSON.stringify(P); if (this._metaSig && sig !== this._metaSig) { this.meta.metaUpdated = Date.now(); Cloud.schedule(); } this._metaSig = sig; } catch (e) { }
    this._saveMetaDb();
  },
  _saveMetaDb: debounce(function () { return DB.put('kv', 'meta', App.meta); }, 300),
  sectionSermons(secId) {
    const arr = [...this.sermons.values()].filter(s => s.sec === secId);
    const byDate = (a, b) => (b.date || '').localeCompare(a.date || '') || b.updated - a.updated;
    if (!arr.some(s => s.order != null)) return arr.sort(byDate);
    return arr.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || byDate(a, b));
  },
  /* ===== Ordem manual e subpáginas (como no OneNote) ===== */
  pageList(secId) { const l = this.sectionSermons(secId); this.normalizeLevels(l); return l; },
  normalizeLevels(l) { l.forEach((s, i) => { const max = i === 0 ? 0 : Math.min(2, (l[i - 1].level || 0) + 1); if ((s.level || 0) > max) s.level = max; }); },
  blockEnd(l, i) { let j = i; const lv = l[i].level || 0; while (j + 1 < l.length && (l[j + 1].level || 0) > lv) j++; return j; },
  saveOrder(l) { l.forEach((s, i) => { if (s.order !== i) { s.order = i; this.touch(s); } }); this.normalizeLevels(l); this.flush(); this.renderPages(); },
  movePage(id, dir) {
    const l = this.pageList(this.meta.currentSec); const i = l.findIndex(s => s.id === id); if (i < 0) return;
    const j = this.blockEnd(l, i), blk = l.slice(i, j + 1), lv = l[i].level || 0;
    if (dir < 0) {
      if (i === 0 || (l[i - 1].level || 0) < lv) return; // já é a primeira dentro do grupo
      let k = i - 1; while (k > 0 && (l[k].level || 0) > lv) k--;
      l.splice(i, blk.length); l.splice(k, 0, ...blk);
    } else {
      if (j + 1 >= l.length || (l[j + 1].level || 0) < lv) return; // já é a última dentro do grupo
      const e = this.blockEnd(l, j + 1);
      l.splice(i, blk.length); l.splice(e - blk.length + 1, 0, ...blk);
    }
    this.saveOrder(l);
  },
  indentPage(id, d) {
    const l = this.pageList(this.meta.currentSec); const i = l.findIndex(s => s.id === id); if (i < 0) return;
    if (d > 0 && i === 0) { UI.toast('A primeira página não pode ser subpágina'); return; }
    const j = this.blockEnd(l, i); const cur = l[i].level || 0;
    const nl = d > 0 ? Math.min(2, cur + 1, (l[i - 1].level || 0) + 1) : Math.max(0, cur - 1);
    if (nl === cur) { if (d > 0) UI.toast('Máximo de 2 níveis de subpágina'); return; }
    for (let k = i; k <= j; k++) { const v = Math.max(0, Math.min(2, (l[k].level || 0) + (nl - cur))); if ((l[k].level || 0) !== v) { l[k].level = v; this.touch(l[k]); } }
    this.saveOrder(l);
  },
  toggleCollapse(id) { const s = this.sermons.get(id); s.collapsed = !s.collapsed; this.touch(s); this.renderPages(); },
  dropPage(dragId, targetId, after) {
    const drag = this.sermons.get(dragId), target = this.sermons.get(targetId); if (!drag || !target || dragId === targetId) return;
    if (drag.sec !== target.sec) { drag.sec = target.sec; drag.level = 0; }
    const l = this.pageList(target.sec); const i = l.findIndex(s => s.id === dragId);
    const j = this.blockEnd(l, i); const blk = l.splice(i, j - i + 1);
    if (blk.some(b => b.id === targetId)) { l.splice(i, 0, ...blk); return; }
    let t = l.findIndex(s => s.id === targetId); if (after) t = this.blockEnd(l, t) + 1;
    const shift = (target.level || 0) - (blk[0].level || 0);
    blk.forEach(b => { b.level = Math.max(0, Math.min(2, (b.level || 0) + shift)); this.touch(b); });
    l.splice(t, 0, ...blk); this.saveOrder(l); this.renderNav();
  },
  startSelect(ids) { this.selMode = true; this.sel = new Set(ids.filter(id => id && this.sermons.has(id))); this.renderPages(); UI.toast('Seleção: marque as páginas e use Mover, Copiar, Tipo ou Excluir (tecla Delete).'); },
  pageMenu(s) {
    const m = UI.modal({ title: s.title || 'Página', body: el('div', { class: 'pm' },
      el('button', { class: 'on-item', onclick: () => { m.close(); this.movePage(s.id, -1); } }, el('b', { text: '↑ Subir' })),
      el('button', { class: 'on-item', onclick: () => { m.close(); this.movePage(s.id, 1); } }, el('b', { text: '↓ Descer' })),
      el('button', { class: 'on-item', onclick: () => { m.close(); this.indentPage(s.id, 1); } }, el('b', { text: '→ Tornar subpágina' }), el('span', { class: 'muted small', text: 'Fica recuada debaixo da página de cima' })),
      el('button', { class: 'on-item', onclick: () => { m.close(); this.indentPage(s.id, -1); } }, el('b', { text: '← Promover' }), el('span', { class: 'muted small', text: 'Volta um nível' })),
      el('button', { class: 'on-item', onclick: async () => { m.close(); const r = await SectionPicker.pick(`“${s.title}”`, true); if (r) this.moveSermons([s.id], r.sec, r.copy); } }, el('b', { text: '⇢ Mover / Copiar para outra seção' })),
      s.id !== this.cur?.id ? el('button', { class: 'on-item', onclick: () => { m.close(); Split.open(s.id); } }, el('b', { text: '◫ Abrir ao lado' }), el('span', { class: 'muted small', text: 'Consulta esta página enquanto escreve na atual' })) : null,
      el('button', { class: 'on-item', onclick: () => { m.close(); this.startSelect([s.id]); } }, el('b', { text: '☑ Selecionar várias' }), el('span', { class: 'muted small', text: 'Para mover, copiar ou excluir várias de uma vez' })),
      el('button', { class: 'on-item', onclick: () => { m.close(); this.open(s.id); this.deleteSermon(); } }, el('b', { class: 'danger-text', text: 'Excluir' }))) });
  },

  /* ---- persistência ---- */
  pending: new Set(),
  touch(s = this.cur) { if (!s) return; if (typeof Shared !== 'undefined' && !Shared.canEdit(s)) return; if (Date.now() - (this.bootT || 0) > 2000) this._typed = true; s.updated = Date.now(); this.pending.add(s.id); this._save(); if (s === this.cur) { this._est(); if (Book.is(s)) Book.updateCount(); } History.tick(s); Cloud.schedule(); typeof Share !== 'undefined' && Share.changed(s); },
  _est: debounce(() => App.updateEstimate(), 400),
  updateEstimate() {
    const E = $('#s-est'); if (!E || !this.cur) return; const e = Estimate.sermon(this.cur);
    const last = (this.cur.preached || []).slice(-1)[0];
    if (!Book.is(this.cur) && PageKinds.timeMode(this.cur) === 'leitura') { const r = PageKinds.readMin(this.cur), p = PageKinds.planned(this.cur); E.textContent = `≈ ${Estimate.fmt(r)} de leitura`; E.classList.toggle('over', !!p && r > p * 1.2); E.title = `${e.words} palavras · leitura silenciosa a ${READ_WPM} palavras/min${p ? ` · meta: até ${p} min` : ''}\nFalado (se for ler em voz alta no culto): ≈ ${Estimate.fmt(e.minutes)}`; return; }
    E.classList.remove('over');
    if (!Book.is(this.cur) && PageKinds.timeMode(this.cur) === 'nenhum') { E.textContent = `${e.words} palavras`; E.title = 'Insight: sem tempo de ministração'; return; }
    E.textContent = `≈ ${Estimate.fmt(e.minutes)} pregando`;
    E.title = `${e.words} palavras · estimativa ${Estimate.label(e)}` + (last ? `\nÚltima vez: ${last.minutes} min em ${new Date(last.date + 'T12:00').toLocaleDateString(DL())}` : '');
  },
  _save: debounce(() => App.flush(), 600),
  flush() { for (const id of this.pending) { const s = this.sermons.get(id); if (s) DB.put('sermons', id, s); } this.pending.clear(); },

  /* ---- navegação ---- */
  bindNav() {
    $('#nb-select').onchange = e => this.goNotebook(e.target.value);
    $('#nb-add').onclick = () => {
      const m = UI.modal({ title: 'Novo caderno', body: el('div', { class: 'type-grid' },
        el('button', { class: 'on-item', onclick: () => { m.close(); newEmpty(); } }, el('b', { text: '🎤 Caderno — ' + NbPanel.gname('ser') }), el('span', { class: 'muted small', text: 'Ministrações, devocionais, estudos, insights' })),
        el('button', { class: 'on-item', onclick: async () => { m.close(); const n = await UI.ask('Novo livro', '', 'Título do livro'); if (n) Book.create(n); } }, el('b', { text: '📖 Livro' }), el('span', { class: 'muted small', text: 'Partes, capítulos, metas, notas de rodapé e exportação do manuscrito' })),
        el('button', { class: 'on-item', onclick: async () => { m.close(); const n = await UI.ask('Novo caderno de anotações', '', 'Ex.: Projetos SOW, Reuniões, Ideias'); if (n) Notes.create(n); } }, el('b', { text: '🗒 Caderno de Anotações' }), el('span', { class: 'muted small', text: 'Reuniões, projetos, organogramas, fluxos, mapas e prints' })),
        el('button', { class: 'on-item', onclick: () => { m.close(); Porter.notebookImport(); } }, el('b', { text: 'Importar caderno do OneNote' }), el('span', { class: 'muted small', text: 'Com as seções, a partir dos arquivos exportados' }))) });
    };
    const newEmpty = async () => { const n = await UI.ask('Novo caderno', '', 'Ex.: Conferência 2027'); if (!n) return; const nb = { id: uid(), name: n, color: SECTION_COLORS[this.meta.notebooks.length % 10] }; this.meta.notebooks.push(nb); const sec = { id: uid(), nb: nb.id, name: 'Geral', color: SECTION_COLORS[0] }; this.meta.sections.push(sec); this.meta.currentNb = nb.id; this.meta.currentSec = sec.id; this.saveMeta(); this.renderNav(); };
    $('#nb-menu').onclick = () => this.notebookMenu();
    $('#sec-add').onclick = $('#sec-add')._orig = async () => { if (App.meta.notebooks.find(n => n.id === this.meta.currentNb)?.foreign) return UI.toast('As seções deste caderno são do dono dele.'); const n = await UI.ask('Nova seção (série, tema, evento…)', ''); if (!n) return; const sec = { id: uid(), nb: this.meta.currentNb, name: n, color: SECTION_COLORS[this.meta.sections.length % 10] }; this.meta.sections.push(sec); this.meta.currentSec = sec.id; this.saveMeta(); this.renderNav(); };
    $('#page-add').onclick = e => PageKinds.addMenu(e.currentTarget);
    $('#page-import').onclick = () => Porter.importDialog();
    Search.init();
    $('#page-select').onclick = () => { this.selMode = !this.selMode; this.sel = new Set(); this.renderPages(); };
    $('#toggle-nav').onclick = () => document.body.classList.toggle('nav-collapsed');
    for (const [n, f] of [['EditorView', () => EditorView.init()], ['Marks', () => Marks.init()], ['MarkSummary', () => MarkSummary.init()], ['Spell', () => Spell.init()], ['Footnotes', () => Footnotes.init()], ['NbPanel', () => NbPanel.init()], ['PaneResize', () => PaneResize.init()], ['FloatBar', () => FloatBar.init()], ['AddFloat', () => AddFloat.init()], ['CaretKeep', () => CaretKeep.init()], ['Focus', () => Focus.init()], ['Split', () => Split.init()], ['Recent', () => Recent.init()], ['Bookmark', () => Bookmark.init()], ['ViewTab', () => ViewTab.init()], ['TopFit', () => TopFit.init()], ['Team', () => Team.init()], ['Emoji', () => Emoji.init()], ['Shared', () => Shared.init()]]) this.safe(n, f);
    this.safe('Updater', () => { Updater.checkSeen(); Updater.initPoll(); }); this.safe('versão', () => { const v = $('#app-ver'); if (v) { v.textContent = 'SmartSower ' + Updater.ver(); v.onclick = () => Updater.notes(); } const g = $('#app-guide'); if (g) g.onclick = () => Tour.start(); Tour.maybeStart(); });
    $('#editor').addEventListener('pointerdown', () => { if (window.innerWidth < 980) document.body.classList.add('nav-collapsed'); });
    if (window.innerWidth < 980) document.body.classList.add('nav-collapsed');
    // dobrar/desdobrar (Galaxy Fold), girar a tela: reajusta como se tivesse aberto naquele tamanho
    let lastW = window.innerWidth, rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => {
      const w = window.innerWidth; if (Math.abs(w - lastW) < 60) return;
      if (w < 980 && lastW >= 980) document.body.classList.add('nav-collapsed');
      const vp = document.querySelector('meta[name=viewport]'); if (vp) { const c = vp.content; vp.content = c + ', maximum-scale=1'; setTimeout(() => { vp.content = c; }, 300); }
      lastW = w;
    }, 150); });
  },
  async notebookMenu() {
    const nb = this.meta.notebooks.find(n => n.id === this.meta.currentNb); if (!nb) return;
    if (nb.foreign) { const m2 = UI.modal({ title: '👥 ' + nb.name, body: el('p', { class: 'muted', text: `Caderno de ${nb.foreign.ownerName || Shared.nameOf(nb.foreign.ownerEmail)}, compartilhado com você. Seções e pessoas são definidas pelo dono.` }), actions: [{ label: 'Sair deste caderno', danger: true, onClick: () => Shared.leave(nb) }] }); return; }
    const m = UI.modal({ title: 'Caderno: ' + nb.name, body: '', actions: [
      { label: nb.shared ? '👥 Pessoas e permissões' : '👥 Compartilhar…', onClick: () => Shared.open(nb) },
      ...(Book.isNb(nb) ? [{ label: '📄 Exportar livro', onClick: () => Book.open('export') }] : []),
      { label: 'Renomear', onClick: async () => { const n = await UI.ask('Renomear caderno', nb.name); if (n) { nb.name = n; this.saveMeta(); this.renderNav(); } } },
      { label: Book.isNb(nb) ? 'Voltar a caderno comum' : '📖 Transformar em livro', onClick: async () => {
        if (Book.isNb(nb)) { if (!await UI.confirm('Voltar a caderno comum', 'As páginas continuam iguais; só some o modo livro (metas, quadro, exportação). Os dados do livro ficam guardados.', 'Voltar a caderno comum')) return; nb.kind = ''; }
        else { nb.kind = 'book'; Book.info(nb); this.meta.sections.filter(x => x.nb === nb.id).forEach(x => Book.ensureOrder(x.id)); }
        this.saveMeta(); this.renderNav(); this.renderEditor(); } },
      ...(Book.isNb(nb) ? [] : [{ label: Notes.isNb(nb) ? '🎤 Voltar a caderno de ministrações' : '🗒 Transformar em caderno de anotações', onClick: () => { nb.kind = Notes.isNb(nb) ? '' : 'notes'; this.saveMeta(); this.renderNav(); this.renderEditor(); UI.toast(Notes.isNb(nb) ? 'Agora é um caderno de anotações' : 'Agora é um caderno de ministrações'); } }]),
      { label: 'Excluir caderno', danger: true, onClick: async () => {
        if (this.meta.notebooks.length < 2) { UI.toast('Mantenha pelo menos um caderno'); return; }
        if (!await UI.confirm('Excluir caderno', `Excluir “${nb.name}” e todas as suas ministrações?`)) return;
        const secIds = this.meta.sections.filter(s => s.nb === nb.id).map(s => s.id);
        for (const s of [...this.sermons.values()]) if (secIds.includes(s.sec)) { this.sermons.delete(s.id); DB.del('sermons', s.id); Cloud.tomb(s.id); }
        this.meta.deleted ||= {}; [nb.id, ...secIds].forEach(id => this.meta.deleted[id] = Date.now());
        this.meta.sections = this.meta.sections.filter(s => s.nb !== nb.id); this.meta.notebooks = this.meta.notebooks.filter(n => n.id !== nb.id);
        this.meta.currentNb = this.meta.notebooks[0].id; this.meta.currentSec = this.meta.sections.find(s => s.nb === this.meta.currentNb)?.id; this.saveMeta(); this.renderNav();
      } }] });
    m.body.innerHTML = '<p class="muted">O que deseja fazer com este caderno?</p>';
  },
  renderNav() {
    const m = this.meta;
    { /* cadernos agrupados por tipo: sermões e livros */
      const opt = n => `<option value="${n.id}" ${n.id === m.currentNb ? 'selected' : ''}>${n.foreign || n.shared ? '👥' : Book.isNb(n) ? '📖' : Notes.isNb(n) ? '🗒' : '🎤'} ${esc(n.name)}</option>`;
      const ser = m.notebooks.filter(n => !n.foreign && !Book.isNb(n)), bks = m.notebooks.filter(n => !n.foreign && Book.isNb(n)), shr = m.notebooks.filter(n => n.foreign);
      $('#nb-select').innerHTML = (bks.length || shr.length) ? `<optgroup label="${esc(NbPanel.gname('ser'))}">${ser.map(opt).join('')}</optgroup>` + (bks.length ? `<optgroup label="${esc(NbPanel.gname('book'))}">${bks.map(opt).join('')}</optgroup>` : '') + (shr.length ? `<optgroup label="Compartilhados comigo">${shr.map(opt).join('')}</optgroup>` : '') : ser.map(opt).join('');
      $('#nb-select').title = NbPanel.gname(Book.cur() ? 'book' : 'ser');
      document.body.classList.toggle('in-book', !!Book.cur());
    }
    const secs = m.sections.filter(s => s.nb === m.currentNb);
    if (!secs.some(s => s.id === m.currentSec)) m.currentSec = secs[0]?.id || null;
    const list = $('#sec-list'); list.innerHTML = '';
    for (const s of secs) {
      const count = this.sectionSermons(s.id).length;
      const row = el('div', { class: 'sec' + (s.id === m.currentSec ? ' active' : ''), style: { '--sc': s.color }, draggable: 'true', 'data-sid': s.id,
        ondragstart: e => { if (e.target !== row) return; e.dataTransfer.setData('text/x-section', s.id); e.dataTransfer.effectAllowed = 'move'; this._dragSec = s.id; }, ondragend: () => { this._dragSec = null; } },
        Book.secBadge(s) || el('span', { class: 'sec-dot' }), el('span', { class: 'sec-name', text: s.name }), el('span', { class: 'sec-count', text: count }),
        el('button', { class: 'icon-btn sm', title: 'Opções da seção', text: '⋯', onclick: e => { e.stopPropagation(); this.sectionMenu(s); } }));
      row.onclick = () => this.goSection(s.id);
      bindContextMenu(row, () => this.sectionMenu(s));
      // soltar uma página arrastada aqui: move (segure Ctrl para copiar)
      row.addEventListener('dragover', e => {
        if (e.dataTransfer.types.includes('text/x-section')) { if (this._dragSec === s.id) return; e.preventDefault(); const r = row.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2; row.classList.toggle('drop-after', after); row.classList.toggle('drop-before', !after); return; }
        if (e.dataTransfer.types.includes('text/x-sermon')) { e.preventDefault(); e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'; row.classList.add('drop'); } });
      row.addEventListener('dragleave', () => row.classList.remove('drop', 'drop-before', 'drop-after'));
      row.addEventListener('drop', e => { e.preventDefault(); const after = row.classList.contains('drop-after'); row.classList.remove('drop', 'drop-before', 'drop-after');
        const sid = e.dataTransfer.getData('text/x-section'); if (sid) { this.placeSection(sid, s.id, after); return; }
        const id = e.dataTransfer.getData('text/x-sermon'); if (!id) return; const ids = this.selMode && this.sel.has(id) ? [...this.sel] : [id]; this.moveSermons(ids, s.id, e.ctrlKey); });
      list.append(row);
    }
    const cs = m.sections.find(s => s.id === m.currentSec);
    $('#pages-title').textContent = cs ? cs.name : '';
    document.documentElement.style.setProperty('--sec-color', cs?.color || '#7719aa');
    this.renderPages();
    Book.navLabels(); NbPanel.render();
  },
  /* ===== Ordem das seções ===== */
  moveSection(id, dir) {
    const A = this.meta.sections, i = A.findIndex(x => x.id === id); if (i < 0) return;
    const nb = A[i].nb; let j = i + dir; while (j >= 0 && j < A.length && A[j].nb !== nb) j += dir;
    if (j < 0 || j >= A.length) return;
    [A[i], A[j]] = [A[j], A[i]]; this.saveMeta(); this.renderNav();
  },
  placeSection(dragId, targetId, after) {
    const A = this.meta.sections; const i = A.findIndex(x => x.id === dragId); if (i < 0 || dragId === targetId) return;
    const [sec] = A.splice(i, 1); const t = A.find(x => x.id === targetId); sec.nb = t.nb;
    let k = A.indexOf(t) + (after ? 1 : 0); A.splice(k, 0, sec); this.saveMeta(); this.renderNav();
  },
  async sectionToNotebook(s) {
    const others = this.meta.notebooks.filter(n => n.id !== s.nb);
    if (!others.length) { UI.toast('Crie outro caderno primeiro'); return; }
    const m = UI.modal({ title: `Mover “${s.name}” para o caderno…`, body: el('div', { class: 'sp-list' }, others.map(n => el('button', { class: 'sp-sec', onclick: () => {
      const A = this.meta.sections; A.splice(A.indexOf(s), 1); s.nb = n.id; A.push(s); this.meta.currentNb = n.id; this.meta.currentSec = s.id; this.saveMeta(); this.renderNav(); m.close(); UI.toast(`Seção movida para “${n.name}”`);
    } }, el('span', { text: n.name })))) });
  },
  async sectionMenu(s) {
    const colors = el('div', { class: 'swatches' }, SECTION_COLORS.map(c => el('button', { class: 'swatch' + (c === s.color ? ' on' : ''), style: { background: c }, onclick: () => { s.color = c; this.saveMeta(); this.renderNav(); m.close(); } })));
    const m = UI.modal({ title: 'Seção: ' + s.name, body: el('div', {},
      el('div', { class: 'pm' },
        el('button', { class: 'on-item', onclick: () => { m.close(); this.moveSection(s.id, -1); } }, el('b', { text: '↑ Subir' })),
        el('button', { class: 'on-item', onclick: () => { m.close(); this.moveSection(s.id, 1); } }, el('b', { text: '↓ Descer' })),
        el('button', { class: 'on-item', onclick: () => { m.close(); this.sectionToNotebook(s); } }, el('b', { text: '⇢ Mover para outro caderno' }))),
      Book.isNb(this.meta.notebooks.find(n => n.id === s.nb)) ? el('div', {}, el('p', { class: 'muted', text: 'Tipo da parte' }), el('div', { class: 'sl-chips' }, ...PART_KINDS.map(([id, l, ic, tip]) => el('button', { class: 'chip' + (Book.secKind(s) === id ? ' on' : ''), title: tip, text: ic + ' ' + l, onclick: () => { s.kind = id; this.saveMeta(); m.close(); this.renderNav(); this.cur && this.renderEditor(); } })))) : null,
      el('p', { class: 'muted', text: 'Cor da seção' }), colors), actions: [
      { label: 'Renomear', onClick: async () => { const n = await UI.ask('Renomear seção', s.name); if (n) { s.name = n; this.saveMeta(); this.renderNav(); } } },
      { label: 'Excluir', danger: true, onClick: async () => {
        const items = this.sectionSermons(s.id);
        if (!await UI.confirm('Excluir seção', `Excluir “${s.name}”${items.length ? ` e ${items.length} ministração(ões)` : ''}?`)) return;
        for (const it of items) { this.sermons.delete(it.id); DB.del('sermons', it.id); Cloud.tomb(it.id); }
        (this.meta.deleted ||= {})[s.id] = Date.now();
        this.meta.sections = this.meta.sections.filter(x => x.id !== s.id); this.saveMeta(); this.renderNav();
        if (this.cur && !this.sermons.has(this.cur.id)) { this.cur = null; this.renderEditor(); }
      } }] });
  },
  renderPages() {
    const q = ($('#page-search').value || '').trim();
    Search.renderScope(q);
    if (q && !this.selMode) return Search.renderResults(q);
    PageKinds.renderBar(); const kf = PageKinds.filter();
    let items = kf ? PageKinds.filtered(kf) : this.sectionSermons(this.meta.currentSec);
    const list = $('#page-list'); list.innerHTML = '';
    if (kf) { const K = PageKinds.get(kf); list.append(el('div', { class: 'pk-note' }, el('span', { text: `${K ? K[2] + ' ' + K[1] : '▫ Sem tipo'} — ${items.length} página(s) de todas as seções` }), el('button', { class: 'btn link sm', text: '✕', title: 'Voltar para a seção', onclick: () => PageKinds.setFilter('') }))); }
    const flat = !!(q || kf); let lastSec = null;
    if (!flat && !this.selMode) { const ask = PageKinds.suggestion(this.meta.currentSec); if (ask) list.append(ask); }
    this.sel ||= new Set(); this.renderBulk();
    if (!items.length) list.append(el('p', { class: 'muted pad', text: q ? 'Nada encontrado.' : kf ? 'Nenhuma página deste tipo neste caderno.' : 'Nenhuma ministração nesta seção.' }));
    if (!flat) { this.normalizeLevels(items); }
    const hidden = new Set(); { const stack = []; items.forEach((s, i) => { const lv = flat ? 0 : (s.level || 0); while (stack.length && stack.at(-1).lv >= lv) stack.pop(); if (stack.some(x => x.collapsed)) hidden.add(s.id); stack.push({ lv, collapsed: !!s.collapsed }); }); }
    for (const [idx, s] of items.entries()) {
      if (!flat && hidden.has(s.id)) continue;
      if (kf && s.sec !== lastSec) { lastSec = s.sec; list.append(el('div', { class: 'pk-sec', text: App.meta.sections.find(x => x.id === s.sec)?.name || '' })); }
      const lv = flat ? 0 : (s.level || 0);
      const hasKids = !flat && items[idx + 1] && (items[idx + 1].level || 0) > lv;
      const preview = s.passage || htmlToText(s.blocks.find(b => b.type === 'text')?.html || '').slice(0, 60);
      if (this.selMode) {
        const on = this.sel.has(s.id);
        const vis = items.map(x => x.id), myIdx = vis.indexOf(s.id);
        list.append(el('label', { class: 'page sel-row' + (on ? ' active' : ''), 'data-id': s.id, onclick: e => { this._shift = e.shiftKey; } },
          el('input', { type: 'checkbox', checked: on, onchange: e => {
            if (this._shift && this._lastSel != null) { const [a2, b2] = [Math.min(this._lastSel, myIdx), Math.max(this._lastSel, myIdx)]; for (let i = a2; i <= b2; i++) this.sel.add(vis[i]); this._shift = false; this._lastSel = myIdx; this.renderPages(); return; }
            e.target.checked ? this.sel.add(s.id) : this.sel.delete(s.id); this._lastSel = myIdx; this.renderBulk(); e.target.closest('.page').classList.toggle('active', e.target.checked); } }),
          el('span', {}, el('div', { class: 'page-title' }, s.title || 'Sem título', Bookmark.has(s) ? el('span', { class: 'bm-ic', title: 'Tem marcador “Parei aqui”', text: ' 🔖' }) : ''), el('div', { class: 'page-sub' }, PageKinds.badge(s), Translate.langBadge(s), s.date ? new Date(s.date + 'T12:00').toLocaleDateString(DL()) : ''))));
        continue;
      }
      const row = el('div', { class: `page lv${lv}` + (this.cur?.id === s.id ? ' active' : ''), 'data-id': s.id, draggable: 'true', onclick: e => { if (e.ctrlKey || e.metaKey || e.shiftKey) return this.startSelect(e.shiftKey && this.cur ? (() => { const v = items.map(x => x.id), i1 = v.indexOf(this.cur.id), i2 = v.indexOf(s.id); return i1 < 0 ? [s.id] : v.slice(Math.min(i1, i2), Math.max(i1, i2) + 1); })() : [this.cur?.id, s.id]); this.open(s.id); },
        ondragstart: e => { e.dataTransfer.setData('text/x-sermon', s.id); e.dataTransfer.effectAllowed = 'copyMove'; document.body.classList.add('dragging'); this._drag = s.id; },
        ondragend: () => { document.body.classList.remove('dragging'); this._drag = null; } },
        hasKids ? el('button', { class: 'pg-tog', title: s.collapsed ? 'Mostrar subpáginas' : 'Recolher subpáginas', text: s.collapsed ? '▸' : '▾', onclick: e => { e.stopPropagation(); this.toggleCollapse(s.id); } }) : el('span', { class: 'pg-tog sp' }),
        el('div', { class: 'pg-main' },
          el('div', { class: 'page-title' }, (s.title || 'Sem título') + (s.collapsed && hasKids ? ' …' : ''), Bookmark.has(s) ? el('span', { class: 'bm-ic', title: 'Tem marcador “Parei aqui”', text: ' 🔖' }) : ''),
          Book.is(s) ? Book.pageSub(s) : el('div', { class: 'page-sub' }, PageKinds.badge(s), Translate.langBadge(s), [s.date ? new Date(s.date + 'T12:00').toLocaleDateString(DL()) : '', preview].filter(Boolean).join(' · '))),
        flat ? null : el('button', { class: 'pg-menu icon-btn sm', title: 'Ordem, subpágina, mover…', text: '⋯', onclick: e => { e.stopPropagation(); this.pageMenu(s); } }));
      if (!flat) {
        row.addEventListener('dragover', e => { if (!this._drag || this._drag === s.id) return; e.preventDefault(); const r = row.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2; row.classList.toggle('drop-after', after); row.classList.toggle('drop-before', !after); });
        row.addEventListener('dragleave', () => row.classList.remove('drop-after', 'drop-before'));
        row.addEventListener('drop', e => { e.preventDefault(); const after = row.classList.contains('drop-after'); row.classList.remove('drop-after', 'drop-before'); const id = e.dataTransfer.getData('text/x-sermon'); if (id) this.dropPage(id, s.id, after); });
      }
      bindContextMenu(row, () => this.pageMenu(s));
      list.append(row);
    }
  },
  _bulk: null,
  renderBulk() {
    const bar = $('#page-bulk'); bar.hidden = !this.selMode; $('#page-select').classList.toggle('on', !!this.selMode); $('#page-select').textContent = this.selMode ? '✕ Concluir' : '☑ Selecionar';
    if (!this.selMode) return;
    const n = this.sel.size; bar.innerHTML = '';
    const ids = () => [...this.sel];
    const all = el('button', { class: 'btn sm', text: 'Todas', onclick: () => { $$('#page-list .sel-row input').forEach(c => { if (!c.checked) { c.checked = true; c.dispatchEvent(new Event('change')); } }); } });
    const mv = el('button', { class: 'btn sm primary', text: 'Mover para…', disabled: !n, onclick: async () => { const sec = await SectionPicker.pick(`Mover ${n} página(s) para…`); if (sec) this.moveSermons(ids(), sec, false); } });
    const cp = el('button', { class: 'btn sm', text: 'Copiar para…', disabled: !n, onclick: async () => { const sec = await SectionPicker.pick(`Copiar ${n} página(s) para…`); if (sec) this.moveSermons(ids(), sec, true); } });
    const del = el('button', { class: 'btn sm danger-text', text: 'Excluir', disabled: !n, onclick: async () => {
      const blocked = ids().filter(id => { const x = this.sermons.get(id); return x && !Shared.canDelete(x); }).length;
      if (!await UI.confirm('Excluir páginas', `Excluir ${n - blocked} página(s)? Não dá para desfazer.` + (blocked ? ` (${blocked} de outras pessoas ficam — só o autor ou o dono do caderno podem excluir.)` : ''), 'Excluir')) return;
      for (const id of this.sel) { const x = this.sermons.get(id); if (x && !Shared.canDelete(x)) continue; this.sermons.delete(id); DB.del('sermons', id); Cloud.tomb(id); }
      if (this.cur && !this.sermons.has(this.cur.id)) { this.cur = null; this.renderEditor(); }
      this.sel = new Set(); this.selMode = false; this.renderNav(); UI.toast('Páginas excluídas');
    } });
    this._bulkDel = del;
    bar.append(el('span', { class: 'small', text: n ? `${n} selecionada(s)` : 'Toque nas páginas' }), all, mv, cp, PageKinds.bulkButton(ids, n), del);
  },
  /* Move ou copia ministrações para outra seção */
  moveSermons(ids, secId, copy) {
    const sec = this.meta.sections.find(x => x.id === secId); if (!sec) return;
    let last = null;
    for (const id of ids) {
      const s = this.sermons.get(id); if (!s) continue;
      if (!copy && !Shared.isAuthor(s) && !Shared.isNbOwner(s)) { UI.toast(`“${s.title}” é de outra pessoa — use Copiar.`); continue; }
      if (copy) {
        const c = structuredClone(s); c.id = uid(); c.sec = secId; c.created = Date.now(); c.blocks.forEach(b => b.id = uid()); c.level = 0; delete c.collapsed; if (c.order != null) c.order = s.order + 0.5;
        delete c.preached; delete c.reviews; delete c.source; delete c.welcome;
        if (secId === s.sec) c.title += ' (cópia)';
        this.sermons.set(c.id, c); this.touch(c); last = c;
      } else if (s.sec !== secId) { s.sec = secId; s.level = 0; const l = this.sectionSermons(secId); if (l.some(x => x.order != null && x !== s)) s.order = 1e6 + Date.now() % 1e6; this.touch(s); last = s; }
    }
    this.flush(); this.sel = new Set();
    UI.toast(`${ids.length} página(s) ${copy ? 'copiada(s)' : 'movida(s)'} para “${sec.name}”`, { label: 'Abrir seção', fn: () => { this.meta.currentNb = sec.nb; this.meta.currentSec = sec.id; this.saveMeta(); this.renderNav(); const f = this.sectionSermons(sec.id)[0]; if (f) this.open(f.id, false, true); } });
    this.renderNav();
  },
  newSermon(data = {}) {
    if (!this.meta.currentSec) { UI.toast('Crie uma seção primeiro'); return; }
    const inBook = Book.isNb(Book.nbOf(this.meta.currentSec)), inNotes = Notes.isNb(Book.nbOf(this.meta.currentSec));
    if (inBook) { data = { ...Book.blankChapter(), ...data }; Book.ensureOrder(this.meta.currentSec); }
    else if (inNotes || NOTE_KINDS.includes(data.kind)) { const k = data.kind || 'anotacao'; data = { title: { projeto: 'Novo projeto', reuniao: 'Reunião ' + new Date().toLocaleDateString(DL()), anotacao: 'Nova anotação' }[k] || 'Nova anotação', passage: '', duration: 0, durSet: false, blocks: Notes.blank(k), ...data, kind: k }; }
    const s = Object.assign(blankSermon(this.meta.currentSec), data);
    if (Shared.inShared(s)) { s.shareMode ||= Shared.mode(s); s.author = { email: Shared.myEmail() }; }
    this.sermons.set(s.id, s);
    const l = this.sectionSermons(this.meta.currentSec);
    if (l.some(x => x.order != null)) { // ordem manual: entra logo abaixo da página aberta (e das subpáginas dela)
      const rest = l.filter(x => x !== s); let at = rest.length;
      const ci = this.cur ? rest.findIndex(x => x.id === this.cur.id) : -1; if (ci >= 0) { at = this.blockEnd(rest, ci) + 1; s.level = this.cur.level || 0; }
      rest.splice(at, 0, s); rest.forEach((x, i) => { if (x.order !== i) { x.order = i; if (x !== s) this.touch(x); } });
    }
    this.touch(s); this.flush();
    this.renderNav(); this.open(s.id);
    setTimeout(() => { const t = $('#s-title'); t && (t.focus(), t.select()); }, 50);
    return s;
  },
  // última página aberta (por caderno / por seção); cai na primeira se não houver ou se foi apagada/movida
  lastIn(key, isNb) {
    const e = this.meta.lastOpen?.[key], id = typeof e === 'string' ? e : e?.id, s = id && this.sermons.get(id);
    if (s) { const sec = this.meta.sections.find(x => x.id === s.sec); if (sec && (isNb ? sec.nb === key : sec.id === key)) return s; }
    return null;
  },
  goNotebook(id) {
    const m = this.meta; m.currentNb = id;
    const last = this.lastIn(id, true), sec = last ? m.sections.find(x => x.id === last.sec) : m.sections.find(x => x.nb === id);
    m.currentSec = sec?.id || null; this.saveMeta(); this.renderNav();
    const pg = last || (sec && this.sectionSermons(sec.id)[0]); if (pg) this.open(pg.id, false, true); else { this.cur = null; this.renderEditor(); }
  },
  goSection(id) {
    this.meta.currentSec = id; this.saveMeta(); this.renderNav();
    const pg = this.lastIn(id, false) || this.sectionSermons(id)[0]; if (pg) this.open(pg.id, false, true);
  },
  // keepNav: abriu por troca de caderno/seção — o menu continua aberto até você escolher a página
  open(id, boot, keepNav) {
    if (typeof FindView !== 'undefined') { if (FindView.active) { FindView.active = false; $$('.rtab').forEach(x => x.classList.toggle('on', x.dataset.tab === 'home')); $$('.rpanel').forEach(p => p.hidden = p.dataset.panel !== 'home'); } if (!FindView._opening) FindView.ran = false; }
    this.flush();
    const s = this.sermons.get(id); if (!s) return;
    this.cur = s; this.meta.currentSermon = id; Recent.add(id);
    const sec = this.meta.sections.find(x => x.id === s.sec);
    if (sec && !boot) { const L = this.meta.lastOpen ||= {}, e = { id, t: Date.now() }; L[sec.id] = e; L[sec.nb] = e; L.__cur = e; if (this.meta.follow && typeof Cloud !== 'undefined') { Cloud.followDirty = true; Cloud.schedule(4000); } }
    if (sec && sec.id !== this.meta.currentSec) { this.meta.currentSec = sec.id; this.meta.currentNb = sec.nb; this.renderNav(); }
    this.saveMeta();
    $$('#page-list .page').forEach(p => p.classList.toggle('active', p.dataset.id === id));
    this.renderEditor(); History.snap(s, 'ao abrir');
    if (window.innerWidth < 980 && !keepNav && !boot) document.body.classList.add('nav-collapsed');
  },
  async deleteSermon() {
    const s = this.cur; if (!s) return;
    if (!Shared.canDelete(s)) return UI.toast('Só o autor da página ou o dono do caderno podem excluir.');
    if (!await UI.confirm('Excluir ministração', `Excluir “${s.title}”?`)) return;
    this.sermons.delete(s.id); await DB.del('sermons', s.id); Cloud.tomb(s.id); this.cur = null;
    this.renderNav(); const n = this.sectionSermons(this.meta.currentSec)[0]; n ? this.open(n.id, false, true) : this.renderEditor();
  },
  duplicateSermon() {
    const s = structuredClone(this.cur); s.id = uid(); s.title += ' (cópia)'; s.created = Date.now(); s.blocks.forEach(b => b.id = uid());
    this.sermons.set(s.id, s); this.touch(s); this.flush(); this.renderNav(); this.open(s.id);
  },

  /* ---- editor ---- */
  renderEditor() {
    if (typeof FindView !== 'undefined' && FindView.active) return FindView.render();
    this.inkSurfaces.forEach(i => i.destroy()); this.inkSurfaces = [];
    const ed = $('#editor-inner'); ed.innerHTML = '';
    const s = this.cur;
    { const bb = typeof FindView !== 'undefined' && FindView.backBar(); if (bb && s) ed.append(bb); }
    if (!s) { ed.append(el('div', { class: 'empty-state' }, el('h2', { text: 'Nenhuma ministração aberta' }), el('button', { class: 'btn primary', text: '+ Nova ministração', onclick: () => this.newSermon() }))); return; }
    if (Book.is(s)) { Book.renderHead(s, ed); document.body.classList.remove('pg-simple'); }
    else {
      const secOpts = this.meta.sections.map(x => { const nb = this.meta.notebooks.find(n => n.id === x.nb); return `<option value="${x.id}" ${x.id === s.sec ? 'selected' : ''}>${esc(nb?.name || '')} › ${esc(x.name)}</option>`; }).join('');
      const head = el('div', { class: 's-head' });
      head.innerHTML = `
        <input id="s-title" class="s-title" value="${esc(s.title)}" placeholder="Título da ministração">
        <div class="s-meta">
          <label>Data <input type="date" id="s-date" value="${esc(s.date || '')}"></label>
          <label>Texto-base <input id="s-passage" value="${esc(s.passage || '')}" placeholder="Ex.: Rm 8:28-39"></label>
          <label id="s-dur-label">Duração <input id="s-duration" type="number" min="0" max="240" value="${s.duration || ''}" style="width:4.2em"> min</label>
          <span class="s-est" id="s-est"></span>
          <label>Seção <select id="s-sec">${secOpts}</select></label>
          <span id="s-kind-slot"></span>
          <span class="s-actions">
            <button class="btn sm ai-btn" id="s-review" title="Revisar com IA (Claude e Gemini) e conferir referências">✦ Revisar</button>
            <button class="btn sm" id="s-report" title="Pregações registradas e relatório pós-culto">📊 Pregações${(s.preached || []).length ? ' (' + s.preached.length + ')' : ''}</button>
            <button class="btn sm" id="s-share" title="Copiar para WhatsApp ou criar um link de leitura (sem conta)">↗ Enviar</button>
            <button class="btn sm" id="s-slide" title="Gerar imagem com o título para o telão ou redes sociais">🖼 Telão</button>
            <button class="btn sm" id="s-hist" title="Versões anteriores desta página">🕘 Versões</button>
            <button class="btn sm" id="s-move" title="Mover ou copiar para outra seção">⇢ Mover/Copiar</button>
            <button class="btn sm" id="s-tr" title="Criar uma cópia traduzida para inglês ou espanhol">🌐 Traduzir</button>
            <button class="btn sm" id="s-dup" title="Duplicar">Duplicar</button>
            <button class="btn sm danger-text" id="s-del" title="Excluir">Excluir</button>
          </span>
        </div>`;
      ed.append(head);
      $('#s-title').oninput = e => { s.title = e.target.value; this.touch(); const p = $(`#page-list .page[data-id="${s.id}"] .page-title`); if (p) p.textContent = s.title || 'Sem título'; };
      $('#s-title').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const f = $('#blocks .b-body'); f && f.focus(); } };
      $('#s-date').onchange = e => { s.date = e.target.value; this.touch(); this.renderPages(); };
      $('#s-passage').oninput = e => { s.passage = e.target.value; this.touch(); };
      $('#s-passage').onchange = async e => {
        const r = parseRef(e.target.value); if (!r || !Bible.current()) return;
        if (s.blocks.some(b => b.type === 'verse' && b.ref === refLabel(r))) return;
        UI.toast('Inserir o texto-base como versículo?', { label: 'Inserir', fn: async () => { const res = await Bible.lookup(r); if (!res.error) { this.insertBlock('verse', { ref: res.label, version: res.version, html: Bible.versesHTML(res.verses) }, -1); } } });
      };
      $('#s-duration').oninput = e => { s.duration = +e.target.value || 0; s.durSet = true; this.touch(); };
      $('#s-kind-slot').replaceWith(PageKinds.headSelect(s)); if (!Book.is(s)) PageKinds.paintTime(s);
      Notes.paint(s);
      $('#s-sec').onchange = e => { s.sec = e.target.value; const sec = this.meta.sections.find(x => x.id === s.sec); this.meta.currentSec = sec.id; this.meta.currentNb = sec.nb; this.touch(); this.saveMeta(); this.renderNav(); };
      $('#s-dup').onclick = () => this.duplicateSermon(); $('#s-tr').onclick = () => Translate.open(s);
      $('#s-share').onclick = () => { this.flush(); Share.open(s); };
      $('#s-slide').onclick = () => { this.flush(); Slide.open(s); };
      $('#s-move').onclick = async () => {
        const r = await SectionPicker.pick(`“${s.title}”`, true); if (r) this.moveSermons([s.id], r.sec, r.copy);
      };
      $('#s-review').onclick = () => { this.flush(); Review.open(s); };
      $('#s-report').onclick = () => PostReport.open(s);
      $('#s-del').onclick = () => this.deleteSermon();
      $('#s-hist').onclick = () => { this.flush(); History.open(s); };
    }
    ed.append(el('div', { id: 'blocks' }));
    this.updateEstimate();
    const add = Book.is(s) ? Book.addBar(s) : Notes.simple(s) ? el('div', { class: 'add-bar' }, el('span', { class: 'muted', text: 'Adicionar:' }),
      ...['subhead', 'text', 'verse'].map(t => el('button', { class: 'chip t-' + t, 'data-t': t, text: '+ ' + (t === 'subhead' ? 'Título' : BLOCK_TYPES[t].label), onclick: () => this.insertBlock(t, {}, Infinity) })),
      ...Mind.LAYOUTS.map(([id, l]) => el('button', { class: 'chip t-mind', 'data-l': id, text: '+ ' + l, onclick: () => Mind.insert(id, Infinity) })),
      el('button', { class: 'chip t-ink', 'data-t': 'ink', text: '+ ✎ Desenho', onclick: () => this.insertBlock('ink', {}, Infinity) }),
      el('button', { class: 'chip', 'data-t': 'image', text: '+ 🖼 Imagem / print', title: 'Escolher imagem — ou cole um print direto no texto (Ctrl+V)', onclick: () => Ribbon.insertImage(true) }))
    : el('div', { class: 'add-bar' }, el('span', { class: 'muted', text: 'Adicionar:' }),
      ...['point', 'intro', 'text', 'verse', 'illus', 'app', 'quote', 'concl', ...(this.meta.customTypes || []).map(c => c.id), 'ink', 'mind', 'image'].map(t => el('button', { class: 'chip t-' + t, 'data-t': t, style: isCallout(t) ? { color: blockColor(t) } : null, text: '+ ' + BLOCK_TYPES[t].label, onclick: () => t === 'image' ? Ribbon.insertImage(true) : this.insertBlock(t, {}, Infinity) })),
      el('button', { class: 'chip', text: '⚙ Tipos…', title: 'Criar ou editar seus próprios tipos de bloco', onclick: () => TypeManager.open() }));
    ed.append(add);
    this.renderBlocks();
    if (Book.is(s)) Footnotes.renderList();
    Shared.decorate(s); AddFloat.update(); Split.afterOpen?.();
  },
  renderBlocks() {
    this.inkSurfaces.forEach(i => i.destroy()); this.inkSurfaces = [];
    const host = $('#blocks'); host.innerHTML = '';
    this.cur.blocks.forEach(b => host.append(this.blockEl(b)));
    this.numberPoints(); Shared.afterBlocks(this.cur); Spell.repaint?.(); Bookmark.afterBlocks();
  },
  numberPoints() { let n = 0; $$('#blocks .block').forEach(e => { if (e.dataset.type === 'point') e.querySelector('.b-tag').textContent = 'Ponto ' + (++n); }); },
  blockIndex(id) { return this.cur.blocks.findIndex(b => b.id === id); },
  blockEl(b) {
    const T = BLOCK_TYPES[b.type] || BLOCK_TYPES.text;
    const wrap = el('div', { class: `block b-${b.type}${isCallout(b.type) ? ' b-callout' : ''}`, 'data-id': b.id, 'data-type': b.type, style: isCallout(b.type) ? { '--bc': blockColor(b.type) } : null });
    wrap.addEventListener('focusin', () => { this.focusId = b.id; $$('#blocks .block.focus').forEach(x => x.classList.remove('focus')); wrap.classList.add('focus'); });
    wrap.addEventListener('pointerdown', () => { this.focusId = b.id; });
    const tools = el('div', { class: 'b-tools' },
      el('button', { class: 'icon-btn sm', title: 'Mover para cima', text: '↑', onclick: () => this.moveBlock(b.id, -1) }),
      el('button', { class: 'icon-btn sm', title: 'Mover para baixo', text: '↓', onclick: () => this.moveBlock(b.id, 1) }),
      el('button', { class: 'icon-btn sm', title: 'Marcações (Alt+1…9)', text: '🏷', onclick: e => Marks.menu(b, e.currentTarget) }),
      el('button', { class: 'icon-btn sm', title: 'Mudar tipo', text: '⇄', onclick: e => this.typeMenu(b, e.currentTarget) }),
      el('button', { class: 'icon-btn sm', title: 'Excluir bloco', text: '✕', onclick: () => this.removeBlock(b.id) }));
    const mg = Marks.gutter(b); if (mg) { wrap.append(mg); wrap.classList.add('has-marks'); }
    wrap.append(el('div', { class: 'b-tag', text: b.type === 'mind' ? Mind.label(b.mind) : b.type === 'subhead' && Notes.simple(this.cur) ? 'Título' : T.label }), tools);
    if (b.type === 'ink') {
      const area = el('div', { class: 'ink-wrap' });
      const surf = new InkSurface(b, area, { onChange: () => this.touch(), theme: Theme.resolved() });
      this.inkSurfaces.push(surf);
      const grip = el('div', { class: 'ink-grip', title: 'Arraste para mudar a altura', text: '⋯' });
      grip.addEventListener('pointerdown', e => {
        e.preventDefault(); grip.setPointerCapture(e.pointerId); const y0 = e.clientY, h0 = b.ink.hr * surf.W;
        const mv = ev => { b.ink.hr = clamp((h0 + ev.clientY - y0) / surf.W, 0.08, 6); surf.resize(); };
        const upf = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', upf); this.touch(); };
        grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', upf);
      });
      wrap.append(area, grip);
      return wrap;
    }
    if (b.type === 'mind') { wrap.append(Mind.el(b)); return wrap; }
    if (b.type === 'image') {
      wrap.append(el('img', { class: 'b-img', src: b.src, alt: '' }));
      const cap = el('div', { class: 'b-body b-caption', contenteditable: 'true', 'data-ph': 'Legenda (opcional)', html: b.html || '' });
      this.bindEditable(cap, b); wrap.append(cap); return wrap;
    }
    if (b.type === 'verse') {
      const ref = el('input', { class: 'verse-ref', value: b.ref || '', placeholder: 'Referência (Jo 3:16) ou uma frase/palavra para procurar' });
      const ver = el('select', { class: 'verse-version', title: 'Versão' }); this.fillVersionSelect(ver, b.version);
      const go = el('button', { class: 'btn sm', text: 'Buscar', title: 'Referência: traz o texto · Frase/palavra: procura na versão escolhida' });
      const list = el('div', { class: 'vs-list', hidden: true }); let hits = [], idx = -1, timer;
      const closeList = () => { list.hidden = true; list.innerHTML = ''; hits = []; idx = -1; };
      const pick = async it => { closeList(); ref.value = `${BOOKS[it.book - 1].name} ${it.ch}:${it.v}`; await fetchIt(); };
      const paintSel = () => [...list.querySelectorAll('.vs-item')].forEach((n, i) => { n.classList.toggle('on', i === idx); if (i === idx) n.scrollIntoView({ block: 'nearest' }); });
      const searchIt = async (q, quiet) => {
        q = q.trim(); if (q.length < 2) return closeList();
        const v = ver.value || Bible.current();
        if (!v) { if (!quiet) UI.toast('Baixe uma versão da Bíblia para procurar por frase'); return; }
        list.hidden = false; list.innerHTML = '<div class="vs-msg muted">Procurando…</div>';
        const res = await Bible.searchWords(q, v); if (ref.value.trim() !== q) return;
        list.innerHTML = ''; hits = res || []; idx = hits.length ? 0 : -1;
        if (!res) { list.innerHTML = '<div class="vs-msg">Essa versão ainda não foi baixada neste aparelho.</div>'; return; }
        const vl = Bible.info(v)?.short || v;
        list.append(el('div', { class: 'vs-msg muted', text: hits.length ? `${res.total > hits.length ? res.total + '+ — mostrando ' + hits.length : hits.length} resultado(s) em ${vl}` + (res.exactCount < hits.length && res.exactCount ? ` · ${res.exactCount} com a frase exata` : '') + ' — clique no versículo (↑ ↓ Enter)' : `Nada encontrado para “${q}” em ${vl}. Tente outras palavras ou outra versão.` }));
        hits.forEach((it, i) => {
          const row = el('div', { class: 'vs-item' + (it.exact ? ' exact' : ''), onmousedown: e => { e.preventDefault(); pick(it); }, onmouseenter: () => { idx = i; paintSel(); } }, el('b', { text: `${BOOKS[it.book - 1].abbr} ${it.ch}:${it.v}` }));
          row.insertAdjacentHTML('beforeend', ' ' + Bible.highlight(it.t, res.words));
          list.append(row);
        });
        paintSel();
      };
      const fetchIt = async (silent) => {
        if (!parseRef(ref.value)) { if (silent !== true) searchIt(ref.value); return; }
        closeList();
        const res = await Bible.lookup(ref.value, ver.value || undefined);
        if (res.error) { if (silent !== true) UI.toast(res.error); return; }
        b.ref = res.label; b.version = res.version; b.html = Bible.versesHTML(res.verses);
        ref.value = b.ref; body.innerHTML = b.html; this.touch();
      };
      ref.onkeydown = e => {
        if (!list.hidden && hits.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length; paintSel(); return; }
        if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); closeList(); return; }
        if (e.key === 'Enter') { e.preventDefault(); if (!list.hidden && hits[idx] && !parseRef(ref.value)) pick(hits[idx]); else fetchIt(); }
      };
      ref.oninput = () => {
        b.ref = ref.value; this.touch(); clearTimeout(timer);
        const q = ref.value.trim();
        if (parseRef(q) || q.length < 3) closeList(); else timer = setTimeout(() => searchIt(q, true), 450);
      };
      ref.onblur = () => setTimeout(closeList, 150);
      ver.onchange = () => { b.version = ver.value; if (!list.hidden) searchIt(ref.value, true); else if (b.ref) fetchIt(true); };
      go.onclick = () => fetchIt();
      const body = el('div', { class: 'b-body', contenteditable: 'true', 'data-ph': T.ph, html: b.html || '' });
      this.bindEditable(body, b);
      const study = el('button', { class: 'btn sm', text: '🔍', title: 'Estudo das palavras no original (Strong)', onclick: () => ref.value.trim() ? StrongUI.open(ref.value) : UI.toast('Informe a referência') });
      wrap.append(el('div', { class: 'verse-head' }, el('div', { class: 'vs-wrap' }, ref, list), b.verLabel && !b.version ? el('span', { class: 'pill', text: b.verLabel, title: 'Versão do texto colado' }) : null, ver, go, study), body);
      if (!b.html && b.ref && Bible.current() && parseRef(b.ref)) setTimeout(() => fetchIt(true), 0);
      return wrap;
    }
    const body = el('div', { class: 'b-body', contenteditable: 'true', 'data-ph': T.ph, html: b.html || '' });
    this.bindEditable(body, b);
    if (b.type === 'point') body.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.insertBlock('text', {}, this.blockIndex(b.id) + 1); } });
    wrap.append(body);
    return wrap;
  },
  async fillMissingVerses() {
    for (const s of this.sermons.values()) {
      let changed = false;
      for (const b of s.blocks) if (b.type === 'verse' && b.ref && !b.html) { const r = await Bible.lookup(b.ref, Bible.has(b.version) ? b.version : undefined); if (!r.error) { b.html = Bible.versesHTML(r.verses); b.version = r.version; changed = true; } }
      if (changed) { this.touch(s); if (s === this.cur) this.renderBlocks(); }
    }
  },
  fillVersionSelect(sel, value) {
    sel.innerHTML = Bible.installed.map(v => `<option value="${v.id}">${esc(v.short)}</option>`).join('') || '<option value="">—</option>';
    sel.value = value && Bible.has(value) ? value : (Bible.current() || '');
  },
  bindEditable(body, b) {
    body.spellcheck = Spell.live(); body.lang = LANGS[App.cur?.lang]?.lt || 'pt-BR';
    const fixC = debounce(() => { if (ensureContrast(body)) { b.html = body.innerHTML; this.touch(); } }, 250);
    body.addEventListener('input', () => { b.html = body.innerHTML === '<br>' ? '' : body.innerHTML; if (b.by && this.cur && Shared.isAuthor(this.cur) && b.by !== Shared.myEmail()) { delete b.by; body.closest('.block')?.querySelector('.by-tag')?.remove(); } this.touch(); fixC(); });
    requestAnimationFrame(() => { if (body.isConnected && ensureContrast(body)) { b.html = body.innerHTML; this.touch(b === this.cur?.blocks.find(x => x.id === b.id) ? this.cur : undefined); } });
    body.addEventListener('paste', e => {
      const img = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
      if (img) { e.preventDefault(); this.focusId = b.id; imageFileToDataURL(img).then(src => { this.insertBlock('image', { src }); UI.toast('🖼 Print colado como imagem'); }); return; }
      const html = e.clipboardData.getData('text/html');
      if (!html) return;
      e.preventDefault();
      document.execCommand('insertHTML', false, sanitizeHTML(html, b.type === 'point'));
    });
    body.addEventListener('keydown', e => {
      /* Tab / Shift+Tab: recuo de listas e parágrafos (como no Word/OneNote) */
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && !['point', 'subhead'].includes(b.type)) {
        e.preventDefault(); indentSel(e.shiftKey ? -1 : 1); return;
      }
      if (e.key === 'Backspace' && !body.textContent.length && !body.querySelector('img') && this.cur.blocks.length > 1 && TEXT_TYPES().includes(b.type)) {
        e.preventDefault(); const i = this.blockIndex(b.id); this.removeBlock(b.id, true);
        const prev = $$('#blocks .block')[Math.max(0, i - 1)]?.querySelector('.b-body'); if (prev) { prev.focus(); placeCaretEnd(prev); }
      }
    });
  },
  insertBlock(type, data = {}, at) {
    if (!this.cur) return;
    const b = Object.assign({ id: uid(), type, html: '' }, data);
    if (type === 'ink' && !b.ink) b.ink = { hr: 0.32, strokes: [] };
    if (type === 'mind' && !b.mind) { b.mind = Mind.blank(this.cur.title); b.html = Mind.html(b.mind); }
    let i;
    if (at === Infinity) i = this.cur.blocks.length;
    else if (at === -1) i = 0;
    else if (typeof at === 'number') i = at;
    else { const f = this.focusId ? this.blockIndex(this.focusId) : -1; i = f >= 0 ? f + 1 : this.cur.blocks.length; }
    this.cur.blocks.splice(i, 0, b);
    const host = $('#blocks'); const node = this.blockEl(b);
    host.insertBefore(node, host.children[i] || null);
    this.numberPoints(); this.touch(); this.focusId = b.id;
    const f = node.querySelector(type === 'verse' && !b.ref ? '.verse-ref' : '.b-body');
    if (f && type !== 'ink') { f.focus(); if (f.isContentEditable) placeCaretEnd(f); }
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return b;
  },
  moveBlock(id, d) {
    const i = this.blockIndex(id), j = i + d; const arr = this.cur.blocks;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const nodes = $$('#blocks .block'); const host = $('#blocks');
    if (d < 0) host.insertBefore(nodes[i], nodes[j]); else host.insertBefore(nodes[j], nodes[i]);
    this.numberPoints(); this.touch();
  },
  removeBlock(id, silent) {
    const i = this.blockIndex(id); if (i < 0) return;
    const [b] = this.cur.blocks.splice(i, 1);
    const node = $(`#blocks .block[data-id="${id}"]`); node && node.remove();
    const surf = this.inkSurfaces.find(s => s.b === b); if (surf) surf.destroy();
    this.numberPoints(); this.touch();
    if (!silent) UI.toast(`${BLOCK_TYPES[b.type].label} removido`, { label: 'Desfazer', fn: () => this.insertBlock(b.type, b, i) });
  },
  typeMenu(b, anchor) {
    const types = [...TEXT_TYPES(), 'verse', 'mind'];
    if (!types.includes(b.type)) { UI.toast('Desenhos e imagens não mudam de tipo'); return; }
    const m = UI.modal({ title: 'Mudar tipo do bloco', body: el('div', { class: 'type-grid' }, types.map(t => el('button', { class: 'chip t-' + t + (t === b.type ? ' on' : ''), style: isCallout(t) ? { color: blockColor(t) } : null, text: BLOCK_TYPES[t].label, onclick: () => {
      this.convertBlock(b, t);
      const node = $(`#blocks .block[data-id="${b.id}"]`); node.replaceWith(this.blockEl(b)); this.numberPoints(); this.touch(); m.close();
    } }))) });
  },
  convertBlock(b, t) {
    if (t === b.type) return;
    if (t === 'mind') { b.mind = Mind.fromHTML(b.html, this.cur?.title); b.type = 'mind'; b.html = Mind.html(b.mind); delete b.ref; return; }
    if (b.type === 'mind') delete b.mind;
    const text = htmlToText(b.html);
    if (t === 'verse') {
      // "Jo 3:16 Porque Deus amou…" -> referência + texto
      const lines = text.split('\n'); const first = lines[0].trim();
      const m = first.match(/^(.{2,40}?\d{1,3}[:.]\d{1,3}(?:\s?[-–]\s?\d{1,3})?)(?:\s*\(([^)]{1,12})\))?\s*[-–:]?\s*(.*)$/);
      const r = m && parseRef(m[1]);
      if (r) { b.ref = refLabel(r); if (m[2]) b.verLabel = m[2]; const rest = [m[3], ...lines.slice(1)].filter(Boolean).join('\n'); b.html = esc(rest).replace(/\n/g, '<br>'); }
      else if (parseRef(first)) { b.ref = refLabel(parseRef(first)); b.html = esc(lines.slice(1).join('\n')).replace(/\n/g, '<br>'); }
      b.type = 'verse'; return;
    }
    if (b.type === 'verse') { // de versículo para texto: mantém a referência no começo
      b.html = (b.ref ? `<b>${esc(b.ref)}</b><br>` : '') + (b.html || ''); delete b.ref; delete b.version; delete b.verLabel;
    }
    if (t === 'point') b.html = esc(htmlToText(b.html).split('\n')[0]);
    b.type = t;
  },
};

/* Botão direito ou toque longo (dedo/caneta) abre um menu */
function bindContextMenu(node, open) {
  let t = null, x0 = 0, y0 = 0, fired = 0;
  const fire = () => { const now = Date.now(); if (now - fired < 700) return; fired = now; open(); };
  node.addEventListener('contextmenu', e => { e.preventDefault(); fire(); });
  node.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return; x0 = e.clientX; y0 = e.clientY; clearTimeout(t);
    t = setTimeout(() => { t = null; node.classList.add('pressed'); setTimeout(() => node.classList.remove('pressed'), 200); try { navigator.vibrate && navigator.vibrate(15); } catch (_) { } fire(); }, 550);
  });
  node.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) { clearTimeout(t); t = null; } });
  ['pointerup', 'pointercancel', 'pointerleave', 'dragstart'].forEach(ev => node.addEventListener(ev, () => { clearTimeout(t); t = null; }));
  // depois do toque longo, ignora o "clique" que vem em seguida
  node.addEventListener('click', e => { if (Date.now() - fired < 700) { e.stopPropagation(); e.preventDefault(); } }, true);
}

function blankSermon(sec) {
  return { id: uid(), sec, title: 'Nova ministração', date: todayISO(), passage: '', duration: 40,
    blocks: [{ id: uid(), type: 'point', html: '' }, { id: uid(), type: 'text', html: '' }],
    settings: { fontSize: 34, mode: 'scroll', speed: 3 }, created: Date.now(), updated: Date.now() };
}
function welcomeSermon(sec) {
  const s = blankSermon(sec);
  s.title = 'Bem-vindo ao SmartSower'; s.passage = 'Sl 119:105'; s.welcome = true;
  const B = (type, html, extra = {}) => ({ id: uid(), type, html, ...extra });
  s.blocks = [
    B('text', 'Este é um exemplo. Cada ministração é feita de <b>blocos</b>: pontos, textos, versículos, ilustrações, aplicações, frases-chave, desenhos e imagens. Use as setas ↑ ↓ de cada bloco para reorganizar.'),
    B('point', 'Escreva com a caneta'),
    B('text', 'Na guia <b>Desenhar</b> escolha cor e espessura. A caneta do Surface desenha; o dedo rola a página (ative “Desenhar com o dedo” se quiser). O botão-borracha da caneta apaga.'),
    B('ink', '', { ink: { hr: 0.22, strokes: [] } }),
    B('point', 'Busque e insira a Bíblia'),
    B('text', 'Clique em <b>Bíblia</b> no topo. Na primeira vez, baixe a Bíblia Livre — depois ela funciona offline. Digite “Jo 3:16” ou uma palavra, selecione os versículos e toque em <b>Inserir</b>.'),
    B('verse', '', { ref: 'Salmos 119:105', version: 'blivre' }),
    B('point', 'Pregue no modo leitura'),
    B('text', 'Toque em <b>▶ Pregar</b> (ou F5). <b>Rolagem</b>: o texto sobe sozinho; toque na tela para pausar e de novo para continuar. <b>Pontos</b>: toque à direita para avançar e à esquerda para voltar. Use a <b>pinça</b> com dois dedos para aumentar ou diminuir a letra.'),
    B('quote', 'A Palavra ilumina o caminho de quem prega e de quem ouve.'),
    B('app', 'Importe suas páginas do OneNote em <b>Importar</b> e exporte para PDF ou Word em <b>Exportar</b>. Referências como Rm 8:28 no meio do texto ficam tocáveis no modo leitura.'),
  ];
  return s;
}
function placeCaretEnd(node) { try { const r = document.createRange(); r.selectNodeContents(node); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { } }

/* ===== Sanitização de HTML colado/importado ===== */
function sanitizeHTML(html, inlineOnly = false) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'SPAN', 'MARK', 'SUP', 'SUB', 'S']);
  const walk = node => {
    for (const c of [...node.childNodes]) {
      if (c.nodeType === 8) { c.remove(); continue; }
      if (c.nodeType !== 1) continue;
      if (['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'XML', 'HEAD'].includes(c.tagName) || c.tagName.includes(':')) { c.remove(); continue; }
      walk(c);
      const st = c.getAttribute('style') || '';
      if (/font-weight:\s*(bold|[6-9]00)/i.test(st) && c.tagName === 'SPAN') { const b = document.createElement('b'); b.append(...c.childNodes); c.replaceWith(b); continue; }
      if (/font-style:\s*italic/i.test(st) && c.tagName === 'SPAN') { const b = document.createElement('i'); b.append(...c.childNodes); c.replaceWith(b); continue; }
      if (!allowed.has(c.tagName) || (inlineOnly && ['P', 'DIV', 'UL', 'OL', 'LI'].includes(c.tagName))) {
        const frag = document.createDocumentFragment(); frag.append(...c.childNodes);
        if (!inlineOnly && /^(H[1-6]|TR|TABLE|SECTION|ARTICLE|BLOCKQUOTE)$/.test(c.tagName)) { const d = document.createElement('div'); d.append(frag); c.replaceWith(d); } else c.replaceWith(frag);
        continue;
      }
      const keep = {};
      const color = st.match(/(?:^|;)\s*color:\s*([^;]+)/i), bg = st.match(/background(?:-color)?:\s*([^;]+)/i);
      const fnNote = c.tagName === 'SUP' && c.classList.contains('fn') ? c.getAttribute('data-note') : null;
      const align = /^(DIV|P|LI|H[1-6]|BLOCKQUOTE)$/.test(c.tagName) && (st.match(/text-align:\s*(center|right|justify)/i) || [])[1];
      [...c.attributes].forEach(a => c.removeAttribute(a.name));
      if (fnNote != null) { c.className = 'fn'; c.setAttribute('data-note', fnNote); c.setAttribute('contenteditable', 'false'); c.textContent = ''; }
      if (c.tagName === 'SPAN' || c.tagName === 'MARK') {
        if (color && !/windowtext|black|#000000|rgb\(0,\s*0,\s*0\)/i.test(color[1])) keep.color = color[1];
        if (bg && !/white|transparent|#fff|initial/i.test(bg[1])) keep['background-color'] = bg[1];
        const css = Object.entries(keep).map(([k, v]) => `${k}:${v.trim()}`).join(';'); if (css) c.setAttribute('style', css);
      }
      if (align) c.setAttribute('style', 'text-align:' + align.toLowerCase());
      if (c.tagName === 'P') { const d = document.createElement('div'); d.append(...c.childNodes); if (align) d.setAttribute('style', 'text-align:' + align.toLowerCase()); c.replaceWith(d); }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML.replace(/&nbsp;/g, ' ').replace(/(<div>\s*<\/div>)+/g, '').trim();
}

/* ===== Faixa de opções (ribbon) ===== */
/* ===== Escolher seção de destino (mover/copiar) ===== */
const SectionPicker = {
  pick(title, withMode = false) {
    return new Promise(res => {
      let done = false; const M = App.meta;
      const mode = el('div', { class: 'seg-toggle' });
      const bMove = el('button', { class: 'on', text: 'Mover' }), bCopy = el('button', { text: 'Copiar' });
      let copy = false; bMove.onclick = () => { copy = false; bMove.classList.add('on'); bCopy.classList.remove('on'); }; bCopy.onclick = () => { copy = true; bCopy.classList.add('on'); bMove.classList.remove('on'); };
      mode.append(bMove, bCopy);
      const finish = sec => { done = true; res(withMode ? { sec, copy } : sec); m.close(); };
      const list = el('div', { class: 'sp-list' });
      const nbs = [...M.notebooks].sort((a, b) => (b.id === M.currentNb) - (a.id === M.currentNb)); // caderno aberto primeiro
      for (const nb of nbs) {
        list.append(el('div', { class: 'sp-nb', text: nb.name + (nb.id === M.currentNb ? ' (aberto)' : '') }));
        for (const sc of M.sections.filter(x => x.nb === nb.id)) {
          const count = App.sectionSermons(sc.id).length;
          list.append(el('button', { class: 'sp-sec' + (sc.id === M.currentSec ? ' cur' : ''), style: { '--sc': sc.color }, onclick: () => finish(sc.id) }, el('span', { class: 'sec-dot' }), el('span', { text: sc.name }), el('span', { class: 'muted small', text: count })));
        }
        const inp = el('input', { class: 'inp sp-new', placeholder: `+ Nova seção em “${nb.name}”` });
        inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.trim()) { const sc = { id: uid(), nb: nb.id, name: inp.value.trim(), color: SECTION_COLORS[M.sections.length % 10] }; M.sections.push(sc); App.saveMeta(); finish(sc.id); } };
        list.append(inp);
      }
      const m = UI.modal({ title, body: el('div', {}, withMode ? mode : null, el('p', { class: 'muted small', text: 'Escolha a seção (ou digite o nome de uma nova e tecle Enter):' }), list), onClose: () => { if (!done) res(null); } });
    });
  }
};

/* ===== Tipos de bloco do usuário ===== */
const TypeManager = {
  open() {
    const body = el('div', { class: 'tm' });
    const draw = () => {
      body.innerHTML = '';
      body.append(el('p', { class: 'muted', text: 'Crie tipos de bloco para a sua forma de pregar (ex.: Apelo, Oração, Testemunho, Declaração Profética). Eles aparecem em Inserir, ganham cor própria e saem no modo leitura, no PDF e no Word.' }));
      body.append(el('div', { class: 'tm-fixed' }, el('span', { class: 'muted small', text: 'Já incluídos: ' }), ...['point', 'intro', 'text', 'verse', 'illus', 'app', 'quote', 'concl', 'ink', 'image'].map(t => el('span', { class: 'pill', style: isCallout(t) ? { color: blockColor(t) } : null, text: BLOCK_TYPES[t].label }))));
      for (const c of App.meta.customTypes) {
        const name = el('input', { class: 'inp', value: c.label });
        name.onchange = () => { c.label = name.value.trim() || c.label; this.save(); };
        const colors = el('div', { class: 'swatches' }, SECTION_COLORS.map(col => el('button', { class: 'swatch' + (col === c.color ? ' on' : ''), style: { background: col }, onclick: () => { c.color = col; this.save(); draw(); } })));
        body.append(el('div', { class: 'tm-row', style: { '--bc': c.color } }, el('span', { class: 'tm-dot' }), name, colors,
          el('button', { class: 'icon-btn sm', title: 'Excluir tipo', text: '✕', onclick: async () => {
            const used = [...App.sermons.values()].reduce((n, s) => n + s.blocks.filter(b => b.type === c.id).length, 0);
            if (!await UI.confirm('Excluir tipo', used ? `${used} bloco(s) usam “${c.label}”. Eles virarão blocos de Texto.` : `Excluir “${c.label}”?`)) return;
            for (const s of App.sermons.values()) { let ch = false; s.blocks.forEach(b => { if (b.type === c.id) { b.type = 'text'; ch = true; } }); if (ch) App.touch(s); }
            (App.meta.deleted ||= {})[c.id] = Date.now(); App.meta.customTypes = App.meta.customTypes.filter(x => x !== c); this.save(); draw();
          } })));
      }
      const nn = el('input', { class: 'inp', placeholder: 'Nome do novo tipo — ex.: Apelo' });
      const add = () => { const v = nn.value.trim(); if (!v) return; App.meta.customTypes.push({ id: 'c_' + uid(), label: v, color: SECTION_COLORS[(App.meta.customTypes.length + 3) % 10] }); this.save(); draw(); };
      nn.onkeydown = e => { if (e.key === 'Enter') add(); };
      body.append(el('div', { class: 'tm-add' }, nn, el('button', { class: 'btn primary', text: 'Adicionar', onclick: add })));
    };
    draw();
    UI.modal({ title: 'Tipos de bloco', body, wide: true, onClose: () => { App.renderEditor(); Ribbon.renderCustom(); } });
  },
  save() { registerCustomTypes(); App.saveMeta(); }
};

const Ribbon = {
  bind() {
    $$('.rtab').forEach(t => t.onclick = () => { if (t.dataset.tab === 'find') return FindView.show(); $$('.rtab').forEach(x => x.classList.toggle('on', x === t)); $$('.rpanel').forEach(p => p.hidden = p.dataset.panel !== t.dataset.tab); FindView.hide(); });
    // Não roubar o foco do texto ao tocar nos botões de formatação
    $$('.ribbon-body button, .ribbon-body .no-focus').forEach(b => b.addEventListener('pointerdown', e => { if (!b.matches('select,input')) e.preventDefault(); }));
    $$('[data-cmd]').forEach(b => b.onclick = () => { document.execCommand('styleWithCSS', false, b.dataset.css === '1'); document.execCommand(b.dataset.cmd, false, b.dataset.val || null); });
    $$('[data-insert]').forEach(b => b.onclick = () => b.dataset.insert === 'image' ? this.insertImage() : App.insertBlock(b.dataset.insert));
    $$('[data-color]').forEach(b => b.onclick = () => { document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, b.dataset.color); });
    $$('[data-hl]').forEach(b => b.onclick = () => { document.execCommand('styleWithCSS', false, true); document.execCommand('hiliteColor', false, b.dataset.hl); });
    // Desenho
    $$('[data-tool]').forEach(b => b.onclick = () => { App.ink.tool = b.dataset.tool; this.syncInk(); });
    $$('[data-pen]').forEach(b => b.onclick = () => { App.ink.color = b.dataset.pen; App.ink.tool = 'pen'; this.syncInk(); });
    $$('[data-mk]').forEach(b => b.onclick = () => { App.ink.hlColor = b.dataset.mk; App.ink.tool = 'marker'; this.syncInk(); });
    $$('[data-size]').forEach(b => b.onclick = () => { App.ink.size = +b.dataset.size; this.syncInk(); });
    $('#ink-finger').onchange = e => { App.ink.finger = e.target.checked; };
    $('#ink-undo').onclick = () => App.lastInk ? App.lastInk.undo() : UI.toast('Desenhe algo primeiro');
    $('#ink-clear').onclick = async () => { if (App.lastInk && await UI.confirm('Limpar desenho', 'Apagar todos os traços deste desenho?', 'Limpar')) App.lastInk.clear(); };
    $('#btn-bible').onclick = () => BiblePane.toggle();
    $('#btn-preach').onclick = e => App.cur && Present.menu(e.currentTarget);
    $('#btn-import').onclick = () => Porter.importDialog();
    $('#btn-export').onclick = () => Porter.exportDialog();
    this.renderCustom();
    this.syncInk();
  },
  renderCustom() {
    const g = $('#rg-custom'); if (!g) return; g.innerHTML = '';
    for (const c of App.meta.customTypes || []) { const b = el('button', { class: 'rb', style: { color: c.color }, text: c.label, onclick: () => App.insertBlock(c.id) }); b.addEventListener('pointerdown', e => e.preventDefault()); g.append(b); }
    const m = el('button', { class: 'rb', text: '⚙ Tipos…', onclick: () => TypeManager.open() }); m.addEventListener('pointerdown', e => e.preventDefault()); g.append(m);
  },
  syncInk() {
    const k = App.ink;
    $$('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === k.tool));
    $$('[data-pen]').forEach(b => b.classList.toggle('on', k.tool === 'pen' && b.dataset.pen === k.color));
    $$('[data-mk]').forEach(b => b.classList.toggle('on', k.tool === 'marker' && b.dataset.mk === k.hlColor));
    $$('[data-size]').forEach(b => b.classList.toggle('on', +b.dataset.size === k.size));
    document.body.dataset.inktool = k.tool;
  },
  async insertImage(atEnd) {
    const [f] = await pickFiles('image/*'); if (!f) return;
    const src = await imageFileToDataURL(f);
    App.insertBlock('image', { src }, atEnd ? Infinity : undefined);
  }
};
function imageFileToDataURL(file, maxW = 1600) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxW / img.naturalWidth); const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88));
    };
    img.onerror = rej; img.src = url;
  });
}

/* ===== Visualização do editor: largura (normal / larga / tela toda) e zoom da letra =====
   Fica salvo por aparelho (Surface e notebook podem ter preferências diferentes). */
const EditorView = {
  WIDTHS: [['normal', '▭', 'Largura normal'], ['wide', '▬', 'Largura ampla'], ['full', '⛶', 'Tela toda (esconde os painéis)']],
  MIN: 0.8, MAX: 2.5,
  get() { try { return { ez: 1, w: 'normal', ...JSON.parse(localStorage.getItem('ss-view') || '{}') }; } catch (e) { return { ez: 1, w: 'normal' }; } },
  set(p) { if ('nav' in p) { const q = { ...p }; delete q.nav; document.body.classList.toggle('nav-collapsed', !p.nav); p = q; } const v = { ...this.get(), ...p }; try { localStorage.setItem('ss-view', JSON.stringify(v)); } catch (e) { } this.apply(v); },
  apply(v = this.get()) {
    const inner = $('#editor-inner'); if (inner) inner.style.setProperty('--ez', v.ez);
    document.body.classList.toggle('ed-wide', v.w === 'wide'); document.body.classList.toggle('ed-full', v.w === 'full');
    document.body.classList.toggle('hide-meta', v.meta === false); document.body.classList.toggle('hide-tags', v.tags === false);
    typeof ViewTab !== 'undefined' && ViewTab.sync(); typeof Focus !== 'undefined' && Focus.box && Focus.syncHud();
    if (this.val) this.val.textContent = Math.round(v.ez * 100) + '%';
    if (this.wb) { const w = this.WIDTHS.find(x => x[0] === v.w) || this.WIDTHS[0]; this.wb.textContent = w[1]; this.wb.title = w[2] + ' — clique para alternar'; }
  },
  zoom(d) { const ez = Math.round(Math.min(this.MAX, Math.max(this.MIN, this.get().ez + d)) * 100) / 100; this.set({ ez }); },
  cycleWidth() { const i = this.WIDTHS.findIndex(x => x[0] === this.get().w); this.setWidth(this.WIDTHS[(i + 1) % this.WIDTHS.length][0]); },
  setWidth(w) {
    if (w === 'full') document.body.classList.add('nav-collapsed'); else if (this.get().w === 'full') document.body.classList.remove('nav-collapsed');
    this.set({ w });
  },
  init() {
    const ed = $('#editor'); if (!ed || this.bar) return;
    this.val = el('button', { class: 'ez-val', title: 'Voltar para 100%', onclick: () => this.set({ ez: 1 }) });
    this.wb = el('button', { onclick: () => this.cycleWidth() });
    const items = el('div', { class: 'ev-items' },
      el('button', { text: 'A−', title: 'Diminuir letra (Ctrl+Alt+−)', onclick: () => this.zoom(-0.1) }), this.val,
      el('button', { text: 'A+', title: 'Aumentar letra (Ctrl+Alt+=)', onclick: () => this.zoom(0.1) }), this.wb,
      el('button', { class: 'ev-focus', text: '◎', title: 'Modo foco — só o texto (Ctrl+Alt+F)', onclick: () => Focus.toggle() }));
    // recolhida num ícone: abre ao passar o mouse ou ao tocar; fecha ao sair / tocar fora
    const tog = el('button', { class: 'ev-tog', title: 'Letra, largura e modo foco', text: 'Aa', onclick: () => this.bar.classList.toggle('open') });
    this.bar = el('div', { class: 'ed-view', role: 'toolbar', 'aria-label': 'Visualização do editor' }, items, tog);
    this.bar.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') this.bar.classList.remove('open'); });
    document.addEventListener('pointerdown', e => { if (this.bar && !this.bar.contains(e.target)) this.bar.classList.remove('open'); }, true);
    ed.append(this.bar);
    if (this.get().w === 'full') document.body.classList.add('nav-collapsed');
    this.apply();
    /* Ctrl+roda do mouse / pinça do touchpad: zoom só do texto do editor */
    ed.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); this.zoom(e.deltaY < 0 ? 0.05 : -0.05); }, { passive: false });
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey && e.altKey) || !$('#editor')?.offsetParent) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); this.zoom(0.1); } else if (e.key === '-') { e.preventDefault(); this.zoom(-0.1); } else if (e.key === '0') { e.preventDefault(); this.set({ ez: 1 }); }
    });
    /* Pinça com dois dedos na tela (fora das áreas de desenho) */
    let pinch = null; const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    ed.addEventListener('touchstart', e => { if (e.touches.length === 2 && !e.target.closest('canvas, .b-ink')) pinch = { d: dist(e.touches), ez: this.get().ez }; }, { passive: true });
    ed.addEventListener('touchmove', e => {
      if (!pinch || e.touches.length !== 2) return; e.preventDefault();
      const ez = Math.round(Math.min(this.MAX, Math.max(this.MIN, pinch.ez * dist(e.touches) / pinch.d)) * 100) / 100;
      const inner = $('#editor-inner'); inner && inner.style.setProperty('--ez', ez); this.val.textContent = Math.round(ez * 100) + '%'; pinch.cur = ez;
    }, { passive: false });
    ed.addEventListener('touchend', e => { if (pinch && e.touches.length < 2) { if (pinch.cur) this.set({ ez: pinch.cur }); pinch = null; } });
  }
};

/* ===== Pesquisa nas ministrações: seção / caderno / tudo, com trecho e destaque no editor ===== */
const Search = {
  cache: new Map(),
  scope() { try { return localStorage.getItem('ss-search-scope') || 'sec'; } catch (e) { return 'sec'; } },
  setScope(v) { try { localStorage.setItem('ss-search-scope', v); } catch (e) { } App.renderPages(); },
  /* normaliza letra por letra (mesmo comprimento) para o trecho apontar o lugar certo do texto original */
  norm(t) { let o = ''; for (const ch of t) { const n = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); o += n.length === ch.length ? n : ch; } return o; },
  terms(q) { const out = []; q.replace(/"([^"]+)"|(\S+)/g, (_, a, b) => { const t = this.norm((a || b).trim()); if (t) out.push(t); }); return out; },
  doc(s) {
    const c = this.cache.get(s.id); if (c && c.u === s.updated) return c;
    const raw = s.blocks.map(b => [b.ref, htmlToText(b.html || ''), b.alt, b.caption].filter(Boolean).join(' ')).join('\n').replace(/[ \t]+/g, ' ');
    const d = { u: s.updated, title: s.title || '', nt: this.norm((s.title || '') + ' ' + (s.passage || '')), raw, nr: this.norm(raw) };
    this.cache.set(s.id, d); return d;
  },
  pool() {
    const sc = this.scope(), m = App.meta;
    if (sc === 'all') return [...App.sermons.values()];
    if (sc === 'nb') { const secs = new Set(m.sections.filter(x => x.nb === this.baseNb).map(x => x.id)); return [...App.sermons.values()].filter(s => secs.has(s.sec)); }
    return App.sectionSermons(this.baseSec);
  },
  count(hay, t) { let n = 0, i = 0; while ((i = hay.indexOf(t, i)) >= 0) { n++; i += t.length; } return n; },
  run(q) {
    const ts = this.terms(q); if (!ts.length) return [];
    const res = [];
    for (const s of this.pool()) {
      const d = this.doc(s); let score = 0, hits = 0, ok = true;
      for (const t of ts) { const inT = this.count(d.nt, t), inB = this.count(d.nr, t); if (!inT && !inB) { ok = false; break; } score += inT * 10 + inB; hits += inT + inB; }
      if (ok) res.push({ s, d, score, hits, ts });
    }
    return res.sort((a, b) => b.score - a.score || (b.s.date || '').localeCompare(a.s.date || ''));
  },
  snippet(d, ts) {
    let at = -1, len = 0; for (const t of ts) { const i = d.nr.indexOf(t); if (i >= 0 && (at < 0 || i < at)) { at = i; len = t.length; } }
    const frag = el('div', { class: 'page-sub sr-snip' });
    if (at < 0) { frag.textContent = d.raw.slice(0, 90); return frag; }
    const a = Math.max(0, at - 40), b = Math.min(d.raw.length, at + len + 70);
    let piece = d.raw.slice(a, b).replace(/\n/g, ' · '), np = d.nr.slice(a, b);
    const marks = []; for (const t of ts) { let i = 0; while ((i = np.indexOf(t, i)) >= 0) { marks.push([i, i + t.length]); i += t.length; } }
    marks.sort((x, y) => x[0] - y[0]); let pos = 0;
    if (a > 0) frag.append('…');
    for (const [x, y] of marks) { if (x < pos) continue; frag.append(piece.slice(pos, x), el('mark', { text: piece.slice(x, y) })); pos = y; }
    frag.append(piece.slice(pos)); if (b < d.raw.length) frag.append('…');
    return frag;
  },
  where(s) { const sec = App.meta.sections.find(x => x.id === s.sec); const nb = sec && App.meta.notebooks.find(n => n.id === sec.nb); return [nb?.name, sec?.name].filter(Boolean).join(' › '); },
  renderScope(q) {
    let bar = $('#search-scope');
    if (!q) { bar && (bar.hidden = true); return; }
    if (!bar) { bar = el('div', { id: 'search-scope', class: 'search-scope' }); $('#page-search').after(bar); }
    bar.hidden = false; bar.innerHTML = '';
    const sc = this.scope(); const secName = App.meta.sections.find(x => x.id === this.baseSec)?.name || 'Seção';
    const nbName = App.meta.notebooks.find(n => n.id === this.baseNb)?.name || 'Caderno';
    for (const [v, label, tip] of [['sec', secName, 'Só nesta seção'], ['nb', nbName, 'No caderno inteiro'], ['all', 'Tudo', 'Em todos os cadernos']])
      bar.append(el('button', { class: 'chip sc' + (sc === v ? ' on' : ''), title: tip, text: label, onclick: () => this.setScope(v) }));
  },
  renderResults(q) {
    const list = $('#page-list'); list.innerHTML = '';
    const res = this.run(q); const total = res.reduce((n, r) => n + r.hits, 0);
    list.append(el('p', { class: 'muted small pad sr-sum', text: res.length ? `${res.length} página${res.length > 1 ? 's' : ''} · ${total} ocorrência${total > 1 ? 's' : ''}` : 'Nada encontrado' + (this.scope() !== 'all' ? ' aqui — tente “Tudo”.' : '.') }));
    const sc = this.scope();
    for (const r of res.slice(0, 300)) {
      list.append(el('div', { class: 'page sr' + (App.cur?.id === r.s.id ? ' active' : ''), 'data-id': r.s.id, onclick: () => { App.open(r.s.id); this.highlight(); } },
        el('div', { class: 'pg-main' },
          el('div', { class: 'page-title' }, r.s.title || 'Sem título', el('span', { class: 'sr-n', text: r.hits })),
          sc !== 'sec' ? el('div', { class: 'page-sub sr-where', text: this.where(r.s) }) : null,
          this.snippet(r.d, r.ts))));
    }
    if (res.length > 300) list.append(el('p', { class: 'muted small pad', text: `Mostrando 300 de ${res.length}. Refine a busca.` }));
  },
  /* marca as ocorrências no editor (sem mexer no texto) e rola até a primeira */
  highlight(given) {
    if (!window.CSS?.highlights) return;
    CSS.highlights.delete('ss-find');
    const q = ($('#page-search')?.value || '').trim(); const ts = Array.isArray(given) ? given : q ? this.terms(q) : []; if (!ts.length) return;
    const ranges = []; const w = document.createTreeWalker($('#editor-inner'), NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const h = this.norm(n.data);
      for (const t of ts) { let i = 0; while ((i = h.indexOf(t, i)) >= 0) { const r = new Range(); r.setStart(n, i); r.setEnd(n, i + t.length); ranges.push(r); i += t.length; } }
    }
    if (!ranges.length) return;
    CSS.highlights.set('ss-find', new Highlight(...ranges));
    ranges.sort((a, b) => a.compareBoundaryPoints(Range.START_TO_START, b));
    const r0 = ranges[0].getBoundingClientRect(), ed = $('#editor'), er = ed.getBoundingClientRect();
    ed.scrollTo({ top: ed.scrollTop + r0.top - er.top - er.height / 3, behavior: 'smooth' });
  },
  init() {
    const inp = $('#page-search'); inp.placeholder = 'Pesquisar…  (Ctrl+Shift+F)';
    let t; inp.oninput = () => {
      if (inp.value.trim() && !this.active) { this.baseSec = App.meta.currentSec; this.baseNb = App.meta.currentNb; }
      this.active = !!inp.value.trim();
      clearTimeout(t); t = setTimeout(() => { App.renderPages(); this.highlight(); }, 150);
    };
    inp.onkeydown = e => {
      if (e.key === 'Escape') { inp.value = ''; inp.oninput(); inp.blur(); }
      if (e.key === 'Enter') { const first = $('#page-list .page.sr'); first && first.click(); }
    };
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); document.body.classList.remove('nav-collapsed'); inp.focus(); inp.select(); }
    });
  }
};

/* recuo: dentro de lista cria/desfaz subitem; fora de lista, recua o parágrafo */
function indentSel(dir) {
  const sel = getSelection(); if (!sel.rangeCount) return;
  const n = sel.anchorNode; const elx = n && (n.nodeType === 1 ? n : n.parentElement);
  const li = elx?.closest('li'), body = elx?.closest('.b-body');
  if (dir < 0) { document.execCommand('outdent'); return; }
  if (li) {
    /* o primeiro item da lista não tem "pai" para virar subitem: o navegador criaria uma lista vazia */
    if (!li.previousElementSibling) { UI.toast('O primeiro item não pode virar subitem. Use Tab a partir do segundo.'); return; }
    document.execCommand('indent'); return;
  }
  document.execCommand('indent');
  /* o navegador recua com <blockquote>; deixamos discreto e sem a margem da direita */
  body?.querySelectorAll('blockquote').forEach(q => { q.style.margin = '0 0 0 2em'; q.style.border = '0'; q.style.padding = '0'; });
  body?.dispatchEvent(new Event('input', { bubbles: true }));
}
