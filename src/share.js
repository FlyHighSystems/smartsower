/* ===== Compartilhar: copiar para WhatsApp/área de transferência e link de leitura online ===== */
const Share = {
  /* Texto com a formatação do WhatsApp (*negrito*, _itálico_, > citação) */
  whatsapp(s) {
    const wa = html => { // converte o HTML do editor para o estilo do WhatsApp
      const d = document.createElement('template'); d.innerHTML = String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '$&\n');
      const walk = n => [...n.childNodes].map(c => {
        if (c.nodeType === 3) return c.nodeValue;
        if (c.nodeType !== 1) return '';
        const t = walk(c), tag = c.tagName; const st = c.getAttribute('style') || '';
        const wrap = (m, x) => { const tt = x.trim(); return tt ? x.replace(tt, m + tt + m) : x; };
        if (tag === 'B' || tag === 'STRONG' || /font-weight:\s*(bold|[6-9]00)/.test(st)) return wrap('*', t);
        if (tag === 'I' || tag === 'EM' || /italic/.test(st)) return wrap('_', t);
        if (tag === 'S' || tag === 'STRIKE') return wrap('~', t);
        if (tag === 'LI') return '• ' + t;
        if (tag === 'SUP') return t + ' ';
        return t;
      }).join('');
      return walk(d.content).replace(/[ \t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    };
    const out = [`*${s.title}*`];
    const meta = [s.date ? new Date(s.date + 'T12:00').toLocaleDateString('pt-BR') : '', s.passage ? '📖 ' + s.passage : ''].filter(Boolean).join(' · ');
    if (meta) out.push(meta);
    let n = 0;
    for (const b of s.blocks) {
      const t = wa(b.html);
      const mk = Marks.emoji(b) ? Marks.emoji(b) + ' ' : '';
      if (b.type === 'point') { out.push(`\n${mk}*${++n}. ${htmlToText(b.html)}*`); continue; }
      if (b.type === 'verse') { if (!t && !b.ref) continue; if (!t) { out.push(`📖 *${b.ref}*`); continue; } out.push(t.split('\n').map(l => '> _' + l.replace(/_/g, '') + '_').join('\n') + (b.ref ? `\n> — *${b.ref}*${b.version ? ' (' + (Bible.info(b.version)?.short || '') + ')' : b.verLabel ? ' (' + b.verLabel + ')' : ''}` : '')); continue; }
      if (b.type === 'ink' || b.type === 'image') continue;
      if (!t) continue;
      if (isCallout(b.type)) { out.push(`${mk}*${(BLOCK_TYPES[b.type]?.label || '').toUpperCase()}:* ${t}`); continue; }
      out.push(mk + t);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
  },
  /* HTML limpo (para colar formatado no Word, e-mail, Google Docs) e para o link de leitura */
  html(s, { inkAsImage = true } = {}) {
    const box = document.createElement('div');
    box.append(el('h1', { text: s.title }));
    const meta = [s.date ? new Date(s.date + 'T12:00').toLocaleDateString('pt-BR') : '', s.passage ? 'Texto-base: ' + s.passage : ''].filter(Boolean).join(' · ');
    if (meta) box.append(el('p', { class: 'meta', text: meta }));
    let n = 0;
    for (const b of s.blocks) {
      if (b.type !== 'image' && b.type !== 'ink' && !htmlToText(b.html) && !b.ref) continue;
      if (b.type === 'point') box.append(Marks.tag(el('h2', { text: `${++n}. ${htmlToText(b.html)}` }), b, true));
      else if (b.type === 'verse') box.append(Marks.tag(el('blockquote', { class: 'verse' }, el('div', { class: 'ref', text: (b.ref || '') + (b.version ? ' · ' + (Bible.info(b.version)?.short || '') : b.verLabel ? ' · ' + b.verLabel : '') }), el('div', { html: sanitizeHTML(b.html || '') })), b, true));
      else if (isCallout(b.type)) box.append(Marks.tag(el('div', { class: 'call', 'data-c': blockColor(b.type) }, el('small', { text: BLOCK_TYPES[b.type]?.label || '' }), el('div', { html: sanitizeHTML(b.html || '') })), b, true));
      else if (b.type === 'image' && b.src) box.append(Marks.tag(el('figure', {}, el('img', { src: b.src, alt: '' }), b.html ? el('figcaption', { text: htmlToText(b.html) }) : null), b, true));
      else if (b.type === 'ink' && b.ink?.strokes?.length && inkAsImage) box.append(Marks.tag(el('img', { class: 'ink', src: inkToDataURL({ hr: inkContentHR(b.ink), strokes: b.ink.strokes }, 1000, '#ffffff'), alt: 'Desenho' }), b, true));
      else box.append(Marks.tag(el('div', { class: 'text', html: sanitizeHTML(b.html || '') }), b, true));
    }
    return box.innerHTML;
  },
  async copyText(t) { try { await navigator.clipboard.writeText(t); UI.toast('Copiado! É só colar no WhatsApp.'); } catch (e) { UI.toast('Não consegui copiar automaticamente'); } },
  async copyRich(s) {
    const html = `<div style="font-family:Calibri,Segoe UI,sans-serif">${this.html(s)}</div>`.replace(/<blockquote class="verse">/g, '<blockquote style="border-left:3px solid #0f6cbd;margin:8px 0;padding-left:10px;font-style:italic">').replace(/<div class="ref">/g, '<div style="font-weight:bold;font-style:normal;color:#0f6cbd">');
    try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([this.whatsapp(s)], { type: 'text/plain' }) })]); UI.toast('Copiado com formatação (Word, e-mail, Google Docs).'); }
    catch (e) { this.copyText(this.whatsapp(s)); }
  },
  /* ---------- Link de leitura (Supabase: tabela shares + função get_share) ---------- */
  viewerURL(id) { return location.origin + location.pathname.replace(/[^/]*$/, '') + 'ler.html?id=' + id; },
  token() { const a = crypto.getRandomValues(new Uint8Array(16)); return b64url(a.buffer).slice(0, 22); },
  async publish(s, { id, allowCopy, days, live = true, expires: keepExp }) {
    if (!Cloud.configured() || !Cloud.session) throw new Error('Entre na sua conta (☁) para criar links.');
    id ||= this.token();
    const expires = keepExp !== undefined ? keepExp : days ? new Date(Date.now() + days * 86400000).toISOString() : null;
    const data = { title: s.title, date: s.date, passage: s.passage, html: this.html(s), author: Cloud.session.user?.email ? '' : '' };
    const body = { id, user_id: Cloud.uid(), sermon_id: s.id, data, allow_copy: !!allowCopy, revoked: false, expires_at: expires, updated_at: new Date().toISOString() };
    await Cloud.rest('/rest/v1/shares?on_conflict=id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(body) });
    const prev = (s.shares || []).find(x => x.id === id);
    const rec = { id, at: prev?.at || Date.now(), upd: Date.now(), allowCopy: !!allowCopy, expires, live: !!live };
    s.shares = (s.shares || []).filter(x => x.id !== id); s.shares.unshift(rec); this._quiet = true; App.touch(s); this._quiet = false;
    return id;
  },
  /* links “ao vivo”: republica sozinho uns 15 s depois que você para de escrever */
  isLive(sh) { return sh.live !== false && !(sh.expires && new Date(sh.expires) < new Date()); },
  changed(s) {
    if (this._quiet || !s?.shares?.some(x => this.isLive(x))) return;
    (this._t ||= {}); clearTimeout(this._t[s.id]);
    this._t[s.id] = setTimeout(() => this.pushLive(s), 15000);
  },
  async pushLive(s) {
    if (!Cloud.configured?.() || !Cloud.session) return;
    for (const sh of (s.shares || []).filter(x => this.isLive(x))) {
      try { await this.publish(s, { id: sh.id, allowCopy: sh.allowCopy, expires: sh.expires || null, live: true }); }
      catch (e) { clearTimeout(this._t[s.id]); this._t[s.id] = setTimeout(() => this.pushLive(s), 60000); return; }   // sem internet: tenta de novo depois
    }
  },
  flushLive() { for (const id of Object.keys(this._t || {})) { clearTimeout(this._t[id]); const s = App.sermons.get(id); if (s) this.pushLive(s); } this._t = {}; },
  async revoke(s, id) {
    await Cloud.rest(`/rest/v1/shares?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ revoked: true, updated_at: new Date().toISOString() }) });
    s.shares = (s.shares || []).filter(x => x.id !== id); App.touch(s);
  },
  open(s) {
    const body = el('div', { class: 'imp' }); const m = UI.modal({ title: 'Compartilhar: ' + s.title, body, wide: true });
    const draw = () => {
      body.innerHTML = '';
      body.append(el('div', { class: 'imp-card' }, el('h4', { text: 'Copiar o texto' }),
        el('p', { class: 'muted small', text: 'Com a formatação do WhatsApp (*negrito*, _itálico_, versículos como citação). Desenhos e imagens ficam de fora.' }),
        el('div', { class: 'row-btns', style: { flexWrap: 'wrap' } },
          el('button', { class: 'btn primary', text: '📋 Copiar para WhatsApp', onclick: () => this.copyText(this.whatsapp(s)) }),
          el('button', { class: 'btn', text: 'Copiar formatado (Word/e-mail)', onclick: () => this.copyRich(s) }),
          el('button', { class: 'btn', text: 'Ver prévia', onclick: () => { const pre = el('pre', { class: 'wa-pre', text: this.whatsapp(s) }); UI.modal({ title: 'Prévia (WhatsApp)', body: pre, wide: true, actions: [{ label: 'Copiar', primary: true, onClick: () => this.copyText(this.whatsapp(s)) }] }); } }))));
      const allow = el('input', { type: 'checkbox' }); const days = el('select', { class: 'inp', style: { width: 'auto' } }, el('option', { value: '0', text: 'Sem prazo' }), el('option', { value: '1', text: '1 dia' }), el('option', { value: '7', text: '7 dias' }), el('option', { value: '30', text: '30 dias' }));
      const out = el('div');
      const card = el('div', { class: 'imp-card' }, el('h4', { text: 'Link de leitura online' }),
        el('p', { class: 'muted small', text: 'Cria uma página só de leitura (celular, tablet ou computador). Por padrão, copiar, imprimir e o botão direito ficam bloqueados — isso dificulta, mas não impede, prints de tela. O link é AO VIVO: acompanha suas alterações (atualiza uns 15 s depois que você para de escrever) e quem estiver lendo vê a mudança sozinho. Se preferir congelar, marque o link como 📌 Fixo; use “Atualizar” depois de editar.' }),
        el('div', { class: 'row-btns', style: { flexWrap: 'wrap', alignItems: 'center' } }, el('label', { class: 'on-check' }, allow, ' Permitir copiar o texto'), el('span', { class: 'muted small', text: 'Validade:' }), days,
          el('button', { class: 'btn primary', text: '🔗 Criar link', onclick: async e => { e.target.disabled = true; try { const id = await this.publish(s, { allowCopy: allow.checked, days: +days.value }); await this.copyLink(id); draw(); } catch (er) { UI.toast(er.message); e.target.disabled = false; } } })), out);
      if (!Cloud.session) out.append(el('p', { class: 'on-log', text: 'Para criar links, entre na sua conta (☁ no topo).' }));
      for (const sh of s.shares || []) {
        const url = this.viewerURL(sh.id);
        const live = this.isLive(sh);
        out.append(el('div', { class: 'sh-row' },
          el('div', { class: 'sh-url' }, el('code', { text: url }), el('div', { class: 'muted small', text: `${live ? '🔴 Ao vivo' : '📌 Fixo'} · criado ${new Date(sh.at).toLocaleString('pt-BR')}${sh.upd ? ' · atualizado ' + new Date(sh.upd).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''} · ${sh.allowCopy ? 'cópia permitida' : 'cópia bloqueada'}${sh.expires ? ' · expira ' + new Date(sh.expires).toLocaleDateString('pt-BR') : ''}` })),
          el('div', { class: 'row-btns', style: { flexWrap: 'wrap' } },
            el('button', { class: 'btn sm', text: 'Copiar link', onclick: () => this.copyLink(sh.id) }),
            el('a', { class: 'btn sm', href: 'https://wa.me/?text=' + encodeURIComponent(`${s.title}\n${url}`), target: '_blank', rel: 'noopener', text: 'Enviar no WhatsApp' }),
            el('a', { class: 'btn sm', href: url, target: '_blank', rel: 'noopener', text: 'Abrir' }),
            el('button', { class: 'btn sm', text: live ? '📌 Congelar' : '🔴 Deixar ao vivo', title: live ? 'Parar de atualizar: o link fica com o conteúdo de agora' : 'Voltar a acompanhar as alterações', onclick: async () => { try { await this.publish(s, { id: sh.id, allowCopy: sh.allowCopy, expires: sh.expires || null, live: !live }); UI.toast(live ? 'Link congelado no conteúdo atual' : 'Link ao vivo de novo'); draw(); } catch (er) { UI.toast(er.message); } } }),
            el('button', { class: 'btn sm', text: '↻ Atualizar agora', title: 'Publicar o conteúdo atual no mesmo link', onclick: async () => { try { await this.publish(s, { id: sh.id, allowCopy: sh.allowCopy, live, days: sh.expires ? Math.max(1, Math.round((new Date(sh.expires) - Date.now()) / 86400000)) : 0 }); UI.toast('Link atualizado com o conteúdo atual'); draw(); } catch (er) { UI.toast(er.message); } } }),
            el('button', { class: 'btn sm danger-text', text: 'Revogar', onclick: async () => { if (!await UI.confirm('Revogar link', 'Quem tiver o link não vai mais conseguir abrir. Continuar?', 'Revogar')) return; try { await this.revoke(s, sh.id); UI.toast('Link revogado'); draw(); } catch (er) { UI.toast(er.message); } } }))));
      }
      body.append(card);
    };
    draw();
  },
  async copyLink(id) { const url = this.viewerURL(id); try { await navigator.clipboard.writeText(url); UI.toast('Link copiado!'); } catch (e) { UI.toast(url); } }
};
