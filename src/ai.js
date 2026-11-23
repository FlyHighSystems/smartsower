/* ===== Inteligência artificial: Claude (Anthropic) e Gemini (Google), direto do navegador =====
   As chaves ficam só neste aparelho (localStorage). Nada passa por servidor nosso. */
const AI = {
  cfg() {
    let c = {}; try { c = JSON.parse(localStorage.getItem('ss-ai') || '{}'); } catch (e) { }
    return { anthropicKey: c.anthropicKey || '', geminiKey: c.geminiKey || '', claudeModel: c.claudeModel || 'claude-sonnet-5-5', geminiModel: c.geminiModel || 'gemini-flash-latest', church: c.church ?? 'Igreja evangélica; cultos de domingo e células; público misto (membros e visitantes).', syncKeys: c.syncKeys !== false, at: c.at || 0, imageModel: c.imageModel || '', hordeKey: c.hordeKey || '', pollKey: c.pollKey || '' };
  },
  /* fromCloud: veio de outro aparelho (mantém o horário original e não reenvia) */
  save(c, { fromCloud = false } = {}) {
    c = { ...c, at: fromCloud ? (c.at || 0) : Date.now() };
    try { localStorage.setItem('ss-ai', JSON.stringify(c)); } catch (e) { }
    if (!fromCloud && typeof App !== 'undefined' && App.meta) App.saveMeta();
  },
  /* O que vai para a conta: com as chaves (padrão) ou só modelos e contexto */
  cloudPayload() {
    const c = this.cfg(); if (!c.at) return null;
    return c.syncKeys ? c : { ...c, anthropicKey: '', geminiKey: '', hordeKey: '', pollKey: '' };
  },
  fromCloud(r) {
    if (!r || !r.at || r.at <= this.cfg().at) return false;
    const loc = this.cfg();
    this.save(r.syncKeys === false ? { ...r, anthropicKey: loc.anthropicKey, geminiKey: loc.geminiKey, hordeKey: loc.hordeKey, pollKey: loc.pollKey } : r, { fromCloud: true });
    return true;
  },
  has(p) { const c = this.cfg(); return p === 'claude' ? !!c.anthropicKey : p === 'gemini' ? !!c.geminiKey : !!(c.anthropicKey || c.geminiKey); },
  async claude(system, user, { maxTokens = 6000 } = {}) {
    const c = this.cfg();
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': c.anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: c.claudeModel, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Claude: ' + (j.error?.message || ('erro ' + r.status)));
    return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  },
  /* Modelos reserva quando o escolhido está sobrecarregado (503), sem cota (429) ou não existe (404) */
  GEMINI_FALLBACK: ['gemini-flash-latest', 'gemini-flash-lite-latest'],
  wait: ms => new Promise(r => setTimeout(r, ms)),
  async gemini(system, user, { json = true, onRetry } = {}) {
    const c = this.cfg();
    const models = [...new Set([c.geminiModel, ...this.GEMINI_FALLBACK])];
    const body = JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}) });
    let lastErr = '';
    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        let r, j = {};
        try {
          r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': c.geminiKey, 'content-type': 'application/json' }, body });
          j = await r.json().catch(() => ({}));
        } catch (e) { lastErr = 'sem conexão'; break; }
        if (r.ok) {
          this.lastGeminiModel = model;
          const parts = j.candidates?.[0]?.content?.parts || [];
          return parts.filter(p => !p.thought && p.text).map(p => p.text).join('');
        }
        lastErr = j.error?.message || ('erro ' + r.status);
        if (r.status === 401 || r.status === 403 || r.status === 400) throw new Error('Gemini: ' + lastErr); // chave/pedido: trocar de modelo não resolve
        if (r.status === 404) break;                                   // modelo não existe: vai para o próximo
        if (r.status === 503 || r.status === 500 || r.status === 429) {
          if (attempt < 2) { onRetry && onRetry(model, attempt + 1); await this.wait(attempt ? 5000 : 2000); continue; }
          break;                                                       // insistiu 3x: tenta o modelo reserva
        }
        throw new Error('Gemini: ' + lastErr);
      }
    }
    throw new Error('Gemini (todos os modelos ocupados ou indisponíveis — tente em alguns minutos): ' + lastErr);
  },
  ask(provider, system, user, opts) { return provider === 'gemini' ? this.gemini(system, user, opts) : this.claude(system, user, opts); },
  parseJSON(t) {
    if (!t) throw new Error('Resposta vazia');
    let s = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(s); } catch (e) { }
    const a = s.indexOf('{'); if (a > 0) s = s.slice(a);
    try { return JSON.parse(s.slice(0, s.lastIndexOf('}') + 1)); } catch (e) { }
    try { return JSON.parse(this.repairJSON(s)); } catch (e) { }
    throw new Error('A IA devolveu uma resposta mal formatada');
  },
  /* Conserta os erros comuns de JSON das IAs: aspas sem escape dentro de textos
     (ex.: o texto diz "quando plantada"), quebras de linha cruas, vírgula sobrando e resposta cortada no fim. */
  repairJSON(s) {
    let out = '', inStr = false, esc = false; const stack = [];
    const nextSig = i => { for (let k = i + 1; k < s.length; k++) if (!/\s/.test(s[k])) return s[k]; return ''; };
    const sigAt = i => { for (let k = i + 1; k < s.length; k++) if (!/\s/.test(s[k])) return k; return -1; };
    /* essa aspa fecha o texto? Num objeto, depois da vírgula tem que vir uma chave "…": */
    const closes = i => {
      const k = sigAt(i); if (k < 0) return true; const n = s[k];
      if (n === '}' || n === ']' || n === ':') return true;
      if (n !== ',') return false;
      if (stack[stack.length - 1] !== '}') return true;
      const j = sigAt(k); if (j < 0 || s[j] !== '"') return false;
      for (let q = j + 1; q < s.length; q++) { if (s[q] === '\\') { q++; continue; } if (s[q] === '"') return s[sigAt(q)] === ':'; if (s[q] === '\n') return false; }
      return false;
    };
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) { out += c; esc = false; continue; }
        if (c === '\\') { out += c; esc = true; continue; }
        if (c === '"') { if (closes(i)) { inStr = false; out += c; } else out += '\\"'; continue; }
        if (c === '\n') { out += '\\n'; continue; } if (c === '\r') continue; if (c === '\t') { out += '\\t'; continue; }
        out += c; continue;
      }
      if (c === '"') { inStr = true; out += c; continue; }
      if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
      else if (c === '}' || c === ']') stack.pop();
      out += c;
    }
    if (inStr) out += '"';
    out = out.replace(/,\s*$/, '');
    while (stack.length) out += stack.pop();
    return out.replace(/,(\s*[}\]])/g, '$1');
  },
  /* Ministração em texto simples, com rótulos dos blocos */
  sermonText(s) {
    const lines = [`# ${s.title}`]; if (s.passage) lines.push(`Texto-base: ${s.passage}`); if (Book.is(s)) { if (s.duration) lines.push(`Duração planejada: ${s.duration} min`); } else { const tt = PageKinds.timeText(s); if (tt) lines.push(tt); }
    let n = 0;
    for (const b of s.blocks) {
      const t = htmlToText(b.html || '').trim();
      if (b.type === 'point') lines.push(`\n## Ponto ${++n}: ${t}`);
      else if (b.type === 'verse') lines.push(`[Versículo ${b.ref || ''}${b.verLabel ? ' (' + b.verLabel + ')' : ''}] ${t}`);
      else if (b.type === 'ink') lines.push('[Desenho à mão]');
      else if (b.type === 'image') lines.push(`[Imagem]${b.alt ? ' ' + b.alt.slice(0, 400) : ''}`);
      else if (t) lines.push(b.type === 'text' ? t : `[${BLOCK_TYPES[b.type]?.label || 'Bloco'}] ${t}`);
    }
    return lines.join('\n');
  },
  settings(after) {
    const c = this.cfg();
    const ak = el('input', { class: 'inp', type: 'password', placeholder: 'sk-ant-…', value: c.anthropicKey, autocomplete: 'off' });
    const gk = el('input', { class: 'inp', type: 'password', placeholder: 'AQ.… ou AIza…', value: c.geminiKey, autocomplete: 'off' });
    /* Campo de chave com mostrar/ocultar e trocar (limpa e foca para colar a nova) */
    const keyRow = inp => el('div', { class: 'key-row', style: { display: 'flex', gap: '6px', alignItems: 'center' } }, inp,
      el('button', { class: 'btn sm', type: 'button', title: 'Mostrar/ocultar', text: '👁', onclick: () => { inp.type = inp.type === 'password' ? 'text' : 'password'; } }),
      el('button', { class: 'btn sm', type: 'button', title: 'Apagar e colar uma nova', text: 'Trocar', onclick: () => { inp.value = ''; inp.type = 'text'; inp.focus(); } }));
    ak.style.flex = gk.style.flex = '1';
    const cm = el('input', { class: 'inp', value: c.claudeModel }), gm = el('input', { class: 'inp', value: c.geminiModel }), im = el('input', { class: 'inp', value: c.imageModel, placeholder: 'automático (Nano Banana 2 → Nano Banana)' }), hk = el('input', { class: 'inp', type: 'password', value: c.hordeKey, placeholder: 'opcional — sem chave usa a anônima (fila mais lenta)', autocomplete: 'off' }), pk = el('input', { class: 'inp', type: 'password', value: c.pollKey, placeholder: 'opcional — pk_… (sem chave: ~1 imagem a cada 15 s)', autocomplete: 'off' });
    pk.style.flex = hk.style.flex = '1';
    const ch = el('textarea', { class: 'inp', rows: 2 }); ch.value = c.church;
    const sk = el('input', { type: 'checkbox', checked: c.syncKeys });
    const out = el('p', { class: 'small' });
    const val = () => ({ anthropicKey: ak.value.trim(), geminiKey: gk.value.trim(), claudeModel: cm.value.trim() || 'claude-sonnet-5-5', geminiModel: gm.value.trim() || 'gemini-flash-latest', church: ch.value.trim(), syncKeys: sk.checked, imageModel: im.value.trim(), hordeKey: hk.value.trim(), pollKey: pk.value.trim() });
    const body = el('div', { class: 'ai-set' },
      el('p', { class: 'muted', html: 'As chamadas vão direto daqui para a Anthropic e o Google. Cada análise custa centavos (cobrança na sua conta de cada serviço). Você pode usar só uma das duas.' }),
      el('label', { class: 'lbl', text: 'Chave da API do Claude (console.anthropic.com › API Keys)' }), keyRow(ak),
      el('label', { class: 'lbl', text: 'Chave da API do Gemini (aistudio.google.com › Get API key)' }), keyRow(gk),
      el('h4', { class: 'ai-sec', text: '🖼 Imagens do telão (opcionais — melhoram a fila e os limites)' }),
      el('label', { class: 'lbl', text: 'Chave do Pollinations (grátis em enter.pollinations.ai — use a publicável pk_…)' }), keyRow(pk),
      el('label', { class: 'lbl', text: 'Chave do AI Horde (grátis em aihorde.net/register — dá prioridade na fila)' }), keyRow(hk),
      el('details', {}, el('summary', { text: 'Modelos e contexto' }),
        el('label', { class: 'lbl', text: 'Modelo do Claude' }), cm,
        el('label', { class: 'lbl', text: 'Modelo do Gemini' }), gm,
        el('label', { class: 'lbl', text: 'Modelo de imagem do Gemini (fundos do telão)' }), im,
        el('label', { class: 'lbl', text: 'Contexto da sua igreja (ajuda a IA a calibrar a revisão)' }), ch),
      el('label', { class: 'lbl', style: { display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 'normal' } }, sk,
        el('span', { html: 'Guardar as chaves na minha conta e usar em <b>todos os meus aparelhos</b> (precisa estar logado na nuvem). Desmarcado: ficam só neste aparelho.' })),
      out);
    UI.modal({ title: 'Inteligência artificial', body, wide: true, actions: [
      { label: 'Testar', onClick: async () => {
        this.save(val()); out.textContent = 'Testando…'; const res = [];
        if (this.has('claude')) try { await this.claude('Responda só: ok', 'teste', { maxTokens: 10 }); res.push('Claude ✓'); } catch (e) { res.push('Claude ✗ ' + e.message); }
        if (this.has('gemini')) try {
          await this.gemini('Responda só: ok', 'teste', { json: false, onRetry: (m, n) => { out.textContent = `Gemini ocupado (${m}) — tentando de novo (${n})…`; } });
          res.push('Gemini ✓' + (this.lastGeminiModel !== val().geminiModel ? ` (respondeu pelo reserva ${this.lastGeminiModel})` : ''));
        } catch (e) { res.push('Gemini ✗ ' + e.message); }
        out.textContent = res.join(' · ') || 'Informe pelo menos uma chave.'; return false;
      } },
      { label: 'Salvar', primary: true, onClick: () => { this.save(val()); UI.toast('Configuração de IA salva'); after && after(); } }] });
  }
};

/* ===== Checagem de referências (por código, sem IA) ===== */
async function checkReferences(s) {
  const out = [];
  const ver = Bible.current(); const books = ver ? await Bible.load(ver) : null;
  const words = t => new Set(stripAccents(t.toLowerCase()).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3));
  const seen = new Set();
  const check = async (raw, where, text) => {
    const r = parseRef(raw); if (!r) return;
    const key = refLabel(r) + '|' + where; if (seen.has(key)) return; seen.add(key);
    if (!books) { out.push({ ref: refLabel(r), where, status: 'skip', msg: 'Baixe uma Bíblia para conferir.' }); return; }
    const bk = books[r.book - 1];
    if (!bk) { out.push({ ref: refLabel(r), where, status: 'warn', msg: 'Livro não está nesta versão.' }); return; }
    if (r.ch > bk.length) { out.push({ ref: refLabel(r), where, status: 'error', msg: `${BOOKS[r.book - 1].name} tem só ${bk.length} capítulos.` }); return; }
    const max = bk[r.ch - 1].length;
    const bad = r.ranges.find(([a, z]) => a > max || z > max || a < 1 || z < a);
    if (bad) { out.push({ ref: refLabel(r), where, status: 'error', msg: `${BOOKS[r.book - 1].name} ${r.ch} tem só ${max} versículos.` }); return; }
    if (text && text.length > 25 && r.ranges.length) {
      const res = await Bible.lookup(r, ver); const a = words(text), b = words(res.verses.map(v => v[1]).join(' '));
      const inter = [...a].filter(w => b.has(w)).length; const sim = inter / Math.max(1, Math.min(a.size, b.size));
      if (sim < 0.3) { out.push({ ref: refLabel(r), where, status: 'warn', msg: `O texto citado não parece ser desta referência (semelhança ${Math.round(sim * 100)}% com a ${Bible.info(ver).short}). Confira — pode ser só outra tradução.` }); return; }
    }
    out.push({ ref: refLabel(r), where, status: 'ok', msg: 'Referência válida.' });
  };
  if (s.passage) for (const p of s.passage.split(/;/)) await check(p.trim(), 'Texto-base');
  let n = 0;
  for (const b of s.blocks) {
    if (b.type === 'point') n++;
    const where = n ? `Ponto ${n}` : 'Introdução';
    if (b.type === 'verse' && b.ref) await check(b.ref, where, htmlToText(b.html || '').replace(/\b\d{1,3}\b/g, ' '));
    const t = htmlToText(b.html || ''); REF_IN_TEXT.lastIndex = 0; let m;
    while ((m = REF_IN_TEXT.exec(t))) await check(m[0], where);
  }
  return out;
}

/* ===== Revisão do sermão ===== */
const REVIEW_KINDS = [
  ['sermao', 'Sermão (culto)', 'Mensagem completa para o culto: avalie todos os critérios normalmente.'],
  ['devocional', 'Devocional curta', 'Texto devocional CURTO (2 a 5 minutos de leitura) para edificação pessoal. NÃO cobre estrutura de sermão, várias ilustrações, apelo formal ou contexto exaustivo. Avalie proporcionalmente ao gênero: clareza, fidelidade, uma ideia central bem aplicada. Se um critério não se aplica a uma devocional, use "nota": null e diga "não se aplica a uma devocional".'],
  ['estudo', 'Estudo bíblico', 'Estudo bíblico de ensino: pese mais fidelidade, contexto e clareza didática; apelo emocional não é esperado.'],
  ['celula', 'Palavra para célula / PG', 'Palavra curta para pequeno grupo: deve gerar conversa e aplicação; perguntas para o grupo valem mais que oratória. Critérios que não se aplicam: "nota": null.'],
  ['insight', 'Insight / anotação', 'Anotação curta ou semente de mensagem: avalie se a ideia central é clara, fiel ao texto e aproveitável; não cobre estrutura, ilustrações nem apelo ("nota": null).'],
  ['outro', 'Outro', 'Gênero livre: adapte os critérios ao propósito do texto e use "nota": null quando um critério não se aplicar.'],
  ['capitulo', 'Capítulo de livro (editor)', 'Capítulo de um LIVRO cristão de não ficção, não um sermão. Faça edição de desenvolvimento (tese, argumento, estrutura, ritmo) E edição de linha: em "riscos", aponte trechos concretos (frases longas, repetições de palavras, clichês, passagens que soam como pregação falada e não como texto escrito) com a reescrita sugerida. Não cobre apelo nem estrutura de culto.', 'book'],
  ['beta', 'Leitor beta', 'Leia como um LEITOR comum do público do livro, não como especialista. Diga com sinceridade onde ficou entediado, confuso ou desconfiado, onde se emocionou, e se teria vontade de continuar. Em "riscos", cite os trechos onde você largaria o livro e por quê.', 'book']
];
const BOOK_CRITERIA = [['tese', 'Ideia central e promessa do capítulo'], ['fidelidade', 'Fidelidade bíblica e teológica'], ['argumento', 'Argumentação e progressão'], ['ritmo', 'Ritmo e engajamento'], ['voz', 'Voz e estilo (texto escrito, não falado)'], ['clareza', 'Clareza'], ['aberturafim', 'Abertura e fechamento']];
const BETA_CRITERIA = [['interesse', 'Prendeu minha atenção'], ['clareza', 'Entendi sem esforço'], ['credibilidade', 'Confiei no autor'], ['emocao', 'Me tocou'], ['pratica', 'Sei o que fazer com isso'], ['continuar', 'Quero ler o próximo capítulo']];
const criteriaFor = kind => kind === 'capitulo' ? BOOK_CRITERIA : kind === 'beta' ? BETA_CRITERIA : REVIEW_CRITERIA;
const reviewKind = s => (Book.is(s) ? (['capitulo', 'beta'].includes(s.kind) ? s.kind : 'capitulo') : s.kind && !['capitulo', 'beta'].includes(s.kind) ? s.kind : null) || (() => { const n = (App.meta.sections.find(x => x.id === s.sec)?.name || '').toLowerCase(); return /devoc/.test(n) ? 'devocional' : /estud/.test(n) ? 'estudo' : /c[eé]lula|pg|pequeno/.test(n) ? 'celula' : 'sermao'; })();
const REVIEW_CRITERIA = [
  ['texto', 'Fidelidade ao texto bíblico'], ['contexto', 'Contexto histórico e literário'], ['estrutura', 'Estrutura e progressão'],
  ['aplicacao', 'Aplicação prática'], ['ilustracoes', 'Ilustrações'], ['clareza', 'Clareza para o público'], ['conclusao', 'Conclusão e apelo']
];
const Review = {
  system(kind = 'sermao') {
    const K = REVIEW_KINDS.find(k => k[0] === kind) || REVIEW_KINDS[0];
    const intro = K[3] === 'book' ? (kind === 'beta' ? 'Você é um leitor beta: cristão, leitor frequente, do público deste livro. Você ajuda o autor a enxergar como o texto chega ao leitor — você não reescreve o livro por ele.' : 'Você é um editor de livros cristãos de não ficção, com formação em teologia e exegese. Você ajuda o autor a MELHORAR o próprio capítulo — você não reescreve o livro por ele.') : 'Você é um revisor homilético experiente, com formação em exegese bíblica (hebraico e grego), teologia e comunicação. Você ajuda um pastor a MELHORAR o próprio sermão — você não reescreve o sermão por ele.';
    return `${intro}
Contexto da igreja: ${AI.cfg().church}
GÊNERO DO TEXTO: ${K[1]}. ${K[2]}
Regras:
- Seja honesto e específico; aponte problemas reais (eisegese, texto fora de contexto, afirmações históricas duvidosas, saltos lógicos, aplicações vagas). Elogios só quando merecidos.
- Respeite a tradição evangélica do pastor; quando houver divergência teológica legítima entre tradições, diga isso em vez de tratar como erro.
- Nunca invente versículos nem citações. Cite referências, não textos longos.
- Escreva em português do Brasil.
Responda SOMENTE com JSON válido neste formato:
{"resumo":"2-3 frases sobre a mensagem central e a impressão geral",
 "criterios":[${criteriaFor(kind).map(([id]) => `{"id":"${id}","nota":0,"comentario":"","sugestao":""}`).join(',')}],
 "pontos_fortes":["..."],
 "riscos":[{"trecho":"citação curta do sermão","problema":"...","sugestao":"..."}],
 "perguntas_ouvinte_cetico":["perguntas que um ouvinte crítico faria"],
 "melhorias_prioritarias":["as 3 mudanças que mais melhorariam o sermão"],
 "trocas":[{"trecho":"trecho COPIADO LITERALMENTE do texto, de 3 a 40 palavras","novo":"como o trecho ficaria reescrito","motivo":"por quê, em uma frase"}]}
Notas de 0 a 10.
Sobre "trocas" (até 8): são reescritas prontas para o autor aplicar com um clique. O "trecho" precisa ser cópia EXATA, caractere por caractere, de um pedaço contínuo do texto (sem reticências, sem juntar partes, sem mudar pontuação), senão não dá para achar. Não mexa em citações bíblicas. Mantenha a voz e o estilo do autor; corrija só o que melhora de verdade (clareza, concisão, gramática, repetição, frase de efeito fraca).`;
  },
  async run(s, providers, onStep) {
    const text = AI.sermonText(s); const kind = reviewKind(s); const K = REVIEW_KINDS.find(k => k[0] === kind);
    let ctx = '';
    if (Book.is(s)) { const nb = Book.nbOf(s.sec); ctx = `LIVRO: "${nb.name}"${Book.info(nb).subtitle ? ' — ' + Book.info(nb).subtitle : ''}. Esta página é: ${Book.numOf(s) ? 'capítulo ' + Book.numOf(s) : Book.kindLabel(s)}.\nMapa do livro (títulos e resumos):\n` + Book.chapters(nb).filter(c => c.top && !c.plan).map(c => `${c.num ? c.num + '.' : '•'} ${c.s.title}${Book.meta(c.s).synopsis ? ' — ' + Book.meta(c.s).synopsis : ''}`).join('\n') + '\n\n'; }
    const user = `${ctx}Revise este texto (gênero: ${K[1]}):\n\n${text}`;
    const tasks = providers.map(async p => {
      onStep && onStep(p, 'run');
      try {
        let r; try { r = AI.parseJSON(await AI.ask(p, this.system(kind), user)); }
        catch (e) { if (!/mal formatada|vazia/.test(e.message)) throw e; onStep && onStep(p, 'retry'); r = AI.parseJSON(await AI.ask(p, this.system(kind), user + '\n\nATENÇÃO: responda com JSON estritamente válido. Dentro dos textos, use aspas simples (\') em vez de aspas duplas.')); }
        onStep && onStep(p, 'ok'); return [p, { ok: true, data: r }];
      }
      catch (e) { onStep && onStep(p, 'err'); return [p, { ok: false, error: e.message }]; }
    });
    const refs = await checkReferences(s);
    const results = Object.fromEntries(await Promise.all(tasks));
    const rev = { at: Date.now(), kind, providers, refs, results, chat: [], models: { claude: AI.cfg().claudeModel, gemini: AI.cfg().geminiModel } };
    (s.reviews ||= []).unshift(rev); s.reviews = s.reviews.slice(0, 10); App.touch(s);
    return rev;
  },
  open(s) {
    const body = el('div', { class: 'rv' });
    const m = UI.modal({ title: Book.is(s) ? 'Revisão do capítulo' : 'Revisão do sermão', body, wide: true });
    m.box.classList.add('xl');
    const start = () => {
      body.innerHTML = '';
      const cl = el('input', { type: 'checkbox', checked: AI.has('claude'), disabled: !AI.has('claude') });
      const gm = el('input', { type: 'checkbox', checked: AI.has('gemini'), disabled: !AI.has('gemini') });
      const kindBox = el('div', { class: 'sl-chips rv-kind' });
      const paintKind = () => { kindBox.innerHTML = ''; const cur = reviewKind(s);
        kindBox.append(el('span', { class: 'muted small', text: Book.is(s) ? 'Revisar como: ' : 'Isto é: ' }), ...REVIEW_KINDS.filter(k => Book.is(s) ? k[3] === 'book' : k[3] !== 'book').map(([id, label]) => el('button', { class: 'chip' + (cur === id ? ' on' : ''), text: label, title: 'A IA calibra a revisão para este gênero', onclick: () => { s.kind = id; App.touch(s); paintKind(); } }))); };
      paintKind();
      body.append(kindBox,
        el('p', { text: 'A revisão olha fidelidade ao texto, contexto, estrutura, aplicação, ilustrações, clareza e conclusão. Com as duas IAs, você vê onde elas concordam — e principalmente onde DISCORDAM, que é onde vale pensar.' }),
        el('div', { class: 'row-btns', style: { flexWrap: 'wrap', alignItems: 'center' } },
          el('label', { class: 'on-check' }, cl, ' Claude'), el('label', { class: 'on-check' }, gm, ' Gemini'),
          el('button', { class: 'btn link', text: '⚙ Chaves e modelos', onclick: () => AI.settings(() => { m.close(); this.open(s); }) }),
          el('button', { class: 'btn link', text: 'Abc ✓ Ortografia e gramática (F7)', onclick: () => { m.close(); Spell.open(); } })),
        !AI.has() ? el('p', { class: 'on-log', text: 'Configure pelo menos uma chave (Claude ou Gemini) em ⚙ Chaves e modelos.' }) : '',
        el('p', { class: 'muted small', text: 'A checagem das referências bíblicas é feita pelo próprio app, sem IA, contra a Bíblia baixada.' }),
        el('div', { class: 'row-btns' },
          el('button', { class: 'btn primary', text: '✦ Revisar agora', onclick: async () => {
            const prov = [cl.checked && 'claude', gm.checked && 'gemini'].filter(Boolean);
            body.innerHTML = ''; const st = el('div', { class: 'rv-steps' });
            const line = (p, t) => { let e = st.querySelector(`[data-p="${p}"]`); if (!e) { e = el('div', { 'data-p': p }); st.append(e); } e.textContent = t; };
            body.append(el('p', { text: 'Analisando… (costuma levar de 20 a 60 segundos)' }), st);
            prov.forEach(p => line(p, `${p === 'claude' ? 'Claude' : 'Gemini'}: aguardando…`)); line('refs', 'Referências: conferindo…');
            const rev = await this.run(s, prov, (p, k) => line(p, `${p === 'claude' ? 'Claude' : 'Gemini'}: ${k === 'run' ? 'analisando…' : k === 'ok' ? 'pronto ✓' : k === 'retry' ? 'resposta veio mal formatada, pedindo de novo…' : 'erro ✗'}`));
            this.render(body, rev, s, start);
          } }),
          s.reviews?.length ? el('button', { class: 'btn', text: `Ver última revisão (${new Date(s.reviews[0].at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`, onclick: () => this.render(body, s.reviews[0], s, start) }) : null));
    };
    start();
  },
  render(body, rev, s, back) {
    body.innerHTML = '';
    const P = rev.providers, R = rev.results;
    const name = p => p === 'claude' ? 'Claude' : 'Gemini';
    body.append(el('div', { class: 'row-btns', style: { justifyContent: 'space-between' } },
      el('span', { class: 'muted small', text: `Revisão de ${new Date(rev.at).toLocaleString('pt-BR')}` + (rev.kind ? ' · ' + (REVIEW_KINDS.find(k => k[0] === rev.kind)?.[1] || '') : '') }),
      el('button', { class: 'btn sm', text: '↻ Nova revisão', onclick: back })));
    for (const p of P) if (!R[p]?.ok) body.append(el('p', { class: 'on-log', text: `⚠ ${name(p)}: ${R[p]?.error || 'falhou'}` }));
    const ok = P.filter(p => R[p]?.ok);
    const chat = ReviewChat.build(rev, s, ok);
    const q = (p, text) => el('button', { class: 'rv-reply', title: 'Responder a este ponto', text: '💬', onclick: () => chat.quote(p, text) });
    // Resumo
    for (const p of ok) if (R[p].data.resumo) body.append(el('div', { class: 'rv-sum' }, el('b', { text: name(p) + ': ' }), R[p].data.resumo));
    // Referências
    const refs = rev.refs || []; const probs = refs.filter(r => r.status !== 'ok');
    body.append(el('h4', { text: `Referências bíblicas (${refs.length} conferidas${probs.length ? ', ' + probs.length + ' para revisar' : ', todas certas'})` }));
    if (probs.length) body.append(el('ul', { class: 'rv-refs' }, probs.map(r => el('li', { class: 'rv-' + r.status }, el('b', { text: `${r.ref} ` }), el('span', { class: 'muted', text: `(${r.where}) ` }), r.msg))));
    // Trocas prontas: aplicar direto no texto
    const swaps = ok.flatMap(p => (R[p].data.trocas || []).filter(x => x && x.trecho && x.novo != null && x.trecho !== x.novo).map(x => [p, x]));
    if (swaps.length) {
      const box = el('div', { class: 'rv-swaps' });
      body.append(el('h4', { text: `Trocas sugeridas (${swaps.length}) — aplique direto no texto` }), box);
      if (s !== App.cur) box.append(el('p', { class: 'muted small', text: 'Abra esta página para aplicar as trocas.' }));
      const paintSwap = (p, x, row) => {
        row.innerHTML = '';
        const where = s === App.cur ? TextFix.find(x.trecho) : null;
        const nova = el('div', { class: 'rv-new', contentEditable: 'plaintext-only', title: 'Você pode ajustar o texto antes de aplicar', text: x.novo });
        row.append(el('div', { class: 'rv-sw-h' }, el('span', { class: 'pill', text: name(p) }), x.motivo ? el('span', { class: 'muted small', text: ' ' + x.motivo }) : null),
          el('div', { class: 'rv-old', text: x.trecho }), nova,
          el('div', { class: 'row-btns rv-sw-a' },
            x.applied ? el('span', { class: 'rv-ok', text: '✓ Aplicado' }) : null,
            x.applied && x.undo ? el('button', { class: 'btn sm', text: '↶ Desfazer', onclick: () => { if (TextFix.undo(x)) { delete x.applied; App.touch(s); paintSwap(p, x, row); } } }) : null,
            !x.applied && where ? el('button', { class: 'btn sm primary', text: '✓ Aplicar no texto', onclick: () => { const txt = nova.textContent.replace(/\s*\n\s*/g, ' ').trim(); const u = TextFix.apply(x.trecho, txt); if (!u) return UI.toast('Não achei o trecho (o texto mudou?).'); x.applied = true; x.undo = u; x.novo = txt; App.touch(s); paintSwap(p, x, row); } }) : null,
            !x.applied && where ? el('button', { class: 'btn sm', text: '👁 Ver no texto', onclick: () => TextFix.show(x.trecho) }) : null,
            !x.applied && s === App.cur && !where ? el('span', { class: 'muted small', text: '⚠ Trecho não encontrado igualzinho no texto (a IA citou diferente ou você já mudou). Use 👁 nas outras ou ajuste à mão.' }) : null,
            !x.applied ? el('button', { class: 'btn link sm', text: 'Copiar', onclick: () => navigator.clipboard?.writeText(nova.textContent).then(() => UI.toast('Copiado')) }) : null));
      };
      for (const [p, x] of swaps) { const row = el('div', { class: 'rv-swap' + (x.applied ? ' done' : '') }); box.append(row); paintSwap(p, x, row); }
      const pend = () => swaps.filter(([, x]) => !x.applied && s === App.cur && TextFix.find(x.trecho));
      if (pend().length > 1) box.prepend(el('div', { class: 'row-btns', style: { justifyContent: 'flex-end' } }, el('button', { class: 'btn sm', text: '✓ Aplicar todas', title: 'Aplica as trocas encontradas no texto (dá para desfazer uma a uma)', onclick: () => { let n = 0; for (const [, x] of pend()) { const u = TextFix.apply(x.trecho, x.novo); if (u) { x.applied = true; x.undo = u; n++; } } App.touch(s); UI.toast(`${n} troca(s) aplicada(s)`); this.render(body, rev, s, back); } })));
    }
    // Critérios lado a lado
    if (ok.length) {
      const tbl = el('table', { class: 'rv-tbl' });
      tbl.append(el('tr', {}, el('th', { text: 'Critério' }), ...ok.map(p => el('th', { text: name(p) }))));
      for (const [id, label] of criteriaFor(rev.kind)) {
        const cells = ok.map(p => (R[p].data.criterios || []).find(c => c.id === id) || {});
        const notas = cells.map(c => +c.nota).filter(n => !isNaN(n));
        const diverge = notas.length === 2 && Math.abs(notas[0] - notas[1]) >= 3;
        tbl.append(el('tr', { class: diverge ? 'rv-div' : '' },
          el('td', {}, el('b', { text: label }), diverge ? el('div', { class: 'rv-flag', text: '⚠ as IAs discordam — vale pensar aqui' }) : null),
          ...cells.map((c, i) => el('td', {}, el('span', { class: 'rv-nota n' + (c.nota == null ? 'x' : Math.round((+c.nota || 0) / 2.5)), text: c.nota ?? 'n/a' }), q(ok[i], `${label} (nota ${c.nota ?? 'n/a'}): ${c.comentario || ''}`), el('div', { text: c.comentario || '' }), c.sugestao ? el('div', { class: 'rv-sug', text: '→ ' + c.sugestao }) : null))));
      }
      body.append(el('h4', { text: 'Avaliação por critério' }), tbl);
      const list = (key, title, fmt) => {
        const items = ok.flatMap(p => (R[p].data[key] || []).map(x => [p, x])); if (!items.length) return;
        const plain = x => typeof x === 'string' ? x : [x.trecho && `“${x.trecho}”`, x.problema, x.sugestao && '→ ' + x.sugestao].filter(Boolean).join(' — ');
        body.append(el('h4', { text: title }), el('ul', { class: 'rv-list' }, items.map(([p, x]) => el('li', {}, el('span', { class: 'pill', text: name(p) }), ' ', fmt(x), ' ', q(p, `${title}: ${plain(x)}`)))));
      };
      list('melhorias_prioritarias', 'O que mais melhoraria o texto', x => x);
      list('riscos', 'Pontos de atenção', x => el('span', {}, x.trecho ? el('i', { text: `“${x.trecho}” — ` }) : null, x.trecho && s === App.cur && TextFix.find(x.trecho) ? el('button', { class: 'btn link sm', text: '👁', title: 'Ver no texto', onclick: () => TextFix.show(x.trecho) }) : null, x.problema || '', x.sugestao ? el('div', { class: 'rv-sug', text: '→ ' + x.sugestao }) : null));
      list('pontos_fortes', 'Pontos fortes', x => x);
      list('perguntas_ouvinte_cetico', 'Perguntas de um ouvinte crítico', x => x);
    }
    if (ok.length) body.append(chat.el);
    body.append(el('p', { class: 'muted small', text: 'IAs erram. Use como segunda opinião: a última palavra sobre a mensagem é sua (e do Espírito Santo).' }));
  }
};

/* ===== Conversa com a revisão: o pastor responde, a IA reavalia (sem bajular) ===== */
const ReviewChat = {
  system(kind) {
    const K = REVIEW_KINDS.find(k => k[0] === kind) || REVIEW_KINDS[0];
    return `Você é ${kind === 'beta' ? 'o mesmo leitor beta' : kind === 'capitulo' ? 'o mesmo editor de livros' : 'o mesmo revisor homilético'} que avaliou o texto abaixo (gênero: ${K[1]}). O pastor está respondendo às suas observações.
Contexto da igreja: ${AI.cfg().church}
Como responder:
- Reavalie com honestidade. Se o argumento dele for bom (ex.: o gênero não pede aquilo, há uma razão pastoral, o contexto da igreja explica), RECONHEÇA claramente e diga o que muda na sua avaliação (qual nota/observação você ajustaria e para quanto).
- Se o argumento não resolver o problema, MANTENHA sua posição com respeito e explique por quê, de forma concreta. Não ceda só para agradar; ele pediu sinceridade.
- Se for uma questão de tradição teológica legítima, diga isso em vez de tratar como erro.
- Seja direto e breve (até 180 palavras), em português do Brasil, texto corrido sem JSON e sem títulos.`;
  },
  build(rev, s, ok) {
    rev.chat ||= [];
    const name = p => p === 'claude' ? 'Claude' : 'Gemini';
    let prov = ok.includes(rev.lastChat) ? rev.lastChat : ok[0]; let quote = null;
    const log = el('div', { class: 'rvc-log' });
    const ta = el('textarea', { class: 'inp', rows: 3, placeholder: 'Ex.: “Isto é uma devocional curta, por isso não tem apelo nem três pontos.”' });
    const quoteBox = el('div', { class: 'rvc-quote', hidden: true });
    const provBox = el('div', { class: 'sl-chips' });
    const paintProv = () => { provBox.innerHTML = ''; if (ok.length < 2) return; provBox.append(el('span', { class: 'muted small', text: 'Responder para: ' }), ...ok.map(p => el('button', { class: 'chip' + (p === prov ? ' on' : ''), text: name(p), onclick: () => { prov = p; paintProv(); } }))); };
    const paintLog = () => {
      log.innerHTML = '';
      for (const m of rev.chat) log.append(el('div', { class: 'rvc-msg ' + m.role },
        el('div', { class: 'rvc-who', text: m.role === 'user' ? 'Você' + (m.to ? ' → ' + name(m.to) : '') : name(m.p) }),
        m.quote ? el('div', { class: 'rvc-q', text: m.quote }) : null,
        el('div', { class: 'rvc-t', text: m.text })));
    };
    const send = async () => {
      const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      const msg = { role: 'user', to: prov, text, quote, at: Date.now() };
      rev.chat.push(msg); rev.lastChat = prov; ta.value = ''; setQuote(null); paintLog();
      const wait = el('div', { class: 'rvc-msg ai wait' }, el('div', { class: 'rvc-who', text: name(prov) }), el('div', { class: 'rvc-t', text: 'pensando…' })); log.append(wait); btn.disabled = true;
      try {
        const hist = rev.chat.filter(m => m.role === 'user' ? m.to === prov : m.p === prov).slice(-12)
          .map(m => (m.role === 'user' ? 'PASTOR' : 'REVISOR') + ':' + (m.quote ? `\n[sobre: ${m.quote}]` : '') + '\n' + m.text).join('\n\n');
        const user = `TEXTO REVISADO:\n${AI.sermonText(s)}\n\nSUA REVISÃO ANTERIOR (JSON):\n${JSON.stringify(rev.results[prov].data).slice(0, 12000)}\n\nCONVERSA:\n${hist}\n\nResponda à última mensagem do PASTOR.`;
        const ans = await AI.ask(prov, this.system(rev.kind), user, { json: false, maxTokens: 1200 });
        rev.chat.push({ role: 'ai', p: prov, text: (ans || '').trim() || '(sem resposta)', at: Date.now() });
      } catch (e) { rev.chat.push({ role: 'ai', p: prov, text: '⚠ ' + e.message, at: Date.now(), err: true }); }
      App.touch(s); btn.disabled = false; paintLog(); log.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    const setQuote = (t) => { quote = t; quoteBox.hidden = !t; quoteBox.innerHTML = ''; if (t) quoteBox.append(el('span', { text: '↪ ' + (t.length > 220 ? t.slice(0, 220) + '…' : t) }), el('button', { class: 'btn link', text: '✕', onclick: () => setQuote(null) })); };
    const btn = el('button', { class: 'btn primary', text: 'Enviar resposta', onclick: send });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } });
    paintProv(); paintLog();
    const box = el('div', { class: 'rvc' }, el('h4', { text: '💬 Conversar com a revisão' }),
      el('p', { class: 'muted small', text: 'Discorda de algo? Explique seu ponto. Toque em 💬 ao lado de qualquer observação para responder a ela. A IA reavalia — e mantém a posição quando achar que deve.' }),
      log, provBox, quoteBox, ta, el('div', { class: 'row-btns' }, btn, el('span', { class: 'muted small', text: 'Ctrl+Enter envia' })));
    return { el: box, quote: (p, t) => { if (ok.includes(p)) { prov = p; paintProv(); } setQuote(t); box.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => ta.focus(), 300); } };
  }
};


/* ===== Achar e trocar um trecho citado pela IA no texto da página aberta (mantendo a formatação) ===== */
const TextFix = {
  /* normaliza espaços, aspas e travessões para achar a citação mesmo com pequenas diferenças */
  norm(t) {
    const out = [], idx = [];
    for (let i = 0; i < t.length; i++) {
      let c = t[i];
      if (/\s/.test(c)) { if (out.length && out[out.length - 1] === ' ') continue; c = ' '; }
      else if (/[“”„"«»]/.test(c)) c = '"'; else if (/[‘’‚']/.test(c)) c = "'"; else if (/[–—]/.test(c)) c = '-';
      out.push(c); idx.push(i);
    }
    return { s: out.join(''), idx };
  },
  clean(q) { return (q || '').replace(/^[\s“”"'‘’.…]+|[\s“”"'‘’…]+$/g, '').replace(/\.\.\.$/, '').trim(); },
  find(q) {
    q = this.clean(q); if (q.length < 3) return null;
    const nq = this.norm(q).s;
    for (const w of document.querySelectorAll('#blocks .block')) {
      const b = App.cur?.blocks.find(x => x.id === w.dataset.id); if (!b || b.type === 'verse') continue;
      for (const body of w.querySelectorAll('.b-body[contenteditable]')) {
        const { nodes, text } = Spell.scan(body); const N = this.norm(text);
        let i = N.s.indexOf(nq);
        if (i < 0) { const lo = N.s.toLowerCase(); i = lo.indexOf(nq.toLowerCase()); }
        if (i < 0) continue;
        const off = N.idx[i], end = N.idx[i + nq.length - 1] + 1;
        return { b, body, nodes, text, off, len: end - off };
      }
    }
    return null;
  },
  show(q) {
    const f = this.find(q); if (!f) return UI.toast('Não achei esse trecho no texto.');
    const r = Spell.range(f.nodes, f.off, f.len); if (!r) return;
    if (window.CSS?.highlights) { CSS.highlights.set('ss-find', new Highlight(r)); clearTimeout(this._t); this._t = setTimeout(() => CSS.highlights.delete('ss-find'), 6000); }
    const rect = r.getBoundingClientRect(), ed = $('#editor'); if (ed) ed.scrollBy({ top: rect.top - ed.getBoundingClientRect().top - ed.clientHeight / 3, behavior: 'smooth' });
    UI.toast('Trecho destacado no texto.');
  },
  apply(q, rep) {
    const f = this.find(q); if (!f) return null;
    if (f.text.substr(f.off, f.len).includes('\n')) { UI.toast('Esse trecho atravessa parágrafos — ajuste à mão.'); return null; }
    const before = f.b.html;
    let off = f.off, left = f.len, first = true;
    for (const { n, start } of f.nodes) {
      const s0 = start, s1 = start + n.data.length; if (s1 <= off || left <= 0) continue;
      const a = off - s0, take = Math.min(left, s1 - off);
      if (first) { n.replaceData(a, take, rep); first = false; } else n.deleteData(a, take);
      left -= take; off += take;
    }
    if (first) return null;
    f.body.querySelectorAll('b,strong,i,em,u,s,span,font,mark').forEach(e => { if (!e.textContent && !e.querySelector('img,br')) e.remove(); });
    f.b.html = f.body.innerHTML;
    return { block: f.b.id, before, after: f.b.html };
  },
  /* desfaz: se o bloco não mudou desde a troca, volta o HTML exato; senão troca o texto novo de volta pelo original */
  undo(x) {
    const u = x.undo; if (!u || !App.cur) return false; const b = App.cur.blocks.find(y => y.id === u.block);
    if (b && b.html === u.after) { b.html = u.before; delete x.undo; App.renderBlocks(); return true; }
    if (this.apply(x.novo, this.clean(x.trecho))) { delete x.undo; return true; }
    UI.toast('Não achei mais o texto trocado — desfaça à mão (🕘 Versões).'); return false;
  },
};
