'use strict';
const $ = s => document.querySelector(s);
const app = $('#app');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const kin = t => esc(t).split(' ').map((w, i) => `<span class="w" style="--i:${i}">${w}</span>`).join(' ');
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => iso(new Date());
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const words = en => en.split(' ').map(w => (/^[ap]\.m\.$/i.test(w) ? w : w.replace(/[.,!?]+$/, '')));

/* ── 저장 ── */
const KEY = 'ddak5.v1';
const BASE = { points: 0, done: [], reps: 3, slow: false, sound: true, unit: 0, n: {}, fin: null, spun: {}, just: null };
let S = { ...BASE };
try { S = { ...BASE, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch {}
S.slow = false; // 예전에 저장된 '천천히'도 원속도로
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
// 하루치(문장 + 표현 레슨)를 끝낸 다음 날이면 다음 일차가 열림
if (S.fin && S.fin < today()) { S.unit++; S.n = {}; S.fin = null; }
save();

const cur = () => DAYS[S.unit % DAYS.length];
const fin = () => { if (S.n.learn && S.n.lesson && !S.fin) S.fin = today(); };
function streak() {
  const has = new Set(S.done), d = new Date();
  if (!has.has(iso(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (has.has(iso(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const mins = () => Math.max(1, Math.round((S.reps * 5 * 29 + 5 * 12) / 60));

/* ── 효과음(Web Audio로 합성) · 진동 ── */
let actx = null;
function tone(f, at, dur, { type = 'sine', vol = 0.18, to = 0 } = {}) {
  actx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + at;
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}
const bell = (f, at, dur) => { tone(f, at, dur, { vol: 0.2 }); tone(f * 2.76, at, dur * 0.4, { vol: 0.04 }); };
const SFX = {
  tap: () => tone(700, 0, 0.05, { type: 'triangle', vol: 0.06 }),
  ok: () => { bell(1318.5, 0, 0.5); bell(1046.5, 0.15, 0.9); },                       // 띵동
  no: () => { tone(415, 0, 0.22, { type: 'triangle', vol: 0.14, to: 392 }); tone(349, 0.2, 0.45, { type: 'triangle', vol: 0.14, to: 311 }); }, // 아쉬움
  combo: n => [0, 4, 7].forEach((s, i) => tone(523 * 2 ** ((s + Math.min(n, 8)) / 12), i * 0.06, 0.18, { type: 'triangle', vol: 0.1 })),
  tick: () => tone(1900, 0, 0.025, { type: 'square', vol: 0.03 }),
  coin: () => { tone(988, 0, 0.08, { type: 'square', vol: 0.05 }); tone(1319, 0.08, 0.35, { type: 'square', vol: 0.05 }); },
  start: () => [392, 523, 784].forEach((f, i) => tone(f, i * 0.07, 0.16, { type: 'triangle', vol: 0.1 })),
  pop: () => tone(420, 0, 0.12, { vol: 0.14, to: 980 }),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, i === 3 ? 0.8 : 0.3, { type: 'triangle', vol: 0.13 })),
  whoosh: () => tone(180, 0, 0.3, { vol: 0.08, to: 900 }),
};
const sfx = (name, ...a) => { if (S.sound) try { SFX[name](...a); } catch {} };
const buzz = p => { if (S.sound) navigator.vibrate?.(p); };

/* ── 목소리: 녹음(ElevenLabs) 우선, 없으면 자연스러운 기기 음성 ── */
const voice = { ko: null, f: null, m: null };
const FEM = /\b(female|aria|jenny|ava|emma|michelle|ana|zira|samantha|allison|susan|karen|moira|tessa|serena|libby|sonia|natasha|clara|jane|nancy|sara|victoria|fiona|google us english)\b/i;
const MAL = /\b(male|guy|andrew|brian|christopher|eric|roger|steffan|davis|tony|jason|david|mark|daniel|alex|fred|aaron|arthur|tom|ryan|william|liam|oliver|reed)\b/i;
function pickVoices() {
  if (!('speechSynthesis' in window)) return;
  const all = speechSynthesis.getVoices();
  const rank = v => (/natural|neural/i.test(v.name) ? 8 : 0) + (/premium|enhanced/i.test(v.name) ? 6 : 0) + (/google/i.test(v.name) ? 4 : 0) + (/online/i.test(v.name) ? 2 : 0) + (v.lang === 'en-US' ? 1 : 0);
  const best = l => l.sort((a, b) => rank(b) - rank(a))[0] || null;
  const en = all.filter(v => /^en[-_]/i.test(v.lang));
  const isMale = v => MAL.test(v.name) && !/female/i.test(v.name);
  voice.m = best(en.filter(isMale));
  voice.f = best(en.filter(v => !isMale(v) && FEM.test(v.name))) || best(en.filter(v => !isMale(v)));
  voice.ko = best(all.filter(v => /^ko/i.test(v.lang)));
}
if ('speechSynthesis' in window) { pickVoices(); speechSynthesis.onvoiceschanged = pickVoices; }

// 녹음이 있는 일차(0부터) · s = 문장(ko/en), x = 표현 · 파일: audio/{일차}-{번호}-{ko|en|ex}.mp3
const REC = { s: [0, 1, 2], x: [0, 1, 2] };
const CLIPS = {};
REC.s.forEach(d => DAYS[d].forEach((s, n) => {
  CLIPS[s[0]] = `audio/${d + 1}-${n + 1}-ko.mp3`;
  CLIPS[s[1]] = `audio/${d + 1}-${n + 1}-en.mp3`;
}));
REC.x.forEach(d => DAYS[d].forEach((s, n) => { CLIPS[s[2]] = `audio/${d + 1}-${n + 1}-ex.mp3`; }));
Object.values(CLIPS).forEach(u => fetch(u).catch(() => {})); // 첫 재생 지연 없애기
const player = new Audio(); // 하나를 재사용해야 iOS에서 자동 재생이 막히지 않음
function hush() { window.speechSynthesis?.cancel(); player.pause(); player.onended?.(); }

function say(text, kind, slow = screen === 'learn' && S.slow) {
  hush();
  if (!CLIPS[text]) return tts(text, kind, slow);
  return new Promise(res => {
    let live = true;
    const end = () => { live = false; player.onended = player.onerror = null; };
    const done = () => { if (live) { end(); res(); } };
    const fail = () => { if (live) { end(); tts(text, kind, slow).then(res); } };
    player.onended = done;
    player.onerror = fail;
    player.src = CLIPS[text];
    player.playbackRate = slow ? 0.8 : 1;
    player.play().catch(e => (e.name === 'AbortError' ? done() : fail()));
  });
}
function tts(text, kind, slow) {
  return new Promise(res => {
    if (!('speechSynthesis' in window)) return res();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\s*~\s*/g, ', '));
    const v = kind === 'ko' ? voice.ko : voice[kind] || voice.f || voice.m;
    if (v) u.voice = v;
    u.lang = kind === 'ko' ? 'ko-KR' : v?.lang || 'en-US';
    // 같은 성별 음성이 없으면 높낮이로 구분
    if (kind === 'm' && !voice.m) u.pitch = 0.8;
    if (kind === 'f' && !voice.f) u.pitch = 1.15;
    u.rate = slow ? 0.72 : kind === 'ko' ? 1.05 : 0.95;
    // onend가 안 오는 브라우저 대비
    const t = setTimeout(done, (text.length * 110) / u.rate + 2500);
    function done() { clearTimeout(t); res(); }
    u.onend = u.onerror = done;
    speechSynthesis.speak(u);
  });
}

/* ── 아이콘 · 마스코트 ── */
const ICON = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h14"/><path d="M9 8h6"/>',
  chart: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  play: '<path d="M7 5l12 7-12 7z" fill="currentColor"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  skip: '<path d="M6 5l10 7-10 7z"/><path d="M19 5v14"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  vol: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  retry: '<path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7"/><path d="M4 4v4.7h4.7"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  slow: '<path d="M12 14l-3.5-3.5"/><path d="M3.5 18a9 9 0 1 1 17 0"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  star: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor" stroke-width="1.5"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  chest: '<path d="M3 11a9 6 0 0 1 18 0v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" fill="currentColor" fill-opacity=".25"/><path d="M3 12h18"/><rect x="10" y="10" width="4" height="5" rx="1" fill="currentColor"/>',
};
const ico = (n, s = 22) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const flame = (s = 18) => `<svg class="fl" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4.5 2-7 2 1 3 2.5 3 4 1.5-2 1-5 1-9z" fill="currentColor"/></svg>`;
// 마스코트 '다섯이' (머리 위 별 = 다섯)
const buddy = (mood = 'happy', s = 72) => `<svg class="buddy ${mood}" width="${s}" height="${s}" viewBox="0 0 100 104" aria-hidden="true">
  <ellipse cx="50" cy="100" rx="24" ry="4" fill="rgb(27 24 66/.12)"/>
  <g class="bd">
    <polygon points="50,0 52.6,6 59,6.6 54.2,10.8 55.6,17 50,13.8 44.4,17 45.8,10.8 41,6.6 47.4,6" fill="#FFD23F"/>
    <path d="M50 16c22 0 36 15 36 39s-14 39-36 39S14 79 14 55s14-39 36-39z" fill="#6D5BFF"/>
    <path d="M30 30c6-7 14-10 20-10" stroke="#9A8CFF" stroke-width="5" stroke-linecap="round" fill="none"/>
    <g class="eyes"><ellipse cx="38" cy="50" rx="9" ry="10.5" fill="#fff"/><ellipse cx="62" cy="50" rx="9" ry="10.5" fill="#fff"/>
      <circle cx="${mood === 'sad' ? 37 : 40}" cy="${mood === 'sad' ? 54 : 52}" r="4.8" fill="#1B1842"/><circle cx="${mood === 'sad' ? 61 : 64}" cy="${mood === 'sad' ? 54 : 52}" r="4.8" fill="#1B1842"/></g>
    <circle cx="29" cy="64" r="5" fill="#FF7AA2" opacity=".55"/><circle cx="71" cy="64" r="5" fill="#FF7AA2" opacity=".55"/>
    ${mood === 'sad'
      ? '<path d="M42 72q8-6 16 0" stroke="#1B1842" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
      : '<path d="M40 66q10 11 20 0z" fill="#1B1842"/><path d="M45 71q5 3 10 0" stroke="#FF7AA2" stroke-width="3" stroke-linecap="round"/>'}
  </g></svg>`;
const wave = () => `<span class="wave" aria-hidden="true">${[0, 1, 2, 3].map(i => `<b style="--i:${i}"></b>`).join('')}</span>`;
const nav = c => `<nav class="nav" aria-label="메뉴">${[['home', 'home', '홈'], ['expr', 'book', '표현'], ['record', 'chart', '기록']]
  .map(([k, i, l]) => `<button data-a="tab" data-v="${k}" ${c === k ? 'aria-current="page"' : ''}>${ico(i)}<span>${l}</span></button>`).join('')}</nav>`;
const bar = (p, label) => `<div class="bar"><button class="icon-btn" data-a="quit" aria-label="닫기">${ico('x')}</button>
  <div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${Math.floor(p)}">${[0, 1, 2, 3, 4].map(k => `<i><b style="width:${Math.max(0, Math.min(1, p - k)) * 100}%"></b></i>`).join('')}</div>
  <span class="lbl">${label}</span></div>`;
const PRAISE = ['좋아요!', '완벽해요!', '대단해요!', '멋져요!', '바로 그거예요!', '천재인가요?'];
const CHEER = ['아쉬워요', '거의 다 왔어요', '괜찮아요, 다시 나와요'];

/* ── 상태 ── */
let screen = sessionStorage.getItem('ddak5.seen') ? 'home' : 'splash';
let shown = null, run = 0;
let T = cur();           // 학습 중 문장 세트
let L = null;            // 문장 학습 {round, i, step, paused}
let P = null;            // 5초 말하기 {i, phase, heard, res, scores, rec}
let LS = null;           // 표현 레슨
let D = null, E = null;  // 완료 요약 (문장 · 레슨)
// 한국어 → 생각 → (영어 → 따라) × 3
const STEPS = ['ko', 'think', 'en', 'shadow', 'en', 'shadow', 'en', 'shadow'];
const STEP_L = ['한국어', '생각', '영어', '따라'];
const pillOf = step => Math.min(step, 2 + ((step - 2) % 2)); // 단계 → 표시할 버튼 번호
const repOf = step => Math.max(1, Math.floor((step - 2) / 2) + 1); // 영어·따라 몇 번째(1~3)
const SEG = [10, 30, 20, 100, 10, 50, 20, 0]; // 0 = 한 번 더
const W = { a: 0, v: 0, on: false, stop: false, dec: 0, last: 0, seg: 0, auto: 0 };
const g = (o = 0) => ((L.i + L.round + o) % 2 ? 'm' : 'f');

/* ── 학습 경로(듀오링고식) ── */
const KINDS = [['learn', 'star', '오늘의 5문장'], ['lesson', 'book', '표현 레슨'], ['chest', 'chest', '보물상자']];
function nodeState(u, kind) {
  if (u < S.unit) return 'done';
  if (u > S.unit) return 'lock';
  if (S.n[kind]) return 'done';
  const first = KINDS.find(([k]) => !S.n[k]);
  return first && first[0] === kind ? 'open' : 'lock';
}
function path() {
  const base = Math.floor(S.unit / 10) * 10, t = today();
  let html = '', i = 0;
  for (let u = base; u < base + 10; u++) {
    if (u > base) html += `<div class="divider"><span>${u + 1}일차</span></div>`;
    for (const [kind, icon, label] of KINDS) {
      const st = nodeState(u, kind), x = Math.round(Math.sin(i++ * 0.9) * 70);
      const guard = kind === 'learn' && streak() > 0 && !S.done.includes(t);
      html += `<div class="node-row" style="--x:${x}px">
        ${st === 'open' ? `<span class="bubble">${guard ? `${flame(14)} ${streak()}일 지키기` : 'START'}</span>
          <span class="mascot" style="${x > 0 ? 'right' : 'left'}:calc(100% + 18px)">${buddy('happy', 64)}</span>` : ''}
        <button class="node ${kind} ${st} ${S.just === kind && u === S.unit ? 'just' : ''}" data-a="node" data-v="${kind}:${u}"
          aria-label="${u + 1}일차 ${label}${st === 'done' ? ' 완료' : st === 'lock' ? ' 잠김' : ''}">${ico(st === 'lock' && kind !== 'chest' ? 'lock' : st === 'done' && kind !== 'chest' ? 'check' : icon, 34)}</button>
      </div>`;
    }
  }
  return html;
}
function popHtml(kind, u) {
  const st = nodeState(u, kind);
  if (st === 'lock') return `<div class="pop lock" data-v="${kind}:${u}"><b>${u > S.unit ? `${u + 1}일차` : KINDS.find(k => k[0] === kind)[2]}</b>
    <p>${u > S.unit ? '내일 열려요 · 오늘 것을 끝내 두세요' : '앞 단계를 먼저 끝내요'}</p></div>`;
  if (kind === 'learn') return `<div class="pop" data-v="${kind}:${u}"><b>${u + 1}일차 · 오늘의 5문장</b>
    <p>${st === 'done' ? '복습하면 +10P' : `약 <span id="mins">${mins()}</span>분 · +50P`}</p>
    <div class="seg" role="radiogroup" aria-label="반복 횟수" style="--idx:${S.reps - 1}">${[1, 2, 3].map(n => `<button role="radio" aria-checked="${S.reps === n}" data-a="reps" data-v="${n}">${n}회</button>`).join('')}</div>
    <button class="btn big" data-a="preview">${st === 'done' ? '다시 하기' : 'START'}</button></div>`;
  return `<div class="pop" data-v="${kind}:${u}"><b>표현 레슨</b><p>${st === 'done' ? '복습하면 +5P' : '오늘 문장으로 10문제 · +20P'}</p>
    <button class="btn big" data-a="lesson">${st === 'done' ? '다시 하기' : 'START'}</button></div>`;
}
function openChest(btn) {
  const r = pickOne([10, 20, 20, 30, 30, 50, 100]);
  btn.classList.add('wiggle');
  sfx('whoosh');
  buzz([20, 60, 20]);
  setTimeout(() => {
    S.points += r; S.n.chest = true; S.just = 'chest'; save();
    sfx('fanfare'); buzz([30, 40, 30, 40, 90]); confetti();
    btn.insertAdjacentHTML('afterend', `<span class="float">+${r}P</span>`);
    setTimeout(() => screen === 'home' && render(), 1400);
  }, 900);
}

/* ── 표현 레슨: 오늘 5문장으로 4가지 유형 ── */
const TYPES = ['build', 'listen', 'fill', 'meaning'];
const QLABEL = { build: '영어로 만들어요', listen: '듣고 뜻을 골라요', fill: '빈칸을 채워요', meaning: '이 표현의 뜻은?' };
function makeItem(t, k) {
  const day = cur(), s = day[k], others = day.filter((_, j) => j !== k);
  if (t === 'build') {
    const ans = words(s[1]), low = new Set(ans.map(w => w.toLowerCase()));
    const extra = shuffle([...new Set(others.flatMap(x => words(x[1])))].filter(w => w.length > 1 && !low.has(w.toLowerCase()))).slice(0, 3);
    return { t, k, tiles: shuffle([...ans, ...extra]), built: [] };
  }
  if (t === 'listen') return { t, k, opts: shuffle([k, ...shuffle(day.map((_, j) => j).filter(j => j !== k)).slice(0, 2)]), pick: null };
  if (t === 'meaning') return { t, k, opts: shuffle([s[3], ...shuffle(others.map(x => x[3])).slice(0, 2)]), pick: null };
  // fill: 표현에 속한 단어(없으면 가장 긴 단어)를 빈칸으로
  const toks = s[1].split(' '), clean = words(s[1]), ex = new Set(norm(s[2].replace(/~/g, ' ')));
  let b = -1;
  clean.forEach((w, j) => { const nw = norm(w); if (nw.length === 1 && ex.has(nw[0]) && w.length > 2 && (b < 0 || w.length > clean[b].length)) b = j; });
  if (b < 0) b = clean.reduce((m, w, j) => (w.length > clean[m].length ? j : m), 0);
  const ans = clean[b];
  const pool = [...new Set(others.flatMap(x => words(x[1])))].filter(w => w.length > 2 && w.toLowerCase() !== ans.toLowerCase());
  return { t, k, toks, blank: b, ans, opts: shuffle([ans, ...shuffle(pool).slice(0, 2)]), pick: null };
}
function startLesson() {
  T = cur();
  const q = shuffle([0, 1, 2, 3, 4].flatMap(k => shuffle(TYPES).slice(0, 2).map(t => makeItem(t, k))));
  LS = { q, n: q.length, solved: 0, first: 0, combo: 0, best: 0, t0: Date.now(), state: 'ask', prev: 0 };
  sfx('start');
  go('lesson');
}
const canCheck = it => (it.t === 'build' ? it.built.length > 0 : it.pick != null);
function isRight(it) {
  const s = T[it.k];
  if (it.t === 'build') return score(s[1], it.built.map(i => it.tiles[i]).join(' ')).pct === 100;
  if (it.t === 'listen') return it.opts[it.pick] === it.k;
  if (it.t === 'meaning') return it.opts[it.pick] === s[3];
  return it.opts[it.pick] === it.ans;
}
const answerOf = it => (it.t === 'listen' ? T[it.k][0] : it.t === 'meaning' ? T[it.k][3] : T[it.k][1]);

function lessonBody(it) {
  const s = T[it.k], A = it.shown ? '' : 'anim';
  const ask = `<div class="ask ${A}"><span class="mini">${buddy('happy', 60)}</span>
    <button class="speech" data-a="sayq" aria-label="다시 듣기"><span class="sp-ic">${ico('vol', 18)}</span><span lang="ko">${esc(s[0])}</span></button></div>`;
  const tip = it.hinted && (it.t === 'listen' || it.t === 'meaning') ? `<p class="hintbox" lang="en">${ico('bulb', 16)} ${esc(s[1])}</p>` : '';
  if (it.t === 'build') return `${ask}
    <div class="answer" aria-label="내 답">${it.built.map(id => `<button class="tile" data-a="untile" data-v="${id}" lang="en">${esc(it.tiles[id])}</button>`).join('')}</div>
    <div class="bank ${A}">${it.tiles.map((w, id) => it.built.includes(id) ? `<span class="tile used" aria-hidden="true">${esc(w)}</span>`
      : `<button class="tile" data-a="tile" data-v="${id}" lang="en">${esc(w)}</button>`).join('')}</div>`;
  const choices = (labels, lang, row) => `<div class="choices ${row ? 'row' : ''} ${A}">${labels.map((l, j) =>
    `<button class="choice ${it.pick === j ? 'sel' : ''}" data-a="choose" data-v="${j}" lang="${lang}" style="--i:${j}">${row ? '' : `<span class="key">${j + 1}</span>`}<span>${esc(l)}</span></button>`).join('')}</div>`;
  if (it.t === 'listen') return `<div class="listen ${A}">
      <button class="spk big" data-a="hear" aria-label="듣기">${ico('vol', 44)}</button>
      <button class="spk small" data-a="hear" data-v="slow" aria-label="천천히 듣기">${ico('slow', 26)}</button></div>
    ${tip}${choices(it.opts.map(k => T[k][0]), 'ko')}`;
  if (it.t === 'meaning') return `<div class="xprompt ${A}"><button class="spk small" data-a="hear" aria-label="듣기">${ico('vol', 26)}</button><b lang="en">${esc(s[2])}</b></div>
    ${tip}${choices(it.opts, 'ko')}`;
  const tail = it.toks[it.blank].slice(it.ans.length);
  return `${ask}<p class="fill ${A}" lang="en">${it.toks.map((w, j) => j === it.blank
    ? `<span class="blank ${it.pick != null ? 'on' : ''}">${it.pick != null ? esc(it.opts[it.pick]) : it.hinted ? `${esc(it.ans[0])}…` : '&nbsp;'}</span>${esc(tail)}` : esc(w)).join(' ')}</p>
    ${choices(it.opts, 'en', true)}`;
}

/* ── 화면 ── */
const V = {
  splash: () => `<section class="splash" data-a="home" role="button" aria-label="시작">
    <i class="halo"></i><i class="halo" style="animation-delay:1.9s"></i>
    <svg class="spark" width="30" height="30" viewBox="0 0 24 24" style="top:18%;left:14%;animation-delay:1.4s" aria-hidden="true"><path d="M12 0L14 10L24 12L14 14L12 24L10 14L0 12L10 10Z" fill="#fff"/></svg>
    <svg class="spark" width="20" height="20" viewBox="0 0 24 24" style="bottom:22%;right:16%;animation-delay:2s" aria-hidden="true"><path d="M12 0L14 10L24 12L14 14L12 24L10 14L0 12L10 10Z" fill="#FFD23F"/></svg>
    <h1 class="mark" aria-label="딱! 다섯">${['딱', '!', '', '다', '섯'].map((c, k) => c ? `<span style="--i:${k}" aria-hidden="true"><span>${c}</span></span>` : '<span class="gap"></span>').join('')}</h1>
    <i class="uline"></i>
    <div class="dots" aria-hidden="true">${[0, 1, 2, 3, 4].map(k => `<i style="--i:${k}"></i>`).join('')}</div>
    <p class="tag">하루 5문장, 딱 5분</p>
  </section>`,

  home: () => `<section class="scr home">
      <div class="fixtop">
        <header class="top"><div class="logo"><b>딱!</b> 다섯</div>
          <div class="chips">
            <span class="chip" aria-label="연속 ${streak()}일">${flame()}${streak()}</span>
            <span class="chip" aria-label="포인트"><i class="gem"></i>${S.points.toLocaleString()}</span>
            <button class="chip" data-a="sound" aria-pressed="${S.sound}" aria-label="소리·진동">${ico(S.sound ? 'vol' : 'mute', 18)}</button>
          </div></header>
        <div class="unit glow"><div><small>${S.unit + 1}일차</small><b>오늘의 5문장</b></div>
          <button class="unit-btn" data-a="sheet" aria-label="오늘 문장 보기">${ico('list')}</button></div>
      </div>
      <div class="path">${path()}</div>
    </section>${nav('home')}`,

  learn: () => {
    const s = T[L.i], st = STEPS[L.step], en = L.step >= 2;
    return `<section class="scr">
      ${bar(L.i + L.step / STEPS.length, `${L.round}/${S.reps}`)}
      <ol class="steps" aria-label="단계">${STEP_L.map((t, k) => {
        const p = pillOf(L.step), rep = repOf(L.step);
        return `<li class="${k < p ? 'did' : k === p ? 'now' : ''}" ${k === p ? 'aria-current="step"' : ''}>${k < p && k < 2 ? ico('check', 14) : ''}${t}${k >= 2 ? `<small class="rep">${L.step >= 2 ? rep : 1}/3</small>` : ''}</li>`;
      }).join('')}</ol>
      <button class="stage" data-a="replay" aria-label="다시 듣기"><span class="replay" aria-hidden="true">${ico('vol', 20)}</span>
        <p class="ko ${en ? 'sub' : ''}" lang="ko">${kin(s[0])}</p>
        ${st === 'think' ? `<div class="cd"><svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="40"/><circle class="fg" cx="48" cy="48" r="40"/></svg><span id="cd" aria-live="polite">5</span></div>` : ''}
        ${en ? `<p class="en" lang="en">${kin(s[1])}</p>` : ''}
        ${st.startsWith('en') && !CLIPS[s[1]] ? `<span class="who">${g(repOf(L.step) - 1) === 'f' ? '여성' : '남성'}</span>` : ''}
        ${st === 'shadow' ? `<span class="say">${ico('mic', 14)}따라 말해요</span>` : ''}
        ${st !== 'think' && st !== 'shadow' && !L.paused ? wave() : ''}
      </button>
      <div class="ctrl">
        <button class="pill ${S.slow ? 'on' : ''}" data-a="slow" aria-pressed="${S.slow}">${ico('slow', 18)}천천히</button>
        <button class="round-btn" data-a="pause" aria-label="${L.paused ? '계속' : '멈춤'}">${ico(L.paused ? 'play' : 'pause', 28)}</button>
        <button class="pill" data-a="skip" aria-label="건너뛰기">${ico('skip', 20)}</button>
      </div>
    </section>`;
  },

  speak: () => {
    const s = T[P.i], r = P.res, rec = P.phase === 'rec', result = P.phase === 'result';
    let body;
    if (!result) body = `<div class="micwrap ${rec && P.live ? 'on' : ''}">
        <svg class="timer" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54"/><circle class="fg" cx="60" cy="60" r="54"/></svg>
        <button class="mic" data-a="mic" aria-label="${rec ? '그만 말하기' : '눌러서 말하기'}">${ico('mic', 36)}</button></div>
      <p class="hintbox ${P.hint ? '' : 'off'}" id="hint" lang="en">${hintText(s[1], P.hint)}</p>
      <p class="heard" id="heard" lang="en" aria-live="polite">${esc(P.heard)}</p>`;
    else if (!r) body = `<div class="res low"><p class="en" lang="en">${esc(s[1])}</p>
        <p class="heard-s">${P.noMic ? '마이크를 허용해 주세요' : SR ? '잘 안 들렸어요' : '이 브라우저는 음성 인식이 안 돼요 · Chrome 추천'}</p></div>`;
    else {
      const tone = r.pct >= 80 ? 'good' : r.pct >= 50 ? 'mid' : 'low';
      const word = r.pct === 100 ? '완벽해요' : r.pct >= 80 ? '좋아요' : r.pct >= 50 ? '거의 다 왔어요' : '한 번 더';
      body = `<div class="res ${tone}">
        <div class="res-top"><div class="pct"><b data-count="${r.pct}">0</b><span>%</span></div><span class="badge">${word}</span></div>
        <div class="meter"><i style="--w:${r.pct}%"></i></div>
        <p class="marks" lang="en">${r.marks.map(m => `<span class="${m.ok ? 'hit' : 'miss'}">${esc(m.w)}</span>`).join(' ')}</p>
        <p class="heard-s" lang="en">“${esc(P.heard)}”</p></div>`;
    }
    return `<section class="scr speak">
      ${bar(P.i + (result ? 1 : 0), `${P.i + 1}/5`)}
      <p class="cue" id="cue">${cueText()}</p>
      <div class="korow"><h2 class="ko big" lang="ko">${kin(s[0])}</h2>
        <button class="spk tiny" data-a="again" aria-label="한국어 다시 듣기">${ico('vol', 18)}</button></div>
      ${result ? '' : `<button class="hint center" data-a="shint">${ico('bulb', 18)}힌트</button>`}
      ${body}
      ${result ? `<div class="ctrl3">
        <button class="btn soft sq" data-a="answer" aria-label="정답 듣기">${ico('vol')}</button>
        <button class="btn soft sq" data-a="retry" aria-label="다시 말하기">${ico('retry')}</button>
        <button class="btn" data-a="snext">${P.i < 4 ? '다음' : '완료'} ${ico('next')}</button></div>` : ''}
    </section>`;
  },

  done: () => {
    const got = S.spun[today()];
    return `<section class="scr done">
      ${buddy('cheer', 96)}
      <h1 class="mega">${kin('딱! 완료')}</h1>
      <div class="tiles3 rise" style="--d:3">
        <div class="t3 gold"><small>획득</small><b>+${D.gain}P</b></div>
        <div class="t3 green"><small>정확도</small><b>${D.avg != null ? `<span data-count="${D.avg}">0</span>%` : '-'}</b></div>
        <div class="t3 orange"><small>연속</small><b>${streak()}일</b></div>
      </div>
      ${got == null ? `<div class="wheel-wrap rise" style="--d:5"><i class="pointer"></i><svg class="wheel" id="wheel" viewBox="0 0 200 200" role="img" aria-label="보상 룰렛">${wheel()}</svg></div>
        <p class="spinres" id="spinres" aria-live="polite"></p>
        <button class="btn big spin" id="spin" data-a="spin">START</button>`
        : `<p class="spinres show">오늘 룰렛 +${got}P</p>`}
      <button class="btn soft big" data-a="tab" data-v="home">계속</button>
    </section>`;
  },

  lesson: () => {
    const it = LS.q[0], pct = Math.round((LS.solved / LS.n) * 100), st = LS.state;
    return `<section class="scr lesson ${st !== 'ask' ? 'fbon' : ''}">
      <div class="lbar"><button class="icon-btn" data-a="quit" aria-label="닫기">${ico('x')}</button>
        <div class="lmeter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="--from:${LS.prev}%;--to:${pct}%"></i></div>
        ${LS.combo >= 2 ? `<span class="chip combo">${flame()}${LS.combo}</span>` : ''}</div>
      ${it.miss && st === 'ask' ? '<p class="again">다시 나온 문제</p>' : ''}
      <div class="qrow"><h2 class="qtype ${it.shown ? '' : 'anim'}">${QLABEL[it.t]}</h2>
        ${st === 'ask' ? `<button class="hint" data-a="hint">${ico('bulb', 18)}힌트</button>` : ''}</div>
      <div class="lbody">${lessonBody(it)}</div>
      ${st === 'ask' ? `<div class="foot"><button class="btn big" data-a="check" ${canCheck(it) ? '' : 'disabled'}>확인</button></div>`
        : `<div class="fb ${st}" role="status">
          <div class="fb-h"><span class="ic">${ico(st === 'good' ? 'check' : 'x', 24)}</span><b>${LS.msg}</b></div>
          ${st === 'bad' ? `<p>정답: <span lang="${it.t === 'listen' || it.t === 'meaning' ? 'ko' : 'en'}">${esc(answerOf(it))}</span></p>`
            : it.t !== 'meaning' && it.t !== 'listen' ? `<p lang="en">${esc(T[it.k][1])}</p>` : ''}
          <button class="btn big" data-a="cont">계속</button></div>`}
    </section>`;
  },

  lend: () => `<section class="scr done">
      ${buddy('cheer', 110)}
      <h1 class="mega">${kin(E.acc === 100 ? '완벽해요!' : '레슨 완료!')}</h1>
      <div class="tiles3 rise" style="--d:3">
        <div class="t3 gold"><small>획득</small><b>+<span data-count="${E.gain}">0</span>P</b></div>
        <div class="t3 green"><small>정확도</small><b><span data-count="${E.acc}">0</span>%</b></div>
        <div class="t3 blue"><small>시간</small><b>${E.time}</b></div>
      </div>
      ${E.best >= 3 ? `<span class="chip rise" style="--d:5">${flame()} 최고 ${E.best}연속</span>` : ''}
      <button class="btn big" data-a="tab" data-v="home">계속</button>
    </section>`,

  preview: () => `<section class="scr">
      <div class="bar"><button class="icon-btn" data-a="quit" aria-label="닫기">${ico('x')}</button><span class="lbl" style="margin-left:auto">${S.unit + 1}일차</span></div>
      <div class="ask rise"><span class="mini">${buddy('happy', 64)}</span><div class="speech">오늘 배울 5문장이에요</div></div>
      <ol class="list">${cur().map((x, k) => `<li><button class="item" style="--i:${k}" data-a="sayko" data-v="${k}" aria-label="${esc(x[0])} 듣기">
        <span class="num">${k + 1}</span><span lang="ko">${esc(x[0])}</span><span class="pl">${ico('vol', 18)}</span></button></li>`).join('')}</ol>
      <div class="dock"><button class="btn big" data-a="start">START ${ico('next')}</button></div>
    </section>`,

  expr: () => !S.n.learn ? `<section class="scr">
      <div class="fixtop"><h1 class="title">오늘의 표현</h1></div>
      <div class="locked rise" style="--d:1">${buddy('happy', 96)}
        <span class="lock-ic">${ico('lock', 22)}</span>
        <p>오늘의 문장을 먼저 공부해요</p></div>
      <div class="dock"><button class="btn big" data-a="preview">문장 공부하러 가기 ${ico('next')}</button></div>
    </section>${nav('expr')}` : `<section class="scr">
      <header class="fixtop head"><h1 class="title">오늘의 표현</h1><span class="chip">${S.unit + 1}일차</span></header>
      <div class="xlist">${cur().map((s, k) => `<article class="xcard" style="--i:${k}">
        <div class="xhead"><span class="num">${k + 1}</span><h2 class="x" lang="en">${esc(s[2])}</h2>
          <button class="spk tiny" data-a="sayx" data-v="${k}" aria-label="표현 듣기">${ico('vol', 18)}</button></div>
        <p class="mean">${esc(s[3])}</p>
        <button class="ex" data-a="sayen" data-v="${k}" aria-label="예문 듣기"><span class="play">${ico('play', 12)}</span><span lang="en">${esc(s[1])}</span></button>
      </article>`).join('')}</div>
      <div class="dock"><button class="btn big" data-a="lesson">표현 레슨 ${ico('next')}</button></div>
    </section>${nav('expr')}`,

  record: () => {
    const d = new Date(), y = d.getFullYear(), m = d.getMonth(), first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), has = new Set(S.done), t = today();
    return `<section class="scr">
      <div class="fixtop"><h1 class="title">기록</h1></div>
      <div class="pts glow rise" style="--d:1"><b data-count="${S.points}">0</b><span>P</span></div>
      <div class="stat2 rise" style="--d:2">
        <div>${flame(24)}<b data-count="${streak()}">0</b><small>연속</small></div>
        <div>${ico('check', 24)}<b data-count="${S.done.length}">0</b><small>완료한 날</small></div>
      </div>
      <div class="cal rise" style="--d:3"><p class="cal-h">${m + 1}월</p><div class="grid">
        ${'일월화수목금토'.split('').map(x => `<span class="wd">${x}</span>`).join('')}${'<span></span>'.repeat(first)}
        ${Array.from({ length: days }, (_, k) => { const x = iso(new Date(y, m, k + 1)); return `<span class="c ${has.has(x) ? 'on' : ''} ${x === t ? 'now' : ''}" style="--i:${k}">${k + 1}</span>`; }).join('')}
      </div></div>
    </section>${nav('record')}`;
  },
};

function wheel() {
  const pt = a => `${(100 + 96 * Math.cos(a)).toFixed(2)} ${(100 + 96 * Math.sin(a)).toFixed(2)}`;
  const C = [['var(--primary)', '#fff'], ['var(--tint)', 'var(--ink)'], ['var(--accent)', '#1B1842'], ['var(--tint)', 'var(--ink)']];
  return SEG.map((v, k) => {
    const a0 = ((k * 45 - 22.5 - 90) * Math.PI) / 180, [bg, fg] = C[k % 4];
    return `<path d="M100 100L${pt(a0)}A96 96 0 0 1 ${pt(a0 + Math.PI / 4)}Z" style="fill:${bg};stroke:var(--card);stroke-width:2"/>
      <text x="100" y="36" transform="rotate(${k * 45} 100 100)" text-anchor="middle" style="fill:${fg}" font-weight="800" font-size="${v ? 15 : 22}">${v ? v + 'P' : '↻'}</text>`;
  }).join('') + '<circle cx="100" cy="100" r="16" style="fill:var(--card);stroke:var(--primary);stroke-width:4"/>';
}

/* ── 렌더 ── */
function countUp(el) {
  const to = +el.dataset.count;
  if (reduce || !to) { el.textContent = to.toLocaleString(); return; }
  const t0 = performance.now();
  const f = now => {
    const p = Math.min(1, (now - t0) / 900);
    el.textContent = Math.round(to * (1 - (1 - p) ** 3)).toLocaleString();
    if (p < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}
function render() {
  const draw = () => {
    app.innerHTML = V[screen]();
    app.querySelectorAll('[data-count]').forEach(countUp);
    if (screen === 'home') {
      $('.node.just, .node.open')?.scrollIntoView({ block: 'center' });
      if (S.just) { S.just = null; save(); }
    }
    if (screen === 'lesson') {
      const it = LS.q[0];
      if (!it.shown && it.t === 'listen') setTimeout(() => say(T[it.k][1], 'f'), 450);
      if (!it.shown && it.t === 'meaning') setTimeout(() => say(T[it.k][2], 'f'), 450);
      it.shown = true;
      LS.prev = Math.round((LS.solved / LS.n) * 100);
    }
  };
  const change = shown !== screen;
  if (change && document.startViewTransition && !reduce && shown) document.startViewTransition(draw).ready.catch(() => {}); // 빠르게 넘기면 전환이 취소됨
  else draw();
  if (change && screen !== 'home') window.scrollTo(0, 0);
  shown = screen;
}
function go(s) {
  if (s !== screen) { run++; hush(); P?.rec?.abort?.(); cancelAnimationFrame(W.raf); W.on = false; clearTimeout(W.auto); }
  screen = s;
  render();
}
function confetti() {
  if (reduce) return;
  const c = document.createElement('div');
  c.className = 'confetti';
  const col = ['#6D5BFF', '#FFD23F', '#FF7AA2', '#3DDC97', '#B9AFFF'];
  c.innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="--x:${Math.random() * 100}%;--c:${col[i % 5]};--dx:${(Math.random() - 0.5) * 160}px;--r:${Math.random() * 720}deg;--t:${1.6 + Math.random()}s;--dl:${Math.random() * 0.3}s"></i>`).join('');
  document.body.appendChild(c);
  setTimeout(() => c.remove(), 3200);
}

/* ── 문장 학습: 듣기 → 생각(5초) → 영어 → 따라 말하기 ── */
async function play() {
  const id = ++run, s = T[L.i], st = STEPS[L.step];
  L.paused = false;
  render();
  if (st === 'ko') await say(s[0], 'ko');
  else if (st === 'think') {
    for (let k = 5; k > 0 && id === run; k--) {
      const el = $('#cd');
      if (el) { el.textContent = k; el.animate?.([{ transform: 'scale(1.4)', opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'ease-out' }); }
      if (k <= 3) sfx('tick');
      await wait(1000);
    }
  } else if (st === 'shadow') await wait(1200 + (s[1].split(' ').length * 450) / (S.slow ? 0.72 : 1)); // 직접 따라 말할 시간
  else await say(s[1], g(repOf(L.step) - 1)); // 반복마다 남·여 번갈아 (녹음 있으면 녹음)
  await wait(350);
  if (id === run) next();
}
function next() {
  if (++L.step < STEPS.length) return play();
  L.step = 0;
  if (++L.i < 5) { sfx('pop'); buzz(10); return play(); }
  L.i = 0;
  if (++L.round <= S.reps) { sfx('combo', L.round); buzz([15, 30, 15]); return play(); }
  P = { i: 0, scores: [] };
  speakItem();
}

/* ── 5초 말하기 ── */
const hintText = (en, n) => en.split(' ').map((w, j) => (j < n * 2 ? esc(w) : '<i class="gap-w"></i>')).join(' ');
const cueText = () => (P.phase === 'listen' ? wave() + '듣는 중'
  : P.phase === 'tap' ? '마이크를 눌러 말해요'
  : P.phase === 'rec' ? (P.live ? '지금 말하세요' : '준비 중…') : '');
async function speakItem() {
  Object.assign(P, { phase: 'listen', heard: '', res: null, noMic: false, hint: 0 });
  go('speak');
  const id = ++run;
  await say(T[P.i][0], 'ko');
  await wait(250); // 스피커 소리 꼬리가 마이크에 들어가지 않게
  if (id === run) listen(id);
}
function listen(id) {
  const target = T[P.i][1];
  Object.assign(P, { phase: 'rec', heard: '', res: null, live: false });
  render();
  if (!SR) { setTimeout(() => id === run && finish(''), 5000); return; }
  const r = (P.rec = new SR());
  r.lang = 'en-US';
  r.interimResults = true;
  r.continuous = false; // 한 문장 말하고 멈추면 바로 끝남 (모바일에서 더 안정적)
  r.maxAlternatives = 5;
  let best = '';
  // 마이크가 실제로 켜진 뒤에 안내·타이머 시작
  r.onaudiostart = () => {
    if (id !== run) return;
    P.live = true;
    $('.micwrap')?.classList.add('on');
    const c = $('#cue'); if (c) c.textContent = cueText();
    sfx('pop'); buzz(15);
  };
  r.onresult = e => {
    const R = [...e.results];
    // 후보 문장 여러 개 중 정답에 가장 가까운 것을 고른다
    const cands = [0, 1, 2, 3, 4].map(a => R.map(x => x[Math.min(a, x.length - 1)].transcript).join(' ').trim());
    best = cands.reduce((b, c) => (score(target, c).pct > score(target, b).pct ? c : b), cands[0]);
    P.heard = best;
    const h = $('#heard');
    if (h) h.textContent = best;
    if (R.every(x => x.isFinal) && score(target, best).pct === 100) r.stop();
  };
  r.onerror = e => { if (/not-allowed|service-not-allowed|audio-capture/.test(e.error)) P.noMic = true; };
  const t = setTimeout(() => r.stop(), 9000);
  r.onend = () => {
    clearTimeout(t);
    if (id !== run) return;
    // 자동 시작이 막힌 브라우저(iOS 등)는 한 번은 '눌러서 말하기'로 다시 기회
    if (!best && P.noMic && !P.tapped) { P.phase = 'tap'; P.tapped = true; P.noMic = false; return render(); }
    finish(best);
  };
  try { r.start(); } catch { clearTimeout(t); P.phase = 'tap'; P.tapped = true; render(); }
}
function finish(text) {
  const s = T[P.i];
  P.phase = 'result';
  P.heard = text;
  P.res = text.trim() ? score(s[1], text) : null;
  if (P.res) P.scores[P.i] = Math.max(P.scores[P.i] || 0, P.res.pct);
  render();
  if (P.res?.pct >= 80) { sfx('ok'); buzz([15, 40, 15]); } else { sfx('no'); buzz(60); }
  setTimeout(() => P.phase === 'result' && screen === 'speak' && say(s[1], 'f'), 1100);
}
function complete() {
  const t = today();
  if (!S.done.includes(t)) S.done.push(t);
  const gain = S.n.learn ? 10 : 50;
  const sc = P.scores.filter(x => x != null);
  S.points += gain;
  if (!S.n.learn) S.just = 'learn';
  S.n.learn = true;
  fin();
  D = { gain, avg: sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null };
  save();
  go('done');
  sfx('fanfare'); buzz([30, 40, 30, 40, 90]);
  setTimeout(confetti, 300);
}

/* ── 룰렛: START → 돌기, STOP → 서서히 멈춤 ── */
function wheelLoop(now) {
  const dt = Math.min(48, now - W.last);
  W.last = now;
  W.v = W.stop ? Math.max(0, W.v - dt * W.dec) : Math.min(1.1, W.v + dt * 0.003); // 도/ms
  W.a += W.v * dt;
  const seg = Math.floor((W.a + 22.5) / 45);
  if (seg !== W.seg) { W.seg = seg; sfx('tick'); if (W.v < 0.35) buzz(5); }
  const el = $('#wheel');
  if (!el) return;
  el.style.transform = `rotate(${W.a}deg)`;
  if (W.v > 0 || !W.stop) W.raf = requestAnimationFrame(wheelLoop);
  else land();
}
function land() {
  W.on = false;
  const k = Math.round(((360 - (W.a % 360)) % 360) / 45) % 8, v = SEG[k], out = $('#spinres'), btn = $('#spin');
  if (!out) return;
  if (!v) {
    out.textContent = '한 번 더!';
    sfx('pop');
    btn.disabled = false; btn.textContent = 'START'; btn.classList.remove('stop');
  } else {
    S.points += v; S.spun[today()] = v; save();
    out.textContent = `+${v}P`;
    btn.remove();
    sfx(v >= 50 ? 'fanfare' : 'coin'); buzz([30, 40, 80]); confetti();
  }
  out.classList.remove('show'); void out.offsetWidth; out.classList.add('show');
}

/* ── 동작 ── */
const ACT = {
  home: () => { sessionStorage.setItem('ddak5.seen', 1); go('home'); },
  tab: v => go(v),
  quit: () => go('home'),
  sound: () => { S.sound = !S.sound; save(); sfx('pop'); const b = $('[data-a=sound]'); b.setAttribute('aria-pressed', S.sound); b.innerHTML = ico(S.sound ? 'vol' : 'mute', 18); },
  node: v => {
    const [kind, u] = v.split(':'), btn = $(`[data-v="${v}"].node`), old = $('.pop');
    const same = old?.dataset.v === v;
    old?.remove();
    if (same) return;
    if (kind === 'chest' && nodeState(+u, kind) === 'open') return openChest(btn);
    sfx('pop'); buzz(8);
    btn.parentElement.insertAdjacentHTML('beforeend', popHtml(kind, +u));
    $('.pop').scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  },
  sheet: () => {
    const el = document.createElement('div');
    el.className = 'sheet-wrap';
    el.innerHTML = `<div class="sheet" role="dialog" aria-label="오늘의 문장"><i class="grab"></i><h3>${S.unit + 1}일차 · 오늘의 5문장</h3>
      <ol class="list">${cur().map((x, k) => `<li><button class="item" style="--i:${k}" data-a="sayen" data-v="${k}"><span class="num">${k + 1}</span>
        <span>${esc(x[0])}${S.n.learn ? `<small lang="en">${esc(x[1])}</small>` : ''}</span><span class="pl">${ico('vol', 18)}</span></button></li>`).join('')}</ol></div>`;
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
    app.appendChild(el);
  },
  preview: () => { sfx('pop'); go('preview'); },
  sayko: v => say(cur()[+v][0], 'ko'),
  start: () => { T = cur(); S.slow = false; L = { round: 1, i: 0, step: 0, paused: false }; sfx('start'); buzz(20); go('learn'); play(); },
  lesson: () => startLesson(),
  reps: v => {
    S.reps = +v; save();
    const seg = $('.seg');
    seg.style.setProperty('--idx', v - 1);
    seg.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-checked', k === v - 1));
    const m = $('#mins'); if (m) m.textContent = mins();
  },
  slow: () => {
    S.slow = !S.slow; // 저장하지 않음: 이번 학습에만 적용
    const b = $('[data-a=slow]');
    b.classList.toggle('on', S.slow);
    b.setAttribute('aria-pressed', S.slow);
  },
  pause: () => {
    if (L.paused) return play();
    L.paused = true; run++; hush(); render();
  },
  skip: () => { run++; hush(); next(); },
  replay: () => play(),
  mic: () => {
    if (P.phase === 'rec') return P.rec?.stop();
    const id = ++run; hush(); listen(id);
  },
  again: () => {
    const id = ++run; P.rec?.abort?.();
    P.phase = 'listen'; P.res = null; P.heard = ''; render();
    say(T[P.i][0], 'ko').then(() => wait(250)).then(() => id === run && listen(id));
  },
  shint: () => {
    P.hint = Math.min(P.hint + 1, Math.ceil(T[P.i][1].split(' ').length / 2));
    const h = $('#hint'); if (h) { h.innerHTML = hintText(T[P.i][1], P.hint); h.classList.remove('off'); }
  },
  sayq: () => say(T[LS.q[0].k][0], 'ko'),
  hint: () => {
    const it = LS.q[0], s = T[it.k];
    if (LS.state !== 'ask') return;
    it.hinted = true;
    if (it.t === 'build') { // 다음에 올 단어 하나를 채워 줌
      const ans = words(s[1]);
      let n = 0;
      while (n < it.built.length && n < ans.length && it.tiles[it.built[n]] === ans[n]) n++;
      if (n < ans.length) {
        const keep = it.built.slice(0, n), i = it.tiles.findIndex((w, j) => w === ans[n] && !keep.includes(j));
        it.built = [...keep, i];
        say(ans[n], 'f');
      }
    }
    render();
  },
  retry: () => { const id = ++run; hush(); listen(id); },
  answer: () => say(T[P.i][1], 'f'),
  snext: () => { if (P.i < 4) { P.i++; speakItem(); } else complete(); },
  sayen: v => say(cur()[+v][1], 'f'),
  sayx: v => say(cur()[+v][2], 'f'),
  spin: () => {
    const btn = $('#spin');
    if (!W.on) {
      Object.assign(W, { on: true, stop: false, v: 0, last: performance.now() });
      W.raf = requestAnimationFrame(wheelLoop);
      btn.textContent = 'STOP'; btn.classList.add('stop');
      sfx('start'); buzz(20);
      W.auto = setTimeout(() => W.on && !W.stop && ACT.spin(), 8000); // 안 누르면 저절로 멈춤
    } else if (!W.stop) {
      W.stop = true;
      W.dec = 0.0006 + Math.random() * 0.0005;
      clearTimeout(W.auto);
      btn.disabled = true;
      sfx('pop'); buzz(30);
    }
  },
  tile: v => {
    const it = LS.q[0];
    if (LS.state !== 'ask') return;
    it.built.push(+v);
    say(it.tiles[v], 'f');
    render();
  },
  untile: v => {
    const it = LS.q[0];
    if (LS.state !== 'ask') return;
    it.built = it.built.filter(x => x !== +v);
    render();
  },
  choose: v => {
    const it = LS.q[0];
    if (LS.state !== 'ask') return;
    it.pick = +v;
    if (it.t === 'fill' || it.t === 'meaning') say(it.opts[v], 'f'); else if (it.t === 'listen') say(T[it.opts[v]][0], 'ko');
    render();
  },
  hear: v => { const it = LS.q[0]; say(T[it.k][it.t === 'meaning' ? 2 : 1], 'f', v === 'slow'); },
  check: () => {
    const it = LS.q[0];
    if (!canCheck(it) || LS.state !== 'ask') return;
    hush();
    if (isRight(it)) {
      LS.state = 'good'; LS.solved++; LS.combo++; LS.best = Math.max(LS.best, LS.combo);
      if (!it.miss && !it.hinted) LS.first++;
      LS.msg = LS.combo >= 3 ? `${LS.combo}연속 정답!` : pickOne(PRAISE);
      sfx('ok'); buzz([15, 40, 15]);
      if (LS.combo >= 3) setTimeout(() => sfx('combo', LS.combo), 450);
      if (it.t === 'build' || it.t === 'fill') setTimeout(() => say(T[it.k][1], 'f'), 700);
    } else {
      LS.state = 'bad'; LS.combo = 0; it.miss = true;
      LS.msg = pickOne(CHEER);
      sfx('no'); buzz([60, 40, 60]);
    }
    render();
  },
  cont: () => {
    const it = LS.q.shift();
    if (LS.state === 'bad') { LS.q.push(Object.assign(makeItem(it.t, it.k), { miss: true })); } // 틀린 문제는 끝에 다시
    LS.state = 'ask';
    if (LS.q.length) { sfx('tap'); return render(); }
    const first = !S.n.lesson, acc = Math.round((LS.first / LS.n) * 100), sec = Math.round((Date.now() - LS.t0) / 1000);
    const gain = first ? 20 + (acc === 100 ? 10 : 0) : 5;
    S.points += gain;
    if (first) S.just = 'lesson';
    S.n.lesson = true; fin(); save();
    E = { gain, acc, best: LS.best, time: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` };
    go('lend');
    sfx('fanfare'); buzz([30, 40, 30, 40, 90]); setTimeout(confetti, 300);
  },
};
const OWN_SOUND = new Set(['node', 'spin', 'check', 'start', 'lesson', 'sound', 'cont']);

app.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (!e.target.closest('.pop, .node')) $('.pop')?.remove();
  if (!b || b.disabled) return;
  if (!OWN_SOUND.has(b.dataset.a)) { sfx('tap'); buzz(6); }
  ACT[b.dataset.a]?.(b.dataset.v);
});
document.addEventListener('keydown', e => {
  if (screen !== 'lesson' || !LS) return;
  if (e.key === 'Enter') $('[data-a=check]:not([disabled]), [data-a=cont]')?.click();
  else if (/^[1-9]$/.test(e.key)) $(`[data-a=choose][data-v="${e.key - 1}"]`)?.click();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && screen === 'learn' && L && !L.paused) ACT.pause();
});
render();
if (screen === 'splash') setTimeout(() => screen === 'splash' && ACT.home(), 2600);
