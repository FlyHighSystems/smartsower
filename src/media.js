/* ===== Marcações nos blocos (como as "marcas" do OneNote) =====
   Cada bloco pode ter várias: b.marks = ['important', 'star', ...]. Atalhos Alt+1…9. */
const MARKS = [
  { id: 'important', label: 'Importante',            color: '#d13438', emoji: '❗', ch: '!',
    svg: '<path d="M12 6.2v7.6" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="18" r="1.9" fill="#fff" stroke="none"/>' },
  { id: 'star',      label: 'Especial',              color: '#e8a400', emoji: '⭐', ch: '★',
    svg: '<path d="M12 4.6l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.9l5-.7z" fill="#fff" stroke="#fff" stroke-width="1" stroke-linejoin="round"/>' },
  { id: 'question',  label: 'Perguntar à igreja',    color: '#0f6cbd', emoji: '❓', ch: '?',
    svg: '<path d="M8.9 9.3a3.2 3.2 0 1 1 4.6 2.9c-1 .5-1.5 1.2-1.5 2.3v.6" stroke-width="2.6" stroke-linecap="round" fill="none"/><circle cx="12" cy="18.4" r="1.7" fill="#fff" stroke="none"/>' },
  { id: 'pray',      label: 'Momento de oração',     color: '#7719aa', emoji: '🙏', ch: '✝',
    svg: '<path d="M12 4.5v15M7 9.5h10" stroke-width="2.8" stroke-linecap="round"/>' },
  { id: 'heart',     label: 'Apelo / ministração',   color: '#e3008c', emoji: '❤️', ch: '♥',
    svg: '<path d="M12 19s-6.8-4.2-6.8-9a3.7 3.7 0 0 1 6.8-2 3.7 3.7 0 0 1 6.8 2c0 4.8-6.8 9-6.8 9z" fill="#fff" stroke="none"/>' },
  { id: 'people',    label: 'Interação (vire para o lado, repita)', color: '#107c10', emoji: '👥', ch: '☺',
    svg: '<circle cx="9" cy="9" r="2.6" fill="#fff" stroke="none"/><circle cx="15.6" cy="10" r="2.2" fill="#fff" stroke="none"/><path d="M4.6 18.5c.6-3 2.3-4.6 4.4-4.6s3.8 1.6 4.4 4.6zM13.6 18.5c.3-1.6.9-2.8 1.9-3.4 1.9-.6 3.4.6 3.9 3.4z" fill="#fff" stroke="none"/>' },
  { id: 'idea',      label: 'Revelação / insight',   color: '#ca5010', emoji: '💡', ch: '✦',
    svg: '<path d="M12 4.4a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z" fill="#fff" stroke="none"/><path d="M10 17.6h4M10.6 19.8h2.8" stroke-width="1.7" stroke-linecap="round"/>' },
  { id: 'screen',    label: 'Mostrar no telão',      color: '#3a5f8f', emoji: '🖥️', ch: '▣',
    svg: '<rect x="4.6" y="5.6" width="14.8" height="9.6" rx="1.4" fill="none" stroke-width="2.2"/><path d="M12 15.4v3.2M8.6 19.2h6.8" stroke-width="2.2" stroke-linecap="round"/>' },
  { id: 'music',     label: 'Louvor / música',       color: '#4f52b2', emoji: '🎵', ch: '♪',
    svg: '<path d="M10 16.6V6.4l8-1.8v10" fill="none" stroke-width="2" stroke-linejoin="round"/><circle cx="8" cy="16.8" r="2.2" fill="#fff" stroke="none"/><circle cx="16" cy="14.8" r="2.2" fill="#fff" stroke="none"/>' },
  { id: 'pause',     label: 'Pausa / silêncio',      color: '#038387', emoji: '⏸️', ch: '‖',
    svg: '<path d="M9.4 7v10M14.6 7v10" stroke-width="3" stroke-linecap="round"/>' },
  { id: 'optional',  label: 'Opcional (se der tempo)', color: '#69707d', emoji: '⏱️', ch: '◷',
    svg: '<circle cx="12" cy="12.6" r="6.6" fill="none" stroke-width="2.2"/><path d="M12 9v4l2.6 1.6M10 4.4h4" stroke-width="2.2" stroke-linecap="round"/>' },
  { id: 'warning',   label: 'Cuidado (tema sensível)', color: '#b7791f', emoji: '⚠️', ch: '△',
    svg: '<path d="M12 5.2l7.4 13H4.6z" fill="none" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 10v3.6" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="16.2" r="1.2" fill="#fff" stroke="none"/>' },
  { id: 'book',      label: 'Para o livro',          color: '#8e562e', emoji: '📚', ch: 'L',
    svg: '<path d="M12 7.6c-1.6-1.3-3.9-1.8-6.6-1.6v10.6c2.7-.2 5 .3 6.6 1.6 1.6-1.3 3.9-1.8 6.6-1.6V6c-2.7-.2-5 .3-6.6 1.6z" fill="none" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 7.6v10.6" stroke-width="1.9"/>' }
];
const Marks = {
  get: id => MARKS.find(m => m.id === id),
  svg(m, size = 22) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><circle cx="12" cy="12" r="11.5" fill="${m.color}"/><g stroke="#fff" fill="none">${m.svg}</g></svg>`;
  },
  badge(m, size) { return el('span', { class: 'mk', title: m.label, 'data-mark': m.id, html: this.svg(m, size) }); },
  /* faixa de marcações de um bloco (editor e leitura) */
  strip(b, size, onClick) {
    if (!b.marks?.length) return null;
    const box = el('span', { class: 'mk-strip' });
    for (const id of b.marks) { const m = this.get(id); if (!m) continue; const x = this.badge(m, size); if (onClick) x.onclick = e => { e.stopPropagation(); onClick(e.currentTarget); }; box.append(x); }
    return box;
  },
  /* para exportações: insere as marcas no começo do elemento (PDF usa SVG; links e cópias usam texto colorido) */
  tag(node, b, plain = false) {
    if (!b.marks?.length || !node?.prepend) return node;
    const box = el('span', { class: 'mk-strip' });
    for (const id of b.marks) { const m = this.get(id); if (!m) continue;
      box.append(plain ? el('span', { class: 'mk-t mk-' + m.id, style: { display: 'inline-block', minWidth: '1.35em', textAlign: 'center', background: m.color, color: '#fff', borderRadius: '1em', fontWeight: '700', fontSize: '.8em', marginRight: '.3em', fontStyle: 'normal', padding: '0 .2em' }, title: m.label, text: m.ch }) : this.badge(m, 18)); }
    node.prepend(box, ' '); return node;
  },
  emoji(b) { return (b.marks || []).map(id => this.get(id)?.emoji).filter(Boolean).join('') ; },
  toggle(b, id) {
    b.marks = b.marks || []; const i = b.marks.indexOf(id);
    if (i >= 0) b.marks.splice(i, 1); else b.marks.push(id);
    if (!b.marks.length) delete b.marks;
    App.touch(); this.refresh(b);
  },
  refresh(b) {
    const w = $(`#blocks .block[data-id="${b.id}"]`); if (!w) return;
    w.querySelector(':scope > .mk-gutter')?.remove();
    const g = this.gutter(b); if (g) w.prepend(g);
    w.classList.toggle('has-marks', !!b.marks?.length);
  },
  gutter(b) {
    const s = this.strip(b, 22, anchor => this.menu(b, anchor)); if (!s) return null;
    s.classList.add('mk-gutter'); return s;
  },
  menu(b, anchor) {
    $('.mk-menu')?.remove();
    const box = el('div', { class: 'mk-menu', role: 'menu' });
    MARKS.forEach((m, i) => {
      const on = b.marks?.includes(m.id);
      box.append(el('button', { class: 'mk-item' + (on ? ' on' : ''), role: 'menuitemcheckbox', 'aria-checked': on ? 'true' : 'false', onclick: () => { this.toggle(b, m.id); box.remove(); } },
        this.badge(m, 24), el('span', { class: 'mk-l', text: m.label }), el('kbd', { text: m.id === 'book' ? 'Alt+0' : i < 9 ? 'Alt+' + (i + 1) : '' }), el('span', { class: 'mk-ck', text: on ? '✓' : '' })));
    });
    if (b.marks?.length) box.append(el('button', { class: 'mk-item mk-clear', onclick: () => { delete b.marks; App.touch(); this.refresh(b); box.remove(); } }, el('span', { class: 'mk-l', text: 'Remover todas as marcações' })));
    document.body.append(box);
    const r = anchor.getBoundingClientRect(); const h = box.offsetHeight, w = box.offsetWidth;
    box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    box.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
    setTimeout(() => { const off = e => { if (!box.contains(e.target)) { box.remove(); document.removeEventListener('pointerdown', off, true); } }; document.addEventListener('pointerdown', off, true); }, 0);
  },
  init() {
    document.addEventListener('keydown', e => {
      if (!e.altKey || e.ctrlKey || e.metaKey || !/^Digit[0-9]$/.test(e.code)) return;
      const id = App.focusId; const b = App.cur?.blocks.find(x => x.id === id); if (!b || !$('#editor')?.offsetParent) return;
      const m = e.code === 'Digit0' ? this.get('book') : MARKS[+e.code.slice(5) - 1]; if (!m) return;
      e.preventDefault(); this.toggle(b, m.id); UI.toast((b.marks?.includes(m.id) ? 'Marcado: ' : 'Desmarcado: ') + m.label);
    });
  }
};

/* ===== Imagem para o telão / redes: título da ministração em arte pronta ===== */
const SLIDE_STYLES = [
  { id: 'noite',   name: 'Noite',        bg: ['#1a0b2e', '#3d1466', '#7719aa'], fg: '#ffffff', sub: '#e2c8ff', accent: '#c58cff', glow: 'rgba(197,140,255,.35)' },
  { id: 'aurora',  name: 'Aurora',       bg: ['#3b0d2c', '#b8325c', '#f29a4b'], fg: '#ffffff', sub: '#ffe3cf', accent: '#ffd08a', glow: 'rgba(255,208,138,.35)' },
  { id: 'oceano',  name: 'Oceano',       bg: ['#03152b', '#0b4a74', '#11a3a3'], fg: '#ffffff', sub: '#c9f1ef', accent: '#7fe3d8', glow: 'rgba(127,227,216,.30)' },
  { id: 'brasa',   name: 'Brasa',        bg: ['#120806', '#4a1408', '#c2410c'], fg: '#fff6ec', sub: '#ffd2a8', accent: '#ff9b4a', glow: 'rgba(255,155,74,.35)' },
  { id: 'pedra',   name: 'Grafite',      bg: ['#0e0e10', '#1f2024', '#34363d'], fg: '#f5f5f5', sub: '#b9bcc6', accent: '#e8c46a', glow: 'rgba(232,196,106,.18)' },
  { id: 'papel',   name: 'Claro',        bg: ['#fbf8f3', '#f2ece2', '#e9e0d1'], fg: '#1c1a17', sub: '#6b5f4f', accent: '#7719aa', glow: 'rgba(119,25,170,.10)' },
  { id: 'foto',    name: 'Foto / IA',   bg: ['#000', '#000', '#000'],          fg: '#ffffff', sub: '#f0f0f0', accent: '#ffffff', glow: 'rgba(0,0,0,0)' }
];
const SLIDE_FORMATS = [['16:9', 1920, 1080, 'Telão 16:9'], ['4:3', 1440, 1080, 'Telão 4:3'], ['1:1', 1080, 1080, 'Feed 1:1'], ['9:16', 1080, 1920, 'Stories 9:16']];
const SLIDE_FONTS = [['moderna', 'Moderna', '"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif', 700], ['classica', 'Clássica', 'Georgia,"Times New Roman",serif', 700], ['condensada', 'Condensada', 'Bahnschrift,"Arial Narrow","Roboto Condensed",sans-serif', 700]];

const Slide = {
  defaults(s) {
    let last = {}; try { last = JSON.parse(localStorage.getItem('ss-slide') || '{}'); } catch (e) { }
    return { style: last.style || 'noite', fmt: last.fmt || '16:9', font: last.font || 'moderna', align: last.align || 'center', footer: last.footer ?? '', upper: !!last.upper,
      title: s.title || '', sub: s.passage || '', kicker: last.kicker ?? 'Série / Tema', showKicker: !!last.showKicker, photo: null, dim: 0.55, ...(s.slide || {}) };
  },
  wrap(ctx, text, maxW) {
    const words = text.split(/\s+/).filter(Boolean); const lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width <= maxW || !line) line = t; else { lines.push(line); line = w; } }
    if (line) lines.push(line); return lines;
  },
  async draw(cv, o) {
    const F = SLIDE_FORMATS.find(f => f[0] === o.fmt) || SLIDE_FORMATS[0]; const W = F[1], H = F[2];
    cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
    const st = SLIDE_STYLES.find(x => x.id === o.style) || SLIDE_STYLES[0];
    const font = SLIDE_FONTS.find(f => f[0] === o.font) || SLIDE_FONTS[0];
    const unit = Math.min(W, H) / 1080;
    /* fundo */
    if (st.id === 'foto' && o.photo) {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = o.photo; }).catch(() => null);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      if (img) { const k = Math.max(W / img.width, H / img.height); const iw = img.width * k, ih = img.height * k; ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih); }
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, `rgba(0,0,0,${o.dim * .7})`); g.addColorStop(.55, `rgba(0,0,0,${o.dim})`); g.addColorStop(1, `rgba(0,0,0,${Math.min(1, o.dim * 1.25)})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createLinearGradient(0, H, W, 0); g.addColorStop(0, st.bg[0]); g.addColorStop(.55, st.bg[1]); g.addColorStop(1, st.bg[2]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      /* luzes suaves */
      for (const [x, y, r] of [[.82, .18, .55], [.12, .92, .45]]) { const rg = ctx.createRadialGradient(W * x, H * y, 0, W * x, H * y, Math.max(W, H) * r); rg.addColorStop(0, st.glow); rg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); }
      /* raios de luz finos */
      ctx.save(); ctx.globalAlpha = st.id === 'papel' ? .05 : .07; ctx.strokeStyle = st.accent; ctx.lineWidth = 2 * unit;
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(W * (0.55 + i * .06), -10); ctx.lineTo(W * (0.15 + i * .09), H + 10); ctx.stroke(); }
      ctx.restore();
      /* grão (textura) */
      const n = Math.round(W * H / 900); ctx.save(); ctx.globalAlpha = st.id === 'papel' ? .05 : .06;
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < n; i++) { ctx.fillStyle = rnd() > .5 ? '#fff' : '#000'; ctx.fillRect(rnd() * W, rnd() * H, 1.6 * unit, 1.6 * unit); }
      ctx.restore();
    }
    /* texto */
    const pad = (o.fmt === '9:16' ? 110 : 150) * unit; const maxW = W - pad * 2;
    const title = (o.upper ? o.title.toUpperCase() : o.title).trim() || 'Título da ministração';
    let size = (o.fmt === '9:16' ? 150 : o.fmt === '1:1' ? 128 : 140) * unit, lines;
    const maxLines = o.fmt === '9:16' ? 6 : 4;
    for (; size > 40 * unit; size -= 4 * unit) { ctx.font = `${font[3]} ${size}px ${font[2]}`; lines = this.wrap(ctx, title, maxW); if (lines.length <= maxLines && Math.max(...lines.map(l => ctx.measureText(l).width)) <= maxW) break; }
    const lh = size * 1.08; const subSize = Math.max(30 * unit, size * .36); const kickSize = Math.max(24 * unit, size * .22);
    const blockH = lines.length * lh + (o.sub ? subSize * 2.1 : 0) + (o.showKicker && o.kicker ? kickSize * 2.4 : 0);
    let y = (H - blockH) / 2 + (o.fmt === '9:16' ? -H * .03 : 0);
    const x = o.align === 'left' ? pad : W / 2; ctx.textAlign = o.align === 'left' ? 'left' : 'center'; ctx.textBaseline = 'top';
    const shadow = st.id === 'papel' ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,.35)';
    if (o.showKicker && o.kicker) {
      ctx.font = `600 ${kickSize}px ${SLIDE_FONTS[0][2]}`; ctx.fillStyle = st.accent;
      const k = o.kicker.toUpperCase().split('').join(String.fromCharCode(8202)); ctx.fillText(k, x, y); y += kickSize * 2.4;
    }
    ctx.font = `${font[3]} ${size}px ${font[2]}`; ctx.fillStyle = st.fg; ctx.shadowColor = shadow; ctx.shadowBlur = 24 * unit; ctx.shadowOffsetY = 4 * unit;
    for (const l of lines) { ctx.fillText(l, x, y); y += lh; }
    ctx.shadowColor = 'rgba(0,0,0,0)';
    if (o.sub) {
      y += subSize * .55;
      const lw = 90 * unit; ctx.fillStyle = st.accent; ctx.fillRect(o.align === 'left' ? x : x - lw / 2, y, lw, 5 * unit); y += subSize * .7;
      ctx.font = `500 ${subSize}px ${SLIDE_FONTS[0][2]}`; ctx.fillStyle = st.sub; ctx.fillText(o.sub, x, y);
    }
    if (o.footer) { ctx.font = `600 ${Math.max(22 * unit, 30 * unit)}px ${SLIDE_FONTS[0][2]}`; ctx.fillStyle = st.sub; ctx.globalAlpha = .85; ctx.textAlign = o.align === 'left' ? 'left' : 'center'; ctx.fillText(o.footer, x, H - pad * .62); ctx.globalAlpha = 1; }
    return cv;
  },
  blob(cv) { return new Promise(r => cv.toBlob(r, 'image/png')); },
  open(s) {
    const o = this.defaults(s);
    const cv = el('canvas', { class: 'sl-canvas' });
    const redraw = debounce(() => this.draw(cv, o), 60);
    const save = () => { const { photo, title, sub, ...keep } = o; try { localStorage.setItem('ss-slide', JSON.stringify({ style: o.style, fmt: o.fmt, font: o.font, align: o.align, footer: o.footer, upper: o.upper, kicker: o.kicker, showKicker: o.showKicker })); } catch (e) { }
      s.slide = { style: o.style, fmt: o.fmt, font: o.font, align: o.align, title: o.title, sub: o.sub, kicker: o.kicker, showKicker: o.showKicker, footer: o.footer, upper: o.upper, dim: o.dim }; App.touch(s); };
    const field = (label, key, ph) => { const i = el('input', { class: 'inp', value: o[key] || '', placeholder: ph || '' }); i.oninput = () => { o[key] = i.value; redraw(); }; return [el('label', { class: 'lbl', text: label }), i]; };
    const chips = (list, key, render) => { const box = el('div', { class: 'sl-chips' }); const paint = () => box.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(o[key])));
      for (const it of list) box.append(render(it, () => { o[key] = it.id ?? it[0]; if (key === 'style' && o.style !== 'foto') { o.lastMood = o.style; resetPrompt(); } paint(); redraw(); photoRow.hidden = o.style !== 'foto'; })); paint(); return box; };
    const styleChips = chips(SLIDE_STYLES, 'style', (st, pick) => el('button', { class: 'sl-sw', 'data-v': st.id, title: st.name, onclick: pick, style: { background: st.id === 'foto' ? 'repeating-linear-gradient(45deg,#444 0 6px,#666 6px 12px)' : `linear-gradient(135deg,${st.bg[0]},${st.bg[1]} 55%,${st.bg[2]})`, color: st.fg } }, el('span', { text: st.name })));
    const fmtChips = chips(SLIDE_FORMATS, 'fmt', (f, pick) => el('button', { class: 'chip', 'data-v': f[0], text: f[3], onclick: pick }));
    const fontChips = chips(SLIDE_FONTS, 'font', (f, pick) => el('button', { class: 'chip', 'data-v': f[0], text: f[1], onclick: pick, style: { fontFamily: f[2] } }));
    const alignChips = chips([['center', 'Centralizado'], ['left', 'À esquerda']], 'align', (a, pick) => el('button', { class: 'chip', 'data-v': a[0], text: a[1], onclick: pick }));
    /* imagem de fundo: arquivo ou imagens desta ministração */
    const thumbs = el('div', { class: 'sl-thumbs' });
    for (const b of s.blocks.filter(b => b.type === 'image' && b.src).slice(0, 8)) thumbs.append(el('img', { src: b.src, title: 'Usar esta imagem', onclick: () => { o.photo = b.src; redraw(); } }));
    const dim = el('input', { type: 'range', min: 0, max: 0.9, step: 0.05, value: o.dim }); dim.oninput = () => { o.dim = +dim.value; redraw(); };
    const prompt = el('textarea', { class: 'inp', rows: 4 });
    const genOut = el('span', { class: 'muted small' });
    let cancel = null;
    const genBtn = el('button', { class: 'btn sm primary', text: '✨ Gerar fundo com IA', onclick: async () => {
      genBtn.disabled = true; const pv = ImageAI.provider(), horde = pv === 'horde';
      genOut.textContent = horde ? 'Enviando para a fila do AI Horde…' : pv === 'pollinations' ? 'Gerando no Pollinations… (10–60 s)' : 'Gerando… (10–30 s)';
      const ctl = { cancelled: false }; cancel = ctl; cancelBtn.hidden = !horde;
      try {
        const url = horde ? await Horde.generate(prompt.value, o.fmt, { ctl, progress: t => { genOut.textContent = t; } }) : pv === 'pollinations' ? await Pollinations.generate(prompt.value, o.fmt) : await ImageAI.generate(prompt.value, o.fmt);
        o.photo = url; (Slide.gen ||= []).unshift(url); addThumb(url, true);
        genOut.textContent = 'Pronto ✓ (' + (horde ? 'AI Horde · ' + (Horde.lastModel || '') : pv === 'pollinations' ? 'Pollinations · ' + Pollinations.lastModel : ImageAI.lastModel) + ') — gere de novo para outras opções.'; redraw();
      } catch (e) { genOut.textContent = e.message; } finally { genBtn.disabled = false; cancelBtn.hidden = true; cancel = null; } } });
    const cancelBtn = el('button', { class: 'btn sm', text: 'Cancelar', hidden: true, onclick: () => { if (cancel) cancel.cancelled = true; } });
    const provChips = el('div', { class: 'sl-chips' });
    const paintProv = () => { provChips.innerHTML = ''; for (const [v, l, t] of [['gemini', 'Nano Banana (Gemini)', 'Rápido e de alta qualidade; precisa de faturamento no Google'], ['pollinations', 'Pollinations (grátis)', 'Gratuito e rápido (Flux); sem chave tem limite de 1 imagem a cada ~15 s'], ['horde', 'AI Horde (grátis)', 'Gratuito e comunitário (Stable Diffusion); pode demorar alguns minutos']])
      provChips.append(el('button', { class: 'chip' + (ImageAI.provider() === v ? ' on' : ''), text: l, title: t, onclick: () => { ImageAI.setProvider(v); paintProv(); resetPrompt(); } })); };
    paintProv();
    const resetPrompt = async () => {
      if (ImageAI.provider() === 'gemini') { prompt.value = ImageAI.prompt(o, s); return; }
      prompt.value = Horde.template(o, s);
      if (AI.has()) { const before = prompt.value; genOut.textContent = 'Escrevendo a descrição em inglês com a IA…';
        try { const t = await Horde.smartPrompt(o, s); if (prompt.value === before && t) prompt.value = t; genOut.textContent = ''; } catch (e) { genOut.textContent = ''; } }
    };
    const addThumb = (src, first) => { const t = el('img', { src, title: 'Usar esta imagem', onclick: () => { o.photo = src; redraw(); } }); first ? thumbs.prepend(t) : thumbs.append(t); };
    (Slide.gen || []).forEach(u => addThumb(u));
    const photoRow = el('div', { class: 'sl-photo' },
      el('div', { class: 'sl-ai' }, el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } }, el('b', { text: '✨ Fundo temático com IA' }), el('button', { class: 'btn link', text: '⚙ Chaves e modelos', onclick: () => AI.settings() })), provChips,
        el('span', { class: 'muted small', text: 'A IA cria só a imagem; o título é escrito por cima pelo app, com letra perfeita.' }),
        prompt, el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, genBtn, cancelBtn, el('button', { class: 'btn sm', text: '↺ Descrição automática', onclick: resetPrompt }), genOut)),
      el('button', { class: 'btn sm', text: '📁 Escolher imagem…', onclick: async () => { const [f] = await pickFiles('image/*'); if (!f) return; o.photo = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }); redraw(); } }),
      thumbs, el('label', { class: 'lbl', text: 'Escurecer a imagem (para o texto aparecer)' }), dim);
    o.lastMood ||= o.style !== 'foto' ? o.style : 'noite'; resetPrompt();
    photoRow.hidden = o.style !== 'foto';
    const upper = el('input', { type: 'checkbox', checked: o.upper }); upper.onchange = () => { o.upper = upper.checked; redraw(); };
    const kick = el('input', { type: 'checkbox', checked: o.showKicker }); kick.onchange = () => { o.showKicker = kick.checked; redraw(); };
    const [kl, ki] = field('Linha acima do título (série, tema, culto)', 'kicker', 'Ex.: Série Romanos');
    const body = el('div', { class: 'sl-wrap' },
      el('div', { class: 'sl-prev' }, cv),
      el('div', { class: 'sl-form' },
        ...field('Título', 'title'), ...field('Subtítulo (texto-base, data…)', 'sub', 'Ex.: Romanos 8:28'),
        el('label', { class: 'sl-ck' }, kick, ' Mostrar linha acima do título'), kl, ki,
        ...field('Rodapé (igreja, @instagram…)', 'footer', 'Ex.: SOW Church'),
        el('label', { class: 'lbl', text: 'Estilo' }), styleChips, photoRow,
        el('label', { class: 'lbl', text: 'Formato' }), fmtChips,
        el('label', { class: 'lbl', text: 'Letra' }), fontChips, alignChips,
        el('label', { class: 'sl-ck' }, upper, ' Título em MAIÚSCULAS')));
    const m = UI.modal({ title: 'Imagem para o telão', body, wide: true, onClose: save, actions: [
      { label: 'Copiar imagem', onClick: async () => { save(); await this.draw(cv, o); try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': this.blob(cv) })]); UI.toast('Imagem copiada — cole no ProPresenter, Holyrics, PowerPoint ou WhatsApp.'); } catch (e) { UI.toast('O navegador não deixou copiar. Use “Baixar PNG”.'); } return false; } },
      { label: 'Tela cheia', onClick: async () => { save(); await this.draw(cv, o); this.present(cv); return false; } },
      { label: 'Baixar PNG', primary: true, onClick: async () => { save(); await this.draw(cv, o); await saveFile(safeName(o.title || 'telao') + ` (${o.fmt.replace(':', 'x')}).png`, await this.blob(cv)); return false; } }] });
    this.draw(cv, o);
    return m;
  },
  /* mostra a arte ocupando a tela (arraste a janela para o projetor e toque para sair) */
  present(cv) {
    const url = cv.toDataURL('image/png');
    const ov = el('div', { class: 'sl-present', title: 'Toque ou Esc para sair' }, el('img', { src: url, alt: '' }));
    const close = () => { document.exitFullscreen?.().catch(() => { }); ov.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    ov.onclick = close; document.addEventListener('keydown', key); document.body.append(ov);
    ov.requestFullscreen?.().catch(() => { });
  }
};

/* ===== Resumo das marcações (como o "Resumo de marcas" do OneNote) ===== */
const MarkSummary = {
  pref() { try { return { scope: 'sec', group: 'mark', ...JSON.parse(localStorage.getItem('ss-mksum') || '{}') }; } catch (e) { return { scope: 'sec', group: 'mark' }; } },
  savePref(p) { try { localStorage.setItem('ss-mksum', JSON.stringify(p)); } catch (e) { } },
  pool(scope) {
    const m = App.meta;
    if (scope === 'page') return App.cur ? [App.cur] : [];
    if (scope === 'all') return [...App.sermons.values()];
    if (scope === 'nb') { const secs = new Set(m.sections.filter(x => x.nb === m.currentNb).map(x => x.id)); return [...App.sermons.values()].filter(s => secs.has(s.sec)); }
    return App.sectionSermons(m.currentSec);
  },
  text(b) {
    if (b.type === 'verse') return [b.ref, htmlToText(b.html || '')].filter(Boolean).join(' — ');
    if (b.type === 'ink') return '[Desenho à mão]';
    if (b.type === 'image') return htmlToText(b.html || '') || '[Imagem]';
    return htmlToText(b.html || '');
  },
  collect(scope) {
    const out = [];
    for (const s of this.pool(scope)) s.blocks.forEach((b, i) => { if (b.marks?.length) out.push({ s, b, i }); });
    return out.sort((a, b) => (b.s.date || '').localeCompare(a.s.date || '') || a.i - b.i);
  },
  open() {
    const p = this.pref(); let filter = new Set(p.filter || []);
    const body = el('div', { class: 'mks' });
    const head = el('div', { class: 'mks-head' }), list = el('div', { class: 'mks-list' });
    body.append(head, list);
    const sc = App.meta.sections.find(x => x.id === App.meta.currentSec)?.name || 'Seção', nb = App.meta.notebooks.find(n => n.id === App.meta.currentNb)?.name || 'Caderno';
    const render = () => {
      const items = this.collect(p.scope);
      const counts = {}; items.forEach(it => it.b.marks.forEach(id => counts[id] = (counts[id] || 0) + 1));
      const shown = items.filter(it => !filter.size || it.b.marks.some(id => filter.has(id)));
      head.innerHTML = '';
      head.append(
        el('div', { class: 'sl-chips' }, ...[['page', 'Esta ministração'], ['sec', sc], ['nb', nb], ['all', 'Tudo']].map(([v, l]) =>
          el('button', { class: 'chip' + (p.scope === v ? ' on' : ''), text: l, disabled: v === 'page' && !App.cur, onclick: () => { p.scope = v; this.savePref({ ...p, filter: [...filter] }); render(); } }))),
        el('div', { class: 'mks-filter' }, ...MARKS.filter(m => counts[m.id]).map(m =>
          el('button', { class: 'mks-f' + (filter.has(m.id) ? ' on' : ''), title: m.label, style: { '--mc': m.color }, onclick: () => { filter.has(m.id) ? filter.delete(m.id) : filter.add(m.id); this.savePref({ ...p, filter: [...filter] }); render(); } },
            this.badge(m), el('span', { text: m.label }), el('b', { text: counts[m.id] }))),
          filter.size ? el('button', { class: 'btn link', text: 'Mostrar todas', onclick: () => { filter.clear(); this.savePref({ ...p, filter: [] }); render(); } }) : null),
        el('div', { class: 'mks-group' }, el('span', { class: 'muted small', text: `${shown.length} marcação(ões) · agrupar por ` }),
          ...[['mark', 'marcação'], ['page', 'página']].map(([v, l]) => el('button', { class: 'chip' + (p.group === v ? ' on' : ''), text: l, onclick: () => { p.group = v; this.savePref({ ...p, filter: [...filter] }); render(); } }))));
      list.innerHTML = '';
      if (!shown.length) { list.append(el('p', { class: 'muted pad', text: items.length ? 'Nenhuma marcação com esse filtro.' : 'Nenhum bloco marcado aqui. Use o 🏷 de um bloco ou Alt+1…9.' })); return; }
      const row = it => el('button', { class: 'mks-item', onclick: () => { m.close(); this.goto(it.s.id, it.b.id); } },
        el('span', { class: 'mks-badges' }, ...it.b.marks.map(id => Marks.get(id)).filter(Boolean).map(mm => this.badge(mm))),
        el('span', { class: 'mks-body' }, el('span', { class: 'mks-t', text: this.text(it.b).slice(0, 280) || '(vazio)' }),
          el('span', { class: 'mks-src', text: [it.s.title || 'Sem título', it.s.date ? new Date(it.s.date + 'T12:00').toLocaleDateString('pt-BR') : '', p.scope !== 'sec' && p.scope !== 'page' ? Search.where(it.s) : ''].filter(Boolean).join(' · ') })));
      if (p.group === 'page') {
        const by = new Map(); shown.forEach(it => { if (!by.has(it.s.id)) by.set(it.s.id, []); by.get(it.s.id).push(it); });
        for (const arr of by.values()) list.append(el('h4', { class: 'mks-h', text: arr[0].s.title || 'Sem título' }), ...arr.map(row));
      } else {
        for (const mm of MARKS) { const arr = shown.filter(it => it.b.marks.includes(mm.id) && (!filter.size || filter.has(mm.id))); if (!arr.length) continue;
          list.append(el('h4', { class: 'mks-h', style: { color: mm.color } }, this.badge(mm), ' ' + mm.label + ` (${arr.length})`), ...arr.map(row)); }
      }
      body._shown = shown;
    };
    const m = UI.modal({ title: '🏷 Resumo das marcações', body, wide: true, actions: [
      { label: 'Copiar lista', onClick: () => { Share.copyText(this.asText(body._shown || [], p.group)); return false; } },
      { label: 'Criar página com a lista', primary: true, onClick: () => { this.toPage(body._shown || [], filter); } }] });
    render();
  },
  badge(m) { return el('span', { class: 'mk', html: Marks.svg(m, 18) }); },
  asText(items, group) {
    const lines = ['*Resumo das marcações*'];
    if (group === 'page') { let last; for (const it of items) { if (it.s !== last) { lines.push('', '*' + (it.s.title || 'Sem título') + '*'); last = it.s; } lines.push(Marks.emoji(it.b) + ' ' + this.text(it.b)); } }
    else for (const mm of MARKS) { const arr = items.filter(it => it.b.marks.includes(mm.id)); if (!arr.length) continue; lines.push('', `${mm.emoji} *${mm.label}*`); arr.forEach(it => lines.push(`• ${this.text(it.b)} _(${it.s.title || 'Sem título'})_`)); }
    return lines.join('\n');
  },
  toPage(items, filter) {
    if (!items.length) { UI.toast('Nada para juntar.'); return false; }
    const labels = filter.size ? MARKS.filter(m => filter.has(m.id)).map(m => m.label).join(', ') : 'todas';
    const blocks = [];
    for (const it of items) {
      const nb = structuredClone(it.b); nb.id = uid(); if (nb.type === 'point') nb.type = 'text';
      blocks.push(nb);
      blocks.push({ id: uid(), type: 'text', html: `<i>— de “${esc(it.s.title || 'Sem título')}”${it.s.date ? ', ' + new Date(it.s.date + 'T12:00').toLocaleDateString('pt-BR') : ''}</i>` });
    }
    App.newSermon({ title: `Resumo de marcações — ${labels}`, passage: '', blocks, duration: 0 });
    UI.toast('Página criada com ' + items.length + ' item(ns).');
  },
  goto(sid, bid) {
    App.open(sid);
    setTimeout(() => { const n = $(`#blocks .block[data-id="${bid}"]`); if (!n) return; n.scrollIntoView({ behavior: 'smooth', block: 'center' }); n.classList.add('mk-flash'); setTimeout(() => n.classList.remove('mk-flash'), 1800); }, 80);
  },
  init() {
    const tools = $('.page-tools'); if (tools && !$('#page-marks')) tools.append(el('button', { class: 'btn sm', id: 'page-marks', title: 'Resumo das marcações (Ctrl+Shift+M)', text: '🏷 Marcas', onclick: () => this.open() }));
    document.addEventListener('keydown', e => { if (e.ctrlKey && e.shiftKey && (e.key === 'M' || e.key === 'm')) { e.preventDefault(); this.open(); } });
  }
};

/* ===== Fundos temáticos com IA (Nano Banana, pela chave do Gemini) ===== */
const ImageAI = {
  MODELS: ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image'],
  model() { return AI.cfg().imageModel; },
  provider() { try { return localStorage.getItem('ss-img-provider') || (AI.cfg().geminiKey ? 'gemini' : 'horde'); } catch (e) { return 'horde'; } },
  setProvider(v) { try { localStorage.setItem('ss-img-provider', v); } catch (e) { } },
  MOODS: { noite: 'noturna, tons de roxo e violeta profundos, luz suave e misteriosa', aurora: 'amanhecer, tons quentes de rosa, laranja e dourado, esperança', oceano: 'águas profundas, azul e verde-água, serenidade', brasa: 'fogo e brasas, laranja e vermelho intensos sobre fundo escuro', pedra: 'sóbria, grafite e dourado discreto, elegante', papel: 'clara e luminosa, tons creme e bege, minimalista', foto: 'cinematográfica e atmosférica' },
  prompt(o, s) {
    const mood = this.MOODS[o.lastMood || 'noite'];
    return `Imagem de fundo para o telão de uma pregação cristã com o tema "${o.title || s.title}"${o.sub ? ` (${o.sub})` : ''}. ` +
      `Cena simbólica e reverente que transmita a mensagem do tema, atmosfera ${mood}. Fotografia cinematográfica, profundidade de campo, luz dramática suave, alta qualidade. ` +
      `IMPORTANTE: sem nenhum texto, letra, número ou logotipo na imagem. Deixe a área central mais limpa e escura para receber o título por cima. Sem rostos em close.`;
  },
  async generate(prompt, aspect) {
    const c = AI.cfg(); if (!c.geminiKey) throw new Error('Configure a chave do Gemini em ✦ Revisar › ⚙ Chaves e modelos.');
    const ar = { '16:9': '16:9', '4:3': '4:3', '1:1': '1:1', '9:16': '9:16' }[aspect] || '16:9';
    const models = [...new Set([this.model(), ...this.MODELS].filter(Boolean))]; let last = '';
    for (const model of models) {
      for (const big of model.includes('2.5') ? [false] : [true, false]) {
        const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ar, ...(big ? { imageSize: '2K' } : {}) } } };
        let r, j = {};
        try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': c.geminiKey, 'content-type': 'application/json' }, body: JSON.stringify(body) }); j = await r.json().catch(() => ({})); }
        catch (e) { throw new Error('Sem conexão com o Google.'); }
        if (r.ok) {
          const part = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
          const d = part && (part.inlineData || part.inline_data);
          if (d) { this.lastModel = model; return `data:${d.mimeType || d.mime_type || 'image/png'};base64,${d.data}`; }
          last = j.candidates?.[0]?.finishReason === 'SAFETY' || j.promptFeedback?.blockReason ? 'O Google recusou este pedido (filtro de segurança). Mude a descrição.' : 'A IA não devolveu imagem.'; break;
        }
        last = j.error?.message || ('erro ' + r.status);
        if (r.status === 404) break;                // modelo não existe nesta conta: próximo
        if (r.status === 400 && big) continue;      // talvez não aceite 2K: tenta sem
        if (r.status === 429 && /limit:\s*0|free/i.test(last)) throw new Error('Geração de imagens não está no plano gratuito. Ative o faturamento do projeto no AI Studio.');
        if (r.status === 401 || r.status === 403) throw new Error(last);
        break;
      }
    }
    throw new Error(last || 'Não foi possível gerar a imagem.');
  }
};

/* ===== AI Horde: geração gratuita e comunitária (voluntários rodando Stable Diffusion) =====
   Sem chave usa a anônima (prioridade mais baixa). Uma chave grátis do aihorde.net dá prioridade. */
const Horde = {
  API: 'https://aihorde.net/api/v2',
  AGENT: 'SmartSower:1.0:' + location.hostname,
  MODELS: ['AlbedoBase XL (SDXL)', 'Juggernaut XL', 'ICBINP XL', 'Dreamshaper XL'],
  SIZES: { '16:9': [1024, 576], '4:3': [1024, 768], '1:1': [1024, 1024], '9:16': [576, 1024] },
  NEG: 'text, letters, words, typography, caption, watermark, logo, signature, frame, border, nsfw, nude, gore, deformed, disfigured, extra fingers, blurry, lowres, jpeg artifacts',
  MOODS: { noite: 'deep purple and violet night, soft mysterious light', aurora: 'sunrise, warm pink orange and golden light, hopeful', oceano: 'deep blue and teal water, serene', brasa: 'embers and fire, intense orange and red on dark background', pedra: 'sober charcoal tones with subtle gold, elegant', papel: 'bright airy cream and beige tones, minimalist', foto: 'cinematic atmospheric' },
  key() { return AI.cfg().hordeKey || '0000000000'; },
  template(o, s) {
    return `cinematic background for a christian sermon slide about "${o.title || s.title}"${o.sub ? ` (${o.sub})` : ''}, symbolic reverent scene, ${this.MOODS[o.lastMood || 'noite']}, dramatic soft lighting, depth of field, highly detailed, professional photography, empty dark center for a title`;
  },
  async smartPrompt(o, s) {
    const provider = AI.has('gemini') ? 'gemini' : 'claude';
    const t = await AI.ask(provider, 'You write prompts for Stable Diffusion XL. Answer ONLY with the prompt, in English, one line, max 60 words, no quotes.',
      `Write a prompt for a cinematic BACKGROUND image (no text, no letters, no people close-up) for a Christian sermon slide.\nSermon title (Portuguese): ${o.title || s.title}\nBible passage: ${o.sub || s.passage || '-'}\nMood/colors: ${this.MOODS[o.lastMood || 'noite']}\nUse a concrete visual symbol from the passage, leave the center darker and uncluttered for the title.`, { json: false, maxTokens: 200 });
    return (t || '').replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0];
  },
  async req(path, opts = {}) {
    const r = await fetch(this.API + path, { ...opts, headers: { 'Client-Agent': this.AGENT, apikey: this.key(), ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.message || ('AI Horde: erro ' + r.status)); e.status = r.status; e.rc = j.rc; throw e; }
    return j;
  },
  async generate(prompt, fmt, { ctl = {}, progress = () => { } } = {}) {
    const [w, h] = this.SIZES[fmt] || this.SIZES['16:9'];
    const payload = (models) => ({ prompt: prompt + ' ### ' + this.NEG, params: { width: w, height: h, steps: 28, n: 1, cfg_scale: 6, sampler_name: 'k_euler_a', karras: true },
      nsfw: false, censor_nsfw: true, trusted_workers: false, r2: false, shared: false, ...(models ? { models } : {}) });
    let job;
    try { job = await this.req('/generate/async', { method: 'POST', body: JSON.stringify(payload(this.MODELS)) }); }
    catch (e) {
      if (e.status === 400 || e.status === 403) { try { job = await this.req('/generate/async', { method: 'POST', body: JSON.stringify(payload(null)) }); } catch (e2) { throw new Error('AI Horde recusou: ' + e2.message); } }
      else if (e.status === 429) throw new Error('AI Horde: muitas solicitações agora. Tente em um minuto.');
      else throw new Error(e.message === 'Failed to fetch' ? 'Sem conexão com o AI Horde.' : 'AI Horde: ' + e.message);
    }
    const id = job.id; const t0 = Date.now();
    try {
      for (;;) {
        if (ctl.cancelled) throw new Error('Cancelado.');
        await new Promise(r => setTimeout(r, 3000));
        const c = await this.req('/generate/check/' + id);
        if (c.faulted) throw new Error('AI Horde: a geração falhou num voluntário. Tente de novo.');
        if (c.is_possible === false) throw new Error('AI Horde: nenhum voluntário disponível para esse pedido agora.');
        if (c.done) break;
        const el2 = Math.round((Date.now() - t0) / 1000);
        progress(c.processing ? `Desenhando… (${el2}s)` : `Na fila: posição ${c.queue_position ?? '?'} · espera estimada ~${c.wait_time ?? '?'}s (${el2}s)`);
        if (Date.now() - t0 > 10 * 60 * 1000) throw new Error('AI Horde demorou demais (10 min). Tente mais tarde ou use uma chave do aihorde.net para ter prioridade.');
      }
      const st = await this.req('/generate/status/' + id);
      const g = st.generations?.[0]; if (!g?.img) throw new Error('AI Horde não devolveu imagem.');
      if (g.censored) throw new Error('O filtro do AI Horde bloqueou a imagem. Mude a descrição.');
      this.lastModel = g.model || '';
      if (/^https?:/.test(g.img)) { const b = await (await fetch(g.img)).blob(); return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); }
      return 'data:image/webp;base64,' + g.img;
    } catch (e) {
      if (ctl.cancelled || /Cancelado|demorou/.test(e.message)) this.req('/generate/status/' + id, { method: 'DELETE' }).catch(() => { });
      throw e;
    }
  }
};

/* ===== Pollinations.ai: gratuito (Flux). Sem chave usa o endpoint aberto (limitado);
   com chave publicável (pk_…) do enter.pollinations.ai usa o gateway novo. ===== */
const Pollinations = {
  SIZES: { '16:9': [1344, 768], '4:3': [1152, 864], '1:1': [1024, 1024], '9:16': [768, 1344] },
  key() { return AI.cfg().pollKey || ''; },
  url(prompt, fmt, seed) {
    const [w, h] = this.SIZES[fmt] || this.SIZES['16:9'];
    const p = encodeURIComponent(prompt + ', no text, no letters, no watermark');
    const q = new URLSearchParams({ model: 'flux', width: w, height: h, seed, nologo: 'true', safe: 'true', private: 'true', enhance: 'false', referrer: 'smartsower' });
    const k = this.key();
    if (k) { q.set('key', k); return `https://gen.pollinations.ai/image/${p}?${q}`; }
    return `https://image.pollinations.ai/prompt/${p}?${q}`;
  },
  async generate(prompt, fmt) {
    const seed = Math.floor(Math.random() * 1e9);
    let r;
    try { r = await fetch(this.url(prompt, fmt, seed)); }
    catch (e) { throw new Error('Sem conexão com o Pollinations (ou o serviço bloqueou o acesso). Tente de novo em instantes.'); }
    if (r.status === 429) throw new Error('Pollinations: limite gratuito — espere uns 15 segundos' + (this.key() ? '.' : ' ou cadastre uma chave grátis em enter.pollinations.ai.'));
    if (r.status === 401 || r.status === 403) throw new Error('Pollinations recusou a chave. Confira em ⚙ Chaves e modelos.');
    if (r.status === 402) throw new Error('Pollinations: sem saldo (pollen) na sua conta para este modelo.');
    if (!r.ok) throw new Error('Pollinations: erro ' + r.status + '. Tente de novo.');
    const b = await r.blob();
    if (!/^image\//.test(b.type)) throw new Error('Pollinations não devolveu imagem. Tente de novo.');
    this.lastModel = 'Flux';
    return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
  }
};

/* ===== Ortografia e gramática (LanguageTool, pt-BR) — F7 =====
   Envia só o texto dos blocos (sem versículos) para api.languagetool.org e mostra as sugestões. */
const Spell = {
  API: 'https://api.languagetool.org/v2/check',
  TYPES: { misspelling: ['Ortografia', '#d13438'], grammar: ['Gramática', '#0f6cbd'], typographical: ['Pontuação', '#8a6d00'], style: ['Estilo', '#107c10'], other: ['Outros', '#69707d'] },
  /* dicionário pessoal fica na conta (sincroniza entre aparelhos) */
  dict() { return new Set(App.meta?.dict || []); },
  addWord(w) { const d = this.dict(); d.add(w.toLowerCase()); App.meta.dict = [...d]; App.saveMeta(); },
  /* texto de cada bloco com o mapa para os nós de texto (para aplicar a correção no lugar certo) */
  segments() {
    const out = [];
    for (const w of document.querySelectorAll('#blocks .block')) {
      const b = App.cur?.blocks.find(x => x.id === w.dataset.id); if (!b || b.type === 'verse') continue;
      w.querySelectorAll('.b-body[contenteditable]').forEach((body, bi) => {
        const { nodes, text } = this.scan(body);
        if (text.trim()) out.push({ b, bi, body, nodes, text });
      });
    }
    return out;
  },
  scan(body) {
    const nodes = []; let text = ''; const tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) { nodes.push({ n, start: text.length }); text += n.data; }
    return { nodes, text };
  },
  /* reencontra o trecho no texto ATUAL do bloco, pelo contexto em volta (não confia em posições antigas) */
  locate(it) {
    const w = $(`#blocks .block[data-id="${it.sg.b.id}"]`); const body = w && w.querySelectorAll('.b-body[contenteditable]')[it.sg.bi];
    if (!body) return null;
    const live = this.scan(body); const t = live.text; let best = null;
    for (let i = t.indexOf(it.word); i >= 0; i = t.indexOf(it.word, i + 1)) {
      let sb = 0; while (sb < it.before.length && t[i - 1 - sb] === it.before[it.before.length - 1 - sb]) sb++;
      let sa = 0; while (sa < it.after.length && t[i + it.word.length + sa] === it.after[sa]) sa++;
      const score = sb + sa - Math.abs(i - it.off) / 1000;
      if (!best || score > best.score) best = { i, score, full: sb === it.before.length && sa === it.after.length, n: (best?.n || 0) + 1 };
      else best.n++;
    }
    /* aceita se o contexto bate inteiro, ou bate em boa parte (uma correção vizinha pode tê-lo mudado), ou se só existe essa ocorrência */
    const need = Math.min(12, Math.ceil((it.before.length + it.after.length) / 2));
    if (!best || !(best.full || best.score >= need || best.n === 1)) return null;
    return { body, ...live, off: best.i };
  },
  async check(text) {
    const r = await fetch(this.API, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text, language: 'pt-BR', enabledOnly: 'false' }) });
    if (r.status === 429) throw new Error('Muitas verificações seguidas. Espere um minuto e tente de novo.');
    if (!r.ok) throw new Error('Verificador indisponível agora (erro ' + r.status + ').');
    return (await r.json()).matches || [];
  },
  async run() {
    if (!App.cur) return;
    App.flush && App.flush();
    const segs = this.segments(); if (!segs.length) { UI.toast('Nada para verificar nesta página.'); return; }
    /* junta os blocos em pedidos de até ~18 mil caracteres */
    const SEP = '\n\n'; const batches = []; let cur = { text: '', parts: [] };
    for (const sg of segs) { if (cur.text.length + sg.text.length > 18000 && cur.parts.length) { batches.push(cur); cur = { text: '', parts: [] }; } cur.parts.push({ sg, at: cur.text.length }); cur.text += sg.text + SEP; }
    batches.push(cur);
    const issues = []; const dict = this.dict();
    for (const bt of batches) {
      const ms = await this.check(bt.text);
      for (const m of ms) {
        const part = bt.parts.find(p => m.offset >= p.at - 8 && m.offset <= p.at + p.sg.text.length); if (!part) continue;
        let off = m.offset - part.at, word = part.sg.text.substr(off, m.length);
        /* confere com o trecho que o próprio LanguageTool diz ter marcado; se as posições escorregaram (emoji etc.), reacha por perto */
        const cw = m.context ? m.context.text.substr(m.context.offset, m.context.length) : null;
        if (cw && cw !== word) {
          let fix = -1; for (let d = 1; d <= 8 && fix < 0; d++) for (const k of [off - d, off + d]) if (k >= 0 && part.sg.text.substr(k, cw.length) === cw) { fix = k; break; }
          if (fix < 0) continue; off = fix; word = cw;
        }
        if (m.rule?.issueType === 'misspelling' && dict.has(word.toLowerCase())) continue;
        issues.push({ sg: part.sg, off, len: word.length, word, before: part.sg.text.slice(Math.max(0, off - 30), off), after: part.sg.text.substr(off + word.length, 30), msg: m.shortMessage || m.message, long: m.message, reps: (m.replacements || []).slice(0, 4).map(r => r.value), type: this.TYPES[m.rule?.issueType] ? m.rule.issueType : 'other', ctx: part.sg.text });
      }
    }
    return issues;
  },
  range(nodes, off, len) {
    const end = off + len; let r = null;
    for (let i = 0; i < nodes.length; i++) {
      const { n, start } = nodes[i], s0 = start, s1 = start + n.data.length, last = i === nodes.length - 1;
      if (!r && off >= s0 && (off < s1 || (off === s1 && last))) { r = new Range(); r.setStart(n, off - s0); }
      if (r && end <= s1 && (end > s0 || len === 0 || n === r.startContainer)) { r.setEnd(n, end - s0); return r; }
    }
    return null;
  },
  paint(list) {
    if (!window.CSS?.highlights) return;
    for (const t of Object.keys(this.TYPES)) CSS.highlights.delete('ss-sp-' + t);
    const by = {}; for (const it of list) { if (it.done) continue; const L = this.locate(it); const r = L && this.range(L.nodes, L.off, it.len); if (r) (by[it.type] ||= []).push(r); }
    for (const [t, rs] of Object.entries(by)) CSS.highlights.set('ss-sp-' + t, new Highlight(...rs));
  },
  clear() { if (window.CSS?.highlights) for (const t of Object.keys(this.TYPES)) CSS.highlights.delete('ss-sp-' + t); },
  apply(it, rep, list = []) {
    const L = this.locate(it);
    /* posições atuais das outras sugestões do mesmo bloco, para atualizá-las depois */
    const sib = list.filter(o => o !== it && !o.done && o.sg.b === it.sg.b && o.sg.bi === it.sg.bi).map(o => ({ o, L: this.locate(o) })).filter(x => x.L);
    if (!L) { UI.toast('Não achei esse trecho igual no texto (ele mudou?). Rode a verificação de novo (F7).'); return false; }
    /* troca caractere a caractere dentro dos próprios nós de texto: a formatação (negrito, cor, realce) fica onde estava */
    let off = L.off, left = it.len, first = true;
    for (const { n, start } of L.nodes) {
      const s0 = start, s1 = start + n.data.length; if (s1 <= off || left <= 0) continue;
      const a = off - s0, take = Math.min(left, s1 - off);
      if (first) { n.replaceData(a, take, rep); first = false; } else n.deleteData(a, take);
      left -= take; off += take;
    }
    if (first) return false;
    /* remove elementos de formatação que ficaram vazios */
    L.body.querySelectorAll('b,strong,i,em,u,s,span,font,mark').forEach(e => { if (!e.textContent && !e.querySelector('img,br')) e.remove(); });
    const b = it.sg.b; b.html = L.body.innerHTML; App.touch();
    const nt = this.scan(L.body).text, delta = rep.length - it.len;
    for (const { o, L: l } of sib) {
      if (l.off < L.off + it.len && l.off + o.len > L.off) { o.done = true; continue; } // sobrepunha a correção: já não vale
      const p = l.off >= L.off + it.len ? l.off + delta : l.off;
      o.off = p; o.before = nt.slice(Math.max(0, p - 30), p); o.after = nt.substr(p + o.len, 30);
    }
    it.done = true; return true;
  },
  async open() {
    if (!App.cur) { UI.toast('Abra uma ministração.'); return; }
    const body = el('div', { class: 'sp' }, el('p', { class: 'muted', text: 'Verificando ortografia e gramática…' }));
    const m = UI.modal({ title: 'Abc ✓ Ortografia e gramática', body, wide: true, onClose: () => this.clear() });
    let list;
    try { list = await this.run(); } catch (e) { body.innerHTML = ''; body.append(el('p', { class: 'on-log', text: e.message.includes('fetch') ? 'Sem conexão com o verificador (LanguageTool).' : e.message })); return; }
    const render = () => {
      body.innerHTML = ''; this.paint(list);
      const left = list.filter(i => !i.done);
      body.append(el('p', { class: 'muted small', text: left.length ? `${left.length} sugestão(ões). Os versículos bíblicos não são verificados. O texto vai para o LanguageTool apenas para conferir.` : '✓ Nada a corrigir nesta página.' }));
      for (const it of left) {
        const [label, color] = this.TYPES[it.type];
        const a = Math.max(0, it.off - 45), z = Math.min(it.ctx.length, it.off + it.len + 45);
        body.append(el('div', { class: 'sp-item', style: { '--sc': color } },
          el('div', { class: 'sp-top' }, el('span', { class: 'sp-type', text: label }), el('span', { class: 'sp-msg', text: it.msg || it.long, title: it.long })),
          el('div', { class: 'sp-ctx', onclick: () => { $(`#blocks .block[data-id="${it.sg.b.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
            (a > 0 ? '…' : '') + it.ctx.slice(a, it.off), el('mark', { text: it.word }), it.ctx.slice(it.off + it.len, z) + (z < it.ctx.length ? '…' : '')),
          el('div', { class: 'sp-acts' },
            ...it.reps.map(r => el('button', { class: 'chip sp-rep', text: r || '(apagar)', onclick: () => { if (this.apply(it, r, list)) render(); } })),
            el('button', { class: 'btn link', text: 'Ignorar', onclick: () => { it.done = true; render(); } }),
            it.type === 'misspelling' ? el('button', { class: 'btn link', text: 'Adicionar ao dicionário', title: 'Nunca mais marcar esta palavra (nomes, termos bíblicos…)', onclick: () => { this.addWord(it.word); list.forEach(o => { if (o.type === 'misspelling' && o.word.toLowerCase() === it.word.toLowerCase()) o.done = true; }); render(); } }) : null)));
      }
    };
    render();
    return m;
  },
  /* corretor do navegador enquanto digita: por aparelho, desligado por padrão
     (se o navegador não tiver o dicionário pt-BR, ele sublinha todas as palavras) */
  live() { try { return localStorage.getItem('ss-livespell') === '1'; } catch (e) { return false; } },
  setLive(v) { try { localStorage.setItem('ss-livespell', v ? '1' : '0'); } catch (e) { } if (App.cur) { App.flush(); App.renderEditor(); } },
  init() {
    document.addEventListener('keydown', e => { if (e.key === 'F7' && !e.ctrlKey && !e.altKey) { e.preventDefault(); this.open(); } });
    const rb = $('#rb-spell'); if (rb) rb.onclick = () => this.open();
    for (const [id, d] of [['#rb-in', 1], ['#rb-out', -1]]) { const x = $(id); if (x) { x.onmousedown = e => e.preventDefault(); x.onclick = () => indentSel(d); } }
    const lv = $('#rb-live'); if (lv) { const paint = () => lv.classList.toggle('on', this.live()); paint();
      lv.onclick = () => { this.setLive(!this.live()); paint(); UI.toast(this.live() ? 'Sublinhado ao digitar: ligado. Se TUDO ficar sublinhado, ative o Português (Brasil) na verificação ortográfica do navegador.' : 'Sublinhado ao digitar: desligado. Use F7 para verificar.'); }; }
  }
};

/* ===== Larguras dos painéis de cadernos e páginas (por aparelho) ===== */
const PaneResize = {
  LIM: { 'nb-col': [160, 400, '--nbcol-w'], 'nb-pane': [150, 420, '--nb-w'], 'pages-pane': [200, 560, '--pages-w'] },
  load() { try { return JSON.parse(localStorage.getItem('ss-panes') || '{}'); } catch (e) { return {}; } },
  save(v) { try { localStorage.setItem('ss-panes', JSON.stringify(v)); } catch (e) { } },
  init() {
    const v = this.load();
    for (const [id, [min, max, cssVar]] of Object.entries(this.LIM)) {
      const pane = document.getElementById(id); if (!pane || pane.querySelector('.pane-grip')) continue;
      if (v[id]) document.documentElement.style.setProperty(cssVar, v[id] + 'px');
      const grip = el('div', { class: 'pane-grip', title: 'Arraste para ajustar a largura · duplo clique volta ao padrão' });
      grip.addEventListener('dblclick', () => { document.documentElement.style.removeProperty(cssVar); const x = this.load(); delete x[id]; this.save(x); });
      grip.addEventListener('pointerdown', e => {
        e.preventDefault(); grip.setPointerCapture(e.pointerId); grip.classList.add('on'); document.body.classList.add('resizing');
        const x0 = e.clientX, w0 = pane.getBoundingClientRect().width;
        const move = ev => { const w = Math.round(Math.min(max, Math.max(min, w0 + ev.clientX - x0))); document.documentElement.style.setProperty(cssVar, w + 'px'); };
        const up = () => { grip.classList.remove('on'); document.body.classList.remove('resizing'); grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
          const x = this.load(); x[id] = Math.round(pane.getBoundingClientRect().width); this.save(x); };
        grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
      });
      pane.append(grip);
    }
  }
};

/* ===== Barra de formatação flutuante: aparece ao selecionar texto no editor ===== */
const FloatBar = {
  HL: ['#fff100', '#7fff7f', '#7fdcff', '#ffb3e6'],
  COL: ['#201f1e', '#c50f1f', '#0f6cbd', '#107c10', '#7719aa'],
  touch: false,
  exec(cmd, val = null, css = false) { document.execCommand('styleWithCSS', false, css); document.execCommand(cmd, false, val); this.paintState(); },
  build() {
    const B = (html, title, fn, cls = '') => { const b = el('button', { class: 'fb-b ' + cls, title, html }); b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('mousedown', e => e.preventDefault()); b.onclick = e => { e.preventDefault(); fn(); }; return b; };
    const sep = () => el('span', { class: 'fb-sep' });
    const bar = el('div', { class: 'fbar', role: 'toolbar', 'aria-label': 'Formatação' },
      B('<b>N</b>', 'Negrito (Ctrl+B)', () => this.exec('bold'), 'st-bold'), B('<i>I</i>', 'Itálico (Ctrl+I)', () => this.exec('italic'), 'st-italic'),
      B('<u>S</u>', 'Sublinhado (Ctrl+U)', () => this.exec('underline'), 'st-underline'), B('<s>ab</s>', 'Tachado', () => this.exec('strikeThrough'), 'st-strikeThrough'), sep(),
      ...this.HL.map(c => B('', 'Marca-texto', () => this.exec('hiliteColor', c, true), 'fb-sw').tap(x => x.style.background = c)),
      B('⌀', 'Tirar marca-texto', () => this.exec('hiliteColor', 'transparent', true), 'fb-sw none'), sep(),
      ...this.COL.map(c => B('A', 'Cor do texto', () => this.exec('foreColor', c, true), 'fb-col').tap(x => x.style.color = c)), sep(),
      B('•', 'Lista com marcadores', () => this.exec('insertUnorderedList')), B('1.', 'Lista numerada', () => this.exec('insertOrderedList')),
      B('⇤', 'Diminuir recuo (Shift+Tab)', () => indentSel(-1)), B('⇥', 'Aumentar recuo / subitem (Tab)', () => indentSel(1)),
      B('😊', 'Emoji (Ctrl+Shift+E) — entra no fim da seleção', () => { const s = getSelection(); if (s.rangeCount) { const r = s.getRangeAt(0); r.collapse(false); s.removeAllRanges(); s.addRange(r); } const bx = this.bar.getBoundingClientRect(); this.hide(); Emoji.open({ getBoundingClientRect: () => bx }); }),
      B('¹', 'Nota de rodapé no fim da seleção (Ctrl+Alt+N)', () => { const s = getSelection(); if (s.rangeCount) { const r = s.getRangeAt(0); r.collapse(false); s.removeAllRanges(); s.addRange(r); } this.hide(); Footnotes.insert(); }),
      B('⨯', 'Limpar formatação', () => this.exec('removeFormat')));
    document.body.append(bar); return bar;
  },
  paintState() { if (!this.bar) return; for (const c of ['bold', 'italic', 'underline', 'strikeThrough']) { try { this.bar.querySelector('.st-' + c)?.classList.toggle('on', document.queryCommandState(c)); } catch (e) { } } },
  hide() { if (this.bar) this.bar.classList.remove('show'); },
  update() {
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed) return this.hide();
    const r = s.getRangeAt(0); const host = n => (n.nodeType === 1 ? n : n.parentElement)?.closest('#blocks .b-body[contenteditable]');
    const h = host(r.startContainer); if (!h || h !== host(r.endContainer) || !r.toString().trim()) return this.hide();
    this.bar ||= this.build(); this.paintState();
    const rects = r.getClientRects(); const box = (rects.length ? rects[0] : r.getBoundingClientRect()); const last = rects.length ? rects[rects.length - 1] : box;
    const bw = this.bar.offsetWidth || 420, bh = this.bar.offsetHeight || 40;
    /* no toque, a barra vai para baixo da seleção (em cima fica o menu do sistema) */
    let top = this.touch ? last.bottom + 12 : box.top - bh - 8; if (top < 56) top = last.bottom + 12; if (top + bh > innerHeight - 8) top = Math.max(56, box.top - bh - 8);
    const left = Math.max(8, Math.min(innerWidth - bw - 8, (this.touch ? last.left : box.left) + (this.touch ? 0 : box.width / 2 - bw / 2)));
    this.bar.style.top = top + 'px'; this.bar.style.left = left + 'px'; this.bar.classList.add('show');
  },
  init() {
    if (!Element.prototype.tap) Object.defineProperty(Element.prototype, 'tap', { value(fn) { fn(this); return this; }, configurable: true });
    const up = debounce(() => this.update(), 120);
    document.addEventListener('selectionchange', up);
    document.addEventListener('pointerdown', e => { this.touch = e.pointerType === 'touch' || e.pointerType === 'pen'; if (this.bar && !this.bar.contains(e.target)) this.hide(); }, true);
    document.addEventListener('pointerup', up, true); document.addEventListener('keyup', e => { if (e.shiftKey || e.key.startsWith('Arrow')) up(); });
    $('#editor')?.addEventListener('scroll', () => { if (this.bar?.classList.contains('show')) up(); }, { passive: true });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.hide(); });
  }
};
