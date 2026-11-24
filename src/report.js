/* ===== Pós-culto: tempo por ponto, transcrição ao vivo e análise "planejado x pregado" ===== */
const Track = {
  /* Chamado pelo modo leitura a cada segundo */
  begin(s) { this.s = s; this.on = true; this.per = {}; this.transcript = []; this.t0 = Date.now(); this.listening = false; },
  currentKey() {
    const R = Reader; if (!R.s) return 'intro';
    if (R.s.settings.mode === 'points') return R.segments[R.seg]?.point?.id || 'intro';
    const sc = $('#r-scroll'), mid = sc.scrollTop + sc.clientHeight * 0.4; let key = 'intro';
    for (const h of $$('#r-content [data-pid]')) { if (h.offsetTop <= mid) key = h.dataset.pid; else break; }
    return key;
  },
  tick() { if (!this.on || document.hidden) return; const k = this.currentKey(); this.per[k] = (this.per[k] || 0) + 1; },
  /* ---- transcrição ao vivo (reconhecimento de fala do navegador) ---- */
  supported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
  toggleMic() { this.listening ? this.stopMic() : this.startMic(); },
  startMic() {
    if (!this.supported()) { UI.toast('Este navegador não tem reconhecimento de fala. Use o Microsoft Edge.'); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR(); r.lang = 'pt-BR'; r.continuous = true; r.interimResults = true;
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) { const text = res[0].transcript.trim(); if (text) this.transcript.push({ t: Math.round((Date.now() - this.t0) / 1000), k: this.currentKey(), text }); }
        else interim += res[0].transcript;
      }
      const L = $('#r-live'); if (L) L.textContent = interim || (this.transcript.at(-1)?.text || '');
    };
    r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { UI.toast('Permita o uso do microfone para transcrever.'); this.stopMic(); } };
    r.onend = () => { if (this.listening) setTimeout(() => { try { r.start(); } catch (e) { } }, 250); }; // o navegador encerra sozinho de tempos em tempos
    this.rec = r; this.listening = true;
    try { r.start(); } catch (e) { }
    $('#r-mic').classList.add('rec'); $('#r-live').hidden = false;
    UI.toast('Transcrevendo… (o texto fica salvo com esta ministração)');
  },
  stopMic() { this.listening = false; try { this.rec && this.rec.stop(); } catch (e) { } $('#r-mic')?.classList.remove('rec'); const L = $('#r-live'); if (L) L.hidden = true; },
  /* Ao sair do modo leitura: guarda a sessão */
  end() {
    if (!this.on) return null; this.on = false; this.stopMic();
    const s = this.s, secs = Math.round((Date.now() - this.t0) / 1000);
    if (secs < 180 && !this.transcript.length) return null;
    const pts = s.blocks.filter(b => b.type === 'point').map(b => ({ id: b.id, title: htmlToText(b.html) }));
    const sess = { at: Date.now(), date: todayISO(), minutes: Math.round(secs / 60), words: Estimate.sermon(s).words, per: this.per, points: pts, transcript: this.transcript, calib: false, mode: s.settings.mode };
    (s.preached ||= []).push(sess); App.touch(s);
    return sess;
  }
};

const PostReport = {
  open(s, idx) {
    const list = (s.preached || []).map((p, i) => ({ p, i })).reverse();
    const body = el('div', { class: 'rp' });
    const m = UI.modal({ title: 'Pregações e relatório pós-culto', body, wide: true }); m.box.classList.add('xl');
    const showList = () => {
      body.innerHTML = '';
      if (!list.length) { body.append(el('p', { class: 'muted', text: 'Ainda não há pregações registradas. No modo leitura, a duração de cada ponto é medida sozinha; toque em 🎙 para transcrever.' })); return; }
      body.append(el('p', { class: 'muted', text: 'Cada vez que você usa o modo leitura por 3 minutos ou mais, o SmartSower guarda quanto tempo passou em cada ponto (e a transcrição, se o 🎙 estiver ligado).' }));
      for (const { p, i } of list) body.append(el('button', { class: 'on-item', onclick: () => this.detail(body, s, i, showList) },
        el('b', { text: `${new Date(p.at || (p.date + 'T12:00')).toLocaleString(DL(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${p.minutes} min` }),
        el('span', { class: 'muted small', text: [p.per ? 'tempo por ponto' : '', p.transcript?.length ? `transcrição (${p.transcript.length} trechos)` : '', p.analysis ? 'analisada' : '', p.calib === false ? 'não usada na estimativa' : 'usada na estimativa'].filter(Boolean).join(' · ') })));
    };
    idx != null ? this.detail(body, s, idx, showList) : showList();
  },
  segmentsPlan(s) {
    const k = Estimate.rate().k, segs = []; let cur = { key: 'intro', title: 'Introdução', blocks: [] };
    for (const b of s.blocks) { if (b.type === 'point') { if (cur.blocks.length) segs.push(cur); cur = { key: b.id, title: htmlToText(b.html) || 'Ponto', blocks: [b] }; } else cur.blocks.push(b); }
    if (cur.blocks.length) segs.push(cur);
    return segs.map(g => ({ ...g, planned: Estimate.ofBlocks(g.blocks, k).minutes }));
  },
  transcriptText(p) { return (p.transcript || []).map(x => `[${String(Math.floor(x.t / 60)).padStart(2, '0')}:${String(x.t % 60).padStart(2, '0')}] ${x.text}`).join('\n'); },
  detail(body, s, i, back) {
    const p = s.preached[i]; body.innerHTML = '';
    const segs = this.segmentsPlan(s); const factor = (s.duration || 0) && segs.reduce((n, g) => n + g.planned, 0) ? s.duration / segs.reduce((n, g) => n + g.planned, 0) : 1;
    body.append(el('div', { class: 'row-btns', style: { justifyContent: 'space-between' } },
      el('button', { class: 'btn link', text: '‹ Todas as pregações', onclick: back }),
      el('span', { class: 'muted small', text: new Date(p.at || (p.date + 'T12:00')).toLocaleString(DL()) })));
    const calib = el('input', { type: 'checkbox', checked: p.calib !== false, onchange: e => { p.calib = e.target.checked; App.touch(s); App.updateEstimate(); } });
    body.append(el('div', { class: 'rp-head' },
      el('div', { class: 'rp-big' }, el('b', { text: `${p.minutes} min` }), el('span', { class: 'muted small', text: 'pregados' })),
      el('div', { class: 'rp-big' }, el('b', { text: s.duration ? `${s.duration} min` : '—' }), el('span', { class: 'muted small', text: 'planejados' })),
      el('label', { class: 'on-check' }, calib, ' Usar esta pregação para calibrar a estimativa de tempo')));
    if (p.per) {
      const total = Object.values(p.per).reduce((a, b) => a + b, 0) || 1;
      const rows = segs.map(g => ({ ...g, real: (p.per[g.key] || 0) / 60, plan: g.planned * factor }));
      const max = Math.max(...rows.map(r => Math.max(r.real, r.plan)), 1);
      const tbl = el('div', { class: 'rp-bars' });
      for (const r of rows) tbl.append(el('div', { class: 'rp-row' },
        el('div', { class: 'rp-t', text: r.title }),
        el('div', { class: 'rp-bar' }, el('i', { class: 'plan', style: { width: (r.plan / max * 100) + '%' } }), el('i', { class: 'real', style: { width: (r.real / max * 100) + '%' } })),
        el('div', { class: 'rp-n', text: `${r.real.toFixed(1)} / ${r.plan.toFixed(1)} min` })));
      body.append(el('h4', { text: 'Tempo por ponto (pregado / planejado)' }), tbl,
        el('p', { class: 'muted small', text: 'Barra roxa = pregado; barra clara = planejado (estimativa proporcional à duração planejada). Medido pela posição da tela no modo leitura.' }));
    }
    // Transcrição
    const ta = el('textarea', { class: 'inp rp-tx', rows: 8, placeholder: 'Sem transcrição. Cole aqui o texto (por exemplo, de uma transcrição da gravação do culto) para analisar.' }); ta.value = this.transcriptText(p);
    ta.onchange = () => { const v = ta.value.trim(); p.transcript = v ? v.split('\n').map(l => { const m = l.match(/^\[(\d+):(\d+)\]\s*(.*)$/); return m ? { t: +m[1] * 60 + +m[2], text: m[3] } : { t: 0, text: l }; }).filter(x => x.text) : []; App.touch(s); };
    body.append(el('h4', { text: 'Transcrição' }), ta,
      el('div', { class: 'row-btns' }, el('button', { class: 'btn sm', text: 'Baixar .txt', onclick: () => saveFile(`${safeName(s.title)} - transcricao.txt`, new Blob([ta.value], { type: 'text/plain' })) })));
    // Análise
    const an = el('div', { class: 'rp-an' });
    const prov = AI.has('claude') ? 'claude' : 'gemini';
    body.append(el('h4', { text: 'Planejado x pregado (análise com IA)' }), an);
    const draw = () => { an.innerHTML = ''; if (p.analysis) this.renderAnalysis(an, p.analysis); an.append(el('div', { class: 'row-btns' },
      el('button', { class: 'btn primary', text: p.analysis ? '↻ Analisar de novo' : '✦ Analisar', disabled: !AI.has() || !(p.transcript || []).length, onclick: async e => {
        e.target.disabled = true; e.target.textContent = 'Analisando…';
        try { p.analysis = await this.analyze(s, p, prov); App.touch(s); } catch (err) { UI.toast(err.message); }
        draw();
      } }),
      !AI.has() ? el('button', { class: 'btn link', text: 'Configurar IA', onclick: () => AI.settings(draw) }) : null,
      !(p.transcript || []).length ? el('span', { class: 'muted small', text: 'Precisa de transcrição.' }) : null)); };
    draw();
  },
  async analyze(s, p, provider) {
    const segs = this.segmentsPlan(s);
    const timing = p.per ? segs.map(g => `- ${g.title}: ${((p.per[g.key] || 0) / 60).toFixed(1)} min`).join('\n') : '(sem medição)';
    const system = `Você ajuda um pastor a avaliar uma pregação comparando o que ele PLANEJOU (esboço) com o que ele de fato PREGOU (transcrição automática, pode ter erros de reconhecimento de fala). Contexto da igreja: ${AI.cfg().church}
Seja honesto, específico e encorajador sem bajular. Português do Brasil. Não invente frases que não estão na transcrição.
Responda SOMENTE com JSON:
{"cobertura":[{"ponto":"título do ponto","status":"coberto|parcial|pulado","comentario":""}],
 "acrescentados":["assuntos que entraram na pregação e não estavam no esboço"],
 "frases_marcantes":["frases fortes ditas de improviso, copiadas da transcrição"],
 "resumo_redes":["3 textos curtos para redes sociais, com tom pastoral"],
 "devocional":"um devocional de 150-200 palavras para a igreja meditar na semana, baseado na mensagem",
 "sugestoes":["melhorias para a próxima vez (ritmo, transições, tempo, clareza)"]}`;
    const user = `ESBOÇO PLANEJADO:\n${AI.sermonText(s)}\n\nTEMPO POR PONTO (medido):\n${timing}\nDuração total: ${p.minutes} min (planejado: ${s.duration || '—'} min)\n\nTRANSCRIÇÃO:\n${this.transcriptText(p).slice(0, 120000)}`;
    const r = AI.parseJSON(await AI.ask(provider, system, user, { maxTokens: 8000 }));
    r.provider = provider; r.at = Date.now(); return r;
  },
  renderAnalysis(box, a) {
    const copy = t => el('button', { class: 'btn sm', text: 'Copiar', onclick: async () => { try { await navigator.clipboard.writeText(t); UI.toast('Copiado'); } catch (e) { } } });
    if (a.cobertura?.length) box.append(el('ul', { class: 'rv-list' }, a.cobertura.map(c => el('li', {}, el('span', { class: 'pill cov-' + c.status, text: c.status }), ' ', el('b', { text: c.ponto }), c.comentario ? ' — ' + c.comentario : ''))));
    const sec = (t, arr) => { if (arr?.length) box.append(el('h5', { text: t }), el('ul', { class: 'rv-list' }, arr.map(x => el('li', { text: x })))); };
    sec('Assuntos acrescentados na hora', a.acrescentados);
    sec('Frases marcantes (improviso)', a.frases_marcantes);
    if (a.resumo_redes?.length) { box.append(el('h5', { text: 'Para as redes sociais' })); a.resumo_redes.forEach(t => box.append(el('div', { class: 'rp-post' }, el('p', { text: t }), copy(t)))); }
    if (a.devocional) box.append(el('h5', { text: 'Devocional da semana' }), el('div', { class: 'rp-post' }, el('p', { text: a.devocional }), copy(a.devocional)));
    sec('Para a próxima vez', a.sugestoes);
    box.append(el('p', { class: 'muted small', text: `Análise por ${a.provider === 'gemini' ? 'Gemini' : 'Claude'} em ${new Date(a.at).toLocaleString(DL())}.` }));
  }
};
