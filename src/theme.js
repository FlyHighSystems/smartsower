/* ===== Tema claro/escuro: Automático (Windows), Claro ou Escuro ===== */
const Theme = {
  mq: window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null,
  LABEL: { auto: '◐ Auto', light: '☀ Claro', dark: '☾ Escuro' },
  mode() { return App.meta?.theme || 'auto'; },
  sys() { return this.mq && this.mq.matches ? 'dark' : 'light'; },
  resolved() { const m = this.mode(); return m === 'auto' ? this.sys() : m; },
  /* Modo leitura: 'auto' segue o app/sistema; também pode fixar escuro, sépia ou claro */
  readerMode() { return App.meta?.readerTheme || 'auto'; },
  reader() { const m = this.readerMode(); return m === 'auto' ? this.resolved() : m; },
  apply() {
    const t = this.resolved();
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('mp-theme', JSON.stringify(this.mode())); } catch (e) { }
    const mt = $('meta[name=theme-color]'); if (mt) mt.content = t === 'dark' ? '#2a1838' : '#7719aa';
    const b = $('#btn-theme'); if (b) { b.textContent = this.LABEL[this.mode()]; b.title = `Tema: ${{ auto: 'Automático (segue o Windows)', light: 'Claro', dark: 'Escuro' }[this.mode()]} — clique para trocar`; }
    App.inkSurfaces.forEach(s => { s.theme = t; s.redraw(); });
    if (Reader.active) { Reader.applyLook(); Reader.render(); }
    typeof ViewTab !== 'undefined' && ViewTab.sync();
  },
  cycle() {
    const order = ['auto', 'light', 'dark']; App.meta.theme = order[(order.indexOf(this.mode()) + 1) % 3]; App.saveMeta(); this.apply();
    UI.toast({ auto: 'Tema automático: segue o claro/escuro do Windows', light: 'Tema claro', dark: 'Tema escuro' }[App.meta.theme]);
  },
  init() {
    this.apply();
    $('#btn-theme').onclick = () => this.cycle();
    const on = () => { if (this.mode() === 'auto' || this.readerMode() === 'auto') this.apply(); };
    if (this.mq) this.mq.addEventListener ? this.mq.addEventListener('change', on) : this.mq.addListener(on);
  }
};


/* ===== Barra roxa sempre cabendo: compacta em degraus conforme o espaço (escala do Windows, janela menor, abas a mais) ===== */
const TopFit = {
  N: 6,
  init() {
    const t = $('.topbar'); if (!t) return;
    new ResizeObserver(() => this.fit()).observe(t);
    window.addEventListener('resize', () => this.fit());
    document.fonts?.ready?.then(() => this.fit());
    new MutationObserver(() => this.fit()).observe($('.rtabs'), { attributes: true, subtree: true, attributeFilter: ['hidden'] });
    this.fit();
  },
  fit() {
    if (this._busy) return; this._busy = true;
    const t = $('.topbar'), B = t?.classList; if (!t) { this._busy = false; return; }
    for (let i = 1; i <= this.N; i++) B.remove('tf' + i);
    if (innerWidth > 600) {
      const over = () => t.scrollWidth > t.clientWidth + 1;
      for (let i = 1; i <= this.N && over(); i++) B.add('tf' + i);
      // com as abas na 2ª linha sobra espaço: devolve o que der (rótulos, nome do app)
      if (B.contains('tf6')) for (const i of [5, 4, 3, 2, 1]) { B.remove('tf' + i); if (over()) { B.add('tf' + i); break; } }
    }
    this._busy = false;
  },
};
