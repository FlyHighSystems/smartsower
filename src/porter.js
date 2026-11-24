/* ===== ZIP (leitura e escrita, sem bibliotecas) ===== */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
async function unzip(buf) {
  const dv = new DataView(buf); let i = buf.byteLength - 22;
  while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
  if (i < 0) throw new Error('Arquivo ZIP/DOCX inválido');
  const count = dv.getUint16(i + 10, true); let p = dv.getUint32(i + 16, true); const files = {};
  for (let n = 0; n < count; n++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nl)); p += 46 + nl + xl + cl;
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    files[name] = { method, data: new Uint8Array(buf, start, csize) };
  }
  return {
    names: Object.keys(files),
    async bytes(name) {
      const f = files[name]; if (!f) return null;
      if (f.method === 0) return f.data;
      if (f.method === 8) return new Uint8Array(await new Response(new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      throw new Error('Compressão ZIP não suportada');
    },
    async text(name) { const b = await this.bytes(name); return b ? new TextDecoder('utf-8').decode(b) : null; }
  };
}
function zipStore(entries) { // entries: [{name, data: Uint8Array|string}]
  const enc = new TextEncoder(); const parts = []; const central = []; let off = 0;
  const d = new Date(), dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const e of entries) {
    const name = enc.encode(e.name), data = typeof e.data === 'string' ? enc.encode(e.data) : e.data, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dosT, true); h.setUint16(12, dosD, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dosT, true); c.setUint16(14, dosD, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, a) => n + a.length, 0);
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
function dataURLtoBytes(u) { const [h, b] = u.split(','); const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return { bytes: a, mime: (h.match(/data:([^;]+)/) || [])[1] || 'image/png' }; }
function bytesToDataURL(bytes, mime) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return `data:${mime};base64,${btoa(s)}`; }
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', emf: 'image/emf', wmf: 'image/wmf' };

/* ===== Conversão de conteúdo importado em blocos ===== */
// items: {kind:'title'|'heading'|'para'|'list'|'img', html|src}
function itemsToSermon(items, fallbackTitle, forceTitle = false) {
  let title = forceTitle ? fallbackTitle : null; const blocks = []; let buf = [];
  const flush = () => { if (buf.length) { blocks.push({ id: uid(), type: 'text', html: buf.join('') }); buf = []; } };
  for (const it of items) {
    if (it.kind === 'title' && !title) { title = htmlToText(it.html); continue; }
    if (it.kind === 'img') { flush(); blocks.push({ id: uid(), type: 'image', src: it.src, html: '', alt: it.alt || '' }); continue; }
    if (it.kind === 'verse') { flush(); const r = parseRef(it.ref); blocks.push({ id: uid(), type: 'verse', ref: r ? refLabel(r) : it.ref, verLabel: it.ver, html: it.html }); continue; }
    const text = htmlToText(it.html);
    if (!text) continue;
    if (it.kind === 'heading' || it.kind === 'title') {
      if (!title && !blocks.length && !buf.length) { title = text; continue; }
      flush(); blocks.push({ id: uid(), type: 'point', html: esc(text) }); continue;
    }
    const r = text.length < 40 ? parseRef(text.replace(/[()]/g, '')) : null;
    if (r && r.ranges.length) { flush(); blocks.push({ id: uid(), type: 'verse', ref: refLabel(r), html: '' }); continue; }
    buf.push(it.kind === 'list' ? it.html : `<div>${it.html}</div>`);
  }
  flush();
  if (!blocks.length) blocks.push({ id: uid(), type: 'text', html: '' });
  return { title: title || fallbackTitle || 'Importado', blocks };
}
/* ===== Divide uma SEÇÃO exportada do OneNote em páginas =====
   O OneNote escreve, no início de cada página: título, data por extenso e hora.
   Usamos isso (e quebras de página) para separar uma ministração por página. */
const PT_MONTHS = { janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  enero: 1, febrero: 2, marzo: 3, mayo: 5, junio: 6, julio: 7, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
function parseOneNoteDate(t) {
  t = t.trim().replace(/\s+/g, ' ').replace(/\s+\d{1,2}:\d{2}(:\d{2})?\s*([AaPp]\.?[Mm]\.?|h)?$/, '');
  if (t.length > 60) return null;
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let m = t.match(/^(?:[a-zà-ú]+(?:-feira)?,?\s+)?(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})$/i); // segunda-feira, 4 de março de 2024
  if (m && PT_MONTHS[m[2].toLowerCase()]) return iso(m[3], PT_MONTHS[m[2].toLowerCase()], m[1]);
  m = t.match(/^(?:[a-z]+,?\s+)?([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);                         // Monday, March 4, 2024
  if (m && PT_MONTHS[m[1].toLowerCase()]) return iso(m[3], PT_MONTHS[m[1].toLowerCase()], m[2]);
  m = t.match(/^(?:[a-zà-ú]+(?:-feira)?,?\s+)?(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/i);           // 04/03/2024
  if (m) return iso(m[3], m[2], m[1]);
  return null;
}
const isTimeLine = t => /^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm|h)?$/i.test(t.trim());
function splitOneNotePages(items) {
  const txt = it => it.kind === 'img' || it.kind === 'break' ? '' : htmlToText(it.html);
  const pages = []; let cur = null, pendingBreak = false;
  const start = (title, date) => { cur = { title, date, items: [] }; pages.push(cur); };
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === 'break') { pendingBreak = true; continue; }
    const t = txt(it), next = items[i + 1], nextT = next ? txt(next) : '';
    const date = next && t && t.length <= 120 ? parseOneNoteDate(nextT) : null;
    if (date) { // título + data (+ hora) = nova página
      start(t, date); i++;
      if (items[i + 1] && isTimeLine(txt(items[i + 1]))) i++;
      pendingBreak = false; continue;
    }
    if (it.kind === 'title' && cur && cur.items.length) { start(t, null); pendingBreak = false; continue; }
    if (pendingBreak && cur && cur.items.length) { pendingBreak = false; if (t && t.length <= 120 && it.kind !== 'img') { start(t, null); continue; } start(null, null); }
    pendingBreak = false;
    if (!cur) start(null, null);
    if (it.kind === 'title' && !cur.title && !cur.items.length) { cur.title = t; continue; }
    cur.items.push(it);
  }
  return pages.filter(p => p.title || p.items.some(it => it.kind === 'img' || txt(it)));
}
const BLOCK_TAGS = /^(P|DIV|H[1-6]|UL|OL|TABLE|TBODY|THEAD|TR|TD|TH|SECTION|ARTICLE|BLOCKQUOTE|LI|BODY|CENTER|FORM)$/;
function htmlToItems(html, imgMap = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,meta,link,title,xml,head').forEach(n => n.remove());
  const items = [];
  const isHeadingLike = n => {
    const txt = (n.textContent || '').trim(); if (!txt || txt.length > 90) return false;
    const st = (n.getAttribute('style') || '') + ' ' + [...n.querySelectorAll('[style]')].map(x => x.getAttribute('style')).join(' ');
    const fs = st.match(/font-size:\s*([\d.]+)\s*pt/i); if (fs && +fs[1] >= 15) return true;
    const boldText = [...n.querySelectorAll('b,strong,span[style*="bold"]')].map(x => x.textContent).join('').trim();
    return boldText.length && boldText.length >= txt.length - 1 && txt.length < 70 && !/[.;:]$/.test(txt);
  };
  const walk = node => {
    let inline = [];
    const flushInline = () => { const h = inline.join('').trim(); if (h && htmlToText(h)) items.push({ kind: 'para', html: sanitizeHTML(h) }); inline = []; };
    for (const c of node.childNodes) {
      if (c.nodeType === 3) { if (c.nodeValue.trim()) inline.push(esc(c.nodeValue)); continue; }
      if (c.nodeType !== 1) continue;
      const tag = c.tagName;
      if (tag === 'IMG') { flushInline(); const raw = c.getAttribute('src') || ''; const src = imgMap[raw] || imgMap[raw.split('/').pop()] || imgMap[decodeURIComponent(raw.split('/').pop())] || raw; if (src && /^data:image\/(png|jpe?g|gif|webp|bmp)/.test(src)) items.push({ kind: 'img', src, alt: (c.getAttribute('alt') || '').replace(/\r/g, '').trim() }); continue; }
      if (c.dataset && c.dataset.verse != null) { flushInline(); items.push({ kind: 'verse', ref: c.dataset.verse, ver: c.dataset.ver || '', html: c.innerHTML }); continue; }
      if (tag === 'BR') { inline.push('<br>'); continue; }
      if (!BLOCK_TAGS.test(tag)) { if (c.querySelector('img,p,div,table,ul,ol')) { flushInline(); walk(c); } else inline.push(c.outerHTML); continue; }
      flushInline();
      if (/^H[12]$/.test(tag) && !items.length) { items.push({ kind: 'title', html: esc(c.textContent.trim()) }); continue; }
      if (/^H[1-6]$/.test(tag)) { items.push({ kind: 'heading', html: esc(c.textContent.trim()) }); continue; }
      if (tag === 'UL' || tag === 'OL') { listItems(c).forEach(x => items.push(x)); continue; }
      if (c.querySelector('p,div,table,ul,ol,h1,h2,h3,h4,img,li')) { walk(c); continue; }
      if (isHeadingLike(c)) { items.push({ kind: 'heading', html: esc(c.textContent.trim()) }); continue; }
      const h = sanitizeHTML(c.innerHTML); if (htmlToText(h)) items.push({ kind: 'para', html: h });
    }
    flushInline();
  };
  // Listas do OneNote podem ter parágrafos e versículos misturados entre os itens
  const listItems = (ul) => {
    const out = []; let chunk = [];
    const flushChunk = () => { if (chunk.length) { const h = sanitizeHTML(`<${ul.tagName}>${chunk.join('')}</${ul.tagName}>`); if (htmlToText(h)) out.push({ kind: 'list', html: h }); chunk = []; } };
    for (const ch of ul.children) {
      if (ch.tagName === 'LI' && !ch.querySelector('img, [data-verse]')) chunk.push(ch.outerHTML);
      else if (ch.tagName === 'LI') { flushChunk(); const tmp = document.createElement('template').content; tmp.append(...ch.cloneNode(true).childNodes); const save = items.length; walk(tmp); out.push(...items.splice(save)); }
      else if (ch.tagName === 'UL' || ch.tagName === 'OL') { if (ch.querySelector('[data-verse], p, img')) { flushChunk(); out.push(...listItems(ch)); } else chunk.push(ch.outerHTML); }
      else { flushChunk(); const tmp = document.createElement('template').content; tmp.append(ch.cloneNode(true)); const save = items.length; walk(tmp); out.push(...items.splice(save)); }
    }
    flushChunk(); return out;
  };
  walk(doc.body);
  return items;
}
/* DOCX → itens (OneNote: Arquivo › Exportar › Documento do Word) */
async function docxToItems(buf) {
  const z = await unzip(buf);
  const xml = await z.text('word/document.xml'); if (!xml) throw new Error('Não encontrei word/document.xml');
  const rels = {}; const relXml = await z.text('word/_rels/document.xml.rels');
  if (relXml) for (const r of new DOMParser().parseFromString(relXml, 'application/xml').getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const items = []; let list = [];
  const flushList = () => { if (list.length) { items.push({ kind: 'list', html: '<ul>' + list.map(l => `<li>${l}</li>`).join('') + '</ul>' }); list = []; } };
  const isOn = (rPr, tag) => { const e = rPr && rPr.getElementsByTagNameNS(W, tag)[0]; if (!e) return false; const v = e.getAttributeNS(W, 'val') ?? e.getAttribute('w:val'); return v == null || !/^(0|false|none)$/.test(v); };
  const paras = [...doc.getElementsByTagNameNS(W, 'body')[0].getElementsByTagNameNS(W, 'p')];
  for (const p of paras) {
    if (p.parentNode && p.parentNode.localName === 'txbxContent') continue;
    const pPr = p.getElementsByTagNameNS(W, 'pPr')[0];
    if (pPr?.getElementsByTagNameNS(W, 'pageBreakBefore')[0]) { flushList(); items.push({ kind: 'break' }); }
    let pageBreakAfter = false;
    const style = pPr?.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttributeNS(W, 'val') || pPr?.getElementsByTagNameNS(W, 'pStyle')[0]?.getAttribute('w:val') || '';
    const isList = !!pPr?.getElementsByTagNameNS(W, 'numPr')[0] || /list|lista/i.test(style);
    let html = ''; const imgs = [];
    for (const r of p.getElementsByTagNameNS(W, 'r')) {
      const rPr = r.getElementsByTagNameNS(W, 'rPr')[0];
      let t = '';
      for (const c of r.childNodes) {
        if (c.localName === 't') t += esc(c.textContent);
        else if (c.localName === 'tab') t += ' ';
        else if (c.localName === 'br' && (c.getAttributeNS(W, 'type') || c.getAttribute('w:type')) === 'page') pageBreakAfter = true;
        else if (c.localName === 'br' || c.localName === 'cr') t += '<br>';
        else if (c.localName === 'drawing' || c.localName === 'pict') {
          const blip = c.getElementsByTagName('a:blip')[0] || c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
          const id = blip?.getAttribute('r:embed') || c.getElementsByTagName('v:imagedata')[0]?.getAttribute('r:id');
          if (id && rels[id]) imgs.push(rels[id]);
        }
      }
      if (!t) continue;
      if (isOn(rPr, 'b')) t = `<b>${t}</b>`; if (isOn(rPr, 'i')) t = `<i>${t}</i>`; if (isOn(rPr, 'u')) t = `<u>${t}</u>`;
      const hl = rPr?.getElementsByTagNameNS(W, 'highlight')[0]; if (hl) t = `<span style="background-color:${({ yellow: '#fff100', green: '#7fff00', cyan: '#00ffff' })[hl.getAttributeNS(W, 'val') || hl.getAttribute('w:val')] || '#fff100'}">${t}</span>`;
      html += t;
    }
    for (const target of imgs) {
      const path = target.startsWith('/') ? target.slice(1) : 'word/' + target.replace(/^\.\//, '');
      const bytes = await z.bytes(path); const ext = path.split('.').pop().toLowerCase();
      if (bytes && /png|jpe?g|gif|webp|bmp/.test(ext)) { flushList(); items.push({ kind: 'img', src: bytesToDataURL(bytes, MIME[ext]) }); }
    }
    const text = htmlToText(html);
    if (!text) { if (pageBreakAfter) { flushList(); items.push({ kind: 'break' }); } continue; }
    if (isList) { list.push(html); continue; }
    flushList();
    if (/^(title|ttulo|titulo|título)$/i.test(style)) items.push({ kind: 'title', html: esc(text) });
    else if (/heading|ttulo|titulo|título|cabe/i.test(style)) items.push({ kind: 'heading', html: esc(text) });
    else if (text.length < 70 && /^<b>.*<\/b>$/.test(html.replace(/<\/b><b>/g, '')) && !/[.;:]$/.test(text)) items.push({ kind: 'heading', html: esc(text) });
    else items.push({ kind: 'para', html });
    if (pageBreakAfter) items.push({ kind: 'break' });
  }
  flushList();
  return items;
}
/* MHT/MHTML (OneNote: Exportar › Arquivo da Web de Arquivo Único) */
function decodeQP(s, charset = 'utf-8') {
  s = s.replace(/=\r?\n/g, '');
  const out = []; const enc = new TextEncoder();
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '=' && /^[0-9A-F]{2}$/i.test(s.substr(i + 1, 2))) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else { const code = c.charCodeAt(0); if (code < 128) out.push(code); else out.push(...enc.encode(c)); }
  }
  try { return new TextDecoder(charset).decode(new Uint8Array(out)); } catch (e) { return new TextDecoder('utf-8').decode(new Uint8Array(out)); }
}
function decodeMimeBody(body, te, charset) {
  if (te === 'quoted-printable') return decodeQP(body, charset);
  if (te === 'base64') { const b = Uint8Array.from(atob(body.replace(/\s/g, '')), c => c.charCodeAt(0)); try { return new TextDecoder(charset).decode(b); } catch (e) { return new TextDecoder().decode(b); } }
  return body;
}
/* Versículos colados do YouVersion: "Genesis 3:17-19 (NVI-PT) 17 E ao homem..." + linhas seguintes */
const YV_REF = /^((?:[1-3]|I{1,3})?\s?[A-Za-zÀ-ú][A-Za-zÀ-ú.]*(?:\s(?:of|dos|de)\s[A-Za-zÀ-ú]+)?\s\d{1,3}:\d{1,3}(?:\s?[-–]\s?\d{1,3})?(?:\s?,\s?\d{1,3}(?:[-–]\d{1,3})?)*)\s*\(([A-Z0-9][A-Za-z0-9\-]{1,14})\)\s*([\s\S]*)$/;
function markYouVersion(root) {
  const supNum = p => { const sp = p.querySelector('span[style*="super"], sup'); if (!sp) return null; const before = p.textContent.slice(0, p.textContent.indexOf(sp.textContent)).replace(/[\s​]/g, ''); return before ? null : parseInt(sp.textContent, 10) || null; };
  const lineHTML = n => { const c = n.cloneNode(true); c.querySelectorAll('span[style*="super"]').forEach(x => { const s = n.ownerDocument.createElement('sup'); s.textContent = x.textContent.trim(); x.replaceWith(s); }); return sanitizeHTML(c.innerHTML.replace(/​/g, ''), true).trim(); };
  for (const p of [...root.querySelectorAll('p')]) {
    if (!p.parentNode) continue; // já absorvido por um versículo anterior
    const t = p.textContent.replace(/\s+/g, ' ').replace(/​/g, '').trim();
    const st = p.getAttribute('style') || '';
    let ref = null, ver = '', lines = [];
    const m = t.match(YV_REF);
    if (m && parseRef(m[1])) {               // "Genesis 3:17-19 (NVI-PT) 17 E ao homem..."
      ref = m[1]; ver = m[2]; if (m[3].trim()) lines.push(esc(m[3].trim()).replace(/^(\d{1,3})\s/, '<sup>$1</sup>'));
      let n = p.nextElementSibling;
      while (n && n.tagName === 'P' && (n.getAttribute('style') || '') === st) {
        const lt = n.textContent.replace(/\s+/g, ' ').trim(); if (YV_REF.test(lt)) break;
        if (lt) lines.push(esc(lt).replace(/^(\d{1,3})\s/, '<sup>$1</sup>'));
        const nx = n.nextElementSibling; n.remove(); n = nx;
      }
    } else if (t.length <= 40 && (ref = (() => { const r = parseRef(t); return r && r.ranges.length ? t : null; })())) {
      // "Isaiah 9:1-7" seguido de parágrafos com números de versículo sobrescritos
      const r = parseRef(t); const last = r.ranges[r.ranges.length - 1][1];
      let n = p.nextElementSibling, seenLast = false;
      if (!(n && n.tagName === 'P' && supNum(n))) { ref = null; continue; }
      while (n && n.tagName === 'P' && (n.getAttribute('style') || '') === st) {
        const num = supNum(n);
        if (seenLast && !num) break;
        if (num && num > last) break;
        if (num === last) seenLast = true;
        const h = lineHTML(n); if (h) lines.push(h);
        const nx = n.nextElementSibling; n.remove(); n = nx;
        if (seenLast && n && n.tagName === 'P' && !supNum(n) && !n.textContent.trim()) break;
      }
    }
    if (!ref) continue;
    const d = p.ownerDocument.createElement('div'); d.dataset.verse = ref; d.dataset.ver = ver; d.innerHTML = lines.join('<br>');
    p.replaceWith(d);
  }
}
/* Export do OneNote (caderno/seção): cada página é <div style="...border-width:100%"> com título, data/hora e conteúdo */
function oneNoteExportPages(html, imgMap) {
  if (!/OneNote\.File|Microsoft OneNote/i.test(html.slice(0, 3000))) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const pageDivs = [...doc.body.children].filter(e => e.tagName === 'DIV' && /border-width:\s*100%/i.test(e.getAttribute('style') || ''));
  if (!pageDivs.length) return null;
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  return pageDivs.map(pg => {
    const inner = pg.firstElementChild?.tagName === 'DIV' ? pg.firstElementChild : pg;
    const divs = [...inner.children].filter(e => e.tagName === 'DIV');
    let dateIdx = -1, date = null;
    for (let i = 0; i < Math.min(3, divs.length); i++) {
      const ps = [...divs[i].querySelectorAll('p')].map(p => norm(p.textContent)).filter(Boolean);
      const cand = [ps[0] || '', (ps[0] || '') + ' ' + (ps[1] || ''), norm(divs[i].textContent)];
      for (const c of cand) { const d = parseOneNoteDate(c); if (d) { dateIdx = i; date = d; break; } }
      if (dateIdx >= 0) break;
    }
    let title = '', contentDivs;
    if (dateIdx >= 0) { title = divs.slice(0, dateIdx).map(d => norm(d.textContent)).join(' '); contentDivs = divs.slice(dateIdx + 1); }
    else {
      const big = divs[0] && /font-size:\s*(1[6-9]|[2-9]\d)(\.\d+)?pt/i.test(divs[0].innerHTML) && norm(divs[0].textContent).length <= 140;
      title = big ? norm(divs[0].textContent) : ''; contentDivs = big ? divs.slice(1) : divs;
    }
    const box = doc.createElement('div'); contentDivs.forEach(d => box.append(d));
    markYouVersion(box);
    const items = htmlToItems(box.innerHTML, imgMap);
    title = title.replace(/[\u00a0\u200b]/g, ' ').trim();
    if (!title && !items.length) return null; // página totalmente vazia
    if (!title) { const first = items.find(it => it.kind !== 'img' && htmlToText(it.html)); const t = first ? htmlToText(first.html).replace(/\s+/g, ' ') : ''; title = !t ? 'Sem título' : t.length > 60 ? t.slice(0, 60).replace(/\s+\S*$/, '') + '…' : t; }
    return { title, date, items };
  }).filter(Boolean);
}
/* MHT do OneNote: uma página, uma seção ou o caderno inteiro (várias partes HTML) */
function mhtToPages(raw) {
  const bm = raw.match(/boundary="?([^"\r\n;]+)"?/i); if (!bm) return oneNoteExportPages(raw, {}) || splitOneNotePages(htmlToItems(raw));
  const pages = []; const imgMap = {};
  for (const part of raw.split('--' + bm[1])) {
    const idx = part.search(/\r?\n\r?\n/); if (idx < 0) continue;
    const head = part.slice(0, idx), body = part.slice(idx).trim();
    const ct = (head.match(/Content-Type:\s*([^;\r\n]+)/i) || [])[1] || '';
    const charset = ((head.match(/charset="?([^";\r\n]+)"?/i) || [])[1] || 'utf-8').trim();
    const te = ((head.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i) || [])[1] || '').trim().toLowerCase();
    const loc = ((head.match(/Content-Location:\s*([^\r\n]+)/i) || [])[1] || '').trim();
    if (/text\/html/i.test(ct)) pages.push({ loc, html: decodeMimeBody(body, te, charset) });
    else if (/^image\//i.test(ct) && te === 'base64') { const url = `data:${ct.trim()};base64,${body.replace(/\s/g, '')}`; imgMap[loc] = url; imgMap[loc.split('/').pop()] = url; imgMap[decodeURIComponent(loc.split('/').pop())] = url; }
  }
  // Ignora índices/molduras (frameset, sumário só com links)
  const real = pages.filter(p => {
    if (/<frameset/i.test(p.html)) return false;
    const d = new DOMParser().parseFromString(p.html, 'text/html');
    const text = (d.body?.innerText || d.body?.textContent || '').trim();
    const linkText = [...d.querySelectorAll('a')].map(a => a.textContent).join('').trim();
    return text.length && !(linkText.length > text.length * 0.8 && d.querySelectorAll('a').length > 2);
  });
  const out = [];
  for (const p of real) { const pp = oneNoteExportPages(p.html, imgMap); if (pp) out.push(...pp); else out.push(...splitOneNotePages(htmlToItems(p.html, imgMap))); }
  return out;
}

/* ===== DOCX (exportação) ===== */
const DocxWriter = {
  async build(s) {
    const media = []; let imgN = 0;
    const X = t => esc(t);
    const run = (text, f = {}) => {
      const pr = [f.b && '<w:b/>', f.i && '<w:i/>', f.u && '<w:u w:val="single"/>', f.color && `<w:color w:val="${f.color}"/>`, f.hl && '<w:highlight w:val="yellow"/>', f.sz && `<w:sz w:val="${f.sz}"/>`, f.sup && '<w:vertAlign w:val="superscript"/>'].filter(Boolean).join('');
      return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${X(text)}</w:t></w:r>`;
    };
    const para = (runs, o = {}) => {
      const pPr = [o.style && `<w:pStyle w:val="${o.style}"/>`, o.shade && `<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>`, o.ind && `<w:ind w:left="${o.ind}"/>`, o.border && `<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="${o.border}"/></w:pBdr>`, o.spacing && `<w:spacing w:after="${o.spacing}"/>`].filter(Boolean).join('');
      return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs}</w:p>`;
    };
    const image = (dataURL, wPx, hPx) => {
      let { bytes, mime } = dataURLtoBytes(dataURL); const ext = mime === 'image/jpeg' ? 'jpeg' : 'png';
      const n = ++imgN; media.push({ name: `word/media/image${n}.${ext}`, data: bytes, id: `rIdImg${n}` });
      const maxW = 6 * 914400; let cx = Math.round(wPx * 9525), cy = Math.round(hPx * 9525); if (cx > maxW) { cy = Math.round(cy * maxW / cx); cx = maxW; }
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Imagem ${n}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    };
    const imgSize = src => new Promise(r => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r([600, 400]); i.src = src; });
    const toPNGIfNeeded = src => new Promise(r => { if (/^data:image\/(png|jpeg)/.test(src)) return r(src); const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); r(c.toDataURL('image/png')); }; i.onerror = () => r(null); i.src = src; });
    // HTML do editor → parágrafos com formatação
    const htmlParas = (html, o = {}, extraFmt = {}) => {
      const d = document.createElement('div'); d.innerHTML = html || '';
      const out = []; let runs = '';
      const end = () => { if (runs) out.push(para(runs, o)); runs = ''; };
      const walk = (n, f, prefix) => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) { if (c.nodeValue) runs += run(c.nodeValue, f); continue; }
          if (c.nodeType !== 1) continue;
          const t = c.tagName, nf = { ...f };
          if (t === 'BR') { runs += '<w:r><w:br/></w:r>'; continue; }
          if (t === 'B' || t === 'STRONG') nf.b = 1; if (t === 'I' || t === 'EM') nf.i = 1; if (t === 'U') nf.u = 1; if (t === 'SUP') nf.sup = 1; if (t === 'MARK') nf.hl = 1;
          const st = c.getAttribute('style') || '';
          if (/font-weight:\s*(bold|[6-9]00)/.test(st)) nf.b = 1; if (/italic/.test(st)) nf.i = 1; if (/underline/.test(st)) nf.u = 1; if (/background-color/.test(st)) nf.hl = 1;
          const cm = st.match(/(?:^|;)\s*color:\s*([^;]+)/); if (cm) { const hex = cssToHex(cm[1]); if (hex) nf.color = hex; }
          if (t === 'UL' || t === 'OL') { end(); let k = 0; for (const li of c.children) { runs = run(t === 'OL' ? `${++k}. ` : '•  ', nf); walk(li, nf); out.push(para(runs, { ...o, ind: (o.ind || 0) + 360 })); runs = ''; } continue; }
          if (t === 'DIV' || t === 'P' || t === 'LI') { end(); walk(c, nf); end(); continue; }
          walk(c, nf);
        }
      };
      walk(d, extraFmt); end();
      return out.join('') || para('', o);
    };
    let body = para(run(s.title, {}), { style: 'Title' });
    const meta = [s.date ? new Date(s.date + 'T12:00').toLocaleDateString(DL()) : '', s.passage ? 'Texto-base: ' + s.passage : ''].filter(Boolean).join('   ·   ');
    if (meta) body += para(run(meta, { color: '605E5C' }), { spacing: 240 });
    let n = 0;
    for (const b of s.blocks) {
      if (b.type !== 'image' && b.type !== 'ink' && !htmlToText(b.html) && !b.ref) continue;
      if (b.type === 'point') body += para(run(`${++n}. ${htmlToText(b.html)}`), { style: 'Heading1' });
      else if (b.type === 'text') body += htmlParas(b.html);
      else if (b.type === 'subhead') body += para(run(htmlToText(b.html), { b: 1 }), { style: 'Heading2' });
      else if (b.type === 'verse') { body += para(run((b.ref || 'Versículo') + (b.version ? ' (' + (Bible.info(b.version)?.short || '') + ')' : ''), { b: 1, color: '0F6CBD' }), { ind: 360, border: '0F6CBD', spacing: 0 }); body += htmlParas(b.html, { ind: 360, border: '0F6CBD' }, { i: 1 }); }
      else if (isCallout(b.type)) {
        const col = blockColor(b.type).replace('#', '').toUpperCase();
        body += para(run((BLOCK_TYPES[b.type]?.label || 'Destaque').toUpperCase(), { b: 1, color: col, sz: 18 }), { ind: 360, border: col, spacing: 0 });
        body += htmlParas(b.html, { ind: 360, border: col }, b.type === 'quote' ? { b: 1 } : {});
      } else if (b.type === 'image' && b.src) { const src = await toPNGIfNeeded(b.src); if (src) { const [w, h] = await imgSize(src); body += para(image(src, w, h)); } if (b.html) body += htmlParas(b.html, {}, { i: 1 }); }
      else if (b.type === 'mind' && b.mind) { const im = Mind.png(b.mind); const w = Math.min(600, im.w); body += para(image(im.src, w, Math.round(im.h * w / im.w))); }
      else if (b.type === 'ink' && b.ink?.strokes?.length) { const view = { hr: inkContentHR(b.ink), strokes: b.ink.strokes }; body += para(image(inkToDataURL(view, 1200, '#ffffff'), 600, 600 * view.hr)); }
    }
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="24"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="7719AA"/><w:sz w:val="48"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="7719AA"/><w:sz w:val="32"/></w:rPr></w:style></w:styles>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map(m => `<Relationship Id="${m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.name.replace('word/', '')}"/>`).join('')}</Relationships>`;
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
    const root = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${X(s.title)}</dc:title><dc:creator>SmartSower</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`;
    const blob = zipStore([{ name: '[Content_Types].xml', data: ct }, { name: '_rels/.rels', data: root }, { name: 'docProps/core.xml', data: core }, { name: 'word/document.xml', data: docXml }, { name: 'word/styles.xml', data: styles }, { name: 'word/_rels/document.xml.rels', data: rels }, ...media.map(m => ({ name: m.name, data: m.data }))]);
    return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
};
function cssToHex(c) { const d = document.createElement('div'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); const m = v.match(/\d+/g); return m ? m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join('').toUpperCase() : null; }

/* ===== Importar / Exportar (diálogos) ===== */
const safeName = s => (s || 'ministracao').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'ministracao';
const Porter = {
  importDialog() {
    const paste = el('div', { class: 'paste-area', contenteditable: 'true', 'data-ph': 'Ou cole aqui uma página copiada do OneNote (Ctrl+A, Ctrl+C no OneNote → Ctrl+V aqui)' });
    const body = el('div', { class: 'imp' },
      el('div', { class: 'imp-card hl' }, el('h4', { text: 'Direto do OneNote (conta Microsoft)' }),
        el('p', { class: 'muted', text: 'Entre com sua conta e traga cadernos inteiros — seções, páginas, imagens e anotações à mão. Ideal para trazer muita coisa de uma vez.' }),
        el('button', { class: 'btn primary', text: 'Conectar ao OneNote…', onclick: () => { m.close(); OneNoteUI.open(); } })),
      el('div', { class: 'imp-card' }, el('h4', { text: '1. Arquivo exportado do OneNote' }),
        el('p', { class: 'muted', html: 'Sem login e sem registro. No OneNote: <b>Arquivo › Exportar</b> › escolha <b>Página</b> ou <b>Seção</b> (uma seção inteira vira várias ministrações, uma por página) › formato <b>Documento do Word (*.docx)</b> ou <b>Arquivo da Web de Arquivo Único (*.mht)</b>. Depois selecione os arquivos abaixo — pode escolher vários de uma vez.' }),
        el('div', { class: 'row-btns' },
          el('button', { class: 'btn primary', text: 'Escolher arquivos .onepkg / .docx / .mht…', onclick: async () => { const fs = await pickFiles('.onepkg,.docx,.mht,.mhtml,.html,.htm', true); if (fs.length) { m.close(); this.importFiles(fs); } } }),
          el('button', { class: 'btn', text: 'Importar caderno (várias seções)…', onclick: () => { m.close(); this.notebookImport(); } }))),
      el('div', { class: 'imp-card' }, el('h4', { text: '2. Copiar e colar' }), paste,
        el('button', { class: 'btn', text: 'Importar o conteúdo colado', onclick: () => { const items = htmlToItems(paste.innerHTML); if (!items.length) return UI.toast('Cole algo primeiro'); const r = itemsToSermon(items, 'Colado do OneNote'); App.newSermon({ title: r.title, blocks: r.blocks }); m.close(); } })),
      el('div', { class: 'imp-card' }, el('h4', { text: '3. Backup do SmartSower' }), el('p', { class: 'muted', text: 'Restaura um arquivo .json exportado por este app (mescla com o que já existe).' }),
        el('button', { class: 'btn', text: 'Restaurar backup…', onclick: async () => { const [f] = await pickFiles('.json'); if (f) { m.close(); this.restore(f); } } })));
    paste.addEventListener('paste', e => { const h = e.clipboardData.getData('text/html'); if (h) { e.preventDefault(); paste.innerHTML = sanitizeHTML(h); } });
    const m = UI.modal({ title: 'Importar', body, wide: true });
  },
  async parseFile(f) {
    const ext = f.name.split('.').pop().toLowerCase(); let items = [];
    if (ext === 'docx') { items = await docxToItems(await f.arrayBuffer()); return { pages: splitOneNotePages(items), items }; }
    if (ext === 'mht' || ext === 'mhtml') return { pages: mhtToPages(await f.text()), items };
    const h = await f.text(); const pages = oneNoteExportPages(h, {}) || splitOneNotePages(items = htmlToItems(h));
    return { pages, items };
  },
  /* Lê os arquivos e pergunta como organizar (caderno novo/atual, uma seção por arquivo, por ano…) */
  async importFiles(files, opts = {}) {
    const parsed = [];
    /* pacotes do OneNote (.onepkg): caderno inteiro com as seções */
    const pkgs = files.filter(f => /\.onepkg$/i.test(f.name)); files = files.filter(f => !/\.onepkg$/i.test(f.name));
    if (pkgs.length) {
      const log = el('p', { class: 'muted', text: 'Abrindo o pacote…' });
      const pm = UI.modal({ title: 'Lendo o caderno do OneNote', body: el('div', {}, log, el('p', { class: 'muted small', text: 'Cadernos grandes podem levar alguns segundos.' })) });
      for (const f of pkgs) {
        try {
          const secs = await OneNoteImport.package(new Uint8Array(await f.arrayBuffer()), nm => { log.textContent = 'Lendo a seção ' + nm.replace(/\.one$/i, '') + '…'; });
          for (const s of secs) parsed.push({ base: (pkgs.length > 1 ? f.name.replace(/\.onepkg$/i, '') + ' › ' : '') + s.base, pkg: true,
            pages: s.pages.map(p => ({ title: p.title, date: p.date, level: p.level, items: htmlToItems(p.html) })) });
          opts.name ||= f.name.replace(/\.onepkg$/i, '');
        } catch (e) { console.error(e); UI.toast(`Não consegui ler ${f.name}: ${e.message}`); }
      }
      pm.close(); opts.asNotebook = true;
    }
    if (files.length) UI.toast(files.length > 1 ? `Lendo ${files.length} arquivos…` : `Lendo ${files[0].name}…`);
    await new Promise(r => setTimeout(r, 30));
    for (const f of files) {
      try { const { pages, items } = await this.parseFile(f); parsed.push({ base: f.name.replace(/\.[^.]+$/, ''), pages: pages.length ? pages : [{ title: null, date: null, items }] }); }
      catch (e) { console.error(e); UI.toast(`Falha em ${f.name}: ${e.message}`); }
    }
    if (!parsed.some(x => x.pkg)) parsed.sort((a, b) => a.base.localeCompare(b.base, 'pt-BR', { numeric: true }));
    const total = parsed.reduce((n, x) => n + x.pages.length, 0);
    if (!total) return;
    // Uma página só: entra direto na seção aberta (o jeito mais rápido)
    // Só páginas soltas (1 por arquivo): entram direto na seção aberta, sem perguntas
    if (!opts.asNotebook && parsed.every(x => x.pages.length === 1)) return this.applyImport(parsed, { dest: 'here' });
    this.organize(parsed, opts);
  },
  organize(parsed, opts) {
    const total = parsed.reduce((n, x) => n + x.pages.length, 0), multi = parsed.length > 1;
    const common = (() => { if (!multi) return parsed[0].base; let p = parsed[0].base; for (const x of parsed) while (p && !x.base.startsWith(p)) p = p.slice(0, -1); return p.replace(/[\s\-_–—·.]+$/, '').trim(); })();
    const name = el('input', { class: 'inp', value: opts.name || common || 'Caderno importado' });
    const curNb = App.meta.notebooks.find(n => n.id === App.meta.currentNb);
    const destNew = el('input', { type: 'radio', name: 'imp-dest', checked: true }), destCur = el('input', { type: 'radio', name: 'imp-dest' });
    const group = el('select', { class: 'inp' },
      el('option', { value: 'one', text: 'Tudo numa seção' }), el('option', { value: 'year', text: 'Uma seção por ano' }));
    group.value = total > 60 ? 'year' : 'one';
    const body = el('div', { class: 'imp' },
      el('p', { html: parsed.some(x => x.pkg) ? `<b>${total}</b> página(s) em <b>${parsed.length}</b> seção(ões) do OneNote.` : `<b>${total}</b> página(s) em <b>${parsed.length}</b> arquivo(s).` }),
      el('div', { class: 'imp-card' },
        el('label', { class: 'on-check' }, destNew, ' Criar um caderno novo chamado:'), name,
        el('label', { class: 'on-check', style: { marginTop: '8px' } }, destCur, ` Colocar no caderno aberto (${curNb?.name || ''})`)),
      multi
        ? el('div', { class: 'imp-card' }, el('b', { text: 'Seções' }), el('p', { class: 'muted small', text: parsed.some(x => x.pkg) ? 'As seções do OneNote, na mesma ordem:' : 'Cada arquivo vira uma seção:' }),
            el('div', { class: 'imp-secs' }, parsed.map(x => el('span', { class: 'pill', text: `${x.base} · ${x.pages.length}` }))))
        : el('div', { class: 'imp-card' }, el('b', { text: 'Seções' }), group,
            total > 1 ? el('p', { class: 'muted small', html: 'O OneNote <b>não grava as seções</b> quando você exporta o caderno inteiro. Para manter as seções originais, exporte <b>cada seção</b> (Arquivo › Exportar › <b>Seção</b> › .mht) e selecione todos os arquivos juntos. Ou importe assim e use <b>☑ Selecionar</b> na lista de páginas para mover várias de uma vez.' }) : null));
    const m = UI.modal({ title: opts.asNotebook ? 'Importar caderno' : 'Importar', body, wide: true, actions: [
      { label: 'Cancelar' },
      { label: 'Importar', primary: true, onClick: () => { this.applyImport(parsed, { dest: destCur.checked ? 'current' : 'new', name: name.value.trim() || common || 'Caderno importado', group: group.value }); } }] });
  },
  applyImport(parsed, o) {
    const M = App.meta; let ok = 0, last = null;
    const newSec = (nb, nm) => { const sc = { id: uid(), nb, name: nm, color: SECTION_COLORS[M.sections.length % 10] }; M.sections.push(sc); return sc; };
    const ord = {};
    const add = (pg, secId, fallback) => {
      const r = itemsToSermon(pg.items, pg.title || fallback || 'Sem título', !!pg.title);
      const s = Object.assign(blankSermon(secId), { title: r.title, blocks: r.blocks.length ? r.blocks : [{ id: uid(), type: 'text', html: '' }], duration: 0 });
      if (pg.level != null) { s.level = pg.level; s.order = ord[secId] = (ord[secId] ?? -1) + 1; } /* .onepkg: mantém a ordem e as subpáginas do OneNote */
      s.date = pg.date || (o.dest === 'here' ? s.date : '');
      App.sermons.set(s.id, s); App.touch(s); last = s; ok++;
    };
    if (o.dest === 'here') { for (const x of parsed) add(x.pages[0], M.currentSec, x.base); }
    else {
      let nbId = M.currentNb;
      if (o.dest === 'new') { const nb = { id: uid(), name: o.name, color: SECTION_COLORS[M.notebooks.length % 10] }; M.notebooks.push(nb); nbId = nb.id; }
      let firstSec = null;
      if (parsed.length > 1) {
        for (const x of parsed) { const sc = newSec(nbId, x.base); firstSec ||= sc; x.pages.forEach(pg => add(pg, sc.id, x.base)); }
      } else {
        const x = parsed[0];
        if (o.group === 'year') {
          const keyOf = pg => (pg.date || '').slice(0, 4) || 'Sem data'; const secs = {};
          [...new Set(x.pages.map(keyOf))].sort((a, b) => (a === 'Sem data') - (b === 'Sem data') || b.localeCompare(a)).forEach(k => { secs[k] = newSec(nbId, k); firstSec ||= secs[k]; });
          x.pages.forEach(pg => add(pg, secs[keyOf(pg)].id, x.base));
        } else {
          const sc = newSec(nbId, o.dest === 'new' ? 'Geral' : x.base); firstSec = sc; x.pages.forEach(pg => add(pg, sc.id, x.base));
        }
      }
      M.currentNb = nbId; if (firstSec) M.currentSec = firstSec.id;
    }
    App.saveMeta(); App.flush(); App.renderNav();
    const open = App.sectionSermons(M.currentSec)[0] || last; if (open) App.open(open.id, false, true);
    if (ok) UI.toast(`${ok} página(s) importada(s). Revise os pontos e versículos.`);
  },
  async notebookImport() {
    UI.modal({ title: 'Importar caderno do OneNote', body: el('div', {},
      el('div', { class: 'imp-card hl' }, el('h4', { text: '⭐ Mais fácil: o caderno inteiro (.onepkg)' }),
        el('p', { html: 'No OneNote para Windows: <b>Arquivo › Exportar</b> › Exportar atual: <b>Bloco de Anotações</b> › formato <b>Pacote do OneNote (*.onepkg)</b>. Traz <b>todas as seções</b>, a ordem das páginas, as subpáginas, as datas, tabelas e imagens.' }),
        el('p', { class: 'muted small', text: 'Desenhos à mão e anexos não vêm (aparece um aviso no lugar). Cadernos protegidos por senha não abrem.' })),
      el('p', { html: 'Ou, seção por seção:' }),
      el('ol', { class: 'steps', html: '<li>No OneNote, clique na seção (a aba colorida).</li><li><b>Arquivo › Exportar</b> › Exportar atual: <b>Seção</b> › formato <b>Página da Web de Arquivo Único (*.mht)</b> ou <b>Documento do Word</b> › Exportar.</li><li>Repita para cada seção, salvando todas na mesma pasta.</li><li>Clique abaixo e selecione <b>todos os arquivos</b> de uma vez (Ctrl+A na pasta).</li>' }),
      el('p', { class: 'muted small', text: 'Cada arquivo vira uma seção, com o nome do arquivo, dentro de um caderno novo. Também funciona com o caderno inteiro em um arquivo só, mas aí o OneNote não informa as seções.' })),
      actions: [{ label: 'Cancelar' }, { label: 'Escolher arquivos…', primary: true, onClick: async () => { const fs = await pickFiles('.onepkg,.docx,.mht,.mhtml,.html,.htm', true); if (fs.length) this.importFiles(fs, { asNotebook: true }); } }] });
  },
  exportDialog() {
    const s = App.cur;
    const body = el('div', { class: 'imp' },
      el('div', { class: 'imp-card' }, el('h4', { text: 'Esta ministração' + (s ? ': ' + s.title : '') }),
        el('div', { class: 'row-btns' },
          el('button', { class: 'btn primary', text: 'PDF', disabled: !s, onclick: () => { m.close(); this.pdf(s); } }),
          el('button', { class: 'btn primary', text: 'Word (.docx)', disabled: !s, onclick: async () => { m.close(); await this.docx(s); } })),
        el('p', { class: 'muted small', text: 'PDF: na janela de impressão escolha “Salvar como PDF” (ou “Microsoft Print to PDF”).' })),
      el('div', { class: 'imp-card hl' }, el('h4', { text: 'Compartilhar' }), el('p', { class: 'muted small', text: 'Copiar para o WhatsApp ou criar um link de leitura online (com cópia bloqueada).' }),
        el('div', { class: 'row-btns', style: { flexWrap: 'wrap' } },
          el('button', { class: 'btn primary', text: '📋 Copiar para WhatsApp', disabled: !s, onclick: () => Share.copyText(Share.whatsapp(s)) }),
          el('button', { class: 'btn', text: '🔗 Link de leitura…', disabled: !s, onclick: () => { m.close(); Share.open(s); } }))),
      el('div', { class: 'imp-card' }, el('h4', { text: 'Backup de tudo' }), el('p', { class: 'muted', text: 'Cadernos, seções e ministrações num único arquivo .json. Uma garantia extra além da nuvem.' }),
        el('button', { class: 'btn', text: 'Baixar backup (.json)', onclick: () => { m.close(); this.backup(); } })));
    const m = UI.modal({ title: 'Exportar', body, wide: true });
  },
  async docx(s) { try { const blob = await DocxWriter.build(s); await saveFile(safeName(s.title) + '.docx', blob); } catch (e) { console.error(e); UI.toast('Erro ao gerar DOCX: ' + e.message); } },
  pdf(s) {
    const P = $('#print-area'); P.innerHTML = '';
    P.append(el('h1', { text: s.title }));
    const meta = [s.date ? new Date(s.date + 'T12:00').toLocaleDateString(DL()) : '', s.passage ? 'Texto-base: ' + s.passage : ''].filter(Boolean).join(' · ');
    if (meta) P.append(el('div', { class: 'p-meta', text: meta }));
    let n = 0;
    for (const b of s.blocks) {
      if (b.type !== 'image' && b.type !== 'ink' && !htmlToText(b.html) && !b.ref) continue;
      if (b.type === 'point') P.append(Marks.tag(el('h2', { text: `${++n}. ${htmlToText(b.html)}` }), b));
      else if (b.type === 'subhead') P.append(Marks.tag(el('h3', { text: htmlToText(b.html) }), b));
      else if (b.type === 'verse') P.append(Marks.tag(el('blockquote', { class: 'p-verse' }, el('b', { text: (b.ref || '') + (b.version ? ' (' + (Bible.info(b.version)?.short || '') + ')' : '') }), el('div', { html: b.html || '' })), b));
      else if (isCallout(b.type)) P.append(Marks.tag(el('div', { class: 'p-call p-' + b.type, style: { borderColor: blockColor(b.type) } }, el('small', { text: BLOCK_TYPES[b.type]?.label || '', style: { color: blockColor(b.type) } }), el('div', { html: b.html || '' })), b));
      else if (b.type === 'image') P.append(Marks.tag(el('figure', {}, el('img', { src: b.src }), b.html ? el('figcaption', { html: b.html }) : null), b));
      else if (b.type === 'mind' && b.mind) { const im = Mind.png(b.mind); P.append(Marks.tag(el('img', { class: 'p-ink p-mind', src: im.src, style: { width: Math.min(100, im.w / 7) + '%' } }), b)); }
      else if (b.type === 'ink' && b.ink?.strokes?.length) { const v = { hr: inkContentHR(b.ink), strokes: b.ink.strokes }; P.append(el('img', { class: 'p-ink', src: inkToDataURL(v, 1400) })); }
      else P.append(Marks.tag(el('div', { class: 'p-text', html: b.html || '' }), b));
    }
    const old = document.title; document.title = safeName(s.title);
    setTimeout(() => { window.print(); document.title = old; }, 120);
  },
  async backup() {
    App.flush();
    const data = { app: 'smartsower', version: 1, exported: new Date().toISOString(), meta: App.meta, sermons: [...App.sermons.values()] };
    await saveFile(`smartsower-backup-${todayISO()}.json`, new Blob([JSON.stringify(data)], { type: 'application/json' }));
  },
  async restore(file) {
    try {
      const d = JSON.parse(await file.text()); if (!['smartsower', 'smartsermon', 'ministrapad', 'pulpito'].includes(d.app)) throw new Error('Não é um backup do SmartSower');
      for (const nb of d.meta.notebooks) if (!App.meta.notebooks.some(x => x.id === nb.id)) App.meta.notebooks.push(nb);
      for (const sc of d.meta.sections) if (!App.meta.sections.some(x => x.id === sc.id)) App.meta.sections.push(sc);
      let n = 0; for (const s of d.sermons) { const cur = App.sermons.get(s.id); if (!cur || (s.updated || 0) > (cur.updated || 0)) { App.sermons.set(s.id, s); await DB.put('sermons', s.id, s); n++; } }
      App.saveMeta(); App.renderNav(); UI.toast(`${n} ministração(ões) restaurada(s)`);
    } catch (e) { UI.toast('Falha: ' + e.message); }
  }
};
