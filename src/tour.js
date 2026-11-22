/* ===== Guia de primeiro acesso: destaca cada função e explica em poucas palavras =====
   Aparece uma vez por conta (sincroniza). Reabrir: "❓ Guia" no rodapé dos cadernos ou em ☁. */
const Tour = {
  STEPS: [
    { t: '👋 Bem-vindo ao SmartSower', d: 'Aqui você prepara sermões, devocionais e estudos, e escreve seus livros — tudo organizado, sincronizado entre seus aparelhos e pronto para ministrar. Em 1 minuto eu te mostro o principal.' },
    { sel: '#nb-col:not(.fly), #nb-btn, #nb-select', nav: true, t: '📚 Cadernos', d: 'Cada caderno é uma área: "Ministrações", "Livro: …", "Estudos da célula". Toque aqui para trocar ou criar cadernos — um caderno pode virar livro, com capítulos e roteiro. Dá para deixar a lista de cadernos fixa como uma coluna.' },
    { sel: '#sec-list', nav: true, t: '🗂 Seções', d: 'Dentro do caderno, separe por seções: Sermões, Devocionais, Insights… Toque e segure (ou clique com o direito) para renomear, mover ou mudar a cor.' },
    { sel: '#page-add', nav: true, t: '＋ Nova página', d: 'Crie a página já dizendo o que ela é: 🎤 Sermão, 🌅 Devocional, 📖 Estudo, 👥 Célula ou 💡 Insight. O tipo ajusta o tempo e a revisão, e depois você filtra tudo que é do mesmo tipo.' },
    { sel: '#kind-bar:not([hidden]), #page-search', nav: true, t: '🏷 Filtro e busca rápida', d: 'Os chips juntam as páginas do mesmo tipo de todas as seções do caderno. A busca procura palavras nesta seção, no caderno ou em tudo.' },
    { sel: '#s-title', t: '✍️ Título e informações', d: 'Título, data, texto-base, tipo e tempo. Para uma devocional o app mede tempo de leitura; para um sermão, tempo falado.' },
    { sel: '.rtab[data-tab="insert"]', t: '➕ Inserir blocos', d: 'A página é feita de blocos: 📖 versículo (digite "Jo 3:16" ou uma frase para procurar), ponto, ilustração, aplicação, imagem e desenho. Use ↑ ↓ para reorganizar.' },
    { sel: '.rtab[data-tab="home"]', t: '🎨 Formatação e emojis', d: 'Negrito, realce, cores, listas, notas de rodapé, correção ortográfica (Abc ✓) e 😊 emojis. Ao selecionar um trecho — ou tocar no texto — a barra aparece ali mesmo. Clique direito também abre o menu.' },
    { sel: '#s-review', t: '✦ Revisar com IA', d: 'A IA lê a página como um revisor exigente: clareza, fidelidade ao texto, estrutura, tempo. Você pode responder a cada ponto. Também dá para 🌐 traduzir para inglês ou espanhol.' },
    { sel: '#btn-preach', t: '▶ Pregar', d: 'Modo de ministrar: letra grande, rolagem automática, cronômetro e só o essencial na tela. Toque para sair.' },
    { sel: '.rtab[data-tab="find"]', t: '🔎 Pesquisar', d: 'Procura no app inteiro: palavras, "frase exata", tipo de página, caderno e período.' },
    { sel: '#btn-cloud', t: '☁ Nuvem e atualizações', d: 'Seus textos sincronizam entre o computador, o tablet e o celular. Quando houver versão nova do app, o ⟳ ao lado fica verde — é só tocar.' },
    { t: '🙌 Pronto para semear!', d: 'Comece criando sua primeira página em ＋ Página. Para ver este guia de novo, toque em "❓ Guia" no rodapé da lista de cadernos.' },
  ],
  done() { return !!App.meta?.tourDone || (() => { try { return !!localStorage.getItem('ss-tour-done'); } catch (e) { return false; } })(); },
  markDone() { App.meta.tourDone = Date.now(); App.saveMeta(); try { localStorage.setItem('ss-tour-done', '1'); } catch (e) { } },
  maybeStart() { if (!this.done()) setTimeout(() => { if (!this.done() && !$('.modal') && !document.body.classList.contains('gated')) this.start(); }, 900); },
  start() {
    this.stop(); this.i = 0; this.wasCollapsed = document.body.classList.contains('nav-collapsed');
    this.shade = el('div', { class: 'tour-hole' }); this.card = el('div', { class: 'tour-card', role: 'dialog', 'aria-live': 'polite' });
    this.block = el('div', { class: 'tour-block', onclick: () => this.next() });
    document.body.append(this.block, this.shade, this.card);
    this.onKey = e => { if (e.key === 'Escape') this.finish(); else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); this.next(); } else if (e.key === 'ArrowLeft') this.go(this.i - 1); };
    this.onResize = debounce(() => this.paint(), 120);
    document.addEventListener('keydown', this.onKey, true); window.addEventListener('resize', this.onResize);
    this.go(0);
  },
  target(st) {
    if (!st.sel) return null;
    for (const s of st.sel.split(/,\s*/)) { const e = $(s); if (e) { const r = e.getBoundingClientRect(); if (r.width && r.height) return e; } }
    return null;
  },
  go(i) {
    if (i < 0) return; if (i >= this.STEPS.length) return this.finish();
    this.i = i; const st = this.STEPS[i];
    if (window.innerWidth < 980) document.body.classList.toggle('nav-collapsed', !st.nav);
    setTimeout(() => { const t = this.target(st); if (st.sel && !t && i < this.STEPS.length - 1) return this.go(i + (this.dir || 1)); t?.scrollIntoView?.({ block: 'nearest' }); this.paint(); }, st.nav !== this.lastNav ? 260 : 30);
    this.lastNav = st.nav;
  },
  next() { this.dir = 1; this.go(this.i + 1); },
  paint() {
    const st = this.STEPS[this.i], t = this.target(st), C = this.card;
    const n = this.STEPS.length, last = this.i === n - 1;
    C.innerHTML = '';
    C.append(el('div', { class: 'tour-step', text: `${this.i + 1} de ${n}` }), el('h3', { text: st.t }), el('p', { text: st.d }),
      el('div', { class: 'tour-btns' },
        !last ? el('button', { class: 'btn link sm', text: 'Pular guia', onclick: () => this.finish() }) : el('span'),
        el('span', { class: 'tour-gap' }),
        this.i > 0 ? el('button', { class: 'btn sm', text: '← Voltar', onclick: () => { this.dir = -1; this.go(this.i - 1); } }) : null,
        el('button', { class: 'btn primary sm', text: last ? 'Começar' : 'Próximo →', onclick: () => this.next() })));
    const pad = 6;
    if (t) {
      const r = t.getBoundingClientRect();
      Object.assign(this.shade.style, { display: 'block', left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      this.card.classList.remove('center');
      const cw = Math.min(360, innerWidth - 24), ch = C.offsetHeight || 180, vh = window.visualViewport?.height || innerHeight;
      let top = r.bottom + 14; if (top + ch > vh - 10) top = r.top - ch - 14; if (top < 10) top = Math.min(vh - ch - 10, Math.max(10, r.top + 20));
      const left = Math.max(12, Math.min(innerWidth - cw - 12, r.left + r.width / 2 - cw / 2));
      Object.assign(C.style, { width: cw + 'px', left: left + 'px', top: top + 'px' });
    } else {
      Object.assign(this.shade.style, { display: 'block', left: '50%', top: '50%', width: '0px', height: '0px' });
      this.card.classList.add('center'); Object.assign(C.style, { width: Math.min(420, innerWidth - 24) + 'px', left: '', top: '' });
    }
    C.querySelector('.btn.primary')?.focus({ preventScroll: true });
  },
  finish() { this.markDone(); this.stop(); if (window.innerWidth < 980) document.body.classList.toggle('nav-collapsed', this.wasCollapsed ?? true); },
  stop() {
    this.shade?.remove(); this.card?.remove(); this.block?.remove(); this.shade = this.card = this.block = null;
    if (this.onKey) document.removeEventListener('keydown', this.onKey, true); if (this.onResize) window.removeEventListener('resize', this.onResize);
  }
};
