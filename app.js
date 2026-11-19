(() => {
'use strict';

const DAY = 86400000;
const INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64]; // giorni per box
const LEARNED_BOX = 3;
const STORE_KEY = 'hanzi-srs-v1';
const OPT_KEY = 'hanzi-opts-v1';
const REVIEW_CAP = 40;

let CHARS = [], WORDS = [], BYCHAR = {}, STROKES = {}, CATS = [];
let srs = {};                // { char: {b, d, n, e} }
let opts = { pencil: null, sawStylus: false, perSession: 8, mode: 'chars' }; // pencil null = automatico
// caratteri e parole condividono lo stesso srs: le chiavi non si sovrappongono (le parole hanno 2+ caratteri)
const isWords = () => opts.mode === 'words';
const items = () => isWords() ? WORDS : CHARS;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// ---------- storage ----------
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(srs)); localStorage.setItem(OPT_KEY, JSON.stringify(opts)); } catch {}
}

// ---------- SRS ----------
const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
const startOfDay = (ms) => { const d = new Date(ms); d.setHours(4, 0, 0, 0); return d.getTime(); };

function grade(c, mistakes, revealed) {
  const s = srs[c] || { b: 0, d: 0, n: 0, e: 0 };
  s.n++; s.e += mistakes;
  const wasLearned = s.b >= LEARNED_BOX;
  let q;
  if (revealed || mistakes > 3) { q = 'fail'; s.b = 1; }
  else if (mistakes === 0) { q = 'good'; s.b = Math.min(s.b + 1, INTERVALS.length - 1); }
  else { q = 'ok'; s.b = Math.max(s.b, 1); }
  const days = q === 'good' ? INTERVALS[s.b] : 1;
  s.d = startOfDay(Date.now() + days * DAY);
  // ultimi 5 esiti (0 perfetto, 1 con errori, 2 da riscrivere) e ricadute su caratteri già imparati
  s.h = [...(s.h || []), { good: 0, ok: 1, fail: 2 }[q]].slice(-5);
  s.relapse = q === 'fail' && wasLearned;
  if (s.relapse) s.r = (s.r || 0) + 1;
  srs[c] = s; save();
  return q;
}
const status = c => { const s = srs[c]; return !s ? 0 : s.b >= LEARNED_BOX ? 2 : 1; };
const dueList = () => items().filter(x => srs[x.c] && srs[x.c].d <= endOfToday())
  .sort((a, b) => srs[a.c].d - srs[b.c].d).map(x => x.c);

// ---------- home: il quaderno ----------
let tab = 1;
// sbagliato di recente: un "da riscrivere" o due esiti con errori negli ultimi 3 ripassi
// (per i dati vecchi senza storico resta la regola sulla media degli errori)
const isHard = s => s.h ? (() => { const last = s.h.slice(-3); return last.includes(2) || last.filter(v => v > 0).length >= 2; })()
  : s.n >= 2 && s.e / s.n >= 1.5;
const hardSet = () => new Set(Object.entries(srs).filter(([, s]) => isHard(s)).map(([c]) => c));
const hardList = () => items().filter(x => srs[x.c] && isHard(srs[x.c])).map(x => x.c);

// ---------- ricerca: hanzi, pinyin (con o senza toni, anche zhun3) o italiano ----------
const plain = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ü|v/g, 'u').replace(/[\s'’·0-9-]/g, '');
const HAN = /[\u4e00-\u9fff]/;
function search(q) {
  q = q.trim(); if (!q) return [];
  const han = HAN.test(q), pq = plain(q), lq = q.toLowerCase();
  const toned = /[\u0300\u0301\u0304\u030c]/.test(q.normalize('NFD')); // solo i 4 toni, non la dieresi di ü
  const hits = [];
  for (const x of CHARS.concat(WORDS)) {
    let score = 0;
    if (han) { if (x.c === q) score = 100; else if (x.c.includes(q)) score = 60 - x.c.length; }
    else {
      const px = plain(x.p);
      if (toned && !x.p.normalize('NFC').toLowerCase().replace(/\s/g, '').includes(q.normalize('NFC').toLowerCase().replace(/\s/g, ''))) score = 0;
      else if (px === pq) score = 90; else if (pq && px.startsWith(pq)) score = 70; else if (pq.length >= 2 && px.includes(pq)) score = 40;
      if (!score && lq.length >= 3) {
        const words = x.m.toLowerCase().split(/[^a-zàèéìòù']+/);
        if (words.includes(lq)) score = 50; else if (x.m.toLowerCase().includes(lq)) score = 30;
      }
    }
    if (score) hits.push([score - [...x.c].length * 0.1 - (x.l - 1) * 0.05, x]);
  }
  return hits.sort((a, b) => b[0] - a[0]).slice(0, 120).map(h => h[1]);
}

function renderHome() {
  const due = dueList().length;
  $('#fieldDue').textContent = due;
  $('#fieldLevel').textContent = 'HSK ' + tab;
  $$('[data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === opts.mode)));
  const W = isWords(), f = W ? 'e' : 'i';
  $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.tab === tab)));
  $('#btnReview').disabled = due === 0;
  $('#btnReview').textContent = due ? `Ripassa ${due}` : 'Niente da ripassare';
  const nh = hardList().length;
  $('#btnHard').hidden = nh === 0;
  $('#btnHard').textContent = `Sbagliati ${nh}`;

  const list = items().filter(x => x.l === tab);
  const seen = list.filter(x => srs[x.c]).length;
  const learned = list.filter(x => status(x.c) === 2).length;
  const left = list.length - seen;
  $('#tally').innerHTML = `<b>${learned}</b> imparat${f}, <b>${seen - learned}</b> in studio, <b>${left}</b> ancora da imparare su ${list.length} ${W ? 'parole' : 'caratteri'}.`;
  $('#btnLearn').disabled = left === 0;
  $('#btnLearn').textContent = left ? `Impara ${Math.min(opts.perSession, left)} nuov${f}` : 'Livello completato';

  const q = $('#search').value.trim(), found = q ? search(q) : null;
  if (found) $('#tally').innerHTML = found.length ? `<b>${found.length}</b> risultat${found.length === 1 ? 'o' : 'i'} per «${q.replace(/[<>&]/g, '')}» tra caratteri e parole, HSK 1 e 2.` : `Nessun risultato per «${q.replace(/[<>&]/g, '')}».`;
  const hard = hardSet();
  const sheet = $('#sheet'); sheet.innerHTML = ''; sheet.classList.toggle('words', W || !!found); sheet.classList.toggle('found', !!found);
  const frag = document.createDocumentFragment();
  let lastK = null;
  for (const x of found || list) {
    if (!found && x.k !== lastK) { // titolo della categoria
      lastK = x.k;
      const inCat = list.filter(y => y.k === x.k), h = document.createElement('h3');
      h.className = 'cat';
      h.innerHTML = `${(CATS.find(c => c[0] === x.k) || [, x.k])[1]} <span>${inCat.filter(y => status(y.c) === 2).length}/${inCat.length}</span>`;
      frag.append(h);
    }
    const b = document.createElement('button');
    b.className = 'cell s' + status(x.c) + (hard.has(x.c) ? ' hard' : '') + (W || found ? ' wd' : '') + (x.w ? ' wr' : '');
    const h = document.createElement('span'), py = document.createElement('span');
    h.className = 'h'; h.textContent = x.c; py.className = 'py'; py.textContent = x.p;
    b.append(h, py);
    if (found) { const m = document.createElement('span'); m.className = 'm'; m.textContent = `HSK${x.l} · ${x.m}`; b.append(m); }
    b.setAttribute('aria-label', `${x.c} ${x.p}, ${x.m}`);
    b.onclick = () => startSession([x.c], 'single');
    frag.append(b);
  }
  sheet.append(frag);
  $('#optPencil').checked = stylusOnly();
  // su un telefono senza Pencil l'opzione non serve
  $('#optPencil').closest('label').hidden = !opts.sawStylus && opts.pencil === null && matchMedia('(max-width: 700px)').matches;
  $('#optNew').value = String(opts.perSession);
}

function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}

// ---------- session ----------
let queue = [], qIndex = 0, total = 0, writer = null, cur = null, results = {};

function startSession(chars, kind) {
  queue = [];
  if (kind === 'review') {
    chars.forEach(c => queue.push({ c, stage: 'recall' }));
  } else {
    chars.forEach(c => queue.push({ c, stage: 'trace' }));
    shuffle([...chars]).forEach(c => queue.push({ c, stage: 'recall' }));
  }
  total = queue.length; qIndex = 0; results = { good: 0, ok: 0, fail: 0, relapses: [] };
  show('practice');
  nextItem();
}

function nextItem() {
  if (qIndex >= queue.length) return finish();
  cur = { ...queue[qIndex++], k: 0, mistakes: 0, revealed: false, done: false };
  $('#sessBar').style.width = ((qIndex - 1) / total * 100) + '%';
  $('#sessCount').textContent = `${Math.min(qIndex, total)} / ${total}`;
  renderItem();
}

const curChar = () => [...cur.c][cur.k];
const multi = () => [...cur.c].length > 1;

// una griglia 米字格 per ogni carattere della parola, affiancate sulla stessa pagina
const MI = '<svg class="mi" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="50" x2="100" y2="50"/><line x1="50" y1="0" x2="50" y2="100"/><line x1="0" y1="0" x2="100" y2="100"/><line x1="100" y1="0" x2="0" y2="100"/></svg>';
let boards = [];
function boardSize(n) {
  const phone = matchMedia('(max-width: 700px)').matches;
  const stacked = matchMedia('(orientation: portrait), (max-width: 820px)').matches;
  const bodyW = $('.practice-body').clientWidth;
  const max = phone ? Math.min(innerWidth - 24, innerHeight * 0.56)
    : stacked ? Math.min(innerWidth * 0.86, 560, innerHeight * 0.54) : Math.min(innerHeight * 0.68, 560);
  const avail = stacked ? bodyW : bodyW - 480; // 440 margine + 40 spazio
  return Math.floor(Math.min(max, avail / n));
}
function buildBoards() {
  const box = $('#boards'), chars = [...cur.c], s = boardSize(chars.length);
  box.querySelectorAll('.board').forEach(b => b.remove());
  boards = chars.map(() => {
    const b = document.createElement('div');
    b.className = 'board'; b.style.width = b.style.height = s + 'px';
    b.innerHTML = MI + '<div class="writer"></div>';
    box.insertBefore(b, $('#stamp'));
    return b;
  });
  $('#order').style.maxWidth = Math.max(s * chars.length, 320) + 'px';
}
function markBoards() { boards.forEach((b, i) => b.classList.toggle('now', boards.length > 1 && !cur.done && i === cur.k)); }
function showWritten(i) { // carattere già scritto (serve dopo un ridimensionamento)
  const b = boards[i], s = b.clientWidth;
  HanziWriter.create(b.querySelector('.writer'), [...cur.c][i], {
    width: s, height: s, padding: Math.round(s * 0.06), strokeColor: css('--ink'), radicalColor: null,
    charDataLoader: (ch, onLoad, onErr) => STROKES[ch] ? onLoad(STROKES[ch]) : onErr(new Error('no data ' + ch)),
  });
}

function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

function makeWriter(c, outline) {
  const b = boards[cur.k], el = b.querySelector('.writer'); el.innerHTML = ''; el.dataset.c = c;
  const size = b.clientWidth;
  writer = HanziWriter.create(el, c, {
    width: size, height: size, padding: Math.round(size * 0.06),
    showCharacter: false, showOutline: outline,
    strokeColor: css('--ink'), outlineColor: css('--trace'), radicalColor: null,
    highlightColor: css('--red'), drawingColor: css('--ink'),
    drawingWidth: Math.max(14, size / 28), strokeAnimationSpeed: 1.2, delayBetweenStrokes: 180,
    showHintAfterMisses: 3, highlightOnComplete: true,
    charDataLoader: (ch, onLoad, onErr) => STROKES[ch] ? onLoad(STROKES[ch]) : onErr(new Error('no data ' + ch)),
  });
}

const SVGNS = 'http://www.w3.org/2000/svg';
function renderOrder(c, visible) {
  const box = $('#order'); box.innerHTML = ''; box.hidden = !visible;
  if (!visible) return;
  const strokes = STROKES[c].strokes;
  strokes.forEach((_, k) => {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '-70 -70 1164 1164');
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('transform', 'translate(0,900) scale(1,-1)');
    for (let i = 0; i <= k; i++) {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', strokes[i]); if (i === k) p.setAttribute('class', 'last');
      g.append(p);
    }
    svg.append(g); box.append(svg);
  });
  markOrder(0);
}
function markOrder(i) { $$('#order svg').forEach((s, k) => s.classList.toggle('now', k === i)); }

function stamp(ch) {
  const el = $('#stamp');
  el.classList.remove('on'); el.textContent = ch; el.classList.toggle('small', ch.length > 1);
  void el.offsetWidth; if (ch) el.classList.add('on');
}

function startQuiz() {
  const isTrace = cur.stage === 'trace';
  writer.quiz({
    showHintAfterMisses: isTrace ? 1 : 3,
    leniency: isTrace ? 1.3 : 1,
    onMistake: () => { cur.mistakes++; fb(isTrace ? 'Segui il tratto evidenziato' : `Tratto sbagliato (${cur.mistakes})`, 'bad'); },
    onCorrectStroke: (d) => { markOrder(d.strokeNum + 1); fb(d.strokesRemaining ? `Mancano ${d.strokesRemaining} tratti` : '', ''); },
    onComplete: () => charDone(),
  });
}
function charDone() {
  if (cur.charDone) return; cur.charDone = true;
  if (cur.k < [...cur.c].length - 1 && !cur.done) {
    cur.k++; markBoards(); fb('Bene, ora il carattere successivo', 'ok');
    setTimeout(() => { if ($('#practice').classList.contains('active') && !cur.done) renderChar(); }, 250);
  } else complete();
}

function renderItem() {
  const x = BYCHAR[cur.c];
  const isTrace = cur.stage === 'trace', W = multi();
  $('#stage').textContent = isTrace ? (W ? 'Parola nuova: guarda e ricalca' : 'Carattere nuovo: guarda e ricalca') : cur.retry ? 'Secondo tentativo, a memoria' : (srs[cur.c] && queue.every(q => q.stage === 'recall') ? (W ? 'Ripasso: scrivila a memoria' : 'Ripasso: scrivilo a memoria') : (W ? 'Ora scrivila a memoria' : 'Ora scrivilo a memoria'));
  $('#pinyin').textContent = x.p;
  $('#meaning').textContent = x.m;
  $('#exZh').textContent = isTrace ? x.ez : x.ez.split(x.c).join('〇'.repeat([...x.c].length));
  $('#exPy').textContent = x.ep;
  $('#exIt').textContent = x.ei;
  $('#btnNext').hidden = true;
  $('#btnReveal').hidden = isTrace;
  $('#btnReveal').textContent = 'Aiuto';
  fb(isTrace ? 'Ricalca seguendo l’ordine dei tratti' : W ? 'Scrivi la parola, un carattere alla volta' : 'Scrivi il carattere nella griglia', '');
  stamp('');
  buildBoards();
  renderChar();
}

function renderChar() {
  const isTrace = cur.stage === 'trace';
  cur.charDone = false;
  markBoards();
  renderOrder(curChar(), isTrace || cur.revealed);
  makeWriter(curChar(), isTrace || cur.revealed);
  if (isTrace) writer.animateCharacter({ onComplete: () => { writer.hideCharacter({ duration: 200 }); startQuiz(); } });
  else startQuiz();
}

function complete() {
  if (cur.done) return; cur.done = true;
  if (cur.graded) { fb('Ripetizione libera completata', 'ok'); $('#btnNext').hidden = false; return; }
  cur.graded = true;
  const x = BYCHAR[cur.c];
  $('#exZh').textContent = x.ez;
  if (cur.stage === 'trace') {
    stamp('好'); fb(multi() ? 'Fra poco la riscrivi a memoria' : 'Fra poco lo riscrivi a memoria', 'ok');
  } else if (cur.retry) {
    // secondo tentativo nella stessa sessione: solo pratica, il ripasso resta fissato a domani
    const ok = cur.mistakes === 0 && !cur.revealed; stamp(ok ? '好' : '再写');
    fb(ok ? 'Meglio. Torna comunque domani nel ripasso' : 'Torna domani nel ripasso', 'ok');
  } else {
    const q = grade(cur.c, cur.mistakes, cur.revealed);
    results[q]++;
    if (srs[cur.c].relapse) results.relapses.push(cur.c);
    stamp({ good: '优', ok: '良', fail: '再写' }[q]);
    const msg = { good: 'Perfetto, senza errori', ok: cur.mistakes === 1 ? 'Giusto, con un errore' : `Giusto, con ${cur.mistakes} errori`,
      fail: srs[cur.c].relapse ? 'Ricaduta: lo sapevi già. Lo riprovi a fine sessione e torna nel ripasso da domani' : 'Da riscrivere: lo riprovi a fine sessione' }[q];
    fb(msg, q === 'fail' ? 'bad' : 'ok');
    if (q === 'fail') { queue.push({ c: cur.c, stage: 'recall', retry: true }); total++; }
  }
  markBoards();
  if ($('#order').hidden) renderOrder(curChar(), true);
  markOrder(-1);
  $('#btnReveal').hidden = true;
  $('#btnNext').hidden = false;
}

function finish() {
  renderHome();
  const n = results.good + results.ok + results.fail;
  $('#doneTitle').textContent = n ? 'Sessione finita' : 'Sessione interrotta';
  $('#doneStamp').textContent = !n ? '停' : results.fail === 0 && results.ok === 0 ? '优' : results.fail === 0 ? '良' : '好';
  $('#doneText').textContent = n
    ? [results.good + ' perfett' + (isWords() ? (results.good === 1 ? 'a' : 'e') : (results.good === 1 ? 'o' : 'i')), results.ok + ' con qualche errore', results.fail + ' da riscrivere domani'].join(', ') + '.'
    : `Non hai completato ${isWords() ? 'nessuna parola' : 'nessun carattere'} a memoria.`;
  if (results.relapses.length) $('#doneText').textContent += ` Ricadute (già imparati e sbagliati): ${results.relapses.join(' ')}.`;
  show('done');
}

function fb(t, cls) { const f = $('#feedback'); f.textContent = t; f.className = 'feedback ' + (cls || ''); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- input: Apple Pencil -> mouse events for Hanzi Writer ----------
// Hanzi Writer legge touches[0]: con il palmo appoggiato prenderebbe il punto sbagliato.
// Intercetto i touch in fase di capture e inoltro solo il tocco scelto come eventi mouse.
let activeTouch = null;
function svgNode() { return boards[cur ? cur.k : 0]?.querySelector('.writer svg'); }
const stylusOnly = () => opts.pencil === null ? opts.sawStylus : opts.pencil;
function pickTouch(list) {
  if (!opts.sawStylus && [...list].some(t => t.touchType === 'stylus')) { opts.sawStylus = true; save(); $('#optPencil').checked = stylusOnly(); }
  const only = stylusOnly();
  for (const t of list) if (!only || t.touchType === 'stylus') return t;
  return null;
}
function fire(type, t, target) {
  target.dispatchEvent(new MouseEvent(type, { clientX: t.clientX, clientY: t.clientY, bubbles: true, cancelable: true, buttons: 1 }));
}
function onTouch(e) {
  const svg = svgNode();
  e.preventDefault(); e.stopPropagation();
  if (!svg) return;
  if (e.type === 'touchstart') {
    if (activeTouch !== null) return;
    const t = pickTouch(e.changedTouches); if (!t) return;
    // si scrive solo nella griglia attiva
    const r = boards[cur.k].getBoundingClientRect();
    if (t.clientX < r.left || t.clientX > r.right || t.clientY < r.top || t.clientY > r.bottom) return;
    activeTouch = t.identifier; fire('mousedown', t, svg);
  } else {
    const t = [...e.changedTouches].find(t => t.identifier === activeTouch); if (!t) return;
    if (e.type === 'touchmove') fire('mousemove', t, svg);
    else { fire('mouseup', t, document); activeTouch = null; }
  }
}
const boardsEl = $('#boards');
['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(t => boardsEl.addEventListener(t, onTouch, { capture: true, passive: false }));
document.addEventListener('gesturestart', e => e.preventDefault());

// ---------- wiring ----------
$('#btnReview').onclick = () => { const d = dueList(); if (d.length) startSession(d.slice(0, REVIEW_CAP), 'review'); };
$('#btnHard').onclick = () => { const h = hardList(); if (h.length) startSession(shuffle(h).slice(0, REVIEW_CAP), 'review'); };
$$('[data-tab]').forEach(b => b.onclick = () => { tab = +b.dataset.tab; $('#search').value = ''; renderHome(); });
let sT; $('#search').addEventListener('input', () => { clearTimeout(sT); sT = setTimeout(renderHome, 150); });
$('#search').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = ''; renderHome(); } });
$$('[data-mode]').forEach(b => b.onclick = () => { opts.mode = b.dataset.mode; save(); $('#search').value = ''; renderHome(); });
$('#btnLearn').onclick = () => {
  const fresh = items().filter(x => x.l === tab && !srs[x.c]).slice(0, opts.perSession).map(x => x.c);
  if (fresh.length) startSession(fresh, 'learn');
};
$$('[data-back]').forEach(b => b.onclick = () => { renderHome(); show('home'); });
$('#btnExit').onclick = () => { if (writer) writer.cancelQuiz(); if (results.good + results.ok + results.fail) finish(); else { renderHome(); show('home'); } };
$('#btnNext').onclick = () => nextItem();
$('#btnAnim').onclick = () => {
  if (!writer) return;
  if (cur.stage === 'recall' && !cur.done) cur.revealed = true;
  writer.cancelQuiz();
  writer.animateCharacter({ onComplete: () => { if (!cur.done) { writer.hideCharacter({ duration: 200 }); startQuiz(); } } });
};
$('#btnRestart').onclick = () => {
  if (!writer) return;
  if (cur.done) { cur.graded = true; cur.done = false; cur.k = 0; buildBoards(); return renderChar(); } // ripetizione libera dell'intera parola
  cur.charDone = false; writer.cancelQuiz(); writer.hideCharacter(); startQuiz();
};
$('#btnReveal').onclick = () => { if (!writer || cur.done) return; cur.revealed = true; writer.showOutline(); renderOrder(curChar(), true); fb('Aiuto usato: lo ripasserai presto', 'bad'); };
$('#optPencil').onchange = e => { opts.pencil = e.target.checked; save(); };
$('#optNew').onchange = e => { opts.perSession = +e.target.value; save(); renderHome(); };

const dlg = $('#backup');
$('#btnBackup').onclick = () => { $('#backupText').value = JSON.stringify(srs); dlg.showModal(); };
$('#btnClose').onclick = () => dlg.close();
$('#btnCopy').onclick = async () => { try { await navigator.clipboard.writeText($('#backupText').value); $('#btnCopy').textContent = 'Copiato ✓'; } catch { $('#backupText').select(); } };
$('#btnRestore').onclick = () => {
  try { const d = JSON.parse($('#backupText').value); if (typeof d === 'object' && d) { srs = d; save(); renderHome(); dlg.close(); } }
  catch { $('#btnRestore').textContent = 'Testo non valido'; }
};

let rT; window.addEventListener('resize', () => {
  clearTimeout(rT);
  rT = setTimeout(() => { if ($('#practice').classList.contains('active') && cur && !cur.done) { buildBoards(); for (let i = 0; i < cur.k; i++) showWritten(i); renderChar(); } }, 250);
});

// ---------- boot ----------
(async () => {
  srs = load(STORE_KEY, {}); opts = { ...opts, ...load(OPT_KEY, {}) };
  const [chars, words, strokes, cats] = await Promise.all(['chars', 'words', 'strokes', 'cats'].map(f => fetch(`data/${f}.json`).then(r => r.json())));
  CATS = cats;
  // ordine per categoria: la griglia e "Impara nuovi" procedono tema per tema
  const ord = Object.fromEntries(cats.map((c, i) => [c[0], i]));
  const byCat = L => L.map((x, i) => [x, i]).sort((a, b) => (ord[a[0].k] - ord[b[0].k]) || (a[1] - b[1])).map(p => p[0]);
  CHARS = byCat(chars); WORDS = byCat(words); STROKES = strokes; CHARS.concat(WORDS).forEach(x => BYCHAR[x.c] = x);
  renderHome();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
})();
})();
