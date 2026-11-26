/* ===== Inicialização ===== */
window.addEventListener('DOMContentLoaded', () => {
  if (handleAuthPopup()) return;
  App.init().catch(e => { console.error(e); Boot.fail(e); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && window.top === window && !/claude|anthropic/.test(location.hostname)) {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  }
});

/* ===== Aviso de abertura: mostra o erro (ou a etapa que está demorando) e oferece tentar de novo ===== */
const Boot = {
  watch() { this.t = setTimeout(() => { if (!App.booted) this.show('O app está demorando para abrir.', `Parado em: ${App.step}`, true); }, 15000); },
  done() {
    clearTimeout(this.t); $('#boot-err')?.remove();
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
