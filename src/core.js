'use strict';
/* ===== Utilidades básicas ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const stripAccents = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) e.style.setProperty(sk, sv); else e.style[sk] = sv; } }
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
function htmlToText(html) {
  if (!html) return '';
  // <template> é inerte: não baixa imagens nem executa nada
  const t = document.createElement('template'); t.innerHTML = String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '$&\n');
  return t.content.textContent.replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
}

/* ===== IndexedDB com fallback em memória ===== */
const DB = (() => {
  let db = null; const mem = { sermons: new Map(), kv: new Map(), bibles: new Map(), images: new Map(), history: new Map() };
  const api = {
    volatile: false,
    close() { try { db?.close(); } catch (e) { } db = null; },
    async init() {
      try {
        db = await new Promise((res, rej) => {
          const r = indexedDB.open('pulpito', 3);
          r.onupgradeneeded = () => { const d = r.result; for (const s of ['sermons', 'kv', 'bibles', 'images', 'history']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s); };
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
          setTimeout(() => rej(new Error('timeout')), 4000);
        });
        try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { }
      } catch (e) { console.warn('IndexedDB indisponível', e); api.volatile = true; }
    },
    tx(store, mode, fn) {
      if (!db) return Promise.resolve(fn(null, mem[store]));
      return new Promise((res, rej) => {
        const t = db.transaction(store, mode); const s = t.objectStore(store); const r = fn(s);
        t.oncomplete = () => res(r && 'result' in r ? r.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    },
    get(s, k) { return api.tx(s, 'readonly', (st, m) => st ? st.get(k) : m.get(k)); },
    put(s, k, v) { return api.tx(s, 'readwrite', (st, m) => st ? st.put(v, k) : void m.set(k, structuredClone(v))); },
    del(s, k) { return api.tx(s, 'readwrite', (st, m) => st ? st.delete(k) : void m.delete(k)); },
    all(s) { return api.tx(s, 'readonly', (st, m) => st ? st.getAll() : [...m.values()]); },
  };
  return api;
})();

/* ===== Toast e modais ===== */
const UI = {
  toast(msg, action) {
    const host = $('#toasts');
    const t = el('div', { class: 'toast' }, el('span', { text: msg }));
    if (action) t.append(el('button', { text: action.label, onclick: () => { action.fn(); t.remove(); } }));
    host.append(t); setTimeout(() => t.classList.add('out'), action ? 5500 : 2800); setTimeout(() => t.remove(), action ? 6000 : 3300);
  },
  modal({ title, body, actions = [], wide = false, onClose }) {
    const back = el('div', { class: 'modal-back' });
    const box = el('div', { class: 'modal' + (wide ? ' wide' : '') });
    const close = () => { back.remove(); onClose && onClose(); };
    box.append(el('div', { class: 'modal-head' }, el('h3', { text: title }), el('button', { class: 'icon-btn', 'aria-label': 'Fechar', text: '✕', onclick: close })));
    const b = el('div', { class: 'modal-body' }); if (typeof body === 'string') b.innerHTML = body; else if (body) b.append(body);
    box.append(b);
    if (actions.length) box.append(el('div', { class: 'modal-foot' }, actions.map(a => el('button', { class: a.primary ? 'btn primary' : (a.danger ? 'btn danger' : 'btn'), text: a.label, onclick: async () => { const r = await a.onClick?.(); if (r !== false) close(); } }))));
    back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
    back.append(box); document.body.append(back);
    setTimeout(() => { const f = box.querySelector('input,textarea,select'); f && f.focus(); }, 30);
    return { close, box, body: b };
  },
  ask(title, value = '', label = '') {
    return new Promise(res => {
      const inp = el('input', { class: 'inp', value, placeholder: label });
      let done = false;
      const m = UI.modal({ title, body: inp, onClose: () => { if (!done) res(null); }, actions: [{ label: 'Cancelar', onClick: () => { } }, { label: 'OK', primary: true, onClick: () => { done = true; res(inp.value.trim()); } }] });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { done = true; res(inp.value.trim()); m.close(); } });
    });
  },
  confirm(title, text, okLabel = 'Excluir') {
    return new Promise(res => {
      let done = false;
      UI.modal({ title, body: el('p', { text }), onClose: () => { if (!done) res(false); }, actions: [{ label: 'Cancelar' }, { label: okLabel, danger: true, onClick: () => { done = true; res(true); } }] });
    });
  }
};

/* ===== Salvar arquivo (download) ===== */
async function saveFile(filename, blob) {
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      const dl = await Promise.race([window.claude.use('downloads'), new Promise(r => setTimeout(() => r(null), 1500))]);
      if (dl) { await dl.save({ filename, data: blob }); return; }
    }
  } catch (e) { console.warn('downloads capability falhou', e); }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function pickFiles(accept, multiple = false) {
  return new Promise(res => {
    const i = el('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    i.addEventListener('change', () => { res([...i.files]); i.remove(); });
    document.body.append(i); i.click();
  });
}

/* ===== Contraste do realce: texto sobre marca-texto sempre legível (claro, escuro, sépia, modo Pregar) ===== */
function cssRGB(c) { const m = String(c).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; }
function relLum([r, g, b]) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }
function ensureContrast(root) {
  let changed = false; if (!root?.querySelectorAll) return false;
  for (const e of root.querySelectorAll('[style*="background"], mark, font[style]')) {
    const cs = getComputedStyle(e), bg = cssRGB(cs.backgroundColor); if (!bg || bg[3] < 0.3) continue;
    const fg = cssRGB(cs.color); if (!fg) continue;
    const lb = relLum(bg), lf = relLum(fg), ratio = (Math.max(lb, lf) + 0.05) / (Math.min(lb, lf) + 0.05);
    if (ratio >= 4.5) continue;
    e.style.color = lb > 0.35 ? '#1b1b1b' : '#ffffff'; changed = true;
  }
  return changed;
}

/* formato de data do app: padrão americano (MM/DD/YYYY); dá para voltar ao brasileiro em Exibir › Data */
const DL = () => (typeof App !== 'undefined' && App.meta?.dateFmt === 'br') ? 'pt-BR' : 'en-US';
