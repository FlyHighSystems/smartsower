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
    box.append(bar, el('div', { class: 'mm-scroll' }, fit));
    const ctx = { b, box, stage, svg, bar, fit, sel: null };
    box._mm = ctx;
    const B = (t, title, fn, cls = '') => { const x = el('button', { class: 'btn sm ' + cls, text: t, title }); x.addEventListener('pointerdown', e => e.preventDefault()); x.onclick = fn; return x; };
    bar.append(
      B('＋ Ideia', 'Novo galho a partir do nó selecionado (Tab)', () => this.add(ctx, 'child')),
      B('＋ Ao lado', 'Nova ideia no mesmo nível (Enter)', () => this.add(ctx, 'sib')),
      B('↑', 'Subir na ordem (Ctrl+↑)', () => this.move(ctx, -1)), B('↓', 'Descer na ordem (Ctrl+↓)', () => this.move(ctx, 1)),
      B('🎨', 'Trocar a cor do galho', () => this.recolor(ctx)),
      B('✕', 'Apagar o nó e o que está abaixo dele', () => this.del(ctx)),
      el('span', { class: 'mm-sep' }),
      B('✦ IA', 'Gerar o mapa a partir da página, ou expandir o nó selecionado com ideias', () => this.ai(ctx), 'mm-ai'),
      B('⛶', 'Abrir o mapa em tela cheia', () => this.full(ctx)));
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
      d.addEventListener('focus', () => { ctx.sel = n; stage.querySelectorAll('.mm-node.on').forEach(x => x.classList.remove('on')); d.classList.add('on'); });
      d.addEventListener('input', () => { n.t = d.textContent.replace(/\n/g, ' '); this.save(ctx, false); this.layout(ctx); });
      d.addEventListener('keydown', e => this.key(ctx, n, e));
      stage.append(d);
      (n.k || []).forEach((k, i) => mk(k, depth + 1, depth === 0 ? (k.c || MIND_COLORS[i % MIND_COLORS.length]) : color));
    };
    mk(b.mind, 0, 'var(--accent)');
    this.layout(ctx);
    if (ctx.sel && this.r(ctx.sel).el) this.r(ctx.sel).el.classList.add('on');
  },
  /* galhos divididos à direita e à esquerda do tema (como no XMind); em tela estreita, tudo à direita */
  layout(ctx) {
    const { stage, svg, b, box } = ctx, root = b.mind; if (!this.r(root).el) return;
    const GX = 34, GY = 10, W = box.clientWidth || 600;
    stage.style.width = '4000px'; stage.querySelectorAll('.mm-node').forEach(e => { e.style.left = '0px'; e.style.top = '0px'; });   // mede sem a borda apertar
    const size = n => { this.r(n).w = this.r(n).el.offsetWidth; this.r(n).h = this.r(n).el.offsetHeight; (n.k || []).forEach(size); };
    size(root);
    const hgt = n => (this.r(n).sh = n.k?.length ? Math.max(this.r(n).h, n.k.reduce((s, k) => s + hgt(k), 0) + GY * (n.k.length - 1)) : this.r(n).h);
    const kids = root.k || [];
    const narrow = W < 560 || kids.length < 3;
    const right = narrow ? kids : kids.slice(0, Math.ceil(kids.length / 2)), left = narrow ? [] : kids.slice(right.length);
    const side = (list) => list.reduce((s, k) => s + hgt(k), 0) + GY * Math.max(0, list.length - 1);
    const hR = side(right), hL = side(left), H = Math.max(hR, hL, this.r(root).h) + 20;
    const place = (n, x, yTop, dir) => {   // x = borda do nó do lado do pai
      this.r(n).x = dir > 0 ? x : x - this.r(n).w; this.r(n).y = yTop + (this.r(n).sh - this.r(n).h) / 2;
      let y = yTop + (this.r(n).sh - (n.k || []).reduce((s, k) => s + this.r(k).sh, 0) - GY * Math.max(0, (n.k || []).length - 1)) / 2;
      for (const k of n.k || []) { place(k, dir > 0 ? this.r(n).x + this.r(n).w + GX : this.r(n).x - GX, y, dir); y += this.r(k).sh + GY; }
    };
    const depthW = (n) => this.r(n).w + (n.k?.length ? GX + Math.max(...n.k.map(depthW)) : 0);
    const wL = left.length ? GX + Math.max(...left.map(depthW)) : 0;
    this.r(root).x = wL + 10; this.r(root).y = 10 + (H - 20 - this.r(root).h) / 2;
    let y = 10 + (H - 20 - hR) / 2; for (const k of right) { place(k, this.r(root).x + this.r(root).w + GX, y, 1); y += this.r(k).sh + GY; }
    y = 10 + (H - 20 - hL) / 2; for (const k of left) { place(k, this.r(root).x - GX, y, -1); y += this.r(k).sh + GY; }
    let maxX = 0; const put = n => { this.r(n).el.style.left = this.r(n).x + 'px'; this.r(n).el.style.top = this.r(n).y + 'px'; maxX = Math.max(maxX, this.r(n).x + this.r(n).w); (n.k || []).forEach(put); }; put(root);
    const SW = maxX + 10; stage.style.width = SW + 'px'; stage.style.height = H + 'px';
    // encolhe para caber no bloco (até 60%); abaixo disso, rola de lado
    const s = SW > W ? Math.max(0.6, W / SW) : 1; ctx.scale = s;
    stage.style.transform = s < 1 ? `scale(${s})` : '';
    ctx.fit.style.width = Math.ceil(SW * s) + 'px'; ctx.fit.style.height = Math.ceil(H * s) + 'px';
    ctx.fit.style.marginLeft = SW * s < W ? Math.max(0, (W - SW * s) / 2) + 'px' : '0';
    svg.setAttribute('width', SW); svg.setAttribute('height', H); svg.innerHTML = '';
    const line = (a, c) => {
      const dir = this.r(c).x > this.r(a).x ? 1 : -1;
      const x1 = dir > 0 ? this.r(a).x + this.r(a).w : this.r(a).x, y1 = this.r(a).y + this.r(a).h / 2, x2 = dir > 0 ? this.r(c).x : this.r(c).x + this.r(c).w, y2 = this.r(c).y + this.r(c).h / 2, mx = (x1 + x2) / 2;
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`);
      p.setAttribute('stroke', getComputedStyle(this.r(c).el).getPropertyValue('--mc').trim() || '#888'); p.setAttribute('fill', 'none'); p.setAttribute('stroke-width', a === root ? 3 : 2); p.setAttribute('stroke-linecap', 'round');
      svg.append(p); (c.k || []).forEach(k => line(c, k));
    };
    (root.k || []).forEach(k => line(root, k));
  },
  focus(n) { const d = this.r(n).el; if (!d) return; d.focus({ preventScroll: true }); const r = document.createRange(); r.selectNodeContents(d); const s = getSelection(); s.removeAllRanges(); s.addRange(r); d.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); },
  add(ctx, how) {
    const cur = ctx.sel || ctx.b.mind, p = this.path(ctx, cur), par = p?.[p.length - 1];
    const n = { t: '', k: [] };
    if (how === 'child' || !par) (cur.k ||= []).push(n); else par.k.splice(par.k.indexOf(cur) + 1, 0, n);
    this.save(ctx); ctx.sel = n; this.focus(n);
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
