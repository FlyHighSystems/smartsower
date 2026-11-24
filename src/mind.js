/* ===== 🧠 Bloco Mapa mental =====
   b.mind = { t, k:[{ t, k:[…], c? }] }  ·  b.html guarda o mesmo mapa como lista (tópicos), então
   busca, contagem, IA, Word, PDF, Pregar e link de leitura já funcionam com ele. */
const MIND_COLORS = ['#7719aa', '#0f6cbd', '#c25e00', '#107c10', '#b4009e', '#008575', '#d13438', '#4f6bed'];
const Mind = {
  R: new WeakMap(),
  r(n) { let o = this.R.get(n); if (!o) this.R.set(n, o = {}); return o; },
  blank(title = '') { return { t: title || 'Tema central', k: [{ t: 'Ideia 1', k: [] }, { t: 'Ideia 2', k: [] }, { t: 'Ideia 3', k: [] }] }; },
  html(m) {
    const li = n => `<li>${esc(n.t || '')}${n.k?.length ? '<ul>' + n.k.map(li).join('') + '</ul>' : ''}</li>`;
    return `<div><b>${esc(m.t || '')}</b></div>` + (m.k?.length ? '<ul>' + m.k.map(li).join('') + '</ul>' : '');
  },
  /* texto com lista (ou linhas com recuo) → mapa */
  fromHTML(html, fallback) {
    const d = document.createElement('div'); d.innerHTML = html || '';
    const ul = d.querySelector('ul,ol');
    const walk = list => [...list.children].filter(x => x.tagName === 'LI').map(li => {
      const sub = li.querySelector(':scope > ul, :scope > ol'); const c = li.cloneNode(true); c.querySelectorAll('ul,ol').forEach(x => x.remove());
      return { t: c.textContent.trim(), k: sub ? walk(sub) : [] };
    });
    if (ul) { const t = (ul.previousElementSibling?.textContent || [...d.childNodes].find(n => n !== ul && n.textContent.trim())?.textContent || fallback || 'Tema central').trim(); return { t, k: walk(ul) }; }
    const lines = htmlToText(html || '').split('\n').map(x => x.replace(/^[\s•\-–*\d.)]+/, '').trim()).filter(Boolean);
    if (!lines.length) return this.blank(fallback);
    return { t: lines[0], k: lines.slice(1).map(t => ({ t, k: [] })) };
  },
  /* ---------- editor ---------- */
  el(b) {
    if (!b.mind) b.mind = this.blank(App.cur?.title);
    if (!b.html) b.html = this.html(b.mind);
    const box = el('div', { class: 'mm-wrap' });
    const stage = el('div', { class: 'mm-stage' }), svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('mm-svg'); stage.append(svg);
    const bar = el('div', { class: 'mm-bar' });
    const fit = el('div', { class: 'mm-fit' }, stage);
    box.append(bar, el('div', { class: 'mm-scroll' }, fit), el('div', { class: 'mm-hint muted small', text: 'Clique num balão e use o ＋ da ponta (ou Tab) para criar ideias saindo dele; Enter cria ao lado. Arraste um balão para outro galho (no celular: segure e arraste).' }));
    const ctx = { b, box, stage, svg, bar, fit, sel: null };
    box._mm = ctx;
    const B = (t, title, fn, cls = '') => { const x = el('button', { class: 'btn sm ' + cls, text: t, title }); x.addEventListener('pointerdown', e => e.preventDefault()); x.onclick = fn; return x; };
    bar.append(
      B('⬅ ＋', 'Nova ideia principal do lado ESQUERDO do tema (Alt+←)', () => this.addMain(ctx, 'L')),
      B('＋ ➡', 'Nova ideia principal do lado DIREITO do tema (Alt+→)', () => this.addMain(ctx, 'R')),
      B('⇆ Lado', 'Passar o galho selecionado para o outro lado do tema', () => this.flip(ctx)),
      el('span', { class: 'mm-sep0' }),
      B('＋ Ideia', 'Novo galho a partir do nó selecionado (Tab)', () => this.add(ctx, 'child')),
      B('＋ Ao lado', 'Nova ideia no mesmo nível (Enter)', () => this.add(ctx, 'sib')),
      B('↑', 'Subir na ordem (Ctrl+↑)', () => this.move(ctx, -1)), B('↓', 'Descer na ordem (Ctrl+↓)', () => this.move(ctx, 1)),
      B('🎨', 'Trocar a cor do galho', () => this.recolor(ctx)),
      B('✕', 'Apagar o nó e o que está abaixo dele', () => this.del(ctx)),
      el('span', { class: 'mm-sep' }),
      B('✦ IA', 'Gerar o mapa a partir da página, ou expandir o nó selecionado com ideias', () => this.ai(ctx), 'mm-ai'),
      B('⛶', 'Abrir o mapa em tela cheia', () => this.full(ctx)));
    box.addEventListener('focusout', () => setTimeout(() => { if (!box.contains(document.activeElement) && !ctx.dragging) { ctx.stage.querySelector('.mm-plus')?.remove(); ctx.stage.querySelectorAll('.mm-node.on').forEach(x => x.classList.remove('on')); ctx.sel = null; } }, 150));
    this.draw(ctx);
    new ResizeObserver(() => this.layout(ctx)).observe(box);
    return box;
  },
  path(ctx, node) { const find = (n, p) => { if (n === node) return p; for (const k of n.k || []) { const r = find(k, [...p, n]); if (r) return r; } return null; }; return find(ctx.b.mind, []); },
  save(ctx, redraw = true) { const b = ctx.b; b.html = this.html(b.mind); App.touch(); if (redraw) this.draw(ctx); },
  draw(ctx) {
    const { stage, b } = ctx; stage.querySelectorAll('.mm-node').forEach(n => n.remove());
    const mk = (n, depth, color) => {
      const d = el('div', { class: `mm-node d${Math.min(depth, 3)}`, contentEditable: Shared.canEdit(App.cur) ? 'plaintext-only' : 'false', spellcheck: true, text: n.t });
      d.style.setProperty('--mc', color); this.r(n).el = d;
      d.addEventListener('focus', () => { ctx.sel = n; stage.querySelectorAll('.mm-node.on').forEach(x => x.classList.remove('on')); d.classList.add('on'); this.plus(ctx); });
      d.addEventListener('input', () => { n.t = d.textContent.replace(/\n/g, ' '); this.save(ctx, false); this.layout(ctx); });
      d.addEventListener('keydown', e => this.key(ctx, n, e));
      d.addEventListener('pointerdown', e => { if (e.button === 0) this.drag(ctx, n, d, e); });
      stage.append(d);
      (n.k || []).forEach((k, i) => mk(k, depth + 1, depth === 0 ? (k.c || MIND_COLORS[i % MIND_COLORS.length]) : color));
    };
    mk(b.mind, 0, 'var(--accent)');
    this.layout(ctx);
    if (ctx.sel && this.r(ctx.sel).el) this.r(ctx.sel).el.classList.add('on');
  },
  /* posições do mapa. size(n) → {w,h}. Galhos divididos à direita e à esquerda do tema (como no XMind);
     em espaço estreito ou com poucos galhos, tudo à direita. Devolve { P: Map(nó → {x,y,w,h}), SW, H } */
  place(root, size, W, allowSplit = true) {
    const GX = 34, GY = 10, P = new Map(), S = new Map();
    const sz = n => { P.set(n, { ...size(n) }); (n.k || []).forEach(sz); }; sz(root);
    const hgt = n => { const p = P.get(n), k = n.k || []; const h = k.length ? Math.max(p.h, k.reduce((s, x) => s + hgt(x), 0) + GY * (k.length - 1)) : p.h; S.set(n, h); return h; };
    const kids = root.k || [];
    // lado de cada galho principal: o escolhido (side: 'L'|'R') ou, se não houver, distribuição automática
    const free = kids.filter(k => !k.side), split = allowSplit && !(W < 560 || kids.length < 3);
    const nR = kids.filter(k => k.side === 'R').length, nL = kids.filter(k => k.side === 'L').length;
    const autoR = split ? Math.max(0, Math.ceil(kids.length / 2) - nR) : free.length;
    const SIDE = new Map(); let a = 0; for (const k of kids) SIDE.set(k, k.side || (a++ < autoR ? 'R' : 'L'));
    const right = kids.filter(k => SIDE.get(k) === 'R'), left = kids.filter(k => SIDE.get(k) === 'L');
    const side = list => list.reduce((s, k) => s + hgt(k), 0) + GY * Math.max(0, list.length - 1);
    const R0 = P.get(root), hR = side(right), hL = side(left), H = Math.max(hR, hL, R0.h) + 20;
    const put = (n, x, yTop, dir) => {
      const p = P.get(n), k = n.k || []; p.x = dir > 0 ? x : x - p.w; p.y = yTop + (S.get(n) - p.h) / 2;
      let y = yTop + (S.get(n) - k.reduce((s, c) => s + S.get(c), 0) - GY * Math.max(0, k.length - 1)) / 2;
      for (const c of k) { put(c, dir > 0 ? p.x + p.w + GX : p.x - GX, y, dir); y += S.get(c) + GY; }
    };
    const depthW = n => P.get(n).w + (n.k?.length ? GX + Math.max(...n.k.map(depthW)) : 0);
    const wL = left.length ? GX + Math.max(...left.map(depthW)) : 0;
    R0.x = wL + 10; R0.y = 10 + (H - 20 - R0.h) / 2;
    let y = 10 + (H - 20 - hR) / 2; for (const k of right) { put(k, R0.x + R0.w + GX, y, 1); y += S.get(k) + GY; }
    y = 10 + (H - 20 - hL) / 2; for (const k of left) { put(k, R0.x - GX, y, -1); y += S.get(k) + GY; }
    let SW = 0; P.forEach(p => { SW = Math.max(SW, p.x + p.w); });
    return { P, SW: SW + 10, H, SIDE };
  },
  /* cor de cada nó: o tema usa a cor do app; cada galho principal tem a sua (ou a escolhida no 🎨) */
  colors(root, rootColor) {
    const C = new Map([[root, rootColor]]);
    (root.k || []).forEach((k, i) => { const c = k.c || MIND_COLORS[i % MIND_COLORS.length]; const w = n => { C.set(n, c); (n.k || []).forEach(w); }; w(k); });
    return C;
  },
  curve(a, c) {
    const dir = c.x > a.x ? 1 : -1;
    const x1 = dir > 0 ? a.x + a.w : a.x, y1 = a.y + a.h / 2, x2 = dir > 0 ? c.x : c.x + c.w, y2 = c.y + c.h / 2, mx = (x1 + x2) / 2;
    return [x1, y1, mx, y1, mx, y2, x2, y2];
  },
  layout(ctx) {
    const { stage, svg, b, box } = ctx, root = b.mind; if (!this.r(root).el) return;
    const W = box.clientWidth || 600;
    stage.style.width = '4000px'; stage.querySelectorAll('.mm-node').forEach(e => { e.style.left = '0px'; e.style.top = '0px'; });   // mede sem a borda apertar
    const { P, SW, H, SIDE } = this.place(root, n => ({ w: this.r(n).el.offsetWidth, h: this.r(n).el.offsetHeight }), W);
    ctx.P = P; ctx.SIDE = SIDE;
    P.forEach((p, n) => { const e = this.r(n).el; e.style.left = p.x + 'px'; e.style.top = p.y + 'px'; });
    this.plus(ctx);
    stage.style.width = SW + 'px'; stage.style.height = H + 'px';
    // encolhe para caber no bloco (até 60%); abaixo disso, rola de lado
    const s = SW > W ? Math.max(0.6, W / SW) : 1; ctx.scale = s;
    stage.style.transform = s < 1 ? `scale(${s})` : '';
    ctx.fit.style.width = Math.ceil(SW * s) + 'px'; ctx.fit.style.height = Math.ceil(H * s) + 'px';
    ctx.fit.style.marginLeft = SW * s < W ? Math.max(0, (W - SW * s) / 2) + 'px' : '0';
    svg.setAttribute('width', SW); svg.setAttribute('height', H); svg.innerHTML = '';
    const line = (a, c) => {
      const [x1, y1, cx1, cy1, cx2, cy2, x2, y2] = this.curve(P.get(a), P.get(c));
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', `M${x1},${y1} C${cx1},${cy1} ${cx2},${cy2} ${x2},${y2}`);
      p.setAttribute('stroke', getComputedStyle(this.r(c).el).getPropertyValue('--mc').trim() || '#888'); p.setAttribute('fill', 'none'); p.setAttribute('stroke-width', a === root ? 3 : 2); p.setAttribute('stroke-linecap', 'round');
      svg.append(p); (c.k || []).forEach(k => line(c, k));
    };
    (root.k || []).forEach(k => line(root, k));
  },
  /* ---------- arrastar um balão para outro galho (ou mudar a ordem) ---------- */
  drag(ctx, n, d, e) {
    if (n === ctx.b.mind || !Shared.canEdit(App.cur)) return;
    if (document.activeElement === d && e.pointerType !== 'touch') return;   // editando o texto: deixa selecionar
    const x0 = e.clientX, y0 = e.clientY, touch = e.pointerType === 'touch'; let on = false, hold = null, ghost, target = null, where = null;
    const sub = new Set(); const w = x => { sub.add(x); (x.k || []).forEach(w); }; w(n);
    const start = () => {
      on = true; ctx.dragging = true; d.classList.add('mm-drag');
      ghost = el('div', { class: 'mm-ghost', text: n.t || '…' }); document.body.append(ghost);
      if (touch) navigator.vibrate?.(15);
    };
    let lastX = x0;
    const pick = (x, y) => {
      lastX = x;
      ghost.style.left = x + 12 + 'px'; ghost.style.top = y + 8 + 'px';
      ctx.stage.querySelectorAll('.mm-drop,.mm-before,.mm-after').forEach(z => z.classList.remove('mm-drop', 'mm-before', 'mm-after'));
      ghost.hidden = true; const hit = document.elementFromPoint(x, y)?.closest?.('.mm-node'); ghost.hidden = false;
      target = null; where = null;
      if (!hit || !ctx.stage.contains(hit)) return;
      let t = null; ctx.P?.forEach((_, k) => { if (this.r(k).el === hit) t = k; }); if (!t || sub.has(t)) return;
      const r = hit.getBoundingClientRect(), f = (y - r.top) / r.height;
      where = t === ctx.b.mind ? 'in' : f < 0.28 ? 'before' : f > 0.72 ? 'after' : 'in';
      target = t; hit.classList.add(where === 'in' ? 'mm-drop' : where === 'before' ? 'mm-before' : 'mm-after');
    };
    const mv = ev => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0, far = Math.hypot(dx, dy) > 6;
      if (!on) { if (touch) { if (far && hold) { clearTimeout(hold); hold = null; end(); } return; } if (!far) return; start(); }
      ev.preventDefault(); pick(ev.clientX, ev.clientY);
    };
    const end = () => {
      clearTimeout(hold); document.removeEventListener('pointermove', mv, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', end, true);
      ctx.stage.removeEventListener('touchmove', stop, { passive: false });
      ghost?.remove(); d.classList.remove('mm-drag'); ctx.stage.querySelectorAll('.mm-drop,.mm-before,.mm-after').forEach(z => z.classList.remove('mm-drop', 'mm-before', 'mm-after'));
      setTimeout(() => { ctx.dragging = false; }, 0);
    };
    const up = () => {
      const was = on, t = target, wh = where; end();
      if (!was) { if (!touch) this.focusEnd(n); return; }
      if (!t) return;
      const p = this.path(ctx, n), par = p[p.length - 1]; par.k.splice(par.k.indexOf(n), 1);
      if (wh === 'in') { (t.k ||= []).push(n); if (t === ctx.b.mind) { const r = this.r(t).el.getBoundingClientRect(); (t.k || []).forEach(k => { k.side ||= ctx.SIDE?.get(k) || 'R'; }); n.side = lastX < r.left + r.width / 2 ? 'L' : 'R'; } }
      else { const tp = this.path(ctx, t), tpar = tp[tp.length - 1]; tpar.k.splice(tpar.k.indexOf(t) + (wh === 'after' ? 1 : 0), 0, n); if (tpar === ctx.b.mind) { (tpar.k || []).forEach(k => { if (k !== n) k.side ||= ctx.SIDE?.get(k) || 'R'; }); n.side = t.side; } }
      if (this.path(ctx, n).length > 1) delete n.side;   // só galho principal tem lado
      ctx.sel = n; this.save(ctx); UI.toast(wh === 'in' ? `“${n.t}” agora fica dentro de “${t.t}”` : 'Ordem alterada');
    };
    const stop = ev => { if (on) ev.preventDefault(); };
    if (touch) { hold = setTimeout(() => { hold = null; start(); pick(x0, y0); }, 320); ctx.stage.addEventListener('touchmove', stop, { passive: false }); }
    else e.preventDefault();   // não põe o cursor no texto ainda: pode ser um arrasto
    document.addEventListener('pointermove', mv, true); document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', end, true);
  },
  focusEnd(n) { const d = this.r(n).el; if (!d) return; d.focus({ preventScroll: true }); const r = document.createRange(); r.selectNodeContents(d); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); },
  /* ---------- imagem do mapa (Word, PDF, link): desenhado em canvas, fundo branco ---------- */
  png(mind, maxW = 1100) {
    if (!mind) return null;
    const F = 'Segoe UI, system-ui, -apple-system, Roboto, Arial, sans-serif', S = 2;
    const c = document.createElement('canvas'), g = c.getContext('2d');
    const font = d => d === 0 ? `700 17px ${F}` : d === 1 ? `600 14px ${F}` : `400 13.5px ${F}`;
    const depth = new Map(); const dw = (n, d) => { depth.set(n, d); (n.k || []).forEach(k => dw(k, d + 1)); }; dw(mind, 0);
    const lines = new Map();
    const wrap = (n) => {
      const d = depth.get(n), max = d === 0 ? 230 : 196; g.font = font(d);
      const words = String(n.t || '…').split(/\s+/); const out = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > max && cur) { out.push(cur); cur = w; } else cur = t; }
      out.push(cur); lines.set(n, out);
      const tw = Math.max(...out.map(l => g.measureText(l).width));
      const px = d === 0 ? 20 : 13, py = d === 0 ? 10 : 6, lh = d === 0 ? 22 : 18;
      return { w: Math.ceil(tw + px * 2 + 4), h: Math.ceil(out.length * lh + py * 2 + 4) };
    };
    const { P, SW, H } = this.place(mind, wrap, 99999);
    const C = this.colors(mind, '#7719aa');
    c.width = Math.ceil(SW * S); c.height = Math.ceil(H * S); g.scale(S, S);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, SW, H);
    const lineTo = (a, k) => { const [x1, y1, cx1, cy1, cx2, cy2, x2, y2] = this.curve(P.get(a), P.get(k)); g.beginPath(); g.moveTo(x1, y1); g.bezierCurveTo(cx1, cy1, cx2, cy2, x2, y2); g.strokeStyle = C.get(k); g.lineWidth = a === mind ? 3 : 2; g.lineCap = 'round'; g.stroke(); (k.k || []).forEach(z => lineTo(k, z)); };
    (mind.k || []).forEach(k => lineTo(mind, k));
    const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
    const mix = (hex, a) => { const n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255; return `rgb(${Math.round(255 - (255 - r) * a)},${Math.round(255 - (255 - gg) * a)},${Math.round(255 - (255 - b) * a)})`; };
    P.forEach((p, n) => {
      const d = depth.get(n), col = C.get(n);
      rr(p.x, p.y, p.w, p.h, Math.min(p.h / 2, d === 0 ? 22 : 16));
      g.fillStyle = d === 0 ? col : d === 1 ? mix(col, 0.14) : '#ffffff'; g.fill();
      g.strokeStyle = col; g.lineWidth = d >= 2 ? 1.5 : 2; g.stroke();
      g.font = font(d); g.fillStyle = d === 0 ? '#ffffff' : '#1b1b1b'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const L = lines.get(n), lh = d === 0 ? 22 : 18, top = p.y + p.h / 2 - (L.length - 1) * lh / 2;
      L.forEach((l, i) => g.fillText(l, p.x + p.w / 2, top + i * lh));
    });
    const w = Math.min(maxW, SW);
    return { src: c.toDataURL('image/png'), w, h: Math.round(H * w / SW) };
  },
  focus(n) { const d = this.r(n).el; if (!d) return; d.focus({ preventScroll: true }); const r = document.createRange(); r.selectNodeContents(d); const s = getSelection(); s.removeAllRanges(); s.addRange(r); d.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); },
  add(ctx, how) {
    const cur = ctx.sel || ctx.b.mind, p = this.path(ctx, cur), par = p?.[p.length - 1];
    const n = { t: '', k: [] };
    if (how === 'child' || !par) (cur.k ||= []).push(n); else par.k.splice(par.k.indexOf(cur) + 1, 0, n);
    if (par === ctx.b.mind && how !== 'child' && ctx.SIDE?.get(cur)) { this.freeze(ctx); n.side = cur.side; }   // ao lado de um galho principal: mesmo lado
    this.save(ctx); ctx.sel = n; this.focus(n);
  },
  /* botão ＋ na ponta do balão selecionado: cria uma ideia saindo dele (para fora do tema) */
  plus(ctx) {
    if (!Shared.canEdit(App.cur)) return;
    let b = ctx.stage.querySelector('.mm-plus');
    const n = ctx.sel, p = n && ctx.P?.get(n);
    if (!p || !this.r(n).el?.isConnected) { b?.remove(); return; }
    if (!b) {
      b = el('button', { class: 'mm-plus', title: 'Nova ideia saindo deste balão (Tab)', text: '+' });
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
      b.onclick = e => { e.stopPropagation(); this.add(ctx, 'child'); };
      ctx.stage.append(b);
    }
    const root = ctx.b.mind, top = n === root ? null : this.path(ctx, n)[1] || n;
    const left = n !== root && ctx.SIDE?.get(top) === 'L';
    const S = 22; b.style.top = (p.y + p.h / 2 - S / 2) + 'px';
    b.style.left = (left ? p.x - S - 4 : p.x + p.w + 4) + 'px';
    b.style.setProperty('--mc', getComputedStyle(this.r(n).el).getPropertyValue('--mc'));
  },
  /* fixa o lado atual de todos os galhos principais, para nenhum pular de lado quando outro muda */
  freeze(ctx) { (ctx.b.mind.k || []).forEach(k => { k.side ||= ctx.SIDE?.get(k) || 'R'; }); },
  addMain(ctx, side) {
    this.freeze(ctx); const n = { t: '', k: [], side }; (ctx.b.mind.k ||= []).push(n);
    this.save(ctx); ctx.sel = n; this.focus(n);
  },
  /* galho principal do nó selecionado vai para o outro lado */
  flip(ctx) {
    const n = ctx.sel; if (!n || n === ctx.b.mind) return UI.toast('Selecione um galho (não o tema central).');
    const p = this.path(ctx, n), top = p.length > 1 ? p[1] : n;
    // fixa o lado de todos os galhos (para os outros não pularem de lado com a mudança)
    (ctx.b.mind.k || []).forEach(k => { k.side ||= ctx.SIDE?.get(k) || 'R'; });
    top.side = top.side === 'L' ? 'R' : 'L';
    this.save(ctx); this.focus(n); UI.toast(`“${top.t}” foi para a ${top.side === 'L' ? 'esquerda' : 'direita'}`);
  },
  del(ctx) {
    const n = ctx.sel; if (!n || n === ctx.b.mind) return UI.toast('O tema central não pode ser apagado.');
    const p = this.path(ctx, n), par = p[p.length - 1], i = par.k.indexOf(n); par.k.splice(i, 1);
    ctx.sel = par.k[Math.max(0, i - 1)] || par; this.save(ctx); this.focus(ctx.sel);
  },
  move(ctx, d) {
    const n = ctx.sel; if (!n || n === ctx.b.mind) return; const p = this.path(ctx, n), par = p[p.length - 1], i = par.k.indexOf(n), j = i + d;
    if (j < 0 || j >= par.k.length) return; par.k.splice(i, 1); par.k.splice(j, 0, n); this.save(ctx); this.focus(n);
  },
  recolor(ctx) {
    const n = ctx.sel; if (!n || n === ctx.b.mind) return UI.toast('Selecione um galho.');
    const p = this.path(ctx, n), top = p.length > 1 ? p[1] : n;   // a cor é do galho principal
    const cur = this.r(top).el ? getComputedStyle(this.r(top).el).getPropertyValue('--mc').trim() : ''; const i = MIND_COLORS.indexOf(cur);
    top.c = MIND_COLORS[(i + 1) % MIND_COLORS.length]; this.save(ctx); this.focus(n);
  },
  key(ctx, n, e) {
    if (e.key === 'Tab') { e.preventDefault(); if (e.shiftKey) { const p = this.path(ctx, n); if (p.length) this.focus(p[p.length - 1]); } else this.add(ctx, 'child'); }
    else if (e.key === 'Enter') { e.preventDefault(); this.add(ctx, n === ctx.b.mind ? 'child' : 'sib'); }
    else if ((e.key === 'Backspace' || e.key === 'Delete') && !this.r(n).el.textContent && n !== ctx.b.mind) { e.preventDefault(); this.del(ctx); }
    else if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); this.move(ctx, e.key === 'ArrowUp' ? -1 : 1); }
    else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); this.addMain(ctx, e.key === 'ArrowLeft' ? 'L' : 'R'); }
    else if (e.key === 'Escape') this.r(n).el.blur();
  },
  full(ctx) {
    const ph = el('div'); ctx.box.replaceWith(ph);
    const m = UI.modal({ title: '🧠 Mapa mental', wide: true, body: ctx.box, onClose: () => { ph.replaceWith(ctx.box); ctx.box.classList.remove('mm-big'); this.layout(ctx); } });
    ctx.box.classList.add('mm-big'); setTimeout(() => this.layout(ctx), 50);
  },
  async ai(ctx) {
    const prov = AI.has('claude') ? 'claude' : AI.has('gemini') ? 'gemini' : null;
    if (!prov) return UI.toast('Configure uma IA (Claude ou Gemini) em ☁ › IA para usar isso.');
    const root = ctx.b.mind, n = ctx.sel && ctx.sel !== root ? ctx.sel : null;
    const empty = !root.k?.length || root.k.every(k => /^Ideia \d+$/.test(k.t) && !k.k?.length);
    const page = (App.cur?.blocks || []).filter(x => x !== ctx.b).map(x => (x.ref ? x.ref + ' ' : '') + htmlToText(x.html || '')).join('\n').slice(0, 9000);
    const sys = 'Você ajuda um pastor e escritor brasileiro a organizar ideias em mapas mentais. Responda SÓ com JSON válido, sem comentários. Formato: {"t":"texto","k":[{"t":"texto","k":[…]}]}. Textos curtos (2 a 7 palavras), em português, fiéis ao conteúdo e à Bíblia.';
    let user, mode;
    if (n) { mode = 'expand'; const p = this.path(ctx, n).map(x => x.t).concat(n.t).join(' › '); user = `Tema do mapa: ${root.t}\nCaminho do nó: ${p}\nIdeias que já existem nele: ${(n.k || []).map(k => k.t).join('; ') || '(nenhuma)'}\n\nConteúdo da página (contexto):\n${page || '(vazio)'}\n\nDevolva {"t":"${n.t}","k":[…]} com 3 a 5 NOVAS ideias para este nó (pode ter 1 nível abaixo).`; }
    else { mode = empty ? 'build' : 'more'; user = `Título da página: ${App.cur?.title || ''}\nTema central do mapa: ${root.t}\n${empty ? '' : 'Galhos que já existem: ' + root.k.map(k => k.t).join('; ') + '\n'}\nConteúdo da página:\n${page || '(vazio — crie a partir do tema)'}\n\n${empty ? 'Monte o mapa mental completo: tema central, 3 a 6 galhos principais e 2 a 4 ideias em cada.' : 'Sugira 2 a 4 galhos principais NOVOS (com 2 a 3 ideias cada) que complementem os existentes.'}`; }
    const btn = ctx.bar.querySelector('.mm-ai'); btn.disabled = true; btn.textContent = '✦ Pensando…';
    try {
      const raw = String(await AI.ask(prov, sys, user, { json: true, maxTokens: 1500 }));
      const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
      const clean = x => ({ t: String(x.t || '').slice(0, 120), k: (x.k || []).slice(0, 8).map(clean) });
      const r = clean(j);
      if (mode === 'build') { root.t = root.t === 'Tema central' && r.t ? r.t : root.t; root.k = r.k; }
      else if (mode === 'more') root.k.push(...r.k);
      else (n.k ||= []).push(...r.k);
      this.save(ctx); UI.toast('Mapa atualizado — ajuste à vontade (Ctrl+Z não desfaz; use 🕘 Versões se precisar).');
    } catch (e) { UI.toast('A IA não respondeu direito: ' + (e.message || e)); }
    btn.disabled = false; btn.textContent = '✦ IA';
  },
};
