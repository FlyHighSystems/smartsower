/* ===== Inicialização ===== */
window.addEventListener('DOMContentLoaded', () => {
  if (handleAuthPopup()) return;
  App.init().catch(e => { console.error(e); Splash.hide(); Boot.fail(e); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && window.top === window && !/claude|anthropic/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
});

/* ===== Aviso de abertura: mostra o erro (ou a etapa que está demorando) e oferece tentar de novo ===== */
const Boot = {
  watch() { this.t = setTimeout(() => { if (!App.booted) Splash.hide(), this.show('O app está demorando para abrir.', `Parado em: ${App.step}`, true); }, 15000); },
  done() {
    clearTimeout(this.t); $('#boot-err')?.remove(); setTimeout(() => Splash.afterBoot(), 600);
    if (App.bootErrors.length) UI.toast('Uma parte do app não carregou direito: ' + App.bootErrors[0].slice(0, 120), { label: 'Detalhes', fn: () => this.show('Uma parte do app não carregou.', App.bootErrors.join('\n'), true) });
  },
  fail(e) { clearTimeout(this.t); this.show('O app não conseguiu abrir.', `${e?.message || e}\nEtapa: ${App.step}\n${(e?.stack || '').split('\n').slice(1, 3).join('\n')}`); },
  show(title, detail, soft) {
    $('#boot-err')?.remove();
    const info = `SmartSower ${typeof Updater !== 'undefined' ? Updater.ver() : ''} · ${navigator.userAgent.split(') ')[0].split('(')[1] || ''}\n${detail}`;
    const box = el('div', { id: 'boot-err' }, el('div', { class: 'be-card' },
      el('h3', { text: '⚠ ' + title }), el('pre', { text: info }),
      el('div', { class: 'row-btns' },
        el('button', { class: 'btn primary', text: '⟳ Tentar de novo', onclick: () => location.reload() }),
        el('button', { class: 'btn', text: 'Atualizar limpo', title: 'Baixa a versão mais nova de novo (seus dados ficam)', onclick: () => Updater.now() }),
        el('button', { class: 'btn', text: '📋 Copiar detalhes', onclick: () => navigator.clipboard?.writeText(info).then(() => UI.toast('Copiado — cole na conversa com o Claude')) }),
        soft ? el('button', { class: 'btn link', text: 'Fechar', onclick: () => box.remove() }) : null)));
    document.body.append(box);
  },
};

/* ===== Tela de abertura: aparece na hora, mostra as etapas e, se a nuvem tiver muito a trazer, o progresso ===== */
const Splash = {
  on: true,
  set(step, pct, sub) {
    if (!this.on) return; const s = $('#sp-step'), f = $('#sp-fill'), u = $('#sp-sub');
    if (step != null && s) s.textContent = step; if (pct != null && f) f.style.width = Math.max(4, Math.min(100, pct)) + '%'; if (sub != null && u) u.textContent = sub;
  },
  hide() {
    if (!this.on) return; this.on = false; clearTimeout(this._t); clearInterval(this._iv); Cloud.listeners?.delete(this._l);
    const e = $('#splash'); if (!e) return; this.set(null, 100); e.classList.add('out'); setTimeout(() => e.remove(), 400);
  },
  /* depois de abrir: se a 1ª sincronização terminar rápido, some; senão vira barra de progresso da nuvem */
  afterBoot() {
    if (!this.on) return;
    if (!Cloud.configured?.() || !Cloud.session || !['syncing', 'pending'].includes(Cloud.status)) return this.hide();
    this.syncMode();
  },
  syncMode() {
    if (!this.on) return;
    const done = () => ['ok', 'offline', 'error', 'out', 'setup'].includes(Cloud.status);
    const tick = () => {
      if (done()) return this.hide();
      const p = Cloud.prog; const pct = p?.total ? 5 + 95 * Math.min(p.done, p.total) / p.total : null;
      this.set('Trazendo seus cadernos da nuvem…', pct, Cloud.progText?.() || (p?.total ? `${Math.min(p.done, p.total)} de ${p.total}` : ''));
    };
    this._l = tick; Cloud.listeners?.add(tick); this._iv = setInterval(tick, 500);
    // se for rápido, nem aparece o modo nuvem; se demorar, oferece usar enquanto termina
    setTimeout(() => { if (this.on) { const b = $('#sp-skip'); if (b) { b.hidden = false; b.onclick = () => { this.hide(); UI.toast('A sincronização continua em segundo plano.'); }; } } }, 2500);
    this._t = setTimeout(() => this.hide(), 45000);
    tick();
  },
};
