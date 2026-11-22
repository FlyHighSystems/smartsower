/* ===== Modo leitura / pregação ===== */
const Reader = {
  active: false, s: null, playing: false, seg: 0, segments: [], pos: 0, lt: 0, t0: 0, inks: [], wake: null,
  open(s) {
    if (!s) return; App.flush();
    this.s = s; s.settings ||= {}; const st = s.settings;
    st.fontSize ||= 34; st.mode ||= 'scroll'; st.speed ||= 3;
    this.active = true; this.playing = false; this.seg = 0; this.t0 = Date.now();
    const R = $('#reader'); R.hidden = false; document.body.classList.add('reading');
    $('#r-title').textContent = s.title;
    try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => { }); } catch (e) { }
    this.keepAwake();
    this.applyLook(); this.build();
    this.est = Estimate.sermon(s);
    Track.begin(s);
    this.clock = setInterval(() => { this.updateClock(); Track.tick(); }, 1000); this.updateClock();
    this.bindOnce();
  },
  close() {
    this.pause(); this.active = false; clearInterval(this.clock);
    this.inks.forEach(i => i.destroy()); this.inks = [];
    $('#reader').hidden = true; document.body.classList.remove('reading');
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { }
    try { this.wake && this.wake.release(); } catch (e) { } this.wake = null;
    App.touch(this.s);
    const sess = Track.end(), s = this.s;
    if (sess) {
      App.renderEditor();
      if (sess.minutes >= 5 && sess.words > 30) UI.toast(`Pregou ${sess.minutes} min? Use para calibrar as estimativas.`, { label: 'Usar', fn: () => { sess.calib = true; App.touch(s); App.updateEstimate(); UI.toast('Pronto. Relatório em 📊 Pregações.'); } });
      else UI.toast('Sessão guardada em 📊 Pregações.');
    }
  },
  async keepAwake() { try { if ('wakeLock' in navigator) this.wake = await navigator.wakeLock.request('screen'); } catch (e) { } },
  applyLook() {
    const st = this.s.settings, R = $('#reader');
    R.dataset.theme = Theme.reader(); $('#r-theme').textContent = { auto: 'Tema: Auto', dark: 'Escuro', sepia: 'Sépia', light: 'Claro' }[Theme.readerMode()]; R.dataset.mode = st.mode; R.classList.toggle('serif', !!App.meta.readerSerif);
    $('#r-content').style.fontSize = st.fontSize + 'px';
    $('#r-size').textContent = Math.round(st.fontSize);
    $('#r-speed').textContent = st.speed;
    $$('#r-modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
  },
  /* Constrói os segmentos: introdução + cada ponto com seus blocos */
  build() {
    const blocks = this.s.blocks; const segs = []; let cur = { point: null, blocks: [] };
    for (const b of blocks) { if (b.type === 'point') { if (cur.blocks.length) segs.push(cur); cur = { point: b, blocks: [b] }; } else cur.blocks.push(b); }
    if (cur.blocks.length) segs.push(cur);
    this.segments = segs.length ? segs : [{ point: null, blocks: [] }];
    this.render();
  },
  render() {
    this.inks.forEach(i => i.destroy()); this.inks = [];
    const C = $('#r-content'); C.innerHTML = '';
    const st = this.s.settings;
    let pointNo = 0; const numbers = new Map(); this.s.blocks.forEach(b => { if (b.type === 'point') numbers.set(b.id, ++pointNo); });
    const list = st.mode === 'points' ? this.segments[this.seg].blocks : this.s.blocks;
    if (st.mode === 'scroll' || this.seg === 0) {
      C.append(el('h1', { class: 'r-h1', text: this.s.title }));
      if (this.s.passage) C.append(el('div', { class: 'r-passage', text: this.s.passage }));
    }
    for (const b of list) { const n = this.blockEl(b, numbers.get(b.id)); const ms = Marks.strip(b, 30); if (ms && n.prepend) { ms.classList.add('r-marks'); n.prepend(ms); } C.append(n); }
    if (st.mode === 'scroll') C.append(el('div', { class: 'r-end', text: '— fim —' }));
    linkifyRefs(C); ensureContrast(C);
    $('#r-scroll').scrollTop = 0; this.pos = 0;
    this.status();
  },
  blockEl(b, num) {
    const theme = Theme.reader();
    switch (b.type) {
      case 'subhead': return el('h3', { class: 'r-subhead', html: b.html || '' });
      case 'point': return el('h2', { class: 'r-point', 'data-pid': b.id, html: `<span class="r-num">${num}.</span> ${b.html || ''}` });
      case 'verse': {
        const ver = b.version ? (Bible.info(b.version)?.short || '') : (b.verLabel || '');
        const q = el('blockquote', { class: 'r-verse' }, el('div', { class: 'r-ref', text: [b.ref, ver].filter(Boolean).join(' · ') }), el('div', { html: b.html || '' }));
        if (!b.html && b.ref) Bible.lookup(b.ref, b.version).then(r => { if (!r.error) q.lastChild.innerHTML = Bible.versesHTML(r.verses); });
        return q;
      }
      case 'illus': case 'app': case 'quote':
        return el('div', { class: 'r-call r-' + b.type }, el('div', { class: 'r-label', text: BLOCK_TYPES[b.type].label }), el('div', { html: b.html || '' }));
      case 'intro': case 'concl':
      case 'image': return el('figure', { class: 'r-fig' }, el('img', { src: b.src, alt: '' }), b.html ? el('figcaption', { html: b.html }) : null);
      case 'ink': {
        if (!b.ink?.strokes?.length) return el('span');
        const w = el('div', { class: 'r-ink' });
        const view = { ...b, ink: { hr: inkContentHR(b.ink), strokes: b.ink.strokes } };
        this.inks.push(new InkSurface(view, w, { readOnly: true, theme }));
        return w;
      }
      default:
        if (isCallout(b.type) && BLOCK_TYPES[b.type]) return el('div', { class: 'r-call r-custom', style: { '--bc': blockColor(b.type) } }, el('div', { class: 'r-label', text: BLOCK_TYPES[b.type].label }), el('div', { html: b.html || '' }));
        return el('div', { class: 'r-text', html: b.html || '' });
    }
  },
  status() {
    const st = this.s.settings, S = $('#r-status');
    if (st.mode === 'points') {
      const sg = this.segments[this.seg];
      const name = sg.point ? htmlToText(sg.point.html) || 'Ponto' : 'Introdução';
      S.innerHTML = '';
      S.append(el('span', { text: `${this.seg + 1} / ${this.segments.length} · ${name}` }),
        el('span', { class: 'r-dots' }, this.segments.map((_, i) => el('i', { class: i === this.seg ? 'on' : (i < this.seg ? 'done' : '') }))));
    } else S.textContent = this.playing ? '▶ Rolando — toque para pausar' : '❚❚ Pausado — toque na tela para rolar';
    $('#r-play').textContent = this.playing ? '❚❚' : '▶';
  },
  updateClock() {
    const sec = Math.floor((Date.now() - this.t0) / 1000), mm = String(Math.floor(sec / 60)).padStart(2, '0'), ss = String(sec % 60).padStart(2, '0');
    const T = $('#r-timer'); T.textContent = `${mm}:${ss}`;
    const dur = PageKinds.planned(this.s) * 60;
    T.className = 'r-timer' + (dur ? (sec >= dur ? ' over' : sec >= dur * 0.8 ? ' red' : sec >= dur * 0.5 ? ' yellow' : '') : '');
    T.title = dur ? `Duração planejada: ${PageKinds.planned(this.s)} min` : 'Toque para zerar';
    $('#r-clock').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.updateEstimate(sec);
  },
  /* Progresso (0..1) medido em palavras já passadas */
  progress() {
    const sc = $('#r-scroll'); const frac = sc.scrollHeight > sc.clientHeight ? sc.scrollTop / (sc.scrollHeight - sc.clientHeight) : 1;
    if (this.s.settings.mode !== 'points') return frac;
    const k = Estimate.rate().k; let before = 0, total = 0;
    this.segments.forEach((g, i) => { const m = Estimate.ofBlocks(g.blocks, k).minutes; if (i < this.seg) before += m; total += m; });
    const cur = Estimate.ofBlocks(this.segments[this.seg].blocks, k).minutes;
    return total ? (before + cur * (sc.scrollHeight > sc.clientHeight ? frac : 0)) / total : 0;
  },
  updateEstimate(sec) {
    const E = $('#r-est'); if (!E || !this.est) return;
    const total = this.est.minutes, left = Math.max(0, total * (1 - this.progress()));
    const finish = sec / 60 + left, dur = PageKinds.planned(this.s);
    E.textContent = `≈ ${Estimate.fmt(total)} · ` + (left < 1 ? 'falta < 1 min' : `faltam ≈ ${Estimate.fmt(left)}`);
    E.className = 'r-est' + (dur && finish > dur * 1.05 ? ' late' : '');
    E.title = `Estimativa ${Estimate.label(this.est)}.` + (dur ? ` Pelo ritmo de agora você termina em ≈ ${Estimate.fmt(finish)} (planejado: ${dur} min).` : '');
  },
  /* ---- rolagem automática ---- */
  pxps() { return this.s.settings.speed * this.s.settings.fontSize * 0.22; },
  play() {
    if (this.s.settings.mode !== 'scroll') return;
    const sc = $('#r-scroll'); if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) sc.scrollTop = 0;
    this.playing = true; this.pos = sc.scrollTop; this.lt = 0; this.flash('▶'); this.status();
    $('#reader').classList.add('playing');
    const loop = t => {
      if (!this.playing) return;
      const dt = this.lt ? Math.min(0.05, (t - this.lt) / 1000) : 0; this.lt = t;
      if (Math.abs(sc.scrollTop - this.pos) > 4) this.pos = sc.scrollTop; // usuário arrastou
      this.pos += this.pxps() * dt; sc.scrollTop = this.pos;
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1) { this.pause(); $('#r-status').textContent = '■ Fim da ministração'; return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
  pause() { if (!this.playing) return; this.playing = false; $('#reader').classList.remove('playing'); this.flash('❚❚'); this.status(); },
  toggle() { this.playing ? this.pause() : this.play(); },
  flash(sym) { const f = $('#r-flash'); f.textContent = sym; f.classList.remove('show'); void f.offsetWidth; f.classList.add('show'); },
  /* ---- ponto a ponto ---- */
  next() {
    const sc = $('#r-scroll');
    if (sc.scrollTop + sc.clientHeight < sc.scrollHeight - 8) { sc.scrollBy({ top: sc.clientHeight * 0.8, behavior: 'smooth' }); return; }
    if (this.seg < this.segments.length - 1) { this.seg++; this.render(); this.anim('next'); } else this.flash('■');
  },
  prev() {
    const sc = $('#r-scroll');
    if (sc.scrollTop > 8) { sc.scrollBy({ top: -sc.clientHeight * 0.8, behavior: 'smooth' }); return; }
    if (this.seg > 0) { this.seg--; this.render(); this.anim('prev'); }
  },
  anim(dir) { const c = $('#r-content'); c.classList.remove('in-next', 'in-prev'); void c.offsetWidth; c.classList.add('in-' + dir); },
  setMode(m) { this.pause(); this.s.settings.mode = m; this.seg = 0; this.applyLook(); this.render(); App.touch(this.s); },
  setFont(px, keepAnchor = true) {
    const st = this.s.settings, sc = $('#r-scroll');
    const ratio = sc.scrollHeight > sc.clientHeight ? sc.scrollTop / (sc.scrollHeight - sc.clientHeight) : 0;
    st.fontSize = clamp(px, 14, 120); $('#r-content').style.fontSize = st.fontSize + 'px'; $('#r-size').textContent = Math.round(st.fontSize);
    if (keepAnchor) { sc.scrollTop = ratio * (sc.scrollHeight - sc.clientHeight); this.pos = sc.scrollTop; }
    this._saveFont();
  },
  _saveFont: debounce(() => App.touch(Reader.s), 500),
  bindOnce() {
    if (this.bound) return; this.bound = true;
    const sc = $('#r-scroll');
    $('#r-close').onclick = () => this.close();
    $('#r-mic').onclick = () => Track.toggleMic();
    $('#r-play').onclick = () => this.s.settings.mode === 'scroll' ? this.toggle() : this.next();
    $('#r-smaller').onclick = () => this.setFont(this.s.settings.fontSize / 1.12);
    $('#r-bigger').onclick = () => this.setFont(this.s.settings.fontSize * 1.12);
    $('#r-slower').onclick = () => { this.s.settings.speed = clamp(this.s.settings.speed - 1, 1, 20); this.applyLook(); App.touch(this.s); };
    $('#r-faster').onclick = () => { this.s.settings.speed = clamp(this.s.settings.speed + 1, 1, 20); this.applyLook(); App.touch(this.s); };
    $$('#r-modes button').forEach(b => b.onclick = () => this.setMode(b.dataset.mode));
    $('#r-theme').onclick = () => { const th = ['auto', 'dark', 'sepia', 'light']; App.meta.readerTheme = th[(th.indexOf(Theme.readerMode()) + 1) % 4]; App.saveMeta(); this.applyLook(); this.render(); };
    $('#r-font').onclick = () => { App.meta.readerSerif = !App.meta.readerSerif; App.saveMeta(); this.applyLook(); };
    $('#r-timer').onclick = () => { this.t0 = Date.now(); this.updateClock(); };
    $('#r-full').onclick = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (e) { } };

    // Toque: pausar/continuar (rolagem) ou avançar/voltar (pontos)
    let down = null, pinched = false;
    sc.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }; if (!e.isPrimary) pinched = true; });
    sc.addEventListener('pointercancel', () => { down = null; });
    sc.addEventListener('pointerup', e => {
      if (!down || down.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t; const d = down; down = null;
      if (pinched) { setTimeout(() => pinched = false, 50); return; }
      if (e.target.closest('a.ref, button, .r-pop')) return;
      if (this.s.settings.mode === 'points' && moved > 60 && Math.abs(e.clientX - d.x) > Math.abs(e.clientY - d.y) * 1.5 && dt < 600) { (e.clientX < d.x) ? this.next() : this.prev(); return; }
      if (moved > 12 || dt > 450) return;
      if (this.s.settings.mode === 'scroll') this.toggle();
      else (e.clientX - sc.getBoundingClientRect().left < sc.clientWidth * 0.3) ? this.prev() : this.next();
    });
    // Pinça (dois dedos) = tamanho da letra
    let p0 = null;
    const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    sc.addEventListener('touchstart', e => { if (e.touches.length === 2) { p0 = { d: dist(e.touches), f: this.s.settings.fontSize }; pinched = true; } }, { passive: true });
    sc.addEventListener('touchmove', e => {
      if (p0 && e.touches.length === 2) { e.preventDefault(); const f = p0.f * dist(e.touches) / p0.d; if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = 0; this.setFont(f); }); }
    }, { passive: false });
    sc.addEventListener('touchend', e => { if (e.touches.length < 2) p0 = null; });
    // Alternativa com Pointer Events (se o navegador não expuser Touch Events)
    if (!('ontouchstart' in window)) {
      const pts = new Map(); let pp = null;
      const pd = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
      sc.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { pp = { d: pd(), f: this.s.settings.fontSize }; pinched = true; } });
      sc.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pp && pts.size === 2) this.setFont(pp.f * pd() / pp.d); });
      const endp = e => { pts.delete(e.pointerId); if (pts.size < 2) pp = null; };
      sc.addEventListener('pointerup', endp); sc.addEventListener('pointercancel', endp);
    }
    // Pinça do touchpad / Ctrl+roda do mouse
    sc.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); this.setFont(this.s.settings.fontSize * Math.exp(-clamp(e.deltaY, -120, 120) * 0.0018)); } }, { passive: false });
    // Teclado / passadores de slide (PageDown/PageUp)
    document.addEventListener('keydown', e => {
      if (!this.active) return;
      const m = this.s.settings.mode;
      if (e.key === 'Escape') { if (!document.fullscreenElement) this.close(); return; }
      if (['ArrowRight', 'PageDown', 'ArrowDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); if (m === 'scroll' && (e.key === ' ' || e.key === 'Enter' || e.key === 'PageDown')) this.toggle(); else if (m === 'points') this.next(); else sc.scrollBy({ top: 80 }); }
      if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); if (m === 'points') this.prev(); else sc.scrollBy({ top: -80 }); }
      if (e.key === '+' || e.key === '=') this.setFont(this.s.settings.fontSize * 1.1);
      if (e.key === '-') this.setFont(this.s.settings.fontSize / 1.1);
    });
    document.addEventListener('visibilitychange', () => { if (this.active && !document.hidden) this.keepAwake(); });
    // Referências tocáveis
    $('#r-content').addEventListener('click', async e => {
      const a = e.target.closest('a.ref'); if (!a) return; e.preventDefault();
      const r = await Bible.lookup(a.dataset.ref);
      const pop = $('#r-pop'); pop.innerHTML = '';
      pop.append(el('div', { class: 'r-ref', text: r.error ? a.dataset.ref : `${r.label} · ${Bible.info(r.version)?.short || ''}` }),
        el('div', { html: r.error ? esc(r.error) : Bible.versesHTML(r.verses) }), el('button', { class: 'btn', text: 'Fechar', onclick: () => pop.hidden = true }));
      pop.hidden = false;
    });
  }
};

/* Transforma "Jo 3:16" no meio do texto em link tocável */
function linkifyRefs(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.parentElement.closest('a, .r-ref, .r-verse, h1') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const txt = n.nodeValue; REF_IN_TEXT.lastIndex = 0; let m, last = 0; const frag = document.createDocumentFragment(); let any = false;
    while ((m = REF_IN_TEXT.exec(txt))) {
      const r = parseRef(m[0].trim()); if (!r || !r.ranges.length) continue;
      any = true; frag.append(txt.slice(last, m.index));
      frag.append(el('a', { class: 'ref', href: '#', 'data-ref': refLabel(r), text: m[0] })); last = m.index + m[0].length;
    }
    if (any) { frag.append(txt.slice(last)); n.replaceWith(frag); }
  }
}
