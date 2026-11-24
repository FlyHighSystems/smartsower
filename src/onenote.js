/* ===== Conexão direta com o OneNote (Microsoft Graph) — somente importação =====
   Login: OAuth 2.0 com PKCE (aplicativo de página única), sem bibliotecas externas.
   Permissão pedida: Notes.Read (ler cadernos). Nada é gravado no OneNote. */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const MSGraph = {
  GRAPH: 'https://graph.microsoft.com/v1.0',
  AUTH: 'https://login.microsoftonline.com/common/oauth2/v2.0',
  CONSUMER_TID: '9188040d-6c67-4c5b-b112-36a304b66dad',
  BASE_SCOPES: 'openid profile offline_access User.Read Notes.Read',
  token: null, refresh: null, exp: 0, account: null, scope: null, lastCall: 0, onWait: null,
  redirectUri() { return location.origin + location.pathname.replace(/index\.html?$/i, ''); },
  clientId() { return (App.meta.msClientId || '').trim(); },
  canLogin() { return /^https?:$/.test(location.protocol) && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)); },
  restore() {
    try { const s = JSON.parse(sessionStorage.getItem('mp-ms') || 'null'); if (s && s.exp > Date.now()) Object.assign(this, s); } catch (e) { }
  },
  persist() { try { sessionStorage.setItem('mp-ms', JSON.stringify({ token: this.token, refresh: this.refresh, exp: this.exp, account: this.account, scope: this.scope })); } catch (e) { } },
  logout() { this.token = this.refresh = this.account = null; this.exp = 0; try { sessionStorage.removeItem('mp-ms'); } catch (e) { } },
  async login(extraScope = '') {
    const client_id = this.clientId(); if (!client_id) throw new Error('Informe o ID do aplicativo primeiro.');
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = uid(), scope = (this.BASE_SCOPES + ' ' + extraScope).trim(), redirect_uri = this.redirectUri();
    const url = `${this.AUTH}/authorize?` + new URLSearchParams({ client_id, response_type: 'code', redirect_uri, response_mode: 'query', scope, state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' });
    try { localStorage.removeItem('mp-auth'); } catch (e) { }
    const w = window.open(url, 'mp-login', 'width=520,height=700');
    if (!w) throw new Error('O navegador bloqueou a janela de login. Permita pop-ups para este site e tente de novo.');
    const search = await this.waitForCode(w, state);
    try { localStorage.removeItem('mp-auth'); } catch (e) { }
    const q = new URLSearchParams(search);
    if (q.get('error')) throw new Error(q.get('error_description') || q.get('error'));
    if (q.get('state') !== state) throw new Error('Resposta de login inválida. Tente de novo.');
    const res = await fetch(`${this.AUTH}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id, grant_type: 'authorization_code', code: q.get('code'), redirect_uri, code_verifier: verifier, scope }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(this.explain(j));
    this.scope = scope; this.setToken(j);
  },
  /* O código volta por 3 caminhos possíveis: postMessage, leitura da URL do pop-up, ou localStorage */
  waitForCode(w, state) {
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (s, err) => { if (done) return; done = true; clearInterval(t); clearTimeout(to); window.removeEventListener('message', onMsg); window.removeEventListener('storage', onStore); try { w.close(); } catch (e) { } err ? reject(err) : resolve(s); };
      const ok = s => s && new URLSearchParams(s).get('state') === state;
      const onMsg = e => { if (e.origin === location.origin && e.data?.type === 'mp-auth' && ok(e.data.search)) finish(e.data.search); };
      const onStore = e => { if (e.key === 'mp-auth' && ok(e.newValue)) finish(e.newValue); };
      window.addEventListener('message', onMsg); window.addEventListener('storage', onStore);
      const t = setInterval(() => {
        try { if (w.location.origin === location.origin && ok(w.location.search)) return finish(w.location.search); } catch (e) { }
        try { const s = localStorage.getItem('mp-auth'); if (ok(s)) finish(s); } catch (e) { }
      }, 400);
      const to = setTimeout(() => finish(null, new Error('Tempo esgotado esperando o login.')), 5 * 60000);
      this.cancelLogin = () => finish(null, new Error('Login cancelado.'));
    });
  },
  explain(j) {
    const d = j.error_description || j.error || 'Falha no login';
    if (/AADSTS50011/.test(d)) return `O endereço de retorno não confere. No registro do app, a URI de redirecionamento (SPA) deve ser exatamente: ${this.redirectUri()}`;
    if (/AADSTS9002326|AADSTS9002327/.test(d)) return 'A URI de redirecionamento precisa estar cadastrada na plataforma “Aplicativo de página única (SPA)”, não em “Web”.';
    if (/AADSTS700016/.test(d)) return 'ID do aplicativo não encontrado. Confira o “ID do aplicativo (cliente)”.';
    if (/AADSTS50020|AADSTS50194/.test(d)) return 'O app foi registrado só para a sua organização. No registro, mude “Tipos de conta com suporte” para incluir contas pessoais, ou entre com a conta da organização.';
    return d.split('\r\n')[0];
  },
  setToken(j) {
    this.token = j.access_token; if (j.refresh_token) this.refresh = j.refresh_token; this.exp = Date.now() + ((j.expires_in || 3600) - 90) * 1000;
    if (j.id_token) { try { const c = JSON.parse(decodeURIComponent(escape(atob(j.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); this.account = { name: c.name, user: c.preferred_username, personal: c.tid === this.CONSUMER_TID }; } catch (e) { } }
    this.persist();
  },
  async ensureToken() {
    if (this.token && Date.now() < this.exp) return;
    if (!this.refresh) throw Object.assign(new Error('Sessão expirada. Entre novamente.'), { status: 401 });
    const res = await fetch(`${this.AUTH}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: this.clientId(), grant_type: 'refresh_token', refresh_token: this.refresh, scope: this.scope || this.BASE_SCOPES }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { this.logout(); throw Object.assign(new Error('Sessão expirada. Entre novamente.'), { status: 401 }); }
    this.setToken(j);
  },
  async pace() { const wait = this.lastCall + 500 - Date.now(); if (wait > 0) await sleep(wait); this.lastCall = Date.now(); },
  async api(path, opts = {}, kind = 'json') {
    const url = path.startsWith('http') ? path : this.GRAPH + path;
    for (let attempt = 0; attempt < 7; attempt++) {
      await this.ensureToken(); await this.pace();
      let r;
      try { r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + this.token, ...(opts.headers || {}) } }); }
      catch (e) { await sleep(1500 * (attempt + 1)); continue; } // rede instável
      if ([429, 502, 503, 504].includes(r.status)) {
        const ra = Math.min(120, +r.headers.get('Retry-After') || 4 * 2 ** attempt);
        this.onWait && this.onWait(ra); await sleep(ra * 1000); continue;
      }
      if (r.status === 401 && attempt === 0) { this.exp = 0; continue; }
      if (!r.ok) {
        let m = 'Erro ' + r.status; try { const j = await r.json(); m = j.error?.message || m; } catch (e) { }
        throw Object.assign(new Error(m), { status: r.status });
      }
      if (kind === 'json') return r.json();
      if (kind === 'blob') return r.blob();
      return { text: await r.text(), type: r.headers.get('content-type') || '' };
    }
    throw new Error('A Microsoft limitou as requisições. Aguarde alguns minutos e importe de novo — as páginas já trazidas não se repetem.');
  },
  async all(path) { let out = [], url = path; while (url) { const j = await this.api(url); out = out.concat(j.value || []); url = j['@odata.nextLink']; } return out; },
  me() { return this.api('/me?$select=displayName,userPrincipalName'); },
  notebooks() { return this.all('/me/onenote/notebooks?$select=id,displayName,isShared,lastModifiedDateTime&$orderby=displayName'); },
  notebookFromLink(webUrl) { return this.api('/me/onenote/notebooks/GetNotebookFromWebUrl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ webUrl }) }); },
  async sectionTree(nbId) {
    const out = [];
    const sel = '?$select=id,displayName';
    for (const s of await this.all(`/me/onenote/notebooks/${nbId}/sections${sel}`)) out.push({ id: s.id, path: s.displayName });
    const walk = async (g, prefix) => {
      const p = prefix + g.displayName + ' › ';
      for (const s of await this.all(`/me/onenote/sectionGroups/${g.id}/sections${sel}`)) out.push({ id: s.id, path: p + s.displayName });
      for (const sg of await this.all(`/me/onenote/sectionGroups/${g.id}/sectionGroups${sel}`)) await walk(sg, p);
    };
    for (const g of await this.all(`/me/onenote/notebooks/${nbId}/sectionGroups${sel}`)) await walk(g, '');
    return out;
  },
  async pages(secId) {
    const ps = await this.all(`/me/onenote/sections/${secId}/pages?$select=id,title,createdDateTime,lastModifiedDateTime,level,order&pagelevel=true&$top=100`);
    return ps.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },
  /* Conteúdo da página: HTML + tinta (InkML), em multipart */
  async pageContent(pageId) {
    let r;
    try { r = await this.api(`/me/onenote/pages/${pageId}/content?includeInkML=true`, {}, 'text'); }
    catch (e) { if (e.status === 400 || e.status === 500) r = await this.api(`/me/onenote/pages/${pageId}/content`, {}, 'text'); else throw e; }
    const bm = r.type.match(/boundary="?([^";]+)"?/i);
    if (!/multipart/i.test(r.type) || !bm) return { html: r.text, inkml: null };
    let html = '', inkml = null;
    for (const part of r.text.split('--' + bm[1])) {
      const i = part.search(/\r?\n\r?\n/); if (i < 0) continue;
      const head = part.slice(0, i), body = part.slice(i).replace(/^\s+/, '').replace(/\s+$/, '');
      if (/text\/html/i.test(head)) html = body; else if (/inkml/i.test(head)) inkml = body;
    }
    return { html, inkml };
  }
};

/* ===== Conversão de página do OneNote ===== */
function orderOneNoteHTML(html) {
  // As caixas do OneNote são posicionadas livremente: ordena por posição (de cima para baixo, da esquerda para a direita)
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const kids = [...doc.body.children];
  const pos = e => { const st = e.getAttribute('style') || ''; const top = +(st.match(/top:\s*([\d.]+)px/) || [])[1] || 0; const left = +(st.match(/left:\s*([\d.]+)px/) || [])[1] || 0; return { top, left }; };
  kids.sort((a, b) => { const A = pos(a), B = pos(b); return Math.abs(A.top - B.top) < 12 ? A.left - B.left : A.top - B.top; });
  kids.forEach(k => doc.body.append(k));
  return { doc, body: doc.body.innerHTML };
}
/* InkML → blocos de desenho do SmartSower (um por grupo de traços próximos verticalmente) */
function inkmlToInks(xml) {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];
  const byTag = t => [...doc.getElementsByTagNameNS('*', t)];
  const brushes = {};
  for (const b of byTag('brush')) {
    const id = b.getAttribute('xml:id') || b.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'id') || b.getAttribute('id');
    const props = {}; for (const p of b.getElementsByTagNameNS('*', 'brushProperty')) props[p.getAttribute('name')] = { v: p.getAttribute('value'), u: p.getAttribute('units') };
    brushes[id] = props;
  }
  let channels = ['X', 'Y'];
  const tf = byTag('traceFormat')[0];
  if (tf) { const ch = [...tf.getElementsByTagNameNS('*', 'channel')].map(c => c.getAttribute('name')); if (ch.length) channels = ch; }
  const ix = channels.indexOf('X'), iy = channels.indexOf('Y'), iF = channels.indexOf('F');
  const traces = [];
  for (const tr of byTag('trace')) {
    const n = channels.length, val = new Array(n).fill(0), vel = new Array(n).fill(0), mode = new Array(n).fill('!');
    const pts = [];
    for (const raw of tr.textContent.split(',')) {
      const toks = [...raw.matchAll(/([!'"]?)\s*(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g)]; if (!toks.length) continue;
      toks.slice(0, n).forEach(([, pre, num], c) => {
        const v = parseFloat(num); if (pre) mode[c] = pre;
        if (mode[c] === '!') { vel[c] = v - val[c]; val[c] = v; }
        else if (mode[c] === "'") { vel[c] = v; val[c] += v; }
        else { vel[c] += v; val[c] += vel[c]; }
      });
      pts.push([val[ix], val[iy], iF >= 0 ? val[iF] : null]);
    }
    if (!pts.length) continue;
    const bref = (tr.getAttribute('brushRef') || '').replace('#', ''); const br = brushes[bref] || {};
    const color = (br.color?.v || '#000000').slice(0, 7);
    let width = parseFloat(br.width?.v || '0'); if (br.width?.u === 'cm') width *= 1000; else if (br.width?.u === 'mm') width *= 100;
    const hl = (+br.transparency?.v || 0) > 0 || /rectangle/i.test(br.tip?.v || '');
    traces.push({ pts, color, width, hl });
  }
  if (!traces.length) return [];
  // Agrupa traços em blocos separados por espaços verticais grandes (~1,5 cm)
  traces.forEach(t => { t.minY = Math.min(...t.pts.map(p => p[1])); t.maxY = Math.max(...t.pts.map(p => p[1])); });
  traces.sort((a, b) => a.minY - b.minY);
  const groups = []; let g = null;
  for (const t of traces) { if (!g || t.minY > g.maxY + 1500) { g = { traces: [], maxY: -Infinity }; groups.push(g); } g.traces.push(t); g.maxY = Math.max(g.maxY, t.maxY); }
  const maxF = Math.max(1, ...traces.flatMap(t => t.pts.map(p => p[2] || 0)));
  return groups.map(gr => {
    const xs = gr.traces.flatMap(t => t.pts.map(p => p[0])), ys = gr.traces.flatMap(t => t.pts.map(p => p[1]));
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max((maxX - minX) * 1.08, 12000), pad = span * 0.03;
    const strokes = gr.traces.map(t => ({
      c: t.color, hl: t.hl ? 1 : 0, w: Math.max(0.0015, (t.width || 50) / span),
      p: t.pts.flatMap(([x, y, f]) => [(x - minX + pad) / span, (y - minY + pad) / span, f == null ? 0.5 : clamp(f / maxF, 0.05, 1)])
    }));
    return { hr: clamp((maxY - minY + pad * 2) / span, 0.06, 4), strokes };
  });
}
async function graphImageToDataURL(src) {
  try { const blob = await MSGraph.api(src, {}, 'blob'); return await imageFileToDataURL(blob, 1600); } catch (e) { console.warn('imagem', e); return null; }
}
async function oneNotePageToSermon(page, secId) {
  const { html, inkml } = await MSGraph.pageContent(page.id);
  const { doc } = orderOneNoteHTML(html);
  const imgMap = {};
  for (const img of doc.querySelectorAll('img')) {
    const src = img.getAttribute('src'); if (!src || imgMap[src]) continue;
    if (/^https:\/\/graph\.microsoft\.com\//.test(src)) { const d = await graphImageToDataURL(src); if (d) imgMap[src] = d; }
  }
  const items = htmlToItems(doc.body.innerHTML, imgMap).map(it => it.kind === 'title' ? { ...it, kind: 'heading' } : it);
  const r = itemsToSermon(items, page.title || 'Sem título', true);
  let inks = [];
  try { inks = inkmlToInks(inkml); } catch (e) { console.warn('inkml', e); }
  if (inks.length) {
    if (r.blocks.length === 1 && r.blocks[0].type === 'text' && !htmlToText(r.blocks[0].html)) r.blocks = [];
    r.blocks.push({ id: uid(), type: 'text', html: '<i>Anotações à mão trazidas do OneNote:</i>' });
    for (const ink of inks) r.blocks.push({ id: uid(), type: 'ink', html: '', ink });
  }
  const s = blankSermon(secId);
  return Object.assign(s, { title: r.title, blocks: r.blocks, date: (page.createdDateTime || '').slice(0, 10) || s.date, duration: 0,
    source: { onenote: page.id, modified: page.lastModifiedDateTime, at: Date.now() } });
}

/* ===== Assistente de importação ===== */
const OneNoteUI = {
  m: null,
  open() {
    MSGraph.restore();
    this.m = UI.modal({ title: 'Importar direto do OneNote', body: el('div', { class: 'on-body' }), wide: true, onClose: () => { this.cancelled = true; MSGraph.cancelLogin && MSGraph.cancelLogin(); } });
    this.route();
  },
  body() { return this.m.body.firstChild; },
  set(...nodes) { const b = this.body(); b.innerHTML = ''; b.append(...nodes.filter(x => x != null && x !== false)); },
  route() {
    if (!MSGraph.canLogin()) return this.viewHosting();
    if (!MSGraph.clientId()) return this.viewSetup();
    if (!MSGraph.token) return this.viewLogin();
    this.viewNotebooks();
  },
  viewHosting() {
    this.set(el('p', { html: 'O login da Microsoft só funciona com o SmartSower aberto num endereço <b>https</b> — não abrindo o arquivo <code>index.html</code> direto do computador.' }),
      el('ol', { class: 'steps', html: '<li>Abra <b>app.netlify.com/drop</b> no Edge e arraste a pasta do SmartSower.</li><li>Abra o link https que aparecer e instale como app (⋯ › Aplicativos › Instalar).</li><li>Leve suas ministrações: aqui, <b>Exportar › Backup</b>; lá, <b>Importar › Restaurar backup</b>.</li>' }),
      el('p', { class: 'muted small', text: 'Enquanto isso, a importação por arquivo (.docx/.mht) e por copiar-e-colar continua funcionando aqui.' }));
  },
  viewSetup() {
    const uri = MSGraph.redirectUri();
    const inp = el('input', { class: 'inp', placeholder: 'ID do aplicativo (cliente) — ex.: 1a2b3c4d-....', value: App.meta.msClientId || '' });
    this.set(
      el('p', { text: 'Configuração única (cerca de 10 minutos). Ela autoriza o SmartSower a LER seus cadernos — nada é alterado no OneNote.' }),
      el('ol', { class: 'steps', html: `
        <li>Abra <b>entra.microsoft.com</b> (ou portal.azure.com) e entre com sua conta Microsoft.</li>
        <li>Vá em <b>Aplicativos › Registros de aplicativo › Novo registro</b>.</li>
        <li>Nome: <b>SmartSower</b>. Em <b>Tipos de conta com suporte</b> escolha <b>“Contas em qualquer diretório organizacional e contas pessoais da Microsoft”</b>.</li>
        <li>Em <b>URI de redirecionamento</b>, escolha a plataforma <b>Aplicativo de página única (SPA)</b> e cole exatamente:<div class="copy-row"><code id="on-uri">${esc(uri)}</code><button class="btn sm" id="on-copy">Copiar</button></div></li>
        <li>Clique em <b>Registrar</b> e copie o <b>ID do aplicativo (cliente)</b> que aparece na página do app. Cole abaixo.</li>` }),
      inp,
      el('div', { class: 'row-btns', style: { marginTop: '10px' } }, el('button', { class: 'btn primary', text: 'Salvar e continuar', onclick: () => {
        const v = inp.value.trim(); if (!/^[0-9a-f-]{36}$/i.test(v)) return UI.toast('O ID tem o formato 00000000-0000-0000-0000-000000000000');
        App.meta.msClientId = v; App.saveMeta(); this.route();
      } })),
      el('p', { class: 'muted small', text: 'Não é preciso adicionar permissões manualmente: no primeiro login a Microsoft pergunta se você autoriza “Ler seus blocos de anotações”.' }));
    $('#on-copy').onclick = async () => { try { await navigator.clipboard.writeText(uri); UI.toast('Copiado'); } catch (e) { UI.toast('Selecione e copie o endereço'); } };
  },
  viewLogin(msg) {
    const btn = el('button', { class: 'btn primary', text: 'Entrar com a conta Microsoft' });
    const status = el('p', { class: 'muted small', text: msg || '' });
    btn.onclick = async () => {
      btn.disabled = true; status.textContent = 'Aguardando o login na janela que abriu…';
      try { await MSGraph.login(); this.viewNotebooks(); }
      catch (e) { btn.disabled = false; status.textContent = e.message; }
    };
    this.set(el('p', { text: 'Entre com a conta onde estão seus cadernos. Uma janela da Microsoft vai abrir.' }), btn, status,
      el('p', { class: 'small' }, el('button', { class: 'btn link', text: 'Alterar ID do aplicativo', onclick: () => this.viewSetup() })));
  },
  async viewNotebooks() {
    this.set(el('p', { class: 'muted', text: 'Carregando seus cadernos…' }));
    let list;
    try { list = await MSGraph.notebooks(); }
    catch (e) { if (e.status === 401) return this.viewLogin('Sessão expirada. Entre novamente.'); return this.set(el('p', { text: 'Erro: ' + e.message })); }
    const acc = MSGraph.account;
    const head = el('div', { class: 'on-acc' }, el('span', { text: acc ? `Conectado como ${acc.name || ''} (${acc.user || ''})` : 'Conectado' }),
      el('button', { class: 'btn link', text: 'Trocar conta', onclick: () => { MSGraph.logout(); this.viewLogin(); } }));
    const box = el('div', { class: 'on-list' });
    if (!list.length) box.append(el('p', { class: 'muted', text: 'Nenhum caderno encontrado nesta conta.' }));
    for (const nb of list) {
      const done = [...App.sermons.values()].filter(s => s.source?.nb === nb.id).length;
      box.append(el('button', { class: 'on-item', onclick: () => this.viewSections(nb) },
        el('b', { text: nb.displayName }), el('span', { class: 'muted small', text: [nb.isShared ? 'compartilhado' : '', nb.lastModifiedDateTime ? 'alterado em ' + new Date(nb.lastModifiedDateTime).toLocaleDateString(DL()) : '', done ? `${done} já importada(s)` : ''].filter(Boolean).join(' · ') })));
    }
    const link = el('input', { class: 'inp', placeholder: 'Ou cole o link do caderno compartilhado (conta de trabalho/escola)' });
    const go = el('button', { class: 'btn', text: 'Abrir link', onclick: async () => {
      const u = link.value.trim(); if (!u) return;
      go.disabled = true;
      try { const nb = await MSGraph.notebookFromLink(u.replace(/^onenote:/, '')); this.viewSections({ id: nb.id, displayName: nb.name || nb.displayName || 'Caderno compartilhado' }); }
      catch (e) { go.disabled = false; UI.toast(MSGraph.account?.personal ? 'Abrir por link só funciona com conta de trabalho/escola. Com conta pessoal, o caderno compartilhado aparece na lista acima depois que você o abre uma vez no OneNote.' : 'Não consegui abrir o link: ' + e.message); }
    } });
    this.set(head, el('h4', { text: 'Escolha o caderno' }), box, el('div', { class: 'on-link' }, link, go));
  },
  async viewSections(nb) {
    this.set(el('p', { class: 'muted', text: `Lendo as seções de “${nb.displayName}”…` }));
    let secs;
    try { secs = await MSGraph.sectionTree(nb.id); } catch (e) { return this.set(el('p', { text: 'Erro: ' + e.message }), el('button', { class: 'btn', text: 'Voltar', onclick: () => this.viewNotebooks() })); }
    const checks = secs.map(s => { const c = el('input', { type: 'checkbox', checked: true }); c._sec = s; return c; });
    const all = el('input', { type: 'checkbox', checked: true, onchange: e => checks.forEach(c => c.checked = e.target.checked) });
    const upd = el('input', { type: 'checkbox' });
    this.set(
      el('div', { class: 'on-acc' }, el('button', { class: 'btn link', text: '‹ Cadernos', onclick: () => this.viewNotebooks() }), el('b', { text: nb.displayName })),
      el('label', { class: 'on-check all' }, all, ` Todas as seções (${secs.length})`),
      el('div', { class: 'on-list' }, secs.map((s, i) => el('label', { class: 'on-check' }, checks[i], ' ' + s.path))),
      el('label', { class: 'on-check' }, upd, ' Trazer de novo as páginas que mudaram no OneNote desde a última importação'),
      el('p', { class: 'muted small', text: 'Cada seção vira uma seção do SmartSower dentro de um caderno com o mesmo nome. Páginas já importadas não se repetem — se a importação parar, é só rodar de novo.' }),
      el('div', { class: 'row-btns' }, el('button', { class: 'btn primary', text: 'Importar', onclick: () => {
        const chosen = checks.filter(c => c.checked).map(c => c._sec); if (!chosen.length) return UI.toast('Escolha ao menos uma seção');
        this.run(nb, chosen, { update: upd.checked });
      } })));
  },
  async run(nb, secs, opts) {
    this.cancelled = false;
    const bar = el('div', { class: 'progress' }, el('div')), line = el('p', { text: 'Preparando…' }), stat = el('p', { class: 'muted small' }), log = el('div', { class: 'on-log' });
    const stop = el('button', { class: 'btn', text: 'Parar', onclick: () => { this.cancelled = true; stop.disabled = true; stop.textContent = 'Parando…'; } });
    this.set(el('h4', { text: 'Importando “' + nb.displayName + '”' }), line, bar, stat, log, el('div', { class: 'row-btns' }, stop));
    MSGraph.onWait = s => { line.textContent = `A Microsoft pediu uma pausa de ${s}s (limite de requisições)… continuando em seguida.`; };
    const c = { new: 0, upd: 0, skip: 0, err: 0, total: 0 };
    // caderno e seções no SmartSower
    let mpNb = App.meta.notebooks.find(n => n.src === nb.id);
    if (!mpNb) { mpNb = { id: uid(), name: nb.displayName, color: SECTION_COLORS[App.meta.notebooks.length % 10], src: nb.id }; App.meta.notebooks.push(mpNb); }
    const bySrc = new Map(); for (const s of App.sermons.values()) if (s.source?.onenote) bySrc.set(s.source.onenote, s);
    try {
      // conta páginas primeiro, para a barra de progresso
      const plan = [];
      for (const sec of secs) { if (this.cancelled) break; line.textContent = `Listando páginas: ${sec.path}…`; const pages = await MSGraph.pages(sec.id); plan.push({ sec, pages }); c.total += pages.length; stat.textContent = `${c.total} página(s) encontradas`; }
      let n = 0;
      for (const { sec, pages } of plan) {
        if (this.cancelled) break;
        let mpSec = App.meta.sections.find(s => s.src === sec.id);
        if (!mpSec) { mpSec = { id: uid(), nb: mpNb.id, name: sec.path, color: SECTION_COLORS[App.meta.sections.length % 10], src: sec.id }; App.meta.sections.push(mpSec); }
        App.saveMeta();
        for (const page of pages) {
          if (this.cancelled) break;
          n++; bar.firstChild.style.width = (n / Math.max(1, c.total) * 100).toFixed(1) + '%';
          const ex = bySrc.get(page.id);
          if (ex && !(opts.update && page.lastModifiedDateTime && page.lastModifiedDateTime > (ex.source.modified || ''))) { c.skip++; stat.textContent = `${c.new} nova(s) · ${c.upd} atualizada(s) · ${c.skip} já existiam · ${c.err} com erro`; continue; }
          line.textContent = `${sec.path} — ${page.title || 'Sem título'} (${n}/${c.total})`;
          try {
            const s = await oneNotePageToSermon(page, mpSec.id);
            s.source.nb = nb.id;
            if (ex) { s.id = ex.id; s.created = ex.created; s.preached = ex.preached; s.settings = ex.settings; c.upd++; } else c.new++;
            App.sermons.set(s.id, s); bySrc.set(page.id, s); await DB.put('sermons', s.id, s);
          } catch (e) {
            if (e.status === 401) throw e;
            c.err++; log.append(el('div', { class: 'small', text: `⚠ ${page.title || page.id}: ${e.message}` }));
          }
          stat.textContent = `${c.new} nova(s) · ${c.upd} atualizada(s) · ${c.skip} já existiam · ${c.err} com erro`;
        }
      }
    } catch (e) {
      log.append(el('div', { class: 'small', text: '⚠ ' + (e.status === 401 ? 'A sessão expirou. Entre de novo e rode a importação — continua de onde parou.' : e.message) }));
    }
    MSGraph.onWait = null;
    await DB.put('kv', 'meta', App.meta);
    App.meta.currentNb = mpNb.id; App.meta.currentSec = App.meta.sections.find(s => s.nb === mpNb.id)?.id || App.meta.currentSec;
    App.renderNav();
    const first = App.sectionSermons(App.meta.currentSec)[0]; if (first) App.open(first.id, false, true);
    line.textContent = this.cancelled ? 'Importação interrompida. Rode de novo para continuar de onde parou.' : 'Importação concluída.';
    bar.firstChild.style.width = '100%';
    stop.replaceWith(el('button', { class: 'btn primary', text: 'Fechar', onclick: () => this.m.close() }), el('button', { class: 'btn', text: 'Importar outro caderno', onclick: () => this.viewNotebooks() }));
  }
};

/* Janela de login: devolve o código para a janela principal e fecha */
function handleAuthPopup() {
  const q = new URLSearchParams(location.search);
  if (!q.has('state') || !(q.has('code') || q.has('error'))) return false;
  try { localStorage.setItem('mp-auth', location.search); } catch (e) { }
  try { window.opener && window.opener.postMessage({ type: 'mp-auth', search: location.search }, location.origin); } catch (e) { }
  document.body.innerHTML = '<div style="font:16px Segoe UI,sans-serif;padding:40px;text-align:center">Login concluído. Você pode fechar esta janela.</div>';
  setTimeout(() => window.close(), 300);
  return true;
}
