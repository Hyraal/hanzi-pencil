(() => {
'use strict';

const DAY = 86400000;
const INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64]; // giorni per box
const LEARNED_BOX = 3;
const STORE_KEY = 'hanzi-srs-v1';
const OPT_KEY = 'hanzi-opts-v1';
const REVIEW_CAP = 40;

let CHARS = [], BYCHAR = {}, STROKES = {};
let srs = {};                // { char: {b, d, n, e} }
let opts = { pencil: true, perSession: 8 };

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
const dueList = () => CHARS.filter(x => srs[x.c] && srs[x.c].d <= endOfToday())
  .sort((a, b) => srs[a.c].d - srs[b.c].d).map(x => x.c);

// ---------- home ----------
function renderHome() {
  $('#dueCount').textContent = dueList().length;
  $('#btnReview').disabled = dueList().length === 0;
  for (const lv of [1, 2]) {
    const items = CHARS.filter(x => x.l === lv);
    const seen = items.filter(x => srs[x.c]).length;
    const learned = items.filter(x => status(x.c) === 2).length;
    const pct = Math.round(learned / items.length * 100);
    $(`[data-pct="${lv}"]`).textContent = pct + '%';
    $(`[data-bar="${lv}"]`).style.width = pct + '%';
    $(`[data-meta="${lv}"]`).textContent = `${learned} imparati · ${seen - learned} in studio · ${items.length - seen} nuovi`;
    $(`[data-learn="${lv}"]`).disabled = seen === items.length;
  }
  const hard = Object.entries(srs).filter(([, s]) => s.e > 0)
    .sort((a, b) => (b[1].e / b[1].n) - (a[1].e / a[1].n)).slice(0, 12);
  $('#hardBox').hidden = hard.length === 0;
  $('#hardList').innerHTML = '';
  for (const [c] of hard) {
    const b = document.createElement('button'); b.textContent = c;
    b.onclick = () => startSession([c], 'single'); $('#hardList').append(b);
  }
  $('#optPencil').checked = opts.pencil;
  $('#optNew').value = String(opts.perSession);
}

function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}

// ---------- list ----------
function openList(lv) {
  $('#listTitle').textContent = 'HSK ' + lv;
  const g = $('#grid'); g.innerHTML = '';
  for (const x of CHARS.filter(x => x.l === lv)) {
    const b = document.createElement('button');
    b.textContent = x.c; b.className = 's' + status(x.c); b.title = x.p;
    b.onclick = () => startSession([x.c], 'single');
    g.append(b);
  }
  show('list');
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
  cur = { ...queue[qIndex++], mistakes: 0, revealed: false, done: false };
  $('#sessBar').style.width = ((qIndex - 1) / total * 100) + '%';
  $('#sessCount').textContent = `${Math.min(qIndex, total)} / ${total}`;
  renderItem();
}

function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

function makeWriter(c, outline) {
  const el = $('#writer'); el.innerHTML = ''; el.dataset.c = c;
  const size = $('#board').clientWidth;
  writer = HanziWriter.create(el, c, {
    width: size, height: size, padding: Math.round(size * 0.06),
    showCharacter: false, showOutline: outline,
    strokeColor: css('--ink'), outlineColor: css('--line'), radicalColor: null,
    highlightColor: css('--amber'), drawingColor: css('--ink'),
    drawingWidth: Math.max(14, size / 28), strokeAnimationSpeed: 1.2, delayBetweenStrokes: 180,
    showHintAfterMisses: 3, highlightOnComplete: true,
    charDataLoader: (ch, onLoad, onErr) => STROKES[ch] ? onLoad(STROKES[ch]) : onErr(new Error('no data ' + ch)),
  });
}

function startQuiz() {
  const isTrace = cur.stage === 'trace';
  writer.quiz({
    showHintAfterMisses: isTrace ? 1 : 3,
    leniency: isTrace ? 1.3 : 1,
    onMistake: () => { cur.mistakes++; fb(isTrace ? 'Segui il tratto evidenziato' : `Tratto sbagliato (${cur.mistakes})`, 'bad'); },
    onCorrectStroke: (d) => fb(d.strokesRemaining ? `${d.strokesRemaining} tratti mancanti` : '', ''),
    onComplete: () => complete(),
  });
}

function renderItem() {
  const x = BYCHAR[cur.c];
  const isTrace = cur.stage === 'trace';
  $('#stage').textContent = isTrace ? 'Nuovo · ricalca' : (srs[cur.c] && queue.every(q => q.stage === 'recall') ? 'Ripasso · scrivi a memoria' : 'Scrivi a memoria');
  $('#pinyin').textContent = x.p;
  $('#meaning').textContent = x.m;
  $('#exZh').textContent = isTrace ? x.ez : x.ez.split(x.c).join('〇');
  $('#exPy').textContent = x.ep;
  $('#exIt').textContent = x.ei;
  $('#btnNext').hidden = true;
  $('#btnReveal').hidden = isTrace;
  $('#btnReveal').textContent = 'Aiuto';
  fb(isTrace ? 'Guarda l’ordine dei tratti, poi ricalca' : 'Scrivi il carattere', '');
  makeWriter(cur.c, isTrace || cur.revealed);
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
    fb('Bene! Lo riscriverai a memoria tra poco', 'ok');
  } else {
    const q = grade(cur.c, cur.mistakes, cur.revealed);
    results[q]++;
    const msg = { good: 'Perfetto ✓', ok: `Giusto, con ${cur.mistakes} errori`, fail: 'Da rivedere: torna più avanti' }[q];
    fb(msg, q === 'fail' ? 'bad' : 'ok');
    if (q === 'fail' && !queue.slice(qIndex).some(i => i.c === cur.c)) {
      queue.push({ c: cur.c, stage: 'recall', retry: true }); total++;
    }
  }
  $('#btnReveal').hidden = true;
  $('#btnNext').hidden = false;
}

function finish() {
  renderHome();
  const n = results.good + results.ok + results.fail;
  $('#doneTitle').textContent = n ? 'Sessione finita' : 'Fatto';
  $('#doneText').textContent = n
    ? `${results.good} perfetti · ${results.ok} con errori · ${results.fail} da rivedere`
    : 'Nessun carattere da valutare.';
  show('done');
}

function fb(t, cls) { const f = $('#feedback'); f.textContent = t; f.className = 'feedback ' + (cls || ''); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- input: Apple Pencil -> mouse events for Hanzi Writer ----------
// Hanzi Writer legge touches[0]: con il palmo appoggiato prenderebbe il punto sbagliato.
// Intercetto i touch in fase di capture e inoltro solo il tocco scelto come eventi mouse.
let activeTouch = null;
function svgNode() { return $('#writer svg'); }
function pickTouch(list) {
  for (const t of list) if (!opts.pencil || t.touchType === 'stylus') return t;
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
$$('[data-learn]').forEach(b => b.onclick = () => {
  const lv = +b.dataset.learn;
  const fresh = CHARS.filter(x => x.l === lv && !srs[x.c]).slice(0, opts.perSession).map(x => x.c);
  if (fresh.length) startSession(fresh, 'learn');
});
$$('[data-list]').forEach(b => b.onclick = () => openList(+b.dataset.list));
$$('[data-back]').forEach(b => b.onclick = () => { renderHome(); show('home'); });
$('#btnExit').onclick = () => { if (writer) writer.cancelQuiz(); finish(); };
$('#btnNext').onclick = () => nextItem();
$('#btnAnim').onclick = () => {
  if (!writer) return;
  if (cur.stage === 'recall' && !cur.done) cur.revealed = true;
  writer.cancelQuiz();
  writer.animateCharacter({ onComplete: () => { if (!cur.done) { writer.hideCharacter({ duration: 200 }); startQuiz(); } } });
};
$('#btnRestart').onclick = () => { if (!writer) return; if (cur.done) cur.graded = true; cur.done = false; writer.cancelQuiz(); writer.hideCharacter(); startQuiz(); };
$('#btnReveal').onclick = () => { if (!writer || cur.done) return; cur.revealed = true; writer.showOutline(); fb('Aiuto usato: lo ripasserai presto', 'bad'); };
$('#optPencil').onchange = e => { opts.pencil = e.target.checked; save(); };
$('#optNew').onchange = e => { opts.perSession = +e.target.value; save(); };

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
  rT = setTimeout(() => { if ($('#practice').classList.contains('active') && cur && !cur.done) renderItem(); }, 250);
});

// ---------- boot ----------
(async () => {
  srs = load(STORE_KEY, {}); opts = { ...opts, ...load(OPT_KEY, {}) };
  const [chars, strokes] = await Promise.all([fetch('data/chars.json').then(r => r.json()), fetch('data/strokes.json').then(r => r.json())]);
  CHARS = chars; STROKES = strokes; CHARS.forEach(x => BYCHAR[x.c] = x);
  renderHome();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
})();
})();
