/* ===== Emojis no editor: botão 😊 na Formatação, na barra flutuante e Ctrl+Shift+E ===== */
const EMOJI_CATS = [
  ['⛪', 'Fé e igreja', [
    ['🙏', 'orar oração mãos rezar gratidão'], ['❤️‍🔥', 'coração em chamas paixão fogo avivamento'], ['☁️', 'nuvem glória presença'], ['🚀', 'foguete crescimento decolar'], ['✝️', 'cruz cristo jesus'], ['📖', 'bíblia livro palavra leitura'], ['🕊️', 'pomba espírito santo paz'],
    ['🔥', 'fogo avivamento espírito'], ['🙌', 'louvor adoração aleluia glória'], ['✨', 'brilho glória especial'], ['👑', 'coroa rei reino'],
    ['🍞', 'pão ceia'], ['🍷', 'vinho cálice ceia sangue'], ['💧', 'água batismo'], ['🌿', 'ramo vida crescimento'], ['⛪', 'igreja templo'],
    ['🎵', 'música louvor nota'], ['🎶', 'músicas louvor cântico'], ['🎤', 'microfone pregar cantar'], ['🎹', 'teclado piano'], ['🎸', 'guitarra violão'],
    ['🥁', 'bateria'], ['🎺', 'trombeta'], ['🌱', 'semente semear broto'], ['🌾', 'colheita trigo seara'], ['🍇', 'uva fruto videira'],
    ['🐑', 'ovelha rebanho'], ['🦁', 'leão judá'], ['🐟', 'peixe pescador'], ['⚓', 'âncora esperança'], ['🛡️', 'escudo fé proteção'],
    ['⚔️', 'espada guerra batalha'], ['🗝️', 'chave'], ['🕯️', 'vela luz'], ['💡', 'luz ideia insight'], ['🌅', 'amanhecer novo dia'],
    ['🌈', 'arco-íris aliança promessa'], ['⭐', 'estrela'], ['☀️', 'sol'], ['🌙', 'lua noite'], ['⛰️', 'monte montanha'], ['🌊', 'mar onda'],
    ['🏔️', 'montanha neve'], ['🚪', 'porta'], ['🪨', 'rocha pedra'], ['🏠', 'casa lar família'], ['👣', 'pegadas caminho passos'], ['🧭', 'bússola direção'],
    ['⏳', 'tempo ampulheta'], ['📜', 'pergaminho escritura lei'], ['🕎', 'menorá candelabro'], ['🫒', 'azeite oliva unção'], ['🪔', 'lâmpada azeite'],
  ]],
  ['😊', 'Rostos', [
    ['😊', 'sorriso feliz'], ['😀', 'alegre feliz'], ['😂', 'risada rir'], ['🥹', 'emocionado'], ['😍', 'amei apaixonado'], ['🥰', 'carinho amor'],
    ['😇', 'anjo santo'], ['🤗', 'abraço'], ['🤔', 'pensar pensando dúvida'], ['🤯', 'mente explodindo uau'], ['😮', 'surpresa'], ['😢', 'triste choro'],
    ['😭', 'chorar'], ['😔', 'pensativo triste'], ['😬', 'tenso'], ['😴', 'sono'], ['😎', 'legal'], ['🤩', 'incrível'], ['😅', 'ufa alívio'],
    ['🙂', 'leve sorriso'], ['😉', 'piscada'], ['🤫', 'silêncio segredo'], ['🫣', 'espiando'], ['🫡', 'saudação continência'], ['😡', 'raiva'],
  ]],
  ['👍', 'Gestos e pessoas', [
    ['👍', 'joia curtir ok'], ['👎', 'não'], ['👏', 'palmas aplauso'], ['🤝', 'aperto mão acordo aliança'], ['✋', 'mão pare'], ['👋', 'tchau olá'],
    ['💪', 'força forte'], ['👉', 'apontar direita'], ['👈', 'esquerda'], ['👆', 'cima'], ['👇', 'baixo'], ['☝️', 'um atenção'], ['✌️', 'paz vitória'],
    ['🫶', 'coração mãos amor'], ['👀', 'olhos ver olhar'], ['👂', 'ouvir ouvido'], ['🧠', 'mente cérebro'], ['❤️‍🔥', 'coração em chamas paixão'],
    ['👨‍👩‍👧‍👦', 'família'], ['👶', 'bebê criança'], ['🧒', 'criança'], ['👨', 'homem'], ['👩', 'mulher'], ['👴', 'idoso'], ['👵', 'idosa'], ['🧑‍🤝‍🧑', 'amigos comunhão'],
    ['🚶', 'andar caminhar'], ['🏃', 'correr corrida'], ['🧎', 'ajoelhar'], ['💑', 'casal'], ['💍', 'anel casamento aliança'],
  ]],
  ['❤️', 'Símbolos', [
    ['❤️', 'coração amor'], ['💜', 'roxo coração'], ['💙', 'azul coração'], ['💚', 'verde coração'], ['💛', 'amarelo coração'], ['🧡', 'laranja'],
    ['🤍', 'branco coração'], ['🖤', 'preto coração'], ['💔', 'coração partido'], ['❣️', 'exclamação coração'], ['💯', 'cem'], ['✅', 'feito ok certo check'],
    ['☑️', 'marcado'], ['✔️', 'certo'], ['❌', 'errado não x'], ['⚠️', 'atenção aviso cuidado'], ['❗', 'exclamação importante'], ['❓', 'pergunta'],
    ['‼️', 'importante'], ['⁉️', 'surpresa pergunta'], ['➡️', 'seta direita'], ['⬅️', 'seta esquerda'], ['⬆️', 'seta cima'], ['⬇️', 'seta baixo'],
    ['↪️', 'volta'], ['🔁', 'repetir'], ['🔴', 'vermelho círculo'], ['🟠', 'laranja'], ['🟡', 'amarelo'], ['🟢', 'verde'], ['🔵', 'azul'], ['🟣', 'roxo'],
    ['⚫', 'preto'], ['⚪', 'branco'], ['🔸', 'losango'], ['🔹', 'losango azul'], ['▶️', 'play'], ['⏸️', 'pausa'], ['➕', 'mais'], ['➖', 'menos'],
    ['1️⃣', 'um 1'], ['2️⃣', 'dois 2'], ['3️⃣', 'três 3'], ['4️⃣', 'quatro 4'], ['5️⃣', 'cinco 5'], ['6️⃣', 'seis 6'], ['7️⃣', 'sete 7'], ['8️⃣', 'oito 8'], ['9️⃣', 'nove 9'], ['🔟', 'dez 10'],
  ]],
  ['📌', 'Objetos e estudo', [
    ['📌', 'alfinete fixar'], ['📍', 'local'], ['📝', 'anotação nota escrever'], ['✍️', 'escrever'], ['🖊️', 'caneta'], ['📚', 'livros estudo'],
    ['📓', 'caderno'], ['📅', 'calendário data'], ['⏰', 'despertador hora'], ['🕐', 'relógio'], ['🎯', 'alvo objetivo foco'], ['🏆', 'troféu vitória'],
    ['🎁', 'presente dom'], ['🎉', 'festa celebração'], ['🎊', 'confete'], ['🎂', 'aniversário bolo'], ['💰', 'dinheiro oferta'], ['🪙', 'moeda'],
    ['💎', 'diamante tesouro'], ['🔑', 'chave'], ['🔒', 'cadeado'], ['🔍', 'lupa buscar'], ['💬', 'conversa fala'], ['🗣️', 'falar pregar'],
    ['📣', 'anúncio megafone'], ['📢', 'aviso'], ['📱', 'celular'], ['💻', 'computador'], ['🎬', 'vídeo filme'], ['📷', 'foto câmera'], ['🧩', 'peça quebra-cabeça'],
    ['⚖️', 'balança justiça'], ['🪞', 'espelho'], ['🧱', 'tijolo'], ['🏗️', 'construção'], ['🌍', 'mundo terra nações'], ['✈️', 'avião viagem missão'], ['🚀', 'foguete'],
  ]],
  ['🌸', 'Natureza e comida', [
    ['🌸', 'flor'], ['🌷', 'tulipa'], ['🌹', 'rosa'], ['🌻', 'girassol'], ['🌳', 'árvore'], ['🌲', 'pinheiro'], ['🍃', 'folha vento'], ['🍂', 'outono'],
    ['☁️', 'nuvem'], ['⛅', 'nuvem sol'], ['🌤️', 'sol entre nuvens'], ['🌥️', 'nublado nuvem'], ['🌦️', 'chuva sol'], ['❄️', 'neve frio'], ['⛈️', 'tempestade'], ['🌧️', 'chuva'], ['⚡', 'raio poder'], ['🌋', 'vulcão'], ['🏜️', 'deserto'], ['🐦', 'pássaro'], ['🦅', 'águia'],
    ['🐝', 'abelha'], ['🦋', 'borboleta transformação'], ['🐍', 'serpente'], ['🍎', 'maçã fruto'], ['🍯', 'mel'], ['🥛', 'leite'], ['☕', 'café'], ['🍽️', 'refeição mesa'],
  ]],
];
const Emoji = {
  range: null, field: null, last: null, // last: 'field' | 'block' — o que você tocou por último
  isField(e) { return e?.matches?.('#editor input.s-title, #editor input.verse-ref, #editor .s-meta input[type=text], #editor input.b-title, #editor textarea'); },
  recent() { try { return JSON.parse(localStorage.getItem('ss-emoji-recent') || '[]'); } catch (e) { return []; } },
  pushRecent(e) { const r = [e, ...this.recent().filter(x => x !== e)].slice(0, 24); try { localStorage.setItem('ss-emoji-recent', JSON.stringify(r)); } catch (x) { } },
  host(n) { return (n?.nodeType === 1 ? n : n?.parentElement)?.closest?.('#blocks [contenteditable="true"], #blocks .b-body[contenteditable]'); },
  // guarda onde está o cursor — só quando o foco está de fato no título/campo ou no texto
  remember() {
    const a = document.activeElement;
    if (this.isField(a)) { this.field = { el: a, id: a.id, s: a.selectionStart ?? a.value.length, e: a.selectionEnd ?? a.value.length }; this.last = 'field'; return; }
    const s = getSelection(); if (!s.rangeCount) return;
    const r = s.getRangeAt(0), h = this.host(r.startContainer);
    if (h && (a === h || h.contains(a))) { this.range = r.cloneRange(); this.rangeBlock = h.closest('.block')?.dataset.id; this.last = 'block'; }
  },
  resolveField() { const f = this.field; if (!f) return null; if (!f.el.isConnected && f.id) f.el = document.getElementById(f.id); return f.el?.isConnected ? f : null; },
  resolveRange() {
    let r = this.range; if (r && this.host(r.startContainer)?.isConnected) return r;
    const b = this.rangeBlock && $(`#blocks .block[data-id="${this.rangeBlock}"] .b-body[contenteditable]`); if (!b) return null;
    r = document.createRange(); r.selectNodeContents(b); r.collapse(false); return this.range = r;
  },
  insert(e) {
    const touch = matchMedia('(pointer:coarse)').matches;
    const f = this.resolveField(), r = this.resolveRange();
    const useField = f && (this.last === 'field' || !r);
    if (useField) { // título da página e outros campos de uma linha
      if (!touch) f.el.focus({ preventScroll: true });
      f.el.setRangeText(e, f.s, f.e, 'end'); f.s = f.e = f.s + e.length;
      f.el.dispatchEvent(new Event('input', { bubbles: true })); this.pushRecent(e); return;
    }
    if (!r) return UI.toast('Toque no texto ou no título onde quer o emoji e tente de novo');
    const h = this.host(r.startContainer);
    if (touch) { // no celular: insere sem abrir o teclado a cada emoji
      r.deleteContents(); const t = document.createTextNode(e); r.insertNode(t); r.setStartAfter(t); r.collapse(true);
      h.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      h.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.execCommand('insertText', false, e); const s2 = getSelection(); if (s2.rangeCount) this.range = s2.getRangeAt(0).cloneRange();
    }
    this.pushRecent(e);
  },
  open(anchor) {
    this.remember(); this.close();
    const grid = el('div', { class: 'em-grid' }), q = el('input', { class: 'inp em-q', placeholder: 'Procurar: oração, coração, fogo…' });
    const tabs = el('div', { class: 'em-tabs' });
    const show = (list, title) => {
      grid.innerHTML = ''; if (title) grid.append(el('div', { class: 'em-h', text: title }));
      if (!list.length) grid.append(el('div', { class: 'em-h muted', text: 'Nada encontrado' }));
      for (const [e, k] of list) { const b = el('button', { class: 'em-b', text: e, title: k || '' }); b.addEventListener('mousedown', x => x.preventDefault()); b.onclick = () => this.insert(e); grid.append(b); }
    };
    const showCat = i => { [...tabs.children].forEach((t, j) => t.classList.toggle('on', j === i)); if (i === 0) { const r = this.recent(); show(r.map(e => [e, '']), r.length ? 'Usados recentemente' : 'Os que você usar aparecem aqui'); if (!r.length) show(EMOJI_CATS[0][2], 'Fé e igreja'); } else show(EMOJI_CATS[i - 1][2], EMOJI_CATS[i - 1][1]); };
    tabs.append(el('button', { class: 'em-t', text: '🕘', title: 'Recentes', onclick: () => showCat(0) }), ...EMOJI_CATS.map((c, i) => el('button', { class: 'em-t', text: c[0], title: c[1], onclick: () => showCat(i + 1) })));
    q.oninput = () => { const t = stripAccents(q.value.trim().toLowerCase()); if (!t) return showCat(0); const all = EMOJI_CATS.flatMap(c => c[2]); const seen = new Set(); show(all.filter(([e, k]) => stripAccents(k).includes(t) && !seen.has(e) && seen.add(e)), `“${q.value.trim()}”`); };
    q.onkeydown = e => { if (e.key === 'Enter') { const b = grid.querySelector('.em-b'); if (b) b.click(); } if (e.key === 'Escape') { e.stopPropagation(); this.close(true); } };
    const pop = this.pop = el('div', { class: 'em-pop', role: 'dialog', 'aria-label': 'Emojis' }, q, tabs, grid, el('div', { class: 'em-foot muted', text: 'Clique para inserir · pode escolher vários · Esc fecha' }));
    document.body.append(pop); showCat(0);
    const b = anchor?.getBoundingClientRect?.(), W = pop.offsetWidth, H = pop.offsetHeight;
    if (innerWidth < 600 || !b) pop.classList.add('sheet');
    else { pop.style.left = Math.max(8, Math.min(innerWidth - W - 8, b.left)) + 'px'; pop.style.top = (b.bottom + 6 + H > innerHeight ? Math.max(8, b.top - H - 6) : b.bottom + 6) + 'px'; }
    if (!matchMedia('(pointer:coarse)').matches) setTimeout(() => q.focus({ preventScroll: true }), 30);
    setTimeout(() => { this._out = e => { if (!pop.contains(e.target) && e.target !== anchor) this.close(); }; document.addEventListener('pointerdown', this._out, true); }, 0);
  },
  close(back) {
    const had = !!this.pop; this.pop?.remove(); this.pop = null;
    if (had && back && this.last === 'field' && this.resolveField()) { const f = this.field; f.el.focus({ preventScroll: true }); f.el.setSelectionRange(f.s, f.e); return; }
    if (had && back) { const r = this.resolveRange(), h = r && this.host(r.startContainer); if (h?.isConnected) { h.focus({ preventScroll: true }); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } } if (this._out) document.removeEventListener('pointerdown', this._out, true); this._out = null; },
  init() {
    const rem = () => { if (!this.pop || !this.pop.contains(document.activeElement)) this.remember(); };
    document.addEventListener('selectionchange', rem); document.addEventListener('keyup', rem, true); document.addEventListener('pointerup', rem, true); document.addEventListener('focusin', rem, true);
    $('#rb-emoji')?.addEventListener('mousedown', e => e.preventDefault());
    $('#rb-emoji')?.addEventListener('click', e => this.open(e.currentTarget));
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.pop) { this.close(true); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'e') { const a = document.activeElement; if (this.isField(a)) { e.preventDefault(); this.open(a); return; } const s = getSelection(); if (s.rangeCount && this.host(s.getRangeAt(0).startContainer)) { e.preventDefault(); const r = s.getRangeAt(0).getBoundingClientRect(); this.open({ getBoundingClientRect: () => r }); } }
    });
  }
};
