/* ===== 📺 Apresentar em tela externa: slides numa janela (projetor/TV) e o painel do pregador no aparelho.
   Slides: capa, pontos, versículos, frases-chave, imagens, desenhos e diagramas. O texto entre eles
   vira anotação do pregador (só aparece no aparelho). Opcional: projetar também os textos. ===== */
const Present = {
  CSS: `
  .pz{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:6% 8%;box-sizing:border-box;font-family:'Segoe UI',system-ui,-apple-system,Roboto,Arial,sans-serif;background:var(--pz-bg);color:var(--pz-fg);overflow:hidden}
  .pz *{box-sizing:border-box}
  .pz.dark{--pz-bg:#120a1c;--pz-fg:#fbf8ff;--pz-mut:#c9b8de;--pz-acc:#c98cf0}
  .pz.light{--pz-bg:#ffffff;--pz-fg:#1b1325;--pz-mut:#6b5a80;--pz-acc:#7719aa}
  .pz .pz-in{width:100%;max-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5em}
  .pz .lab{font-size:.42em;letter-spacing:.14em;text-transform:uppercase;color:var(--pz-acc);font-weight:700}
  .pz .h1{font-size:1.35em;font-weight:800;line-height:1.12}
  .pz .h2{font-size:1em;font-weight:700;line-height:1.15}
  .pz .sub{font-size:.5em;color:var(--pz-mut)}
  .pz .vt{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:.78em;line-height:1.4}
  .pz .vr{font-size:.46em;font-weight:700;color:var(--pz-acc);margin-top:.6em}
  .pz .qt{font-size:.95em;font-weight:700;line-height:1.25}.pz .qt:before{content:"“";color:var(--pz-acc)}.pz .qt:after{content:"”";color:var(--pz-acc)}
  .pz .tx{font-size:.6em;line-height:1.45;text-align:left;max-width:30em}.pz .tx p,.pz .tx div{margin:0 0 .5em}
  .pz img{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;min-height:0}
  .pz.k-img{padding:3%}.pz.k-img .pz-in{height:100%}
  .pz.black{background:#000!important}.pz.black>*{visibility:hidden}
  .pz .bar{position:absolute;left:0;bottom:0;height:.6vh;background:var(--pz-acc);transition:width .3s}`,
  /* ---------- slides ---------- */
  build(s, withText) {
    const T = h => htmlToText(h || '').trim(), S = [];
    const ver = b => b.version ? (Bible.info(b.version)?.short || '') : (b.verLabel || '');
    S.push({ k: 'title', t: s.title || '', sub: [s.passage, s.date && !Notes.simple(s) ? new Date(s.date + 'T12:00').toLocaleDateString(DL()) : ''].filter(Boolean).join(' · '), notes: [] });
    let pn = 0;
    for (const b of s.blocks || []) {
      const t = T(b.html), last = S[S.length - 1];
      if (b.type === 'point' && t) S.push({ k: 'point', lab: `Ponto ${++pn}`, t, notes: [] });
      else if (b.type === 'subhead' && t) S.push({ k: 'point', t, notes: [] });
      else if (b.type === 'verse' && (t || b.ref)) S.push({ k: 'verse', t, ref: [b.ref, ver(b)].filter(Boolean).join(' · '), notes: [] });
      else if (b.type === 'quote' && t) S.push({ k: 'quote', t, notes: [] });
      else if (b.type === 'image' && b.src) S.push({ k: 'img', src: b.src, notes: t ? [{ html: sanitizeHTML(b.html) }] : [] });
      else if (b.type === 'mind' && b.mind) S.push({ k: 'img', src: Mind.png(b.mind, 1800).src, notes: [] });
      else if (b.type === 'ink' && b.ink?.strokes?.length) S.push({ k: 'img', src: inkToDataURL({ hr: inkContentHR(b.ink), strokes: b.ink.strokes }, 1600, '#ffffff'), notes: [] });
      else if (t) {
        const lab = BLOCK_TYPES[b.type]?.label || '', pre = b.type === 'text' ? '' : lab.toUpperCase() + ': ';
        // pontos escritos dentro do texto (título ou linha toda em negrito, como vem do OneNote) também viram slide
        const parts = this.split(b.html || '');
        if (!parts.some(x => x.head)) { if (withText) S.push({ k: 'text', lab: b.type === 'text' ? '' : lab, html: sanitizeHTML(b.html || ''), notes: [] }); else S[S.length - 1].notes.push({ lab: pre.replace(/: $/, ''), html: sanitizeHTML(b.html || '') }); continue; }
        let buf = [], first = true;
        const flush = () => { if (!buf.length) return; const html = buf.join(''), tt = htmlToText(html).trim(); if (tt) { if (withText) S.push({ k: 'text', lab: first && b.type !== 'text' ? lab : '', html: sanitizeHTML(html), notes: [] }); else S[S.length - 1].notes.push({ lab: first ? pre.replace(/: $/, '') : '', html: sanitizeHTML(html) }); } buf = []; first = false; };
        for (const x of parts) { if (x.head) { flush(); S.push({ k: 'point', t: x.text, notes: [] }); first = false; } else buf.push(x.html); }
        flush();
      }
    }
    return S;
  },
  /* divide um bloco de texto em parágrafos e marca os que são “ponto”: título (h1–h4) ou parágrafo curto todo em negrito */
  split(html) {
    const d = document.createElement('div'); d.innerHTML = html; const out = [];
    const isHead = e => {
      const tx = (e.textContent || '').replace(/\s+/g, ' ').trim(); if (!tx || tx.length > 140) return false;
      if (/^H[1-4]$/.test(e.tagName)) return true;
      let bold = ''; e.querySelectorAll('b,strong').forEach(x => { if (!x.parentElement.closest('b,strong') || x.parentElement === e) bold += x.textContent; });
      const st = e.getAttribute?.('style') || ''; if (/font-weight:\s*(bold|[6-9]00)/.test(st)) return true;
      return bold.replace(/\s+/g, ' ').trim().length >= tx.replace(/[\s:.\-–—]+$/, '').length * 0.95;
    };
    const nodes = d.children.length ? [...d.childNodes] : [d];
    for (const n of nodes) {
      if (n.nodeType === 3) { if (n.data.trim()) out.push({ html: n.data }); continue; }
      if (n.nodeType !== 1) continue;
      if (/^(UL|OL)$/.test(n.tagName)) { out.push({ html: n.outerHTML }); continue; }
      const head = isHead(n); out.push(head ? { head: true, text: n.textContent.replace(/\s+/g, ' ').trim().replace(/[:.]$/, '') } : { html: n.outerHTML });
    }
    return out;
  },
  slideEl(doc, sl, theme) {
    const E = (tag, cls, txt) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const root = E('div', `pz ${theme} k-${sl.k}`), inn = E('div', 'pz-in'); root.append(inn);
    if (sl.k === 'title') { inn.append(E('div', 'h1', sl.t)); if (sl.sub) inn.append(E('div', 'sub', sl.sub)); }
    else if (sl.k === 'point') { if (sl.lab) inn.append(E('div', 'lab', sl.lab)); inn.append(E('div', 'h1', sl.t)); }
    else if (sl.k === 'verse') { if (sl.t) inn.append(E('div', 'vt', sl.t)); if (sl.ref) inn.append(E('div', 'vr', sl.ref)); }
    else if (sl.k === 'quote') inn.append(E('div', 'qt', sl.t));
    else if (sl.k === 'img') { const i = E('img'); i.src = sl.src; inn.append(i); }
    else if (sl.k === 'text') { if (sl.lab) inn.append(E('div', 'lab', sl.lab)); const d = E('div', 'tx'); d.innerHTML = sl.html; inn.append(d); }
    return root;
  },
  /* encolhe a letra até caber */
  fit(root, base) {
    let f = base; root.style.fontSize = f + 'px';
    const inn = root.firstChild; let guard = 40;
    while (guard-- && (inn.scrollHeight > root.clientHeight * 0.9 || inn.scrollWidth > root.clientWidth * 0.92) && f > 14) { f *= 0.92; root.style.fontSize = f + 'px'; }
  },
  /* ---------- abrir ---------- */
  menu(anchor) {
    $('.mk-menu')?.remove();
    const box = el('div', { class: 'mk-menu pr-menu' },
      el('button', { class: 'mk-item', onclick: () => { box.remove(); App.cur && Reader.open(App.cur); } }, el('span', { class: 'pk-ic', text: '▶' }), el('span', { class: 'mk-l', text: 'Pregar neste dispositivo' }), el('kbd', { text: 'teleprompter' })),
      el('button', { class: 'mk-item', onclick: () => { box.remove(); this.start(); } }, el('span', { class: 'pk-ic', text: '📺' }), el('span', { class: 'mk-l', text: 'Apresentar em tela externa' }), el('kbd', { text: 'slides no telão + painel aqui' })));
    document.body.append(box); const r = anchor.getBoundingClientRect();
    box.style.left = Math.max(8, Math.min(innerWidth - box.offsetWidth - 8, r.right - box.offsetWidth)) + 'px'; box.style.top = (r.bottom + 4) + 'px';
    setTimeout(() => { const off = e => { if (!box.contains(e.target)) { box.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
  },
  async start() {
    const s = App.cur; if (!s) return; App.flush();
    this.s = s; this.withText = localStorage.getItem('ss-pz-text') === '1'; this.theme = localStorage.getItem('ss-pz-theme') || 'dark';
    this.S = this.build(s, this.withText); this.i = 0; this.black = false; this.t0 = Date.now();
    // abre a janela já na outra tela, quando o navegador deixa (Chrome/Edge: “Gerenciamento de janelas”)
    let feat = 'width=1280,height=720';
    try {
      if ('getScreenDetails' in window) {
        const sd = await getScreenDetails(); const ext = sd.screens.find(x => x !== sd.currentScreen);
        if (ext) feat = `left=${ext.availLeft},top=${ext.availTop},width=${ext.availWidth},height=${ext.availHeight}`;
        this.ext = !!ext;
      }
    } catch (e) { }
    const w = window.open('', 'ss-present', feat + ',menubar=no,toolbar=no,location=no');
    if (!w) return UI.toast('O navegador bloqueou a janela da apresentação. Permita pop-ups para este site e tente de novo.');
    this.w = w; this.setupWin(); this.panel(); this.show();
    if (!this.ext) UI.toast('Arraste a janela da apresentação para o projetor/TV e clique nela para tela cheia.');
  },
  setupWin() {
    const w = this.w, d = w.document;
    d.open(); d.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Apresentação — SmartSower</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden;cursor:none}' + this.CSS + '#fs{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:5;background:#7719aa;color:#fff;border:0;border-radius:22px;padding:12px 22px;font:600 16px system-ui;cursor:pointer}</style></head><body><div id="st"></div><button id="fs">⤢ Clique aqui para tela cheia</button></body></html>'); d.close();
    const fs = d.getElementById('fs'); fs.onclick = () => { d.documentElement.requestFullscreen?.().catch(() => { }); fs.remove(); };
    d.addEventListener('fullscreenchange', () => { if (d.fullscreenElement) fs.remove(); });
    d.addEventListener('keydown', e => this.key(e));
    d.addEventListener('click', e => { if (e.target !== fs && d.fullscreenElement) this.go(1); });
    w.addEventListener('resize', () => this.paintWin());
    w.addEventListener('beforeunload', () => { if (this.on) setTimeout(() => this.lost(), 300); });
  },
  paintWin() {
    const w = this.w; if (!w || w.closed) return; const st = w.document.getElementById('st'); if (!st) return;
    st.innerHTML = ''; const sl = this.S[this.i], r = this.slideEl(w.document, sl, this.theme);
    if (this.black) r.classList.add('black');
    const bar = w.document.createElement('div'); bar.className = 'bar'; bar.style.width = ((this.i + 1) / this.S.length * 100) + '%'; r.append(bar);
    st.append(r); this.fit(r, Math.max(28, Math.min(w.innerWidth / 15, w.innerHeight / 8)));
  },
  /* ---------- painel do pregador (no aparelho) ---------- */
  panel() {
    $('#pz-panel')?.remove(); this.on = true;
    if (!$('#pz-css')) document.head.append(el('style', { id: 'pz-css', text: this.CSS }));
    const P = el('div', { id: 'pz-panel' });
    const B = (t, title, fn, cls = '') => el('button', { class: 'btn ' + cls, text: t, title, onclick: fn });
    this.cur = el('div', { class: 'pzp-cur' }); this.next = el('div', { class: 'pzp-next' }); this.notes = el('div', { class: 'pzp-notes' });
    this.clock = el('span', { class: 'pzp-clock' }); this.pos = el('span', { class: 'pzp-pos' }); this.strip = el('div', { class: 'pzp-strip' });
    this.blackB = B('⬛ Tela preta', 'Apaga o telão (B)', () => this.toggleBlack());
    const textCk = el('label', { class: 'pzp-ck', title: 'Projetar também os textos (introdução, ilustrações etc.), não só pontos e versículos' }, el('input', { type: 'checkbox', checked: this.withText, onchange: e => { this.withText = e.target.checked; localStorage.setItem('ss-pz-text', this.withText ? '1' : '0'); const at = this.S[this.i]; this.S = this.build(this.s, this.withText); this.i = Math.max(0, this.S.findIndex(x => x.t === at.t && x.k === at.k)); this.show(); } }), ' Projetar textos');
    P.append(
      el('div', { class: 'pzp-top' }, el('b', { text: '📺 ' + (this.s.title || 'Apresentação') }), this.pos, this.clock, el('span', { class: 'pzp-sp' }), textCk,
        B(this.theme === 'dark' ? '☀ Fundo claro' : '☾ Fundo escuro', 'Trocar o fundo dos slides', e => { this.theme = this.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('ss-pz-theme', this.theme); e.target.textContent = this.theme === 'dark' ? '☀ Fundo claro' : '☾ Fundo escuro'; this.show(); }),
        this.blackB, B('⟳ Atualizar', 'Recarregar os slides com as últimas alterações da página', () => { const at = this.i; this.S = this.build(App.sermons.get(this.s.id) || this.s, this.withText); this.i = Math.min(at, this.S.length - 1); this.show(); UI.toast('Slides atualizados'); }),
        B('✕ Encerrar', 'Fechar a apresentação (Esc)', () => this.stop(), 'danger')),
      el('div', { class: 'pzp-main' },
        el('div', { class: 'pzp-left' }, el('div', { class: 'pzp-l muted small', text: 'No telão agora' }), this.cur,
          el('div', { class: 'pzp-nav' }, B('◀ Anterior', '← ou PageUp', () => this.go(-1), 'lg'), B('Próximo ▶', '→, espaço ou PageDown (passadores de slide funcionam)', () => this.go(1), 'primary lg'))),
        el('div', { class: 'pzp-right' }, el('div', { class: 'pzp-l muted small', text: 'Próximo' }), this.next, el('div', { class: 'pzp-l muted small', text: 'Suas anotações (só aqui)' }), this.notes)),
      this.strip);
    document.body.append(P); document.body.classList.add('pz-on');
    this._k = e => { if ($('#pz-panel')) this.key(e); }; document.addEventListener('keydown', this._k, true);
    this._tick = setInterval(() => { const m = Math.floor((Date.now() - this.t0) / 60000), sec = Math.floor((Date.now() - this.t0) / 1000) % 60; this.clock.textContent = `⏱ ${m}:${String(sec).padStart(2, '0')}`; if (this.w?.closed && this.on) this.lost(); }, 1000);
    try { navigator.wakeLock?.request('screen').then(l => { this.lock = l; }).catch(() => { }); } catch (e) { }
  },
  mini(sl) { const box = el('div', { class: 'pzp-mini' }); const r = this.slideEl(document, sl, this.theme); box.append(r); requestAnimationFrame(() => this.fit(r, Math.max(10, box.clientWidth / 15))); return box; },
  show() {
    if (!this.S) return; const sl = this.S[this.i];
    this.cur.innerHTML = ''; this.cur.append(this.mini(sl)); if (this.black) this.cur.firstChild.firstChild.classList.add('black');
    this.next.innerHTML = ''; const nx = this.S[this.i + 1]; this.next.append(nx ? this.mini(nx) : el('div', { class: 'pzp-end muted', text: 'Fim da apresentação' }));
    this.notes.innerHTML = '';
    if (!sl.notes.length) this.notes.append(el('p', { class: 'muted', text: '—' }));
    for (const n of sl.notes) this.notes.append(typeof n === 'string' ? el('p', { text: n }) : el('div', { class: 'pzp-note' }, n.lab ? el('div', { class: 'pzp-nl', text: n.lab }) : null, el('div', { class: 'pzp-nh', html: n.html })));
    this.pos.textContent = `${this.i + 1} / ${this.S.length}`;
    this.strip.innerHTML = '';
    this.S.forEach((x, j) => { const t = el('button', { class: 'pzp-th' + (j === this.i ? ' on' : ''), title: x.t || x.ref || x.k, onclick: () => { this.i = j; this.show(); } }, el('span', { text: String(j + 1) }), el('span', { class: 'pzp-tt', text: { title: '🏷', point: '●', verse: '📖', quote: '❝', img: '🖼', text: '¶' }[x.k] + ' ' + (x.t || x.ref || '').slice(0, 26) })); this.strip.append(t); if (j === this.i) setTimeout(() => t.scrollIntoView({ inline: 'center', block: 'nearest' }), 0); });
    this.paintWin();
  },
  go(d) { if (!this.S) return; const j = Math.max(0, Math.min(this.S.length - 1, this.i + d)); if (j === this.i) return; this.i = j; this.black = false; this.blackB?.classList.remove('on'); this.show(); },
  toggleBlack() { this.black = !this.black; this.blackB.classList.toggle('on', this.black); this.show(); },
  key(e) {
    const k = e.key;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); e.stopPropagation(); this.go(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); e.stopPropagation(); this.go(-1); }
    else if (k === 'b' || k === 'B' || k === '.') { e.preventDefault(); this.toggleBlack(); }
    else if (k === 'Home') { this.i = 0; this.show(); } else if (k === 'End') { this.i = this.S.length - 1; this.show(); }
    else if (k === 'Escape' && e.currentTarget === document) { e.preventDefault(); this.stop(); }
  },
  lost() {
    if (!this.on || !$('#pz-panel') || $('#pz-lost')) return;
    const bar = el('div', { id: 'pz-lost' }, el('span', { text: 'A janela do telão foi fechada.' }), el('button', { class: 'btn sm primary', text: 'Reabrir', onclick: () => { bar.remove(); const w = window.open('', 'ss-present', 'width=1280,height=720'); if (!w) return UI.toast('Pop-up bloqueado'); this.w = w; this.setupWin(); this.paintWin(); } }), el('button', { class: 'btn sm', text: 'Encerrar', onclick: () => this.stop() }));
    $('#pz-panel .pzp-top')?.after(bar);
  },
  stop() {
    this.on = false; clearInterval(this._tick); document.removeEventListener('keydown', this._k, true);
    try { this.w && !this.w.closed && this.w.close(); } catch (e) { }
    this.lock?.release?.().catch?.(() => { }); this.lock = null;
    $('#pz-panel')?.remove(); document.body.classList.remove('pz-on'); this.S = null;
  },
};
