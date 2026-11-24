/* ===== 🔖 Marcador “Parei aqui”: uma marca dentro do texto que diz onde continuar.
   É um <span class="ss-bm"> vazio (o rótulo vem do CSS), então não entra em contagem de palavras,
   corretor, tradução, PDF, Word, Pregar nem link de leitura. ===== */
const Bookmark = {
  SEL: '.ss-bm',
  has(s) { return (s?.blocks || []).some(b => (b.html || '').includes('ss-bm')); },
  count(s) { return (s?.blocks || []).reduce((n, b) => n + ((b.html || '').match(/class="ss-bm"/g) || []).length, 0); },
  /* as notas e o texto logo antes de cada marca (para a busca e a lista) */
  info(s) {
    const out = [];
    for (const b of s?.blocks || []) {
      if (!(b.html || '').includes('ss-bm')) continue;
      const d = document.createElement('div'); d.innerHTML = b.html; d.querySelectorAll('div,p,li,br').forEach(x => x.after(document.createTextNode(' ')));
      d.querySelectorAll(this.SEL).forEach(m => {
        const r = document.createRange(); r.selectNodeContents(d); r.setEndBefore(m);
        const before = r.toString().replace(/\s+/g, ' ').trim().slice(-90);
        out.push({ note: m.dataset.note || '', before, at: +m.dataset.at || 0 });
      });
    }
    return out;
  },
  make(note = '') {
    const m = document.createElement('span');
    m.className = 'ss-bm'; m.contentEditable = 'false'; m.dataset.at = Date.now();
    if (note) m.dataset.note = note;
    m.title = 'Parei aqui — clique para opções';
    return m;
  },
  /* coloca a marca onde está o cursor (ou no fim da seleção) */
  insert() {
    const sel = getSelection(); if (!sel.rangeCount) return UI.toast('Clique no texto onde você parou e tente de novo.');
    const r = sel.getRangeAt(0); const body = (r.endContainer.nodeType === 1 ? r.endContainer : r.endContainer.parentElement)?.closest('#blocks .b-body[contenteditable="true"]');
    if (!body) return UI.toast('Clique dentro de um texto (não no título) e tente de novo.');
    const wrap = body.closest('.block'), b = App.cur?.blocks.find(x => x.id === wrap?.dataset.id);
    if (!b) return; if (!Shared.canEdit(App.cur)) return UI.toast('Página somente leitura.');
    const m = this.make(); const rr = r.cloneRange(); rr.collapse(false);
    const sp = document.createTextNode(' ');
    rr.insertNode(sp); rr.insertNode(m);
    const c = document.createRange(); c.setStartAfter(sp); c.collapse(true); sel.removeAllRanges(); sel.addRange(c);
    b.html = body.innerHTML; App.touch(); this.paint(); App.renderPages();
    UI.toast('🔖 Marcado: “Parei aqui”. Ache depois em Pesquisar › 🔖 Para terminar.');
  },
  sync(m) {
    const body = m.closest('.b-body'), wrap = m.closest('.block'), b = App.cur?.blocks.find(x => x.id === wrap?.dataset.id);
    if (b && body) { b.html = body.innerHTML; App.touch(); }
  },
  remove(m) { const body = m.closest('.b-body'), wrap = m.closest('.block'); const n = m.nextSibling; m.remove(); if (n?.nodeType === 3 && n.data === ' ') n.remove();
    const b = App.cur?.blocks.find(x => x.id === wrap?.dataset.id); if (b && body) { b.html = body.innerHTML; App.touch(); } this.paint(); App.renderPages(); },
  /* leva o cursor para logo antes da marca (onde o texto parou) */
  goTo(m) {
    if (!m) return; const body = m.closest('.b-body'); body?.focus({ preventScroll: true });
    const r = document.createRange(); r.setStartBefore(m); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const ed = $('#editor'), rc = m.getBoundingClientRect(); ed?.scrollBy({ top: rc.top - ed.getBoundingClientRect().top - ed.clientHeight / 3, behavior: 'smooth' });
    m.classList.add('flash'); setTimeout(() => m.classList.remove('flash'), 1600);
  },
  pop(m) {
    this.close();
    const note = el('input', { class: 'inp', placeholder: 'Nota (opcional): o que falta aqui?', value: m.dataset.note || '' });
    note.oninput = () => { if (note.value.trim()) m.dataset.note = note.value.trim(); else delete m.dataset.note; this.sync(m); };
    note.onkeydown = e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); this.close(); this.goTo(m); } };
    const at = +m.dataset.at;
    const p = el('div', { class: 'bm-pop' },
      el('div', { class: 'bm-pop-h' }, el('b', { text: '🔖 Parei aqui' }), at ? el('span', { class: 'muted small', text: ' · ' + (typeof Recent !== 'undefined' ? Recent.ago(at) : new Date(at).toLocaleString('pt-BR')) }) : null),
      note,
      el('div', { class: 'row-btns' },
        el('button', { class: 'btn sm primary', text: '✍ Continuar daqui', onclick: () => { this.close(); this.goTo(m); } }),
        el('button', { class: 'btn sm', text: '✓ Terminei (tirar)', title: 'Remove o marcador', onclick: () => { this.close(); this.remove(m); UI.toast('Marcador removido'); } })));
    document.body.append(p); this._p = p;
    const r = m.getBoundingClientRect(); const W = Math.min(320, innerWidth - 16);
    p.style.width = W + 'px'; p.style.left = Math.max(8, Math.min(innerWidth - W - 8, r.left - 20)) + 'px';
    const h = p.offsetHeight; p.style.top = (r.bottom + 6 + h > innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    setTimeout(() => { const off = e => { if (!p.contains(e.target) && !e.target.closest?.(this.SEL)) this.close(); }; document.addEventListener('pointerdown', off, true); this._off = off; }, 0);
  },
  close() { this._p?.remove(); this._p = null; if (this._off) document.removeEventListener('pointerdown', this._off, true); this._off = null; },
  /* faixa no topo da página com marcador */
  paint() {
    const host = $('#blocks'); if (!host || !App.cur) return;
    host.previousElementSibling?.classList?.contains('bm-bar') && host.previousElementSibling.remove();
    const ms = [...host.querySelectorAll(this.SEL)]; if (!ms.length) return;
    let i = 0;
    const go = el('button', { class: 'btn sm bm-go', text: ms.length > 1 ? `🔖 Continuar de onde parei (1/${ms.length})` : '🔖 Continuar de onde parei', onclick: () => { this.goTo(ms[i % ms.length]); i++; if (ms.length > 1) go.textContent = `🔖 Continuar de onde parei (${(i % ms.length) + 1}/${ms.length})`; } });
    const n = ms[0].dataset.note;
    host.before(el('div', { class: 'bm-bar' }, go, n ? el('span', { class: 'muted small bm-n', text: '“' + n + '”' }) : null));
  },
  init() {
    document.addEventListener('click', e => { const m = e.target.closest?.('#blocks ' + this.SEL); if (m) { e.preventDefault(); e.stopPropagation(); this.pop(m); } }, true);
    document.addEventListener('keydown', e => { if (e.ctrlKey && e.altKey && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); this.insert(); } });
    // apagar a marca com Backspace/Delete também atualiza a faixa e a lista
    document.addEventListener('input', e => { if (e.target.closest?.('#blocks') && this._had !== undefined) { const now = !!$('#blocks ' + this.SEL); if (now !== this._had) { this.paint(); App.renderPages(); } this._had = now; } }, true);
  },
  afterBlocks() { this._had = !!$('#blocks ' + this.SEL); this.paint(); },
};
