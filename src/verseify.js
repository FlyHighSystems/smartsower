/* ===== Transformar um trecho do texto em bloco de versículo / dividir o bloco ===== */
const Verseify = {
  ctx() {
    const s = getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0);
    const body = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement)?.closest('#blocks .b-body[contenteditable="true"]');
    if (!body || !body.contains(r.endContainer)) return null;
    const id = body.closest('.block')?.dataset.id, b = App.cur?.blocks.find(x => x.id === id);
    return b && b.type !== 'verse' ? { r, body, b } : null;
  },
  html(rg) {
    const d = document.createElement('div'); d.append(rg.cloneContents());
    d.querySelectorAll('li, div, p').forEach(e => { if (!e.textContent.trim() && !e.querySelector('img, sup')) e.remove(); });
    d.querySelectorAll('ul, ol').forEach(e => { if (!e.querySelector('li')) e.remove(); });
    return htmlToText(d.innerHTML).trim() ? d.innerHTML.replace(/^(\s|&nbsp;|<br\s*\/?>)+|(\s|&nbsp;|<br\s*\/?>)+$/g, '') : '';
  },
  trimLead(h) { // tira ". ", ") " etc. que sobram no começo do texto de baixo
    if (!h) return h; const d = document.createElement('div'); d.innerHTML = h;
    const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) { if (!n.data.trim()) continue; n.data = n.data.replace(/^[\s.,;:)\]”"’»]+/, ''); break; }
    return this.html((() => { const r = document.createRange(); r.selectNodeContents(d); return r; })());
  },
  parts(c) {
    const { r, body } = c;
    const pre = document.createRange(); pre.setStart(body, 0); pre.setEnd(r.startContainer, r.startOffset);
    const post = document.createRange(); post.setStart(r.endContainer, r.endOffset); post.setEnd(body, body.childNodes.length);
    return { before: this.html(pre), mid: r.toString(), after: this.trimLead(this.html(post)) };
  },
  replace(b, list) {
    const s = App.cur, i = s.blocks.indexOf(b), snap = s.blocks.slice();
    s.blocks.splice(i, 1, ...list); App.touch(s); App.renderBlocks();
    return () => { s.blocks = snap; App.touch(s); App.renderBlocks(); UI.toast('Desfeito'); };
  },
  // ✂ dividir no cursor (ou separar o trecho selecionado num bloco próprio)
  split() {
    const c = this.ctx(); if (!c) return UI.toast('Coloque o cursor no texto onde quer dividir.');
    const { before, after } = this.parts(c), sel = c.r.collapsed ? '' : this.html(c.r);
    const type = c.b.type === 'point' ? 'text' : c.b.type, list = [];
    if (before) list.push({ ...c.b, html: before });
    if (sel) list.push({ id: uid(), type, html: sel });
    if (after) list.push({ id: uid(), type, html: after });
    if (list.length < 2) return UI.toast('Nada para dividir aqui — o cursor está no começo ou no fim do bloco.');
    const undo = this.replace(c.b, list); UI.toast('Bloco dividido', { label: 'Desfazer', fn: undo });
  },
  // 📖 o trecho selecionado vira um bloco de versículo
  async toVerse() {
    const c = this.ctx(); if (!c || c.r.collapsed) return UI.toast('Selecione o versículo (com ou sem a referência) dentro do texto.');
    const { before, mid, after } = this.parts(c); let text = mid.replace(/\s+/g, ' ').trim();
    let ref = null, version = '', html = '', note = '';
    // 1) a referência está no trecho? (ex.: "João 3:16", "(Rm 8:28)")
    const found = [...text.matchAll(REF_IN_TEXT)].map(m => m[0]).find(m => parseRef(m));
    if (found) { ref = parseRef(found); text = text.replace(found, ' '); }
    text = text.replace(/\(\s*\)|\[\s*\]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s"“”'‘’«»(\[\-–—:,;]+|[\s"“”'‘’«»(\[\-–—:,;]+$/g, '').trim();
    text = text.replace(/^[\s"“”'‘’«»]+|[\s"“”'‘’«»]+$/g, '');
    const lang = App.cur.lang;
    if (ref && text.length < 12) { // só a referência → busca o texto na Bíblia
      const res = await Bible.lookup(ref); if (!res.error) { html = Bible.versesHTML(res.verses); version = res.version; } else { note = res.error; }
    } else if (text) html = esc(text);
    if (!ref && text.length >= 12) { // sem referência → procura a frase na Bíblia
      try { const res = await Bible.searchWords(text.split(' ').slice(0, 14).join(' '), Bible.current(), 6); const ex = (res || []).filter(x => x.exact); if (ex.length === 1) { ref = parseRef(`${BOOKS[ex[0].book - 1].name} ${ex[0].ch}:${ex[0].v}`); note = 'Referência encontrada pela frase — confira.'; } else note = ex.length > 1 ? 'Essa frase aparece em mais de um versículo — escreva a referência na caixa.' : 'Não achei a referência — escreva na caixa do versículo.'; } catch (e) { }
    }
    const vb = { id: uid(), type: 'verse', ref: ref ? refLabel(ref, lang) : '', version, html };
    const list = []; if (before) list.push({ ...c.b, html: before }); list.push(vb); if (after) list.push({ id: uid(), type: c.b.type === 'point' ? 'text' : c.b.type, html: after });
    const undo = this.replace(c.b, list);
    setTimeout(() => { const w = $(`#blocks .block[data-id="${vb.id}"]`); w?.scrollIntoView({ block: 'center', behavior: 'smooth' }); w?.classList.add('flash'); setTimeout(() => w?.classList.remove('flash'), 1200); }, 60);
    UI.toast('📖 Versículo separado' + (note ? ' — ' + note : ''), { label: 'Desfazer', fn: undo });
  }
};
