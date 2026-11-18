(() => {
'use strict';

const DAY = 86400000;
const INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64]; // giorni per box
const LEARNED_BOX = 3;
const STORE_KEY = 'hanzi-srs-v1';
const OPT_KEY = 'hanzi-opts-v1';
const REVIEW_CAP = 40;

let CHARS = [], WORDS = [], BYCHAR = {}, STROKES = {};
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
  let q;
  if (revealed || mistakes > 3) { q = 'fail'; s.b = 1; }
  else if (mistakes === 0) { q = 'good'; s.b = Math.min(s.b + 1, INTERVALS.length - 1); }
  else { q = 'ok'; s.b = Math.max(s.b, 1); }
  const days = q === 'good' ? INTERVALS[s.b] : 1;
  s.d = startOfDay(Date.now() + days * DAY);
  srs[c] = s; save();
  return q;
}
const status = c => { const s = srs[c]; return !s ? 0 : s.b >= LEARNED_BOX ? 2 : 1; };
const dueList = () => items().filter(x => srs[x.c] && srs[x.c].d <= endOfToday())
  .sort((a, b) => srs[a.c].d - srs[b.c].d).map(x => x.c);

// ---------- home: il quaderno ----------
let tab = 1;
const hardSet = () => new Set(Object.entries(srs).filter(([, s]) => s.n >= 2 && s.e / s.n >= 1.5).map(([c]) => c));

function renderHome() {
  const due = dueList().length;
  $('#fieldDue').textContent = due;
  $('#fieldLevel').textContent = 'HSK ' + tab;
  $$('[data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === opts.mode)));
  const W = isWords(), f = W ? 'e' : 'i';
  $$('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.tab === tab)));
  $('#btnReview').disabled = due === 0;
  $('#btnReview').textContent = due ? `Ripassa ${due}` : 'Niente da ripassare';

  const list = items().filter(x => x.l === tab);
  const seen = list.filter(x => srs[x.c]).length;
  const learned = list.filter(x => status(x.c) === 2).length;
  const left = list.length - seen;
  $('#tally').innerHTML = `<b>${learned}</b> imparat${f}, <b>${seen - learned}</b> in studio, <b>${left}</b> ancora da imparare su ${list.length} ${W ? 'parole' : 'caratteri'}.`;
  $('#btnLearn').disabled = left === 0;
  $('#btnLearn').textContent = left ? `Impara ${Math.min(opts.perSession, left)} nuov${f}` : 'Livello completato';

  const hard = hardSet();
  const sheet = $('#sheet'); sheet.innerHTML = ''; sheet.classList.toggle('words', W);
  const frag = document.createDocumentFragment();
  for (const x of list) {
    const b = document.createElement('button');
    b.className = 'cell s' + status(x.c) + (hard.has(x.c) ? ' hard' : '') + (W ? ' wd' : '');
    const h = document.createElement('span'), py = document.createElement('span');
    h.className = 'h'; h.textContent = x.c; py.className = 'py'; py.textContent = x.p;
    b.append(h, py);
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
  total = queue.length; qIndex = 0; results = { good: 0, ok: 0, fail: 0 };
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
function renderStrip() {
  const box = $('#strip'); box.hidden = !multi(); if (box.hidden) return;
  const trace = cur.stage === 'trace' || cur.revealed;
  box.innerHTML = [...cur.c].map((ch, i) =>
    i < cur.k || cur.done ? `<span>${ch}</span>` :
    `<span class="${i === cur.k ? 'now ' : ''}${trace ? 'todo' : ''}">${trace ? ch : ''}</span>`).join('');
}

function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

function makeWriter(c, outline) {
  const el = $('#writer'); el.innerHTML = ''; el.dataset.c = c;
  const size = $('#board').clientWidth;
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
    cur.k++; renderStrip(); fb('Bene, ora il carattere successivo', 'ok');
    setTimeout(() => { if ($('#practice').classList.contains('active') && !cur.done) renderChar(); }, 450);
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
  renderChar();
}

function renderChar() {
  const isTrace = cur.stage === 'trace';
  cur.charDone = false;
  renderStrip();
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
    stamp({ good: '优', ok: '良', fail: '再写' }[q]);
    const msg = { good: 'Perfetto, senza errori', ok: cur.mistakes === 1 ? 'Giusto, con un errore' : `Giusto, con ${cur.mistakes} errori`, fail: 'Da riscrivere: lo riprovi a fine sessione' }[q];
    fb(msg, q === 'fail' ? 'bad' : 'ok');
    if (q === 'fail') { queue.push({ c: cur.c, stage: 'recall', retry: true }); total++; }
  }
  renderStrip();
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
  show('done');
}

function fb(t, cls) { const f = $('#feedback'); f.textContent = t; f.className = 'feedback ' + (cls || ''); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- input: Apple Pencil -> mouse events for Hanzi Writer ----------
// Hanzi Writer legge touches[0]: con il palmo appoggiato prenderebbe il punto sbagliato.
// Intercetto i touch in fase di capture e inoltro solo il tocco scelto come eventi mouse.
let activeTouch = null;
function svgNode() { return $('#writer svg'); }
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
    activeTouch = t.identifier; fire('mousedown', t, svg);
  } else {
    const t = [...e.changedTouches].find(t => t.identifier === activeTouch); if (!t) return;
    if (e.type === 'touchmove') fire('mousemove', t, svg);
    else { fire('mouseup', t, document); activeTouch = null; }
  }
}
const board = $('#board');
['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(t => board.addEventListener(t, onTouch, { capture: true, passive: false }));
document.addEventListener('gesturestart', e => e.preventDefault());

// ---------- wiring ----------
$('#btnReview').onclick = () => { const d = dueList(); if (d.length) startSession(d.slice(0, REVIEW_CAP), 'review'); };
$$('[data-tab]').forEach(b => b.onclick = () => { tab = +b.dataset.tab; renderHome(); });
$$('[data-mode]').forEach(b => b.onclick = () => { opts.mode = b.dataset.mode; save(); renderHome(); });
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
  if (cur.done) { cur.graded = true; cur.done = false; cur.k = 0; return renderChar(); } // ripetizione libera dell'intera parola
  cur.charDone = false; writer.cancelQuiz(); writer.hideCharacter(); startQuiz();
};
$('#btnReveal').onclick = () => { if (!writer || cur.done) return; cur.revealed = true; writer.showOutline(); renderOrder(curChar(), true); renderStrip(); fb('Aiuto usato: lo ripasserai presto', 'bad'); };
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
  rT = setTimeout(() => { if ($('#practice').classList.contains('active') && cur && !cur.done) renderChar(); }, 250);
});

// ---------- boot ----------
(async () => {
  srs = load(STORE_KEY, {}); opts = { ...opts, ...load(OPT_KEY, {}) };
  const [chars, words, strokes] = await Promise.all(['chars', 'words', 'strokes'].map(f => fetch(`data/${f}.json`).then(r => r.json())));
  CHARS = chars; WORDS = words; STROKES = strokes; CHARS.concat(WORDS).forEach(x => BYCHAR[x.c] = x);
  renderHome();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
})();
})();
