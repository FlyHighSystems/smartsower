/* ===== Nuvem (Supabase): login e sincronização entre aparelhos =====
   Offline-first: o app trabalha sempre na cópia local (IndexedDB) e sincroniza em segundo plano.
   Sem bibliotecas: fala direto com as APIs REST do Supabase (Auth, PostgREST e Storage). */
const Cloud = {
  session: null, status: 'off', syncing: false, again: false, lastError: '', timer: null,
  st: { synced: {}, tombs: {}, lastPull: 0, lastMeta: 0, metaSynced: 0, at: 0 }, // estado de sincronização (por aparelho)

  /* ---------- configuração ---------- */
  cfg() {
    let local = {}; try { local = JSON.parse(localStorage.getItem('ss-cloud') || '{}'); } catch (e) { }
    const g = window.SMARTSOWER_CONFIG || window.SMARTSERMON_CONFIG || {};
    const url = (local.url || g.supabaseUrl || '').trim().replace(/\/+$/, '');
    const key = (local.key || g.supabaseAnonKey || '').trim();
    return { url, key };
  },
  configured() { const c = this.cfg(); return /^https:\/\/.+/.test(c.url) && c.key.length > 20; },
  saveCfg(url, key) { try { localStorage.setItem('ss-cloud', JSON.stringify({ url, key })); } catch (e) { } },
  redirect() { return location.origin + location.pathname; },

  /* ---------- sessão ---------- */
  loadSession() { try { this.session = JSON.parse(localStorage.getItem('ss-session') || 'null'); } catch (e) { this.session = null; } },
  saveSession(s) { this.session = s; try { s ? localStorage.setItem('ss-session', JSON.stringify(s)) : localStorage.removeItem('ss-session'); } catch (e) { } },
  sessionFrom(j) { return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + ((+j.expires_in || 3600) - 60) * 1000, user: j.user ? { id: j.user.id, email: j.user.email } : this.session?.user }; },
  userFromToken(t) { try { const c = JSON.parse(decodeURIComponent(escape(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); return { id: c.sub, email: c.email }; } catch (e) { return null; } },
  /* Volta do Google / link mágico: tokens chegam no #hash da URL */
  captureRedirect() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('access_token')) {
      const s = this.sessionFrom({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: h.get('expires_in') });
      s.user = this.userFromToken(s.access_token); this.saveSession(s);
      history.replaceState(null, '', location.pathname + location.search);
      return 'ok';
    }
    if (h.get('error_description') || h.get('error')) { const m = this.authMsg(h.get('error_description') || h.get('error')); history.replaceState(null, '', location.pathname + location.search); return m; }
    return null;
  },
  /* Entrada vinda do Church2all: o painel da igreja manda dois códigos de uso único no #c2a=… (nunca vão a servidor):
     o do SmartSower (a conta da pessoa aqui) e o do Church2all (para o caderno da igreja, numa próxima etapa).
     Se este aparelho já está com OUTRA conta, não troca sozinho (os cadernos locais iriam para a conta errada). */
  async captureChurch2all() {
    const m = /(?:^#|&)c2a=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return null;
    history.replaceState(null, '', location.pathname + location.search.replace(/[?&]from=church2all/, '').replace(/^&/, '?'));
    let p; try { p = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return 'O link do Church2all veio incompleto. Abra o SmartSower de novo pelo painel.'; }
    if (!p || !p.ss || !p.email) return 'O link do Church2all veio incompleto. Abra o SmartSower de novo pelo painel.';
    const cur = (this.session?.user?.email || '').toLowerCase();
    if (cur && cur !== String(p.email).toLowerCase())
      return `Este aparelho está conectado como ${cur}. Para entrar como ${p.email} (${p.church?.name || 'Church2all'}), use ☁ › "Sair e apagar deste aparelho" e abra o SmartSower de novo pelo Church2all.`;
    try {
      const j = await this.auth('verify', { type: 'magiclink', token_hash: p.ss });
      this.saveSession(this.sessionFrom(j));
    } catch (e) { return 'Não foi possível entrar pelo Church2all (o link vale uma vez e por pouco tempo). Abra de novo pelo painel.'; }
    const info = { church: p.church || {}, role: p.role || '', name: p.name || '', email: p.email, at: Date.now() };
    if (p.c2a && p.api && /^https:\/\//.test(p.api.url || '')) {   // sessão no Church2all, para o caderno da igreja
      try {
        const r = await fetch(`${p.api.url}/auth/v1/verify`, { method: 'POST', headers: { apikey: p.api.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: p.c2a }) });
        const j = await r.json();
        if (r.ok && j.access_token) info.c2a = { url: p.api.url, key: p.api.key, session: this.sessionFrom(j) };
      } catch (e) { /* o caderno da igreja tenta de novo depois */ }
    }
    try { localStorage.setItem('ss-c2a', JSON.stringify(info)); } catch (e) { }
    return 'c2a';
  },
  c2a() { try { return JSON.parse(localStorage.getItem('ss-c2a') || 'null'); } catch (e) { return null; } },
  async auth(path, body, method = 'POST') {
    const c = this.cfg();
    const r = await fetch(`${c.url}/auth/v1/${path}`, { method, headers: { apikey: c.key, 'Content-Type': 'application/json', ...(this.session && path === 'user' ? { Authorization: 'Bearer ' + this.session.access_token } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(this.authMsg(j.error_description || j.msg || j.message || j.error || ('Erro ' + r.status)));
    return j;
  },
  authMsg(m) {
    const map = [[/SS_NOT_INVITED|Database error saving new user|Signups not allowed|signup.*disabled/i, 'Este e-mail não está cadastrado na equipe do SmartSower. Peça ao administrador para liberar o seu acesso.'], [/Invalid login credentials/i, 'E-mail ou senha incorretos.'], [/Email not confirmed/i, 'Confirme seu e-mail: abra o link que o Supabase enviou e depois entre de novo.'],
      [/User already registered/i, 'Este e-mail já tem conta. Use “Entrar”.'], [/Password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
      [/rate limit|For security purposes/i, 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.'], [/provider is not enabled|Unsupported provider/i, 'O login com Google não está ativado no seu projeto Supabase (Authentication › Providers › Google).']];
    for (const [rx, t] of map) if (rx.test(m)) return t; return m;
  },
  async signIn(email, password) { const j = await this.auth('token?grant_type=password', { email, password }); this.saveSession(this.sessionFrom(j)); },
  async signUp(email, password) {
    const j = await this.auth(`signup?redirect_to=${encodeURIComponent(this.redirect())}`, { email, password });
    if (j.access_token) { this.saveSession(this.sessionFrom(j)); return 'in'; }
    return 'confirm';
  },
  async magicLink(email) { await this.auth(`otp?redirect_to=${encodeURIComponent(this.redirect())}`, { email, create_user: true }); },
  async providers(fresh) {
    if (this._prov && !fresh) return this._prov;
    try { const c = this.cfg(); const r = await fetch(`${c.url}/auth/v1/settings`, { headers: { apikey: c.key } }); const j = await r.json(); this._prov = { ...(j.external || {}), __disableSignup: !!j.disable_signup }; } catch (e) { this._prov = {}; }
    return this._prov;
  },
  google() { const c = this.cfg(); location.href = `${c.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(this.redirect())}`; },
  async signOut() {
    try { localStorage.removeItem('ss-role'); localStorage.removeItem('ss-c2a'); } catch (e) { }
    try { const c = this.cfg(); await fetch(`${c.url}/auth/v1/logout`, { method: 'POST', headers: { apikey: c.key, Authorization: 'Bearer ' + this.session?.access_token } }); } catch (e) { }
    this.saveSession(null); this.setStatus('out');
  },
  async token() {
    if (!this.session) throw Object.assign(new Error('Entre na sua conta'), { auth: true });
    if (Date.now() < this.session.expires_at) return this.session.access_token;
    const c = this.cfg();
    const r = await fetch(`${c.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { apikey: c.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: this.session.refresh_token }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { if (r.status >= 400 && r.status < 500) { this.saveSession(null); throw Object.assign(new Error('Sessão expirada. Entre novamente.'), { auth: true }); } throw new Error('Sem conexão com o Supabase'); }
    this.saveSession(this.sessionFrom(j)); return this.session.access_token;
  },
  async rest(path, opts = {}) {
    const c = this.cfg(); const t = await this.token();
    const r = await fetch(`${c.url}${path}`, { ...opts, headers: { apikey: c.key, Authorization: 'Bearer ' + t, ...(opts.headers || {}) } });
    if (r.status === 401) { this.session.expires_at = 0; throw Object.assign(new Error('Sessão expirada'), { retry: true }); }
    if (!r.ok) { let m = 'Erro ' + r.status; try { const j = await r.json(); m = j.message || j.error || m; } catch (e) { } if (/relation .* does not exist|Could not find the table/i.test(m)) m = 'As tabelas não existem no Supabase. Rode o script supabase.sql no SQL Editor.'; throw new Error(m); }
    return r;
  },

  /* ---------- estado ---------- */
  async init() {
    this.loadSession();
    const viaC2a = await this.captureChurch2all();
    const back = viaC2a === 'c2a' ? 'ok' : viaC2a || this.captureRedirect();
    this.st = Object.assign(this.st, (await DB.get('kv', 'sync')) || {});
    window.addEventListener('online', () => this.schedule(500));
    window.addEventListener('offline', () => this.setStatus('offline'));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.schedule(800); });
    window.addEventListener('storage', e => { if (e.key === 'ss-session') { this.loadSession(); this.schedule(300); } }); // login feito em outra aba/janela
    $('#btn-cloud').onclick = () => CloudUI.open();
    Gate.back = back;
    if (viaC2a === 'c2a') { try { C2aBar.init(); } catch (e) { } }
    if (viaC2a === 'c2a') UI.toast(`Conectado pelo Church2all — ${this.c2a()?.church?.name || ''}. Sincronizando…`);
    else if (back === 'ok') UI.toast('Conectado à nuvem. Sincronizando…'); else if (back && this.session) UI.toast('Login: ' + back);
    this.timer = setInterval(() => this.schedule(0), 90000);
    if (!this.configured()) this.setStatus('setup'); else if (!this.session) this.setStatus('out'); else this.schedule(300);
  },
  saveState: debounce(() => DB.put('kv', 'sync', Cloud.st), 300),
  pendingCount() { return [...App.sermons.values()].filter(s => !s.welcome && (this.st.synced[s.id] || 0) < s.updated).length + Object.keys(this.st.tombs || {}).length; },
  hhmm(t) { return t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; },
  setStatus(s, extra) {
    this.status = s; const b = $('#btn-cloud'); if (!b) return;
    const pend = this.session ? this.pendingCount() : 0;
    const L = { setup: ['☁', 'Configurar nuvem'], out: ['☁', 'Entrar'], syncing: ['⟳', this.progText() || 'Sincronizando…'], ok: ['☁✓', 'Sincronizado ' + this.hhmm(this.st.at)],
      offline: ['☁', 'Offline' + (pend ? ` · ${pend} a enviar` : '')], error: ['☁!', 'Erro — toque para ver'], pending: ['☁', pend ? `${pend} a enviar` : 'Alterações pendentes'] }[s];
    b.dataset.state = s;
    // depois da 1ª sincronização ao abrir o app, fica discreto: só o ícone, sem texto nem animação
    if (s === 'ok' && !this.quiet && !this._qt) this._qt = setTimeout(() => { this.quiet = true; this.setStatus(this.status); }, 4000);
    if (this.quiet && ['syncing', 'ok', 'pending', 'offline', 'error'].includes(s)) {
      b.innerHTML = ''; b.dataset.quiet = '1';
      b.append(el('span', { class: 'cl-i', text: '☁' }), s === 'error' || s === 'offline' ? el('span', { class: 'cl-dot ' + s }) : '');
      b.title = s === 'ok' ? `Tudo sincronizado às ${this.hhmm(this.st.at)} — clique para detalhes` : s === 'syncing' ? 'Sincronizando em segundo plano…' : (extra || L[1]);
      typeof TopFit !== 'undefined' && TopFit.fit(); this.listeners.forEach(f => f()); return;
    }
    delete b.dataset.quiet;
    if (s === 'syncing') { b.innerHTML = ''; b.append(this.ring(), el('span', { class: 'cl-t', text: L[1] })); }
    else { b.innerHTML = ''; const [pre, tail] = s === 'ok' ? ['Sincronizado ', this.hhmm(this.st.at)] : ['', L[1]];
      b.append(el('span', { class: 'cl-i', text: L[0] + ' ' }), pre ? el('span', { class: 'cl-x', text: pre }) : '', el('span', { class: 'cl-t', text: tail })); }
    typeof TopFit !== 'undefined' && TopFit.fit();
    b.title = s === 'ok' ? `Tudo sincronizado às ${this.hhmm(this.st.at)}` : (extra || L[1]);
    this.paintBar(); this.listeners.forEach(f => f());
  },
  /* progresso: barra fina no topo + texto no botão da nuvem + painel da conta */
  listeners: new Set(),
  prog: null,
  setProg(p) { this.prog = p; const t = $('#btn-cloud .cl-t'); if (t && this.status === 'syncing') t.textContent = this.progText() || 'Sincronizando…'; this.paintBar(); this.listeners.forEach(f => f()); },
  /* anel de progresso ao lado do texto da nuvem */
  ring() { const NS = 'http://www.w3.org/2000/svg'; const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 20 20'); s.setAttribute('class', 'cl-ring');
    s.innerHTML = '<circle cx="10" cy="10" r="8" class="bg"/><circle cx="10" cy="10" r="8" class="fg" pathLength="100"/>'; return s; },
  progText() { const p = this.prog; if (!p) return ''; return p.total ? `${p.label} ${Math.min(p.done, p.total)}/${p.total}` : p.label; },
  paintBar() {
    const r = $('#btn-cloud .cl-ring'); if (!r || this.status !== 'syncing') return;
    const p = this.prog, fg = r.querySelector('.fg');
    if (p?.total) { r.classList.remove('ind'); fg.style.strokeDasharray = `${Math.max(3, Math.round(Math.min(p.done, p.total) / p.total * 100))} 100`; }
    else { r.classList.add('ind'); fg.style.strokeDasharray = '28 100'; }
  },
  /* chamado sempre que algo muda localmente */
  schedule(ms = 4000) {
    if (!this.configured() || !this.session) return;
    clearTimeout(this._t); this._t = setTimeout(() => this.sync(), ms);
    if (this.status === 'ok') this.setStatus('pending');
  },
  tomb(id) {
    const o = this.st.owners?.[id]; if (o && o !== this.uid()) { (this.st.otherTombs ||= {})[id] = { owner: o, ts: Date.now() }; this.saveState(); this.schedule(); return; }
    this.st.tombs[id] = Date.now(); delete this.st.synced[id]; this.saveState(); this.schedule(); },

  /* ---------- sincronização ---------- */
  /* devolve uma promessa que só termina quando a sincronização (inclusive a que estava em andamento) acabar */
  sync() {
    if (this.running) { this.again = true; return this.running.then(() => this.running || this.sync()); }
    this.running = this._sync().finally(() => { this.running = null; });
    return this.running;
  },
  async _sync() {
    if (!this.configured() || !this.session) return;
    if (!navigator.onLine) return this.setStatus('offline');
    this.syncing = true; this.res = { down: 0, up: 0, conflicts: 0 }; this.prog = { label: 'Conectando…' }; this.setStatus('syncing');
    try {
      App.flush();
      if (!await Team.enforce()) return;
      this.setProg({ label: 'Cadernos e seções…' }); await this.syncMeta();
      Shared.conflicts = 0; this.setProg({ label: 'Cadernos compartilhados…' }); try { await Shared.sync(); } catch (e) { console.warn('compartilhados', e); }
      this.setProg({ label: 'Procurando novidades…' }); await this.pull();
      this.applyJump();
      this.setProg({ label: 'Enviando…' }); await this.push(); try { await Shared.pushOthers(); } catch (e) { console.warn('compartilhados', e); }
      if (Shared.conflicts) UI.toast(`${Shared.conflicts} trecho(s) editado(s) ao mesmo tempo por outra pessoa — guardei as duas versões, marcadas com ⚠.`);
      this.st.at = Date.now(); this.saveState(); this.lastError = ''; this.last = { ...this.res, at: this.st.at };
      this.prog = null; this.setStatus('ok');
    } catch (e) {
      console.warn('sync', e); this.lastError = e.message;
      if (e.auth) this.setStatus('out', e.message); else if (!navigator.onLine) this.setStatus('offline'); else this.setStatus('error', e.message);
      if (e.retry && !this._retried) { this._retried = true; this.syncing = false; return this._sync(); }
    } finally { this.syncing = false; this._retried = false; if (this.status === 'syncing') this.setStatus('pending'); this.prog = null; this.paintBar(); }
    if (this.again) { this.again = false; this.schedule(1500); }
  },
  applyJump() {
    const id = this.pendingJump; this.pendingJump = null; if (!id || !App.meta.follow) return;
    const s = App.sermons.get(id); if (!s || App.cur?.id === id || Reader.active) return;
    const fresh = !App._typed && Date.now() - (App.bootT || 0) < 45000;
    if (fresh) { App.open(id); UI.toast(`Continuando de onde você parou: “${s.title || 'sem título'}”`); }
    else UI.toast(`No outro aparelho você estava em “${s.title || 'sem título'}”`, { label: 'Ir para lá', fn: () => App.open(id) });
  },
  uid() { return this.session.user?.id || this.userFromToken(this.session.access_token)?.id; },

  /* Cadernos/seções/tipos: une por id; o mais recente vence nos itens em comum; exclusões viajam como lista */
  metaPayload() {
    const m = App.meta;
    return { notebooks: m.notebooks.filter(n => !n.foreign), sections: m.sections.filter(x => !x.foreign), customTypes: m.customTypes || [], deleted: m.deleted || {}, theme: m.theme, dateFmt: m.dateFmt, readerTheme: m.readerTheme, readerSerif: !!m.readerSerif, dict: m.dict || [], groupNames: m.groupNames || {}, tourDone: m.tourDone || 0, follow: { on: !!m.follow, onT: m.followT || 0, last: m.follow ? (m.lastOpen || {}) : undefined }, ai: (typeof AI !== 'undefined' && AI.cloudPayload()) || undefined };
  },
  async syncMeta() {
    const r = await this.rest('/rest/v1/user_meta?select=data,updated_at,server_updated');
    const rows = await r.json(); const remote = rows[0];
    const m = App.meta; m.deleted ||= {}; m.metaUpdated ||= 0;
    let changed = false;
    if (remote && remote.server_updated > this.st.lastMeta) {
      const rd = remote.data || {}; const del = { ...(rd.deleted || {}), ...m.deleted }; m.deleted = del;
      const firstTime = !this.st.metaSynced;
      const merge = (loc, rem, key) => {
        const out = []; const byId = new Map(loc.map(x => [x.id, x]));
        for (const x of rem || []) {
          if (del[x.id]) continue;
          if (firstTime && !byId.has(x.id)) { // primeira vez neste aparelho: junta itens com o mesmo nome em vez de duplicar
            const twin = loc.find(l => !rem.some(r2 => r2.id === l.id) && l.name === x.name && (key !== 'sections' || (l.nb === x.nb || this.remapNb?.[l.nb] === x.nb)));
            if (twin) { this.remap(key, twin.id, x.id); byId.delete(twin.id); }
          }
          const l = byId.get(x.id);
          out.push(l && m.metaUpdated > remote.updated_at ? l : x); byId.delete(x.id);
        }
        for (const l of byId.values()) if (!del[l.id] && !(rem || []).some(x => x.id === l.id)) out.push(l);
        if (m.metaUpdated > remote.updated_at) { const pos = new Map(loc.map((x, i) => [x.id, i])); out.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9)); } // ordem local mais recente
        return out;
      };
      this.remapNb = {};
      m.notebooks = merge(m.notebooks, rd.notebooks, 'notebooks');
      m.sections = merge(m.sections.map(s => ({ ...s, nb: this.remapNb[s.nb] || s.nb })), rd.sections, 'sections');
      m.customTypes = merge(m.customTypes || [], rd.customTypes, 'customTypes');
      if (remote.updated_at > m.metaUpdated) { if (rd.theme) m.theme = rd.theme; if (rd.dateFmt) m.dateFmt = rd.dateFmt; if (rd.readerTheme) m.readerTheme = rd.readerTheme; if (rd.readerSerif != null) m.readerSerif = rd.readerSerif; }
      try { AI.fromCloud(rd.ai); } catch (e) { }
      if (rd.groupNames && remote.updated_at > m.metaUpdated) m.groupNames = rd.groupNames;
      if (rd.tourDone && !m.tourDone) m.tourDone = rd.tourDone;
      if (rd.follow) { // continuar de onde parei em outro aparelho
        const f = rd.follow; if ((f.onT || 0) > (m.followT || 0)) { m.follow = !!f.on; m.followT = f.onT; }
        if (m.follow && f.last) { const L = m.lastOpen ||= {}, norm = e => typeof e === 'string' ? { id: e, t: 0 } : (e || { t: 0 });
          for (const k in f.last) { const r = norm(f.last[k]), l = norm(L[k]); if (r.id && r.t > l.t) { L[k] = r; if (k === '__cur' && r.id !== App.cur?.id) this.pendingJump = r.id; } } }
      }
      if (Array.isArray(rd.dict)) m.dict = [...new Set([...(m.dict || []), ...rd.dict])];
      this.st.lastMeta = remote.server_updated; changed = true;
      if (!m.notebooks.length) { const nb = { id: uid(), name: 'Ministrações', color: '#7719aa' }; m.notebooks.push(nb); }
      if (!m.notebooks.some(n => n.id === m.currentNb)) m.currentNb = m.notebooks[0].id;
      if (!m.sections.some(s => s.id === m.currentSec)) m.currentSec = m.sections.find(s => s.nb === m.currentNb)?.id || null;
      registerCustomTypes(); await DB.put('kv', 'meta', m);
    }
    if (!remote || m.metaUpdated > (this.st.metaSynced || 0) || changed || this.followDirty) {
      this.followDirty = false;
      const body = { user_id: this.uid(), data: this.metaPayload(), updated_at: Math.max(m.metaUpdated, remote?.updated_at || 0) };
      const r2 = await this.rest('/rest/v1/user_meta?on_conflict=user_id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(body) });
      const saved = (await r2.json())[0]; if (saved) this.st.lastMeta = saved.server_updated;
      this.st.metaSynced = Date.now();
    }
    if (changed) { App.renderNav(); Ribbon.renderCustom(); Theme.apply(); }
  },
  remap(key, from, to) {
    const m = App.meta;
    if (key === 'notebooks') { this.remapNb[from] = to; m.sections.forEach(s => { if (s.nb === from) s.nb = to; }); if (m.currentNb === from) m.currentNb = to; }
    if (key === 'sections') { for (const s of App.sermons.values()) if (s.sec === from) { s.sec = to; App.touch(s); } if (m.currentSec === from) m.currentSec = to; }
  },

  async pull() {
    const before = App.cur && JSON.stringify(App.cur);
    let n = 0, conflicts = 0, cursor = this.st.lastPull || 0, more = true; const conflictIds = new Set();
    while (more) {
      // 1) lista leve (sem conteúdo) do que mudou desde a última vez
      const r = await this.rest(`/rest/v1/sermons?select=id,updated_at,deleted,server_updated&user_id=eq.${this.uid()}&server_updated=gt.${cursor}&order=server_updated.asc&limit=500`);
      const rows = await r.json(); more = rows.length === 500;
      const need = [];
      for (const row of rows) {
        cursor = Math.max(cursor, row.server_updated);
        const local = App.sermons.get(row.id);
        if (this.st.tombs[row.id] && !row.deleted) continue;
        if (row.deleted) {
          if (local && local.updated <= row.updated_at) { App.sermons.delete(row.id); await DB.del('sermons', row.id); n++; }
          this.st.synced[row.id] = row.updated_at; continue;
        }
        if (local) {
          const synced = this.st.synced[row.id] || 0;
          if (row.updated_at === synced) continue;                                      // é o que já temos (eco do nosso envio)
          if (local.updated === row.updated_at) { this.st.synced[row.id] = row.updated_at; continue; }
          if (local.updated > synced && synced) { need.push(row.id); conflictIds.add(row.id); continue; } // mudou nos dois lados
          if (row.updated_at < local.updated) continue;
        }
        need.push(row.id);
      }
      // 2) baixa o conteúdo só do que precisa
      const base = n; if (need.length) this.setProg({ label: 'Baixando', done: 0, total: need.length });
      for (let i = 0; i < need.length; i += 40) {
        const ids = need.slice(i, i + 40).map(x => `"${x}"`).join(',');
        const r2 = await this.rest(`/rest/v1/sermons?select=id,data,updated_at&user_id=eq.${this.uid()}&id=in.(${encodeURIComponent(ids)})`);
        for (const row of await r2.json()) {
          const local = App.sermons.get(row.id);
          if (Shared.inShared(row.data) || (local && Shared.inShared(local))) { await Shared.receive(row); n++; continue; } // caderno compartilhado: junta bloco a bloco
          if (local && conflictIds.has(row.id)) { // os dois lados mudaram: a versão da nuvem fica, a deste aparelho vira cópia
            const copy = structuredClone(local); copy.id = uid(); copy.title = `${local.title} (conflito — outra versão, ${new Date(local.updated).toLocaleString(DL(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`; copy.updated = Date.now();
            App.sermons.set(copy.id, copy); await DB.put('sermons', copy.id, copy); conflicts++;
          }
          const s = row.data; s.id = row.id; s.updated = row.updated_at;
          await this.inflateImages(s);
          App.sermons.set(s.id, s); await DB.put('sermons', s.id, s);
          this.st.synced[s.id] = row.updated_at; n++; this.setProg({ label: 'Baixando', done: n - base, total: need.length });
        }
      }
      this.st.lastPull = cursor; this.saveState();
    }
    this.res.down = n; this.res.conflicts = conflicts;
    if (n || conflicts) {
      App.renderNav();
      if (App.cur && !App.sermons.has(App.cur.id)) { App.cur = null; App.renderEditor(); }
      else if (App.cur) {
        const fresh = App.sermons.get(App.cur.id);
        if (fresh !== App.cur && JSON.stringify(fresh) !== before) {
          const editing = document.activeElement && $('#editor').contains(document.activeElement);
          if (editing) UI.toast('Esta ministração foi alterada em outro aparelho.', { label: 'Recarregar', fn: () => App.open(fresh.id) });
          else { App.cur = fresh; App.renderEditor(); }
        }
      }
      if (conflicts) UI.toast(`${conflicts} ministração(ões) editada(s) nos dois aparelhos — guardei as duas versões.`);
    }
  },
  async push() {
    const uidv = this.uid();
    const rows = [];
    for (const [id, ts] of Object.entries(this.st.tombs)) rows.push({ user_id: uidv, id, data: {}, updated_at: ts, deleted: true, _tomb: true });
    const todo = [...App.sermons.values()].filter(s => !s.welcome && Shared.isAuthor(s) && (this.st.synced[s.id] || 0) < s.updated); let k = 0;
    for (const s of todo) {
      this.setProg({ label: 'Preparando envio', done: ++k, total: todo.length });
      if (await this.uploadImages(s)) await DB.put('sermons', s.id, s);
      const snb = Shared.sharedNbId(s); if (snb) { s.author ||= { email: Shared.myEmail() }; s.lastBy = Shared.myEmail(); }
      rows.push({ user_id: uidv, id: s.id, data: this.outbound(s), updated_at: s.updated, deleted: false, ...(Shared.ready ? { shared_nb: snb } : {}), _base: !!snb });
    }
    if (!rows.length) return;
    this.res.up = rows.length; let sent = 0; this.setProg({ label: 'Enviando', done: 0, total: rows.length });
    // envia em lotes de até ~1,5 MB
    let batch = [], size = 0;
    const send = async () => {
      if (!batch.length) return;
      const body = JSON.stringify(batch.map(({ _tomb, _base, ...r }) => r));
      await this.rest('/rest/v1/sermons?on_conflict=user_id,id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body });
      for (const r of batch) { this.st.synced[r.id] = r.updated_at; if (r._tomb) delete this.st.tombs[r.id]; if (r._base) await Shared.saveBase(r, r.id); }
      sent += batch.length; this.setProg({ label: 'Enviando', done: sent, total: rows.length });
      this.saveState(); batch = []; size = 0;
    };
    for (const r of rows) { const len = JSON.stringify(r.data).length; if (size + len > 1500000) await send(); batch.push(r); size += len; }
    await send();
  },
  /* cópia para a nuvem: imagens viram referência ao Storage */
  outbound(s) {
    const c = structuredClone(s);
    c.blocks.forEach(b => { if (b.type === 'image' && b.cloud) b.src = ''; });
    return c;
  },
  async uploadImages(s) {
    let changed = false;
    for (const b of s.blocks) {
      if (b.type !== 'image' || !b.src || b.cloud || !b.src.startsWith('data:')) continue;
      const { bytes, mime } = dataURLtoBytes(b.src);
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
      const path = `${this.uid()}/${hash}.${mime === 'image/png' ? 'png' : 'jpg'}`;
      await this.rest(`/storage/v1/object/images/${path}`, { method: 'POST', headers: { 'Content-Type': mime, 'x-upsert': 'true' }, body: bytes });
      b.cloud = path; await DB.put('images', path, b.src); changed = true;
    }
    return changed;
  },
  async inflateImages(s) {
    for (const b of s.blocks || []) {
      if (b.type !== 'image' || b.src || !b.cloud) continue;
      let d = await DB.get('images', b.cloud);
      if (!d) { try { const r = await this.rest(`/storage/v1/object/authenticated/images/${b.cloud}`); const blob = await r.blob(); d = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); }); await DB.put('images', b.cloud, d); } catch (e) { console.warn('imagem', e); } }
      if (d) b.src = d;
    }
  }
};

/* ===== Janela da conta / nuvem ===== */
const CloudUI = {
  open() {
    const body = el('div', { class: 'cloud' });
    this.m = UI.modal({ title: 'Nuvem — usar em vários aparelhos', body, wide: true });
    this.body = body; this.route();
  },
  set(...n) { this.body.innerHTML = ''; this.body.append(...n.filter(x => x != null && x !== false)); },
  route() { if (!Cloud.configured()) return this.viewSetup(); if (!Cloud.session) return this.viewLogin(); this.viewAccount(); },
  viewSetup() {
    const c = Cloud.cfg();
    const url = el('input', { class: 'inp', placeholder: 'Project URL — https://xxxx.supabase.co', value: c.url });
    const key = el('input', { class: 'inp', placeholder: 'anon public key (chave pública)', value: c.key });
    this.set(el('p', { html: 'Ligue o SmartSower ao seu projeto do <b>Supabase</b>. Os dados ficam protegidos por login: cada pessoa só vê as próprias ministrações.' }),
      el('ol', { class: 'steps', html: '<li>No Supabase, abra o projeto › <b>SQL Editor</b> › cole o conteúdo do arquivo <code>supabase.sql</code> › <b>Run</b>.</li><li>Em <b>Project Settings › API</b>, copie a <b>Project URL</b> e a chave <b>anon public</b>.</li><li>Em <b>Authentication › URL Configuration</b>, coloque o endereço do app em <b>Site URL</b>: <code>' + esc(Cloud.redirect()) + '</code></li>' }),
      url, key, el('div', { class: 'row-btns', style: { marginTop: '10px' } }, el('button', { class: 'btn primary', text: 'Salvar', onclick: () => {
        if (!/^https:\/\/.+/.test(url.value.trim()) || key.value.trim().length < 20) return UI.toast('Confira a URL e a chave');
        Cloud.saveCfg(url.value.trim().replace(/\/+$/, ''), key.value.trim()); this.route(); Cloud.setStatus(Cloud.session ? 'pending' : 'out');
      } })),
      el('p', { class: 'muted small', text: 'Dica: deixando a URL e a chave no arquivo config.js do site, nenhum aparelho precisa digitar isso.' }));
  },
  viewLogin(msg) {
    const email = el('input', { class: 'inp', type: 'email', placeholder: 'seu e-mail', autocomplete: 'email' });
    const pass = el('input', { class: 'inp', type: 'password', placeholder: 'senha', autocomplete: 'current-password', onkeydown: e => { if (e.key === 'Enter') e.target.closest('.cloud')?.querySelector('.btn.primary')?.click(); } });
    const out = el('p', { class: 'small', text: msg || '' });
    // Só mostra "Entrar com Google" se o provedor estiver ativado no Supabase
    const gbtn = el('button', { class: 'btn', text: 'Entrar com Google', hidden: true, onclick: () => Cloud.google() });
    Cloud.providers().then(p => { if (p.google) gbtn.hidden = false; });
    const run = async (fn) => { out.textContent = 'Aguarde…'; try { const r = await fn(); if (r !== false) { if (Cloud.session) { out.textContent = ''; if (Gate.active) return Gate.done(out); this.viewAccount(); Cloud.schedule(100); } } } catch (e) { out.textContent = e.message; } };
    this.set(
      Gate.active ? el('p', { class: 'muted', text: 'Acesso restrito à equipe. Entre com a sua conta — ou, se o administrador acabou de cadastrar você, toque em “Primeiro acesso” para criar sua senha.' }) : el('p', { text: 'Entre com a mesma conta em todos os seus aparelhos (Surface, notebook…). As ministrações deste aparelho são enviadas e juntadas às da nuvem.' }),
      email, el('div', { style: { height: '8px' } }), pass,
      el('div', { class: 'row-btns', style: { marginTop: '10px', flexWrap: 'wrap' } },
        el('button', { class: 'btn primary', text: 'Entrar', onclick: () => run(() => Cloud.signIn(email.value.trim(), pass.value)) }),
        el('button', { class: 'btn', text: Gate.active ? 'Primeiro acesso' : 'Criar conta', title: 'Criar a senha com o e-mail que o administrador cadastrou', onclick: () => run(async () => { const r = await Cloud.signUp(email.value.trim(), pass.value); if (r === 'confirm') { out.textContent = 'Conta criada! Abra o e-mail de confirmação do Supabase e depois clique em “Entrar”.'; return false; } }) }),
        el('button', { class: 'btn', text: 'Receber link por e-mail', onclick: () => run(async () => { await Cloud.magicLink(email.value.trim()); out.textContent = 'Enviamos um link para o seu e-mail. Abra-o neste aparelho para entrar.'; return false; }) }),
        gbtn),
      out,
      !Gate.active && el('p', { class: 'small' }, el('button', { class: 'btn link', text: 'Configurar projeto Supabase', onclick: () => this.viewSetup() })));
    setTimeout(() => email.focus(), 50);
  },
  viewAccount() {
    const u = Cloud.session?.user || Cloud.userFromToken(Cloud.session.access_token) || {};
    const live = el('div', { class: 'sync-live' });
    const btn = el('button', { class: 'btn primary', text: 'Sincronizar agora', onclick: async () => { Cloud.sync(); paint(); } });
    const paint = () => {
      if (!live.isConnected) { Cloud.listeners.delete(paint); return; }
      const pend = Cloud.pendingCount(); live.innerHTML = '';
      if (Cloud.status === 'syncing') {
        const p = Cloud.prog; const pct = p?.total ? Math.round(Math.min(p.done, p.total) / p.total * 100) : null;
        live.append(el('div', { class: 'sync-row' }, el('span', { class: 'spin' }), el('b', { text: 'Sincronizando…' }), el('span', { class: 'muted', text: Cloud.progText() })),
          el('div', { class: 'sync-prog' }, el('i', { class: pct == null ? 'ind' : '', style: pct == null ? {} : { width: pct + '%' } })),
          el('p', { class: 'muted small', text: 'Pode continuar usando o app enquanto isso.' }));
        btn.disabled = true; btn.textContent = 'Sincronizando…';
      } else {
        btn.disabled = false; btn.textContent = 'Sincronizar agora';
        if (Cloud.status === 'error' || Cloud.lastError) live.append(el('p', { class: 'on-log', text: '⚠ Não consegui sincronizar: ' + (Cloud.lastError || 'erro desconhecido') + '. Toque em “Sincronizar agora” para tentar de novo.' }));
        else if (Cloud.status === 'offline') live.append(el('p', { class: 'on-log', text: '📴 Sem internet. ' + (pend ? `${pend} alteração(ões) esperando para enviar — sobem sozinhas quando a conexão voltar.` : 'Tudo o que você fizer fica salvo aqui e sobe quando a conexão voltar.') }));
        else if (Cloud.last) { const L = Cloud.last; live.append(el('div', { class: 'sync-row ok' }, el('b', { text: '✓ Sincronizado às ' + Cloud.hhmm(L.at) }),
          el('span', { class: 'muted', text: [L.down ? `${L.down} recebida(s)` : 'nada novo da nuvem', L.up ? `${L.up} enviada(s)` : 'nada a enviar', L.conflicts ? `${L.conflicts} conflito(s) guardado(s) como cópia` : ''].filter(Boolean).join(' · ') })));
          if (pend) live.append(el('p', { class: 'muted small', text: `${pend} alteração(ões) nova(s) desde então — sobem em alguns segundos.` })); }
        else live.append(el('p', { class: 'muted', text: Cloud.st.at ? `Última sincronização: ${new Date(Cloud.st.at).toLocaleString(DL())}${pend ? ` · ${pend} alteração(ões) aguardando envio` : ''}` : 'Ainda não sincronizado neste aparelho.' }));
      }
    };
    this.set(
      el('p', {}, 'Conectado como ', el('b', { text: u.email || '—' })),
      Cloud.c2a()?.church?.name ? el('p', { class: 'muted small' }, '⛪ Pelo Church2all · ', el('b', { text: Cloud.c2a().church.name })) : '',
      live,
      el('label', { class: 'follow-opt' }, el('input', { type: 'checkbox', checked: !!App.meta.follow, onchange: e => { App.meta.follow = e.target.checked; App.meta.followT = Date.now(); if (e.target.checked && App.cur) App.open(App.cur.id); App.saveMeta(); Cloud.followDirty = true; Cloud.schedule(500); UI.toast(e.target.checked ? 'Os aparelhos vão continuar de onde você parou' : 'Cada aparelho volta a lembrar só a própria página'); } }),
        el('span', {}, el('b', { text: 'Continuar de onde parei em outro aparelho' }), el('small', { class: 'muted', text: 'Ao abrir o app (ou um caderno) no Surface, celular ou notebook, ele vai para a última página que você usou em qualquer aparelho. Desmarcado, cada aparelho lembra só a própria.' }))),
      el('div', { class: 'ver-row' }, el('span', { class: 'small' }, el('b', { text: `Versão ${window.SS_BUILD?.version || '—'}` }), el('span', { class: 'muted', text: window.SS_BUILD ? ` · ${SS_BUILD.code} · ${SS_BUILD.at}` : '' }), ' ', el('button', { class: 'btn link sm', text: 'Novidades', onclick: () => Updater.notes() }), el('button', { class: 'btn link sm', text: '❓ Guia', onclick: () => { document.querySelectorAll('.modal-back').forEach(b => b.querySelector('.modal-head .icon-btn')?.click()); Tour.start(); } })),
        el('button', { class: 'btn sm', text: '⟳ Atualizar agora', title: 'Baixa a versão mais nova do app (seus textos não são afetados)', onclick: () => Updater.now() })),
      el('div', { class: 'row-btns' }, btn,
        el('button', { class: 'btn', text: 'Sair desta conta', onclick: async () => { Cloud.listeners.delete(paint); App.flush(); await Cloud.signOut(); location.reload(); } }),
        el('button', { class: 'btn danger', text: 'Sair e apagar deste aparelho', title: 'Para computador emprestado ou da igreja', onclick: () => Gate.wipe() })),
      el('p', { class: 'muted small', text: 'A sincronização é automática: alguns segundos depois de cada alteração, ao abrir o app e a cada minuto e meio. As Bíblias baixadas ficam em cada aparelho; ministrações, livros, cadernos, imagens e chaves sincronizam.' }));
    Cloud.listeners.add(paint); paint();
  }
};

// ── Tela de entrada: só usa o app quem estiver logado ──
const Gate = {
  active: false,
  on() { return Cloud.configured(); },
  early() { // esconde tudo antes de desenhar, se não houver sessão guardada
    try { if (this.on() && !localStorage.getItem('ss-session') && !/access_token|error_description|c2a=/.test(location.hash)) document.body.classList.add('gated'); } catch (e) { }
  },
  need() { return this.on() && !Cloud.session; },
  wait() {
    this.active = true; document.body.classList.add('gated'); Splash.hide();
    const card = el('div', { class: 'gate-card' });
    this.box = el('div', { id: 'gate' }, card); document.body.append(this.box);
    card.append(el('div', { class: 'gate-logo', html: '<img src="icon-192.png" alt="">' }), el('h1', { text: 'SmartSower' }));
    setTimeout(() => card.append(el('p', { class: 'muted small', style: { marginTop: '14px' }, text: 'Versão ' + Updater.ver() })), 0);
    const body = el('div', { class: 'cloud' }); card.append(body);
    const prev = CloudUI.body; CloudUI.body = body; let msg = ''; try { msg = sessionStorage.getItem('ss-gate-msg') || ''; sessionStorage.removeItem('ss-gate-msg'); } catch (e) { } CloudUI.viewLogin(msg || (this.back && this.back !== 'ok' ? this.back : '')); this._prev = prev;
    if (!navigator.onLine) body.prepend(el('p', { class: 'on-log', text: '📴 Sem internet. Conecte-se para entrar pela primeira vez neste aparelho.' }));
    return new Promise(r => this._res = r);
  },
  async done(out) {
    if (out) out.textContent = 'Verificando acesso…';
    if (!await Team.enforce()) return;
    this.active = false; this.box?.remove(); document.body.classList.remove('gated'); CloudUI.body = this._prev;
    Cloud.setStatus('pending'); Cloud.schedule(100); UI.toast('Bem-vindo! Sincronizando seus cadernos…');
    if (!$('#splash') && document.body) { /* depois do login: mostra o progresso da 1ª sincronização */ document.body.insertAdjacentHTML('afterbegin', '<div id="splash" role="status"><div class="sp-card"><img src="icon-192.png" alt=""><div class="sp-name">SmartSower</div><div class="sp-step" id="sp-step">Trazendo seus cadernos…</div><div class="sp-bar"><i id="sp-fill"></i></div><div class="sp-sub" id="sp-sub"></div><button class="sp-skip" id="sp-skip" hidden>Usar enquanto carrega</button></div></div>'); Splash.on = true; Splash.set(null, 75); setTimeout(() => Splash.syncMode(), 50); }
    this._res?.(); setTimeout(() => Tour.maybeStart(), 2500);
  },
  async wipe() {
    if (!await UI.confirm('Sair e apagar deste aparelho', 'Os cadernos, livros e imagens serão apagados SÓ deste aparelho (continuam na nuvem e nos seus outros aparelhos). Use em computador emprestado ou da igreja.', 'Apagar e sair')) return;
    App.flush(); try { await Cloud.sync(); } catch (e) { }
    const pend = Cloud.pendingCount();
    if (pend) return UI.toast(`Ainda há ${pend} alteração(ões) que não subiram para a nuvem. Conecte-se e sincronize antes de apagar.`);
    await Cloud.signOut();
    DB.close();
    await new Promise(r => { const q = indexedDB.deleteDatabase('pulpito'); q.onsuccess = q.onerror = q.onblocked = () => r(); });
    try { Object.keys(localStorage).filter(k => k.startsWith('ss-') || k.startsWith('smart')).forEach(k => localStorage.removeItem(k)); } catch (e) { }
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) { }
    location.reload();
  }
};

// ── Forçar atualização do app (limpa só o cache do app, nunca os seus textos) ──
const Updater = {
  ver() { return window.SS_BUILD?.version || ''; },
  notes() {
    const B = window.SS_BUILD || { notes: [] };
    const body = el('div', { class: 'cl' }, el('p', { class: 'muted small', text: `Você está na versão ${B.version || '—'} (${B.code || ''} · publicada ${B.at || ''}). Cada atualização sobe o último número.` }),
      ...B.notes.map((n, i) => el('div', { class: 'cl-v' + (i === 0 ? ' now' : '') }, el('h4', {}, `${n.v}`, el('span', { class: 'muted small', text: ' · ' + n.d }), i === 0 ? el('span', { class: 'cl-tag', text: 'atual' }) : null), el('ul', {}, ...n.items.map(t => el('li', { text: t }))))),
      el('div', { class: 'row-btns' }, el('button', { class: 'btn', text: '⟳ Procurar atualização', onclick: () => this.now() })));
    UI.modal({ title: '✨ Novidades do SmartSower', body });
  },
  // procura versão nova no servidor (ao voltar para o app e a cada 15 min) e avisa
  async poll() {
    if (!navigator.onLine || this.found) return;
    try {
      const t = await (await fetch(location.pathname + '?check=' + Date.now(), { cache: 'no-store' })).text();
      const code = (t.match(/"code": "([0-9a-f]+)"/) || [])[1], ver = (t.match(/"version": "([^"]+)"/) || [])[1];
      if (!code || code === window.SS_BUILD?.code) return;
      this.found = ver || 'nova'; const b = $('#btn-reload'); if (b) { b.classList.add('has-new'); b.title = `Versão ${this.found} disponível — toque para atualizar`; }
      UI.toast(`Nova versão ${ver || ''} disponível`, { label: 'Atualizar', fn: () => this.now() });
    } catch (e) { }
  },
  initPoll() {
    $('#btn-reload')?.addEventListener('click', () => this.now());
    setTimeout(() => this.poll(), 20000); setInterval(() => this.poll(), 15 * 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.poll(); });
  },
  checkSeen() { // avisa uma vez quando o app foi atualizado
    const v = this.ver(); if (!v) return; let seen = ''; try { seen = localStorage.getItem('ss-seen-ver') || ''; localStorage.setItem('ss-seen-ver', v); } catch (e) { }
    if (seen && seen !== v) setTimeout(() => UI.toast(`SmartSower atualizado para a versão ${v}`, { label: 'Novidades', fn: () => this.notes() }), 1500);
  },
  async now() {
    if (!navigator.onLine) { App.flush(); return location.reload(); } // sem internet: só recarrega com o que já está no aparelho
    App.flush(); UI.toast('Atualizando o app…'); await new Promise(r => setTimeout(r, 400));
    try { const regs = await navigator.serviceWorker?.getRegistrations?.() || []; for (const r of regs) await r.unregister(); } catch (e) { }
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) { }
    location.replace(location.pathname + '?v=' + Date.now());
  }
};

// ── Entrada pelo Church2all: faixa com as cores do Church2all (azul e dourado) e o aviso do que vai para lá ──
const C2aBar = {
  init() {
    const c = Cloud.c2a(); const root = document.documentElement;
    if (!c?.church?.name) { root.classList.remove('c2a'); $('#c2a-bar')?.remove(); return; }
    root.classList.add('c2a');
    if (!$('#c2a-bar')) {
      const bar = el('div', { id: 'c2a-bar', role: 'note' },
        el('span', { class: 'c2a-mark', text: 'Church2all' }),
        el('span', { class: 'c2a-church', text: c.church.name }),
        el('button', { class: 'c2a-why', text: 'O que vai para o Church2all?', onclick: () => this.notice() }));
      document.querySelector('header.topbar')?.after(bar);
    }
    try { const k = 'ss-c2a-seen-' + c.church.id; if (!localStorage.getItem(k)) { localStorage.setItem(k, '1'); setTimeout(() => { if (!$('.tour-card')) this.notice(true); }, 400); } } catch (e) { }
  },
  notice(first) {
    const c = Cloud.c2a(); if (!c) return;
    const body = el('div', { class: 'c2a-notice' },
      el('p', {}, 'Você entrou pela ', el('b', { text: c.church.name }), ' no Church2all. Este é o SmartSower da igreja: o editor do material que vai para o app e o site.'),
      el('ul', { html:
        '<li><b>Seus cadernos pessoais são só seus.</b> Nada deles vai para o Church2all, e ninguém da igreja os vê.</li>' +
        '<li><b>O caderno “Conteúdos Church2All”</b> é da igreja: quem entra pela igreja vê e edita junto. Seções: Sermões, Devocionais e Cursos/Escola.</li>' +
        '<li><b>Só vai para o Church2all o que você publicar</b> com o botão “Publicar no Church2all” numa página desse caderno. Publicar de novo atualiza o mesmo conteúdo.</li>' +
        '<li><b>Sermões:</b> você escolhe se fica aberto a todos, só para membros ou só no arquivo do painel.</li>' }),
      el('p', { class: 'muted small', text: 'O caderno da igreja e o botão de publicar estão chegando nas próximas versões. A equipe e os cadernos de outras igrejas nunca aparecem aqui.' }));
    UI.modal({ title: '⛪ SmartSower pelo Church2all', body, actions: [{ label: 'Entendi', primary: true }],
      onClose: () => { if (first) try { Tour.maybeStart(); } catch (e) { } } });
  }
};
