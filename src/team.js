/* ============================================================
   Equipe — quem pode usar o SmartSower (aba "Equipe", só administradores)
   A regra de verdade fica no Supabase (supabase.sql): e-mail fora da lista
   não consegue criar conta, e quem é removido perde o acesso aos dados.
   ============================================================ */
const Team = {
  role() { try { return localStorage.getItem('ss-role') || ''; } catch (e) { return ''; } },
  setRole(r) { try { r ? localStorage.setItem('ss-role', r) : localStorage.removeItem('ss-role'); } catch (e) { } this.paintTab(); },
  email() { const u = Cloud.session?.user || (Cloud.session && Cloud.userFromToken(Cloud.session.access_token)) || {}; return (u.email || '').toLowerCase(); },
  // 'admin' | 'member' | null (não está na equipe) | 'nosetup' (o trecho da equipe ainda não foi rodado no Supabase)
  async check() {
    const em = this.email(); if (!em) return null;
    try {
      const r = await Cloud.rest(`/rest/v1/team_members?select=role&email=eq.${encodeURIComponent(em)}`);
      const rows = await r.json(); let role = rows[0]?.role || null;
      if (!role && Cloud.session?.user?.id) {   // veio do Church2all: usa o app, mas não faz parte da equipe
        const l = await (await Cloud.rest(`/rest/v1/c2a_links?select=church_name&user_id=eq.${encodeURIComponent(Cloud.session.user.id)}&limit=1`)).json().catch(() => []);
        if (Array.isArray(l) && l.length) role = 'c2a';
      }
      this.setRole(role); return role;
    } catch (e) {
      if (/não existem|does not exist|Could not find the (table|function)|schema cache/i.test(e.message)) { this.lastErr = e.message; this.setRole('nosetup'); return 'nosetup'; }
      throw e;
    }
  },
  async enforce() { // chamado no login e a cada sincronização
    if (!Cloud.session || !navigator.onLine) return true;
    let role; try { role = await this.check(); } catch (e) { return true; } // erro de rede: não expulsa ninguém
    if (role) return true;
    await Cloud.signOut(); this.setRole('');
    try { sessionStorage.setItem('ss-gate-msg', 'Seu e-mail não está liberado na equipe do SmartSower. Peça ao administrador para cadastrar você.'); } catch (e) { }
    location.reload(); return false;
  },
  paintTab() {
    const t = $('.rtab[data-tab="team"]'); if (!t) return;
    const r = this.role(), show = !!Cloud.session && (r === 'admin' || r === 'nosetup');
    t.hidden = !show;
    if (!show && t.classList.contains('on')) $('.rtab[data-tab="home"]')?.click();
  },
  init() {
    $('#team-open').onclick = () => this.open();
    $('#team-add').onclick = () => this.open(true);
    this.paintTab();
  },
  inviteText(m) {
    const url = location.origin + location.pathname.replace(/index\.html$/, '');
    return `Olá${m.name ? ', ' + m.name.split(' ')[0] : ''}! Liberei seu acesso ao SmartSower.\n\n` +
      `1) Acesse ${url}\n2) Clique em “Primeiro acesso”, use este e-mail (${m.email}) e crie sua senha. Se esse e-mail for uma conta Google, pode usar “Entrar com Google”.\n3) Confirme pelo link que chegar no seu e-mail e entre.\n\n` +
      `Seus cadernos são só seus: ninguém da equipe vê o que você escreve.`;
  },
  copy(txt) { navigator.clipboard?.writeText(txt).then(() => UI.toast('Mensagem copiada — é só colar no WhatsApp ou e-mail'), () => UI.toast('Não consegui copiar')); },
  async open(focusAdd) {
    const body = el('div', { class: 'team' });
    this.m = UI.modal({ title: '👥 Equipe — quem pode usar o SmartSower', body, wide: true });
    this.body = body; await this.render(focusAdd);
  },
  async render(focusAdd) {
    const B = this.body; B.innerHTML = ''; B.append(el('p', { class: 'muted', text: 'Carregando…' }));
    let role; try { role = await this.check(); } catch (e) { B.innerHTML = ''; B.append(el('p', { class: 'on-log', text: '⚠ O Supabase respondeu: ' + e.message }), el('p', { class: 'muted small', text: 'Mande um print desta mensagem para ajustarmos.' })); return; }
    B.innerHTML = '';
    if (role === 'nosetup') return this.renderSetup();
    if (role !== 'admin') { B.append(el('p', { text: 'Só administradores gerenciam a equipe.' })); return; }
    const set = await Cloud.providers(true);
    if (set.__disableSignup) B.append(el('div', { class: 'team-warn', html: '⚠ <b>Falta um passo no Supabase:</b> as pessoas cadastradas aqui ainda não conseguem criar a senha. Em <b>Authentication › Sign In / Providers</b>, ligue <b>“Allow new users to sign up”</b>. Pode ligar sem medo: o banco só aceita contas de e-mails desta lista.' }));
    // adicionar
    const name = el('input', { class: 'inp', placeholder: 'Nome' }), email = el('input', { class: 'inp', type: 'email', placeholder: 'e-mail' });
    const roleSel = el('select', { class: 'inp' }, el('option', { value: 'member', text: 'Membro' }), el('option', { value: 'admin', text: 'Administrador' }));
    const out = el('div');
    const add = async () => {
      const em = email.value.trim().toLowerCase(), nm = name.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return UI.toast('Confira o e-mail');
      try {
        await Cloud.rest('/rest/v1/team_members', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ email: em, name: nm, role: roleSel.value }) });
      } catch (e) { return UI.toast(/duplicate|23505|already exists/i.test(e.message) ? 'Esse e-mail já está na equipe' : e.message); }
      UI.toast(`${nm || em} foi adicionado(a)`);
      await this.render(); this.showInvite({ email: em, name: nm });
    };
    email.onkeydown = e => { if (e.key === 'Enter') add(); };
    B.append(el('div', { class: 'team-add' }, el('h4', { text: '＋ Adicionar pessoa' }),
      el('div', { class: 'team-add-row' }, name, email, roleSel, el('button', { class: 'btn primary', text: 'Adicionar', onclick: add })), out));
    this.inviteBox = out;
    // lista
    let list = [];
    try { list = await (await Cloud.rest('/rest/v1/rpc/team_list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json(); } catch (e) { B.append(el('p', { class: 'on-log', text: '⚠ ' + e.message })); return; }
    const me = this.email(), admins = list.filter(x => x.role === 'admin').length;
    const tbl = el('div', { class: 'team-list' });
    for (const m of list) {
      const isMe = m.email === me;
      const st = m.registered ? (m.last_sign_in ? '✓ Último acesso ' + new Date(m.last_sign_in).toLocaleDateString(DL()) : '✓ Conta criada') : '⏳ Aguardando primeiro acesso';
      tbl.append(el('div', { class: 'team-row' },
        el('div', { class: 'team-who' }, el('b', { text: (m.name || m.email.split('@')[0]) + (isMe ? ' (você)' : '') }), el('span', { class: 'muted small', text: m.email })),
        el('span', { class: 'team-badge ' + m.role, text: m.role === 'admin' ? 'Administrador' : 'Membro' }),
        el('span', { class: 'small ' + (m.registered ? 'ok' : 'muted'), text: st }),
        el('div', { class: 'team-acts' },
          !m.registered && el('button', { class: 'btn sm', text: 'Convite', title: 'Copiar a mensagem de convite', onclick: () => this.showInvite(m) }),
          el('button', { class: 'btn sm', text: m.role === 'admin' ? 'Tornar membro' : 'Tornar admin', disabled: m.role === 'admin' && admins <= 1, title: m.role === 'admin' && admins <= 1 ? 'A equipe precisa de pelo menos um administrador' : '', onclick: () => this.setMemberRole(m, m.role === 'admin' ? 'member' : 'admin') }),
          el('button', { class: 'btn sm danger', text: 'Remover', disabled: isMe || (m.role === 'admin' && admins <= 1), title: isMe ? 'Você não pode remover a si mesmo' : '', onclick: () => this.remove(m) }))));
    }
    B.append(el('h4', { text: `Equipe (${list.length})` }), tbl,
      el('p', { class: 'muted small', text: 'Quem não está nesta lista não consegue criar conta nem entrar — nem com senha, nem por link de e-mail, nem com Google. Ao remover alguém, o acesso aos dados dessa pessoa é cortado na hora. Cada pessoa tem os próprios cadernos: a equipe não vê os textos uns dos outros.' }));
    if (focusAdd) setTimeout(() => name.focus(), 50);
  },
  showInvite(m) {
    const txt = this.inviteText(m), box = this.inviteBox; if (!box) return; box.innerHTML = '';
    box.append(el('div', { class: 'team-invite' }, el('div', { class: 'small', html: `Mensagem para enviar a <b>${esc(m.name || m.email)}</b>:` }), el('pre', { text: txt }),
      el('button', { class: 'btn primary sm', text: '📋 Copiar mensagem', onclick: () => this.copy(txt) })));
  },
  async setMemberRole(m, role) {
    if (m.email === this.email() && role !== 'admin' && !await UI.confirm('Deixar de ser administrador', 'Você não vai mais conseguir abrir esta aba. Continuar?', 'Continuar')) return;
    try { await Cloud.rest(`/rest/v1/team_members?email=eq.${encodeURIComponent(m.email)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ role }) }); }
    catch (e) { return UI.toast(e.message); }
    if (m.email === this.email()) { await this.check(); this.m?.close?.(); $('.modal-back')?.remove(); return; }
    this.render();
  },
  async remove(m) {
    if (!await UI.confirm('Remover da equipe', `Remover ${m.name || m.email}? A pessoa não vai mais conseguir entrar nem sincronizar. Os textos dela não são apagados — se você adicionar o e-mail de novo, ela volta a ter tudo.`, 'Remover')) return;
    try { await Cloud.rest(`/rest/v1/team_members?email=eq.${encodeURIComponent(m.email)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); }
    catch (e) { return UI.toast(e.message); }
    UI.toast('Removido(a) da equipe'); this.render();
  },
  renderSetup() {
    this.body.append(
      el('p', { html: 'Para controlar quem usa o SmartSower, o banco precisa da <b>lista da equipe</b>. São 2 passos, uma vez só:' }),
      el('ol', { class: 'steps', html: '<li>No Supabase, abra <b>SQL Editor</b>, cole o conteúdo atualizado do arquivo <code>supabase.sql</code> e clique em <b>Run</b>. Quem já tem conta hoje (você) vira <b>administrador</b> automaticamente.</li><li>Em <b>Authentication › Sign In / Providers</b>, ligue <b>“Allow new users to sign up”</b>. Pode ligar sem medo: o banco recusa qualquer e-mail que não esteja na lista.</li>' }),
      el('p', { class: 'muted small', text: 'Detalhe técnico: ' + (this.lastErr || '') }),
      el('div', { class: 'row-btns' }, el('button', { class: 'btn primary', text: 'Já fiz — verificar', onclick: () => this.render() })));
  }
};
