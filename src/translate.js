/* ===== Traduzir a página para inglês ou espanhol =====
   Cria uma NOVA página (a original fica intacta). O texto é traduzido pela IA mantendo a formatação;
   os versículos vêm de uma Bíblia publicada no idioma (WEB/KJV, Reina-Valera) — a IA só traduz versículo se você pedir. */
const LANGS = {
  en: { label: 'Inglês', flag: '🇺🇸', ai: 'English (natural American English, as a pastor would preach it)', lt: 'en-US', tag: 'EN', bibles: ['web', 'kjv'] },
  es: { label: 'Espanhol', flag: '🇪🇸', ai: 'Spanish (neutral Latin American Spanish, as a pastor would preach it)', lt: 'es', tag: 'ES', bibles: ['rvr'] },
};
const Translate = {
  FIELDS: ['html', 'title', 'alt', 'caption', 'note', 'text'],
  provider() { return AI.has('claude') ? 'claude' : AI.has('gemini') ? 'gemini' : null; },
  langBadge(s) { const L = LANGS[s.lang]; return L ? el('span', { class: 'lang-badge', title: 'Página traduzida — ' + L.label, text: L.flag + ' ' + L.tag }) : null; },
  open(s = App.cur) {
    if (!s) return;
    if (!this.provider()) return UI.modal({ title: '🌐 Traduzir', body: el('p', { html: 'A tradução usa a mesma IA da revisão. Configure uma chave em <b>✦ Revisar › ⚙ Chaves e modelos</b> (Gemini ou Claude) e tente de novo.' }) });
    let lang = localStorage.getItem('ss-tr-lang') || 'en', bibleMode = '';
    const body = el('div', { class: 'tr' }); const m = UI.modal({ title: '🌐 Traduzir esta página', body });
    const draw = () => {
      body.innerHTML = ''; const L = LANGS[lang];
      const hasVerse = s.blocks.some(b => b.type === 'verse');
      const inst = L.bibles.filter(id => Bible.has(id));
      if (!bibleMode || (bibleMode !== 'ai' && !Bible.has(bibleMode))) bibleMode = inst[0] || 'ai';
      body.append(
        el('p', { class: 'muted small', text: 'Cria uma nova página traduzida na mesma seção. A original não muda.' }),
        el('div', { class: 'tr-langs' }, ...Object.entries(LANGS).map(([id, x]) => el('button', { class: 'tr-lang' + (id === lang ? ' on' : ''), onclick: () => { lang = id; bibleMode = ''; localStorage.setItem('ss-tr-lang', id); draw(); } }, el('span', { class: 'tr-flag', text: x.flag }), x.label))));
      if (hasVerse) {
        const opts = el('div', { class: 'tr-bibles' }, el('div', { class: 'small', html: '<b>Versículos</b> — vêm de uma Bíblia publicada nesse idioma (não da IA):' }));
        for (const id of L.bibles) {
          const src = BIBLE_SOURCES.find(x => x.id === id), ok = Bible.has(id);
          opts.append(el('label', { class: 'tr-opt' + (ok ? '' : ' off') }, el('input', { type: 'radio', name: 'trb', checked: bibleMode === id, disabled: !ok, onchange: () => { bibleMode = id; } }),
            el('span', {}, el('b', { text: src.short }), ' — ' + src.name), ok ? null : el('button', { class: 'btn sm', text: 'Baixar', onclick: async e => { e.preventDefault(); await BibleManager.downloadOne(src); if (Bible.has(id)) bibleMode = id; draw(); } })));
        }
        opts.append(el('label', { class: 'tr-opt' }, el('input', { type: 'radio', name: 'trb', checked: bibleMode === 'ai', onchange: () => { bibleMode = 'ai'; } }), el('span', { text: 'Deixar a IA traduzir os versículos (tradução livre — fica marcado no versículo)' })));
        body.append(opts);
      }
      const go = el('button', { class: 'btn primary', text: `${L.flag} Traduzir para ${L.label.toLowerCase()}`, onclick: () => this.run(s, lang, bibleMode, body, m) });
      body.append(el('div', { class: 'row-btns' }, go), el('p', { class: 'muted small', text: `IA: ${this.provider() === 'claude' ? 'Claude' : 'Gemini'}. Imagens e desenhos são copiados como estão.` }));
    };
    draw();
  },
  async run(src, lang, bibleMode, body, modal) {
    const L = LANGS[lang], prov = this.provider();
    const log = el('p', { class: 'muted', text: 'Preparando…' }); body.innerHTML = ''; body.append(el('div', { class: 'spinner' }), log);
    const s = structuredClone(src); s.id = uid(); s.created = s.updated = Date.now(); s.blocks.forEach(b => b.id = uid());
    s.lang = lang; s.translatedFrom = src.id; delete s.reviews; delete s.preached;
    // o que mandar para a IA
    const items = [], put = (k, t) => { if (t && String(t).replace(/<[^>]+>/g, '').trim()) items.push({ k, t: String(t) }); };
    put('title', s.title);
    s.blocks.forEach((b, i) => {
      if (b.type === 'verse') { if (bibleMode === 'ai') put(`b${i}.html`, b.html); return; }
      for (const f of this.FIELDS) if (typeof b[f] === 'string') put(`b${i}.${f}`, b[f]);
    });
    // lotes de ~6000 caracteres
    const batches = []; let cur = [], n = 0;
    for (const it of items) { if (n + it.t.length > 6000 && cur.length) { batches.push(cur); cur = []; n = 0; } cur.push(it); n += it.t.length; }
    if (cur.length) batches.push(cur);
    const sys = `You translate Christian sermons, devotionals and book chapters from Brazilian Portuguese into ${L.ai}.
Rules:
- Keep the meaning, tone and warmth of the original; natural and fluent, not word-for-word.
- Each item may contain HTML: keep EVERY tag and attribute exactly as it is, translating only the visible text. Also translate the text inside data-note="..." attributes (footnotes).
- Keep emojis, names of people and places as is. Convert Bible book names in references to the target language (e.g. "Jo 3:16" → "${refLabel(parseRef('Jo 3:16'), lang)}").
- Do not add, summarize or comment. Do not translate the keys.
Answer ONLY with JSON: {"items":[{"k":"<same key>","t":"<translation>"}]}`;
    const out = new Map();
    try {
      for (let i = 0; i < batches.length; i++) {
        log.textContent = `Traduzindo${batches.length > 1 ? ` parte ${i + 1} de ${batches.length}` : ''}…`;
        const user = JSON.stringify({ items: batches[i] });
        let r; try { r = AI.parseJSON(await AI.ask(prov, sys, user, { maxTokens: 12000 })); }
        catch (e) { if (!/mal formatada|vazia|JSON/i.test(e.message)) throw e; r = AI.parseJSON(await AI.ask(prov, sys, user + '\n\nIMPORTANT: answer with strictly valid JSON.', { maxTokens: 12000 })); }
        for (const x of r.items || []) if (x && x.k) out.set(x.k, x.t);
      }
    } catch (e) { body.innerHTML = ''; body.append(el('p', { class: 'on-log', text: 'Não consegui traduzir: ' + e.message })); return; }
    const missing = items.filter(it => !out.has(it.k)).length;
    // aplica
    if (out.has('title')) s.title = out.get('title');
    s.blocks.forEach((b, i) => { for (const f of this.FIELDS) if (out.has(`b${i}.${f}`)) b[f] = sanitizeHTML ? (f === 'html' ? sanitizeHTML(out.get(`b${i}.${f}`)) : out.get(`b${i}.${f}`)) : out.get(`b${i}.${f}`); });
    // texto-base e versículos
    const pr = parseRef(s.passage); if (pr) s.passage = refLabel(pr, lang);
    log.textContent = 'Buscando os versículos…';
    for (const [i, b] of s.blocks.entries()) {
      if (b.type !== 'verse') continue; const r = parseRef(b.ref); if (!r) continue;
      if (bibleMode === 'ai') { b.ref = refLabel(r, lang) + ' (tradução livre)'; b.version = ''; continue; }
      const res = await Bible.lookup(r, bibleMode);
      if (res.error) { b.ref = refLabel(r, lang); b.html = ''; continue; }
      b.ref = refLabel(r, lang); b.version = bibleMode; b.html = Bible.versesHTML(res.verses);
    }
    App.sermons.set(s.id, s); App.touch(s); App.flush(); modal.close(); App.renderNav(); App.open(s.id);
    UI.toast(`${L.flag} Página traduzida para ${L.label.toLowerCase()}` + (missing ? ` — ${missing} trecho(s) ficaram em português, confira` : ''));
  }
};
