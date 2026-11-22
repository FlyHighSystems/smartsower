/* ===== Cadernos compartilhados =====
   • O dono compartilha o caderno (com as seções) com pessoas da equipe.
   • Cada página é "✍️ Colaboração" ou "🔒 Só leitura" — quem define é o autor da página (ou o dono do caderno).
   • Quando duas pessoas mexem na mesma página, junta bloco a bloco; se mexeram no MESMO bloco, guarda as duas versões.
   • O texto escrito por outra pessoa fica marcado na cor dela (ver Authorship). */
const Shared = {
  people: new Map(), // e-mail -> nome
  me() { return Cloud.uid?.() || null; },
  myEmail() { return Team.email(); },
  myName() { const e = this.myEmail(); return this.people.get(e) || e.split('@')[0]; },
  nameOf(email) { return email ? (this.people.get(email) || email.split('@')[0]) : 'alguém'; },
  color(email) { let h = 0; for (const c of String(email)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 70% 42%)`; },
  nbOfPage(s) { const sec = App.meta.sections.find(x => x.id === s?.sec); return sec && App.meta.notebooks.find(n => n.id === sec.nb); },
  isSharedNb(nb) { return !!(nb && (nb.shared || nb.foreign)); },
  inShared(s) { return this.isSharedNb(this.nbOfPage(s)); },
  sharedNbId(s) { const nb = this.nbOfPage(s); return this.isSharedNb(nb) ? nb.id : null; },
  isAuthor(s) { return !s.owner || s.owner === this.me(); },
  isNbOwner(s) { const nb = this.nbOfPage(s); return !!nb && !nb.foreign; },
  mode(s) { const nb = this.nbOfPage(s); return s.shareMode || nb?.shared?.mode || nb?.foreign?.mode || 'edit'; },
  canEdit(s) { if (!s || !this.inShared(s)) return true; return this.isAuthor(s) || this.isNbOwner(s) || this.mode(s) === 'edit'; },
  canDelete(s) { if (!s || !this.inShared(s)) return true; return this.isAuthor(s) || this.isNbOwner(s); },
  authorName(s) { return this.isAuthor(s) ? 'você' : this.nameOf(s.author?.email); },

  async loadPeople() {
    try { const c = JSON.parse(localStorage.getItem('ss-people') || '[]'); c.forEach(p => this.people.set(p.email, p.name || '')); } catch (e) { }
    if (!Cloud.session || !navigator.onLine) return;
    try { const list = await (await Cloud.rest('/rest/v1/rpc/team_people', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json(); if (Array.isArray(list)) { this.people.clear(); list.forEach(p => this.people.set(p.email, p.name || '')); localStorage.setItem('ss-people', JSON.stringify(list)); } } catch (e) { }
  },

  /* ── tela "Compartilhar caderno" (só o dono) ── */
  async open(nb) {
    if (!Cloud.session) return UI.toast('Entre na sua conta (☁) para compartilhar cadernos.');
    if (nb.foreign) return UI.toast('Só o dono pode mudar com quem este caderno é compartilhado.');
    if (this.ready === false) return UI.modal({ title: '👥 Compartilhar cadernos', body: el('p', { html: 'Falta preparar o banco: no Supabase, abra <b>SQL Editor</b>, cole o arquivo <b>supabase-compartilhados.sql</b> e clique em <b>Run</b>. Depois toque em ⟳ e tente de novo.' }) });
    await this.loadPeople();
    const me = this.myEmail(), sel = new Set(nb.shared?.members || []); let mode = nb.shared?.mode || 'edit';
    const body = el('div', { class: 'shr' });
    const m = UI.modal({ title: '👥 Compartilhar “' + nb.name + '”', body, wide: true });
    const draw = () => {
      body.innerHTML = '';
      const others = [...this.people.entries()].filter(([e]) => e !== me);
      body.append(el('p', { class: 'muted small', text: 'As pessoas escolhidas veem este caderno em “Compartilhados comigo”, com todas as seções. Tudo que você criar, copiar ou mover para cá aparece para elas.' }));
      if (!others.length) body.append(el('p', { class: 'on-log', text: 'Ainda não há outras pessoas na equipe. Um administrador cadastra em Equipe › ＋ Adicionar pessoa.' }));
      const list = el('div', { class: 'shr-list' });
      for (const [email, name] of others) list.append(el('label', { class: 'shr-p' }, el('input', { type: 'checkbox', checked: sel.has(email), onchange: e => { e.target.checked ? sel.add(email) : sel.delete(email); } }), el('span', { class: 'shr-dot', style: { background: this.color(email) } }), el('b', { text: name || email.split('@')[0] }), el('span', { class: 'muted small', text: email })));
      body.append(list,
        el('div', { class: 'shr-mode' }, el('b', { text: 'Páginas novas neste caderno começam como:' }),
          el('label', {}, el('input', { type: 'radio', name: 'shm', checked: mode === 'edit', onchange: () => mode = 'edit' }), ' ✍️ Colaboração — todos podem escrever'),
          el('label', {}, el('input', { type: 'radio', name: 'shm', checked: mode === 'read', onchange: () => mode = 'read' }), ' 🔒 Só leitura — só o autor escreve'),
          el('p', { class: 'muted small', text: 'Cada página pode ser trocada depois, no topo dela, pelo autor ou por você.' })),
        el('div', { class: 'row-btns' },
          el('button', { class: 'btn primary', text: nb.shared ? 'Salvar' : 'Compartilhar', onclick: async e => { e.target.disabled = true; try { await this.share(nb, [...sel], mode); m.close(); } catch (x) { UI.toast(x.message); e.target.disabled = false; } } }),
          nb.shared ? el('button', { class: 'btn danger', text: 'Parar de compartilhar', onclick: async () => { if (!await UI.confirm('Parar de compartilhar', `As pessoas deixam de ver “${nb.name}”. As páginas que elas escreveram aqui continuam com elas.`, 'Parar')) return; try { await this.unshare(nb); m.close(); } catch (x) { UI.toast(x.message); } } }) : null));
    };
    draw();
  },
  nbData(nb) {
    return { name: nb.name, color: nb.color, kind: nb.kind || '', mode: nb.shared?.mode || 'edit', ownerEmail: this.myEmail(), ownerName: this.myName(),
      sections: App.meta.sections.filter(x => x.nb === nb.id).map(({ id, name, color, kind, level, order }) => ({ id, name, color, kind, level, order })) };
  },
  async share(nb, emails, mode) {
    nb.shared = { members: emails, mode, at: Date.now() };
    await this.pushNb(nb);
    // páginas do caderno passam a subir marcadas como compartilhadas
    for (const s of App.sermons.values()) if (this.nbOfPage(s) === nb) { s.shareMode ||= mode; s.author ||= { email: this.myEmail() }; delete Cloud.st.synced[s.id]; App.pending.add(s.id); }
    App.saveMeta(); App.renderNav(); if (App.cur) App.renderEditor(); Cloud.saveState(); Cloud.schedule(200);
    UI.toast(emails.length ? `Compartilhado com ${emails.length} pessoa(s)` : 'Caderno pronto para compartilhar — escolha as pessoas');
  },
  async pushNb(nb) {
    await Cloud.rest('/rest/v1/shared_nbs?on_conflict=id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: nb.id, owner: this.me(), data: this.nbData(nb), updated_at: Date.now(), deleted: false }) });
    const cur = await (await Cloud.rest(`/rest/v1/shared_members?select=email&nb_id=eq.${encodeURIComponent(nb.id)}`)).json();
    const want = new Set(nb.shared.members), have = new Set(cur.map(x => x.email));
    const del = [...have].filter(e => !want.has(e)), add = [...want].filter(e => !have.has(e));
    if (del.length) await Cloud.rest(`/rest/v1/shared_members?nb_id=eq.${encodeURIComponent(nb.id)}&email=in.(${del.map(e => `"${e}"`).join(',')})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    if (add.length) await Cloud.rest('/rest/v1/shared_members', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(add.map(email => ({ nb_id: nb.id, email }))) });
    nb.shared.sig = JSON.stringify(this.nbData(nb));
  },
  async unshare(nb) {
    await Cloud.rest(`/rest/v1/shared_nbs?id=eq.${encodeURIComponent(nb.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ deleted: true, updated_at: Date.now() }) });
    delete nb.shared;
    for (const s of App.sermons.values()) if (this.nbOfPage(s) === nb && this.isAuthor(s)) { delete Cloud.st.synced[s.id]; App.pending.add(s.id); }
    App.saveMeta(); App.renderNav(); if (App.cur) App.renderEditor(); Cloud.saveState(); Cloud.schedule(200); UI.toast('Caderno não é mais compartilhado');
  },
  async leave(nb) {
    if (!await UI.confirm('Sair do caderno', `Você deixa de ver “${nb.name}”. Só o dono consegue te incluir de novo.`, 'Sair')) return;
    try { await Cloud.rest(`/rest/v1/shared_members?nb_id=eq.${encodeURIComponent(nb.id)}&email=eq.${encodeURIComponent(this.myEmail())}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); } catch (e) { return UI.toast(e.message); }
    this.dropForeign(nb.id); App.saveMeta(); App.renderNav();
  },

  /* ── sincronização ── */
  async sync() {
    if (!Cloud.session) return;
    await this.loadPeople();
    // 1) meus cadernos compartilhados que mudaram (nome, seções)
    if (this.ready !== false) for (const nb of App.meta.notebooks) if (nb.shared && nb.shared.sig !== JSON.stringify(this.nbData(nb))) await this.pushNb(nb);
    // 2) cadernos compartilhados comigo
    let rows; try { rows = await (await Cloud.rest('/rest/v1/shared_nbs?select=id,owner,data,deleted')).json(); this.ready = true; } catch (e) { if (/does not exist|Could not find|não existem|schema cache/i.test(e.message)) { this.ready = false; return; } throw e; }
    const me = this.me(), seen = new Set();
    for (const r of rows) {
      if (r.owner === me) continue; if (r.deleted) continue; seen.add(r.id);
      const d = r.data || {}; let nb = App.meta.notebooks.find(n => n.id === r.id);
      if (!nb) { nb = { id: r.id }; App.meta.notebooks.push(nb); }
      Object.assign(nb, { name: d.name || 'Caderno', color: d.color, kind: d.kind || '', foreign: { owner: r.owner, ownerEmail: d.ownerEmail, ownerName: d.ownerName, mode: d.mode || 'edit' } });
      const secIds = new Set((d.sections || []).map(x => x.id));
      App.meta.sections = App.meta.sections.filter(x => x.nb !== r.id || secIds.has(x.id));
      for (const sx of d.sections || []) { const ex = App.meta.sections.find(x => x.id === sx.id); if (ex) Object.assign(ex, sx, { nb: r.id, foreign: true }); else App.meta.sections.push({ ...sx, nb: r.id, foreign: true }); }
    }
    for (const nb of [...App.meta.notebooks]) if (nb.foreign && !seen.has(nb.id)) this.dropForeign(nb.id);
    // 3) páginas de cada caderno compartilhado (meus e dos outros)
    for (const nb of App.meta.notebooks.filter(n => this.isSharedNb(n))) await this.pullPages(nb);
    App.renderNav();
  },
  dropForeign(nbId) {
    const secIds = new Set(App.meta.sections.filter(x => x.nb === nbId).map(x => x.id)), me = this.me();
    const keep = App.meta.sections.find(x => !secIds.has(x.id) && !x.foreign);
    let moved = 0;
    for (const s of [...App.sermons.values()]) if (secIds.has(s.sec)) {
      if (s.owner && s.owner !== me) { App.sermons.delete(s.id); DB.del('sermons', s.id); delete Cloud.st.synced[s.id]; }
      else if (keep) { s.sec = keep.id; s.updated = Date.now(); App.pending.add(s.id); moved++; }
    }
    App.meta.sections = App.meta.sections.filter(x => !secIds.has(x.id)); App.meta.notebooks = App.meta.notebooks.filter(n => n.id !== nbId);
    if (App.meta.currentNb === nbId) { App.meta.currentNb = App.meta.notebooks[0]?.id; App.meta.currentSec = App.meta.sections.find(x => x.nb === App.meta.currentNb)?.id; }
    if (App.cur && !App.sermons.has(App.cur.id)) { App.cur = null; App.renderEditor(); }
    if (moved) UI.toast(`${moved} página(s) sua(s) de um caderno que deixou de ser compartilhado foram para “${keep.name}”.`);
    App._save?.();
  },
  async pullPages(nb) {
    const me = this.me(), st = Cloud.st; st.sharedCur ||= {}; st.owners ||= {};
    let cur = st.sharedCur[nb.id] || 0, more = true, got = 0;
    while (more) {
      const rows = await (await Cloud.rest(`/rest/v1/sermons?select=user_id,id,updated_at,deleted,server_updated&shared_nb=eq.${encodeURIComponent(nb.id)}&server_updated=gt.${cur}&order=server_updated.asc&limit=500`)).json();
      more = rows.length === 500; const need = [];
      for (const row of rows) {
        cur = Math.max(cur, row.server_updated);
        if (row.user_id === me) continue;                 // as minhas vêm pela sincronização normal
        st.owners[row.id] = row.user_id;
        const local = App.sermons.get(row.id);
        if (row.deleted) { if (local) { App.sermons.delete(row.id); DB.del('sermons', row.id); got++; } delete st.synced[row.id]; continue; }
        if (local && (st.synced[row.id] || 0) === row.updated_at) continue;
        need.push(row);
      }
      for (let i = 0; i < need.length; i += 40) {
        const part = need.slice(i, i + 40), ids = part.map(x => `"${x.id}"`).join(',');
        const full = await (await Cloud.rest(`/rest/v1/sermons?select=user_id,id,data,updated_at&shared_nb=eq.${encodeURIComponent(nb.id)}&id=in.(${encodeURIComponent(ids)})`)).json();
        for (const row of full) { if (row.user_id === me) continue; await this.receive(row); got++; }
      }
    }
    st.sharedCur[nb.id] = cur;
    // páginas que saíram do caderno (movidas pelo autor) somem daqui
    try {
      const live = new Set((await (await Cloud.rest(`/rest/v1/sermons?select=id&shared_nb=eq.${encodeURIComponent(nb.id)}&deleted=is.false`)).json()).map(x => x.id));
      const secIds = new Set(App.meta.sections.filter(x => x.nb === nb.id).map(x => x.id));
      for (const s of [...App.sermons.values()]) if (secIds.has(s.sec) && s.owner && s.owner !== me && !live.has(s.id) && Cloud.st.synced[s.id]) { App.sermons.delete(s.id); DB.del('sermons', s.id); got++; }
    } catch (e) { }
    Cloud.saveState(); if (got) Cloud.res.down = (Cloud.res.down || 0) + got;
  },
  /* chega uma versão de outra pessoa (ou minha página editada por outra pessoa) */
  async receive(row) {
    const local = App.sermons.get(row.id), synced = Cloud.st.synced[row.id] || 0, remoteSnap = structuredClone(row.data);
    let s = row.data; s.id = row.id; s.updated = row.updated_at;
    if (row.user_id && row.user_id !== this.me()) s.owner = row.user_id; else delete s.owner;
    if (local && local.updated > synced && synced) { // mudou aqui também: junta bloco a bloco
      const base = await DB.get('kv', 'base:' + row.id);
      s = this.merge(base, local, s); s.updated = Date.now(); App.pending.add(s.id); this.conflicts += s._conf || 0; delete s._conf;
    }
    await Cloud.inflateImages(s);
    App.sermons.set(s.id, s); await DB.put('sermons', s.id, s);
    Cloud.st.synced[s.id] = s.updated === row.updated_at ? row.updated_at : synced; // se juntou, ainda falta enviar
    await this.saveBase({ data: remoteSnap }, row.id);
    if (App.cur?.id === s.id) this.refreshOpen(s);
  },
  async saveBase(row, id) { try { const d = row.data || row; await DB.put('kv', 'base:' + id, { title: d.title, blocks: (d.blocks || []).map(b => ({ ...b })) }); } catch (e) { } },
  sig(b) { const { by, at, conflict, ...rest } = b || {}; return JSON.stringify(rest); },
  merge(base, local, remote) {
    const B = new Map((base?.blocks || []).map(b => [b.id, b])), L = new Map(local.blocks.map(b => [b.id, b])), out = [];
    let conf = 0; const used = new Set();
    for (const r of remote.blocks || []) {
      const l = L.get(r.id), b = B.get(r.id); used.add(r.id);
      if (!l) { if (b && this.sig(r) === this.sig(b)) continue; out.push(r); continue; }       // apaguei aqui e o outro não mexeu → fica apagado
      const lc = !b || this.sig(l) !== this.sig(b), rc = !b || this.sig(r) !== this.sig(b);
      if (lc && rc && this.sig(l) !== this.sig(r)) { out.push(r); out.push({ ...l, id: uid(), conflict: { by: this.myEmail(), at: Date.now() } }); conf++; }
      else out.push(lc ? l : r);
    }
    // blocos que só existem aqui
    local.blocks.forEach((l, i) => {
      if (used.has(l.id)) return; const b = B.get(l.id);
      if (b && this.sig(l) === this.sig(b)) return;                                              // o outro apagou e eu não mexi → apaga
      const prev = local.blocks.slice(0, i).reverse().find(x => out.some(o => o.id === x.id));
      const at = prev ? out.findIndex(o => o.id === prev.id) + 1 : 0; out.splice(at, 0, l);
    });
    const tl = local.title !== base?.title, tr = remote.title !== base?.title;
    return { ...remote, title: tl && !tr ? local.title : remote.title, blocks: out, _conf: conf };
  },
  refreshOpen(s) {
    const editing = document.activeElement && $('#editor').contains(document.activeElement);
    if (editing) UI.toast(`${this.nameOf(s.lastBy)} alterou esta página.`, { label: 'Atualizar', fn: () => { App.cur = App.sermons.get(s.id); App.renderEditor(); } });
    else { App.cur = s; App.renderEditor(); }
  },
  /* envio das páginas de outras pessoas (que eu posso editar) */
  async pushOthers() {
    const me = this.me(), st = Cloud.st;
    for (const s of App.sermons.values()) {
      if (!s.owner || s.owner === me || (st.synced[s.id] || 0) >= s.updated) continue;
      if (!this.canEdit(s)) { st.synced[s.id] = s.updated; continue; }
      if (await Cloud.uploadImages(s)) await DB.put('sermons', s.id, s);
      s.lastBy = this.myEmail();
      const data = Cloud.outbound(s); delete data.owner;
      const r = await Cloud.rest(`/rest/v1/sermons?user_id=eq.${s.owner}&id=eq.${encodeURIComponent(s.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ data, updated_at: s.updated, shared_nb: this.sharedNbId(s) }) });
      const back = await r.json().catch(() => []);
      if (!back.length) { UI.toast(`Não deu para salvar “${s.title}”: a página ficou só leitura.`); delete st.sharedCur[this.sharedNbId(s)]; }
      st.synced[s.id] = s.updated; await this.saveBase({ data }, s.id);
    }
    for (const [id, t] of Object.entries(st.otherTombs || {})) {
      try { await Cloud.rest(`/rest/v1/sermons?user_id=eq.${t.owner}&id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ deleted: true, updated_at: t.ts }) }); } catch (e) { }
      delete st.otherTombs[id];
    }
    Cloud.saveState();
  },
  /* ── no editor: aviso de só leitura, seletor de permissão ── */
  headControls(s) {
    if (!this.inShared(s)) return null;
    const nb = this.nbOfPage(s), canSet = this.isAuthor(s) || this.isNbOwner(s), mode = this.mode(s);
    const who = nb.foreign ? `Caderno de ${nb.foreign.ownerName || this.nameOf(nb.foreign.ownerEmail)}` : `Compartilhado com ${(nb.shared?.members || []).length} pessoa(s)`;
    const box = el('div', { class: 'shr-head' }, el('span', { class: 'shr-tag', text: '👥 ' + who + (this.isAuthor(s) ? '' : ` · página de ${this.authorName(s)}`) }));
    if (canSet) {
      const sel = el('select', { title: 'Quem pode escrever nesta página' }, el('option', { value: 'edit', text: '✍️ Colaboração', selected: mode === 'edit' }), el('option', { value: 'read', text: '🔒 Só leitura', selected: mode === 'read' }));
      sel.onchange = () => { s.shareMode = sel.value; App.touch(s); App.renderEditor(); };
      box.append(sel);
    } else box.append(el('span', { class: 'shr-tag ' + (mode === 'edit' ? 'ok' : 'ro'), text: mode === 'edit' ? '✍️ Você pode colaborar' : '🔒 Só leitura' }));
    const cs = Authorship.contributors(s);
    if (cs.size) {
      box.append(el('span', { class: 'shr-who' }, 'Contribuições: ', ...[...cs.keys()].map(e => el('span', { class: 'shr-c', style: { '--by': this.color(e) }, text: this.nameOf(e) }))));
      if (canSet) box.append(el('button', { class: 'btn sm', text: '✓ Aceitar todas', title: 'Tira as marcas e deixa o texto limpo', onclick: () => Authorship.acceptAll(s) }));
    }
    return box;
  },
  decorate(s) {
    if (!s || Book.is(s) && !this.inShared(s)) { document.body.classList.remove('page-ro'); return; }
    $('#editor-inner .shr-head')?.remove(); $('#editor-inner .ro-banner')?.remove();
    const h = this.headControls(s); if (h) { const meta = $('#editor-inner .s-meta') || $('#editor-inner .bk-head'); meta ? meta.after(h) : $('#editor-inner').prepend(h); }
    this.lockEditor(s); Authorship.attach(s);
    const del = $('#s-del'); if (del) del.hidden = !this.canDelete(s);
  },
  afterBlocks(s) {
    if (!s || !this.inShared(s)) return;
    for (const w of $$('#blocks .block')) {
      const b = s.blocks.find(x => x.id === w.dataset.id); if (!b) continue;
      if (b.conflict) { w.classList.add('b-conflict'); w.prepend(el('div', { class: 'conf-tag', html: b.conflict.by === this.myEmail() ? '⚠ <b>Sua versão</b> — você e outra pessoa mexeram neste trecho ao mesmo tempo; a versão dela está logo acima. Fique com a melhor e apague a outra.' : `⚠ <b>Versão de ${esc(this.nameOf(b.conflict.by))}</b> — ela e outra pessoa mexeram neste trecho ao mesmo tempo. Fique com a melhor e apague a outra.`, onclick: e => { if (e.target.closest('button')) return; } }, el('button', { class: 'btn sm', text: 'Manter esta e tirar o aviso', onclick: () => { delete b.conflict; App.touch(s); App.renderBlocks(); } }))); }
      if (b.by && b.by !== s.author?.email) { const t = w.querySelector('.b-tag'); t && t.after(el('span', { class: 'by-tag', style: { '--by': this.color(b.by) }, text: '✎ ' + this.nameOf(b.by), title: 'Último a mexer neste bloco' + (b.at ? ' · ' + new Date(b.at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') })); }
    }
    this.lockEditor(s, true);
  },
  lockEditor(s, quiet) {
    document.body.classList.toggle('page-ro', !this.canEdit(s));
    if (this.canEdit(s)) return;
    const ed = $('#editor-inner');
    ed.querySelectorAll('[contenteditable]').forEach(e => e.setAttribute('contenteditable', 'false'));
    ed.querySelectorAll('input, select, textarea').forEach(e => { if (!e.closest('.shr-head')) e.disabled = true; });
    if (!quiet && !ed.querySelector('.ro-banner')) ed.prepend(el('div', { class: 'ro-banner', text: `🔒 Somente leitura — página de ${this.authorName(s)}. Só o autor ou o dono do caderno podem abrir para colaboração.` }));
  },
  init() {
    setInterval(() => { if (App.cur && this.inShared(App.cur) && !document.hidden && Cloud.session) Cloud.schedule(100); }, 45000);
  }
};

/* ===== Autoria no texto: o que outra pessoa escreve fica sublinhado na cor dela ===== */
const Authorship = {
  attach(s) {
    this.mo?.disconnect(); this.s = s; this.pending = new Map(); this.composing = false;
    const host = $('#blocks'); if (!host) return;
    host.onclick = e => { const sp = e.target.closest?.('span.by'); if (sp) this.info(sp); };
    if (!s || !Shared.inShared(s) || !Shared.canEdit(s) || Shared.isAuthor(s)) return; // o autor escreve "limpo"
    this.me = Shared.myEmail(); if (!this.me) return;
    this.mo = new MutationObserver(recs => this.collect(recs));
    this.mo.observe(host, { subtree: true, characterData: true, characterDataOldValue: true, childList: true });
    host.addEventListener('compositionstart', () => this.composing = true);
    host.addEventListener('compositionend', () => { this.composing = false; setTimeout(() => this.flush(), 0); });
  },
  body(n) { return (n.nodeType === 1 ? n : n.parentElement)?.closest?.('#blocks .b-body[contenteditable="true"]'); },
  mine(n) { const sp = (n.nodeType === 1 ? n : n.parentElement)?.closest?.('span.by'); return sp && sp.dataset.by === this.me; },
  collect(recs) {
    for (const r of recs) {
      if (r.type === 'characterData') { if (!this.pending.has(r.target)) this.pending.set(r.target, r.oldValue ?? ''); }
      else for (const a of r.addedNodes) {
        if (a.nodeType === 3) { if (!this.pending.has(a)) this.pending.set(a, ''); }
        else if (a.nodeType === 1) { const w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT); for (let t; (t = w.nextNode());) if (!this.pending.has(t)) this.pending.set(t, ''); }
      }
    }
    if (!this.composing) this.flush();
  },
  flush() {
    if (!this.pending.size || !this.mo) return;
    const items = [...this.pending]; this.pending.clear();
    const sel = getSelection(), an = sel.rangeCount ? sel.anchorNode : null, ao = sel.anchorOffset; let caret = null;
    const touched = new Set();
    for (const [n, old] of items) {
      if (!n.isConnected || !n.data || this.mine(n)) continue;
      const body = this.body(n); if (!body) continue;
      const v = n.data; let p = 0; while (p < old.length && p < v.length && old[p] === v[p]) p++;
      let q = 0; while (q < old.length - p && q < v.length - p && old[old.length - 1 - q] === v[v.length - 1 - q]) q++;
      const len = v.length - p - q; if (len <= 0 || !v.slice(p, p + len).replace(/​/g, '').length) continue;
      let mid = n; if (p > 0) mid = n.splitText(p); let tail = null; if (len < mid.data.length) tail = mid.splitText(len);
      const sp = document.createElement('span'); sp.className = 'by'; sp.dataset.by = this.me; sp.dataset.at = new Date().toISOString().slice(0, 10);
      sp.style.setProperty('--by', Shared.color(this.me)); sp.title = 'Escrito por ' + Shared.myName();
      mid.replaceWith(sp); sp.append(mid);
      if (an === n) { if (ao >= p && ao <= p + len) caret = [mid, ao - p]; else if (ao > p + len && tail) caret = [tail, ao - p - len]; }
      touched.add(body);
    }
    this.mo.takeRecords(); // ignora as mudanças que nós mesmos fizemos
    if (caret) { const r = document.createRange(); r.setStart(caret[0], Math.min(caret[1], caret[0].data.length)); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
    for (const body of touched) {
      const id = body.closest('.block')?.dataset.id, b = this.s?.blocks.find(x => x.id === id);
      if (b) { b.by = this.me; b.at = Date.now(); }
      body.dispatchEvent(new Event('input', { bubbles: true }));
    }
    this.mo.takeRecords();
  },
  info(sp) {
    const who = Shared.nameOf(sp.dataset.by), when = sp.dataset.at ? new Date(sp.dataset.at + 'T12:00').toLocaleDateString('pt-BR') : '';
    const s = App.cur, can = s && (Shared.isAuthor(s) || Shared.isNbOwner(s));
    UI.toast(`✎ Escrito por ${who}${when ? ' em ' + when : ''}`, can ? { label: 'Aceitar', fn: () => { const body = sp.closest('.b-body'); sp.replaceWith(...sp.childNodes); body?.dispatchEvent(new Event('input', { bubbles: true })); } } : undefined);
  },
  contributors(s) {
    const set = new Map();
    for (const b of s.blocks) for (const m of String(b.html || '').matchAll(/data-by="([^"]+)"/g)) set.set(m[1], (set.get(m[1]) || 0) + 1);
    return set;
  },
  acceptAll(s) {
    for (const b of s.blocks) if (b.html?.includes('data-by=')) { const d = document.createElement('div'); d.innerHTML = b.html; d.querySelectorAll('span.by').forEach(x => x.replaceWith(...x.childNodes)); b.html = d.innerHTML; delete b.by; }
    App.touch(s); App.renderEditor(); UI.toast('Contribuições aceitas — o texto ficou limpo');
  }
};
