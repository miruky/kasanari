import './style.css';
import { BOARD_SIZES, SIZE, isValidState, move, newGame, resumableRng } from './lib';
import type { Direction, GameState, ResumableRng } from './lib';

const STATE_KEY = 'kasanari:state';
const BEST_PREFIX = 'kasanari:best:';
const LEGACY_BEST_KEY = 'kasanari:best';
const THEME_KEY = 'kasanari:theme';
const UNDO_CAP = 200;

type ThemePref = 'system' | 'light' | 'dark';

const LOGO_SVG = `<svg viewBox="0 0 64 64" role="img" aria-label="kasanariのロゴ" class="logo">
  <rect x="7" y="20" width="33" height="33" rx="8" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linejoin="round"/>
  <rect x="24" y="9" width="33" height="33" rx="8" fill="var(--accent)"/>
  <text x="40.5" y="26.5" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="700" fill="#fff" font-family="system-ui, sans-serif">10</text>
</svg>`;

const GITHUB_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>`;

const THEME_ICONS: Record<ThemePref, string> = {
  system: `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.6a6.4 6.4 0 0 1 0 12.8Z" fill="currentColor"/></svg>`,
  light: `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="3.1"/><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.15 1.15M11.85 11.85 13 13M13 3l-1.15 1.15M4.15 11.85 3 13"/></svg>`,
  dark: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.4 2.4a6 6 0 1 0 7.2 7.2A5 5 0 0 1 6.4 2.4Z" fill="currentColor"/></svg>`,
};

const SHARE_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.3 9.7 9.7 6.3"/><path d="M7 4.6 8.1 3.5a2.5 2.5 0 0 1 3.5 3.5l-1.1 1.1"/><path d="M9 11.4 7.9 12.5A2.5 2.5 0 0 1 4.4 9l1.1-1.1"/></svg>`;

const THEME_LABELS: Record<ThemePref, string> = {
  system: 'システム',
  light: 'ライト',
  dark: 'ダーク',
};

function mustFind<T extends Element>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`${selector} が見つからない`);
  return el;
}

const app = mustFind<HTMLDivElement>('#app');

const sizeButtons = BOARD_SIZES.map(
  (s) =>
    `<button type="button" class="seg-btn" data-size="${s}" aria-pressed="false">${s}&times;${s}</button>`,
).join('');

app.innerHTML = `
  <header class="site-header">
    <div class="brand">
      ${LOGO_SVG}
      <div class="brand-text">
        <h1>kasanari</h1>
        <p class="tagline">足して10で消すスライド数字パズル</p>
      </div>
    </div>
    <a class="repo-link" href="https://github.com/miruky/kasanari" rel="noopener" target="_blank">
      ${GITHUB_SVG}<span>GitHub</span>
    </a>
  </header>
  <main class="stage">
    <div class="toolbar">
      <div class="scoreboard">
        <div class="stat stat--score">
          <span class="stat-label">スコア</span>
          <span class="stat-value" id="score">0</span>
        </div>
        <div class="stat">
          <span class="stat-label">ベスト</span>
          <span class="stat-value" id="best">0</span>
        </div>
        <div class="stat">
          <span class="stat-label">同時消し</span>
          <span class="stat-value" id="combo">0</span>
        </div>
      </div>
      <div class="controls">
        <button type="button" id="btn-undo">もどす</button>
        <button type="button" id="btn-new" class="primary">新しいゲーム</button>
      </div>
    </div>
    <div class="options">
      <div class="seg" id="size-group" role="group" aria-label="盤面の大きさ">${sizeButtons}</div>
      <div class="options-right">
        <button type="button" id="btn-theme" class="icon-btn" aria-label="テーマを切り替える"></button>
        <button type="button" id="btn-share" class="icon-btn" aria-label="この配置を共有する">${SHARE_ICON}</button>
      </div>
    </div>
    <div class="board-wrap">
      <div class="board" id="board" tabindex="0" role="application"
        aria-label="盤面" aria-describedby="help">
        <div class="cells" id="cells" aria-hidden="true"></div>
        <div class="tiles" id="tiles"></div>
        <div class="overlay" id="overlay" hidden>
          <p class="over-title">手詰まり</p>
          <p class="over-score" id="over-score"></p>
          <button type="button" class="primary" id="btn-retry">もう一度</button>
        </div>
      </div>
    </div>
    <p class="help" id="help">矢印キー・WASD・スワイプで全タイルが滑る。ぶつかった2枚の和が10だと消えて10点。同時に複数組消すとボーナス。</p>
  </main>
  <footer class="site-footer">
    <p>スコアと盤面はこのブラウザにだけ保存される。MIT License</p>
  </footer>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>
  <p class="sr-only" id="status" role="status" aria-live="polite"></p>
`;

const board = mustFind<HTMLDivElement>('#board');
const cellsLayer = mustFind<HTMLDivElement>('#cells');
const tilesLayer = mustFind<HTMLDivElement>('#tiles');
const overlay = mustFind<HTMLDivElement>('#overlay');
const overScore = mustFind<HTMLParagraphElement>('#over-score');
const scoreStat = mustFind<HTMLDivElement>('.stat--score');
const scoreEl = mustFind<HTMLSpanElement>('#score');
const bestEl = mustFind<HTMLSpanElement>('#best');
const comboEl = mustFind<HTMLSpanElement>('#combo');
const btnUndo = mustFind<HTMLButtonElement>('#btn-undo');
const btnNew = mustFind<HTMLButtonElement>('#btn-new');
const btnRetry = mustFind<HTMLButtonElement>('#btn-retry');
const btnTheme = mustFind<HTMLButtonElement>('#btn-theme');
const btnShare = mustFind<HTMLButtonElement>('#btn-share');
const sizeGroup = mustFind<HTMLDivElement>('#size-group');
const toast = mustFind<HTMLDivElement>('#toast');
const statusEl = mustFind<HTMLParagraphElement>('#status');
const metaTheme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

/** スクリーンリーダー向けの状態通知。視覚的には出さない。 */
function announce(message: string): void {
  statusEl.textContent = message;
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* 再現可能な乱数。シードと消費回数を保存しておけば、リロード後も同じ展開を続けられる。 */
let seed = 0;
let rng: ResumableRng = resumableRng(0);

function seedGame(value: number, skip = 0): void {
  seed = value >>> 0;
  rng = resumableRng(seed, skip);
}

function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
}

let state: GameState;
let undoStack: GameState[] = [];
let best = 0;

function bestKey(size: number): string {
  return `${BEST_PREFIX}${size}`;
}

function loadBest(size: number): number {
  try {
    return Number(localStorage.getItem(bestKey(size)) ?? '0') || 0;
  } catch {
    return 0;
  }
}

function saveBest(): void {
  try {
    localStorage.setItem(bestKey(state.size), String(best));
  } catch {
    // 保存できなくても遊べる
  }
}

function persist(): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ state, seed, draws: rng.draws() }));
  } catch {
    // 保存できなくても遊べる
  }
}

interface Saved {
  state: GameState;
  seed: number;
  draws: number;
}

function restore(): Saved | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    const s = (parsed as { state?: unknown }).state;
    if (
      isValidState(s) &&
      !s.over &&
      s.tiles.length > 0 &&
      (BOARD_SIZES as readonly number[]).includes(s.size)
    ) {
      const p = parsed as { seed?: unknown; draws?: unknown };
      const draws = Number(p.draws);
      return {
        state: s,
        seed: Number(p.seed) >>> 0,
        draws: Number.isFinite(draws) && draws >= 0 ? Math.floor(draws) : 0,
      };
    }
  } catch {
    // 壊れた保存値は捨てる
  }
  return null;
}

/* テーマ */
const themeMql = window.matchMedia('(prefers-color-scheme: dark)');
let themePref: ThemePref = loadThemePref();

function loadThemePref(): ThemePref {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch {
    // 既定へ
  }
  return 'system';
}

function applyTheme(): void {
  const dark = themePref === 'dark' || (themePref === 'system' && themeMql.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  if (metaTheme) metaTheme.content = dark ? '#0d0f14' : '#f4f5f8';
  btnTheme.innerHTML = THEME_ICONS[themePref];
  btnTheme.setAttribute('aria-label', `テーマ: ${THEME_LABELS[themePref]}（押して切替）`);
  btnTheme.title = `テーマ: ${THEME_LABELS[themePref]}`;
}

themeMql.addEventListener('change', () => {
  if (themePref === 'system') applyTheme();
});

function cycleTheme(): void {
  themePref = themePref === 'system' ? 'light' : themePref === 'light' ? 'dark' : 'system';
  try {
    localStorage.setItem(THEME_KEY, themePref);
  } catch {
    // 保存できなくてもその場では効く
  }
  applyTheme();
}

/* 描画 */
const tileEls = new Map<number, HTMLDivElement>();

function buildCells(size: number): void {
  cellsLayer.innerHTML = '<div class="cell"></div>'.repeat(size * size);
  board.style.setProperty('--size', String(size));
  board.setAttribute('aria-label', `${size}×${size}の盤面。矢印キーかスワイプでタイルを動かす`);
}

function tilePosition(el: HTMLDivElement, row: number, col: number): void {
  el.style.transform = `translate(${col * 100}%, ${row * 100}%)`;
}

function createTileEl(
  id: number,
  value: number,
  row: number,
  col: number,
  delayMs = 0,
): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `tile v${value} pop`;
  el.textContent = String(value);
  if (delayMs > 0 && !reduceMotion.matches) el.style.animationDelay = `${delayMs}ms`;
  tilePosition(el, row, col);
  tilesLayer.append(el);
  tileEls.set(id, el);
  return el;
}

/** 値の変化を一瞬の拡大で知らせる。reduced-motionでは何もしない。 */
function bump(el: HTMLElement): void {
  if (reduceMotion.matches) return;
  el.classList.remove('bump');
  void el.offsetWidth; // アニメーションを確実に再生するためリフローを強制
  el.classList.add('bump');
}

let displayedScore = 0;
let scoreRaf = 0;

/** スコアを目標値までカウントアップする。連打中も現在値から滑らかに継ぐ。 */
function animateScore(to: number): void {
  if (reduceMotion.matches) {
    displayedScore = to;
    scoreEl.textContent = String(to);
    return;
  }
  cancelAnimationFrame(scoreRaf);
  const from = displayedScore;
  if (from === to) return;
  bump(scoreEl);
  const dur = Math.min(520, 220 + Math.abs(to - from) * 4);
  const start = performance.now();
  const tick = (now: number): void => {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    displayedScore = Math.round(from + (to - from) * eased);
    scoreEl.textContent = String(displayedScore);
    if (p < 1) scoreRaf = requestAnimationFrame(tick);
    else displayedScore = to;
  };
  scoreRaf = requestAnimationFrame(tick);
}

/** 得点をスコアの上に浮かせて消す「+N」表示。 */
function floatGain(amount: number): void {
  if (reduceMotion.matches || amount <= 0) return;
  const el = document.createElement('span');
  el.className = 'gain';
  el.textContent = `+${amount}`;
  scoreStat.append(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

/** タイルが消えたマスから広がる輪。 */
function spawnBurst(row: number, col: number): void {
  if (reduceMotion.matches) return;
  const el = document.createElement('div');
  el.className = 'burst';
  el.style.transform = `translate(${col * 100}%, ${row * 100}%)`;
  tilesLayer.append(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

let toastTimer = 0;

function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1800);
}

function syncSizeButtons(): void {
  for (const btn of sizeGroup.querySelectorAll<HTMLButtonElement>('.seg-btn')) {
    const active = Number(btn.dataset.size) === state.size;
    btn.setAttribute('aria-pressed', String(active));
    btn.classList.toggle('is-active', active);
  }
}

function renderHud(): void {
  cancelAnimationFrame(scoreRaf);
  displayedScore = state.score;
  scoreEl.textContent = String(state.score);
  bestEl.textContent = String(best);
  comboEl.textContent = String(state.bestCombo);
  btnUndo.disabled = undoStack.length === 0;
}

function renderAll(): void {
  buildCells(state.size);
  tilesLayer.textContent = '';
  tileEls.clear();
  state.tiles.forEach((t, i) => createTileEl(t.id, t.value, t.row, t.col, i * 35));
  overlay.hidden = !state.over;
  if (state.over) overScore.textContent = `スコア ${state.score}`;
  renderHud();
  syncSizeButtons();
}

/* 操作 */
function applyMove(dir: Direction): void {
  if (state.over) return;
  const before = state;
  const beforeBest = best;
  const result = move(state, dir, rng.next);
  if (!result.moved) return;

  undoStack.push(before);
  if (undoStack.length > UNDO_CAP) undoStack.shift();
  state = result.state;
  if (state.score > best) {
    best = state.score;
    saveBest();
  }
  persist();

  // 消えるタイルは衝突位置まで滑らせてからフェードさせ、そのマスに輪を出す
  const burstCells = new Set<string>();
  for (const t of result.removed) {
    const el = tileEls.get(t.id);
    if (el) {
      tilePosition(el, t.row, t.col);
      el.classList.add('vanish');
      tileEls.delete(t.id);
      setTimeout(() => el.remove(), 320);
    }
    const key = `${t.row}:${t.col}`;
    if (!burstCells.has(key)) {
      burstCells.add(key);
      spawnBurst(t.row, t.col);
    }
  }

  const known = new Set<number>();
  for (const t of state.tiles) {
    known.add(t.id);
    const el = tileEls.get(t.id);
    if (el) tilePosition(el, t.row, t.col);
    else createTileEl(t.id, t.value, t.row, t.col);
  }
  for (const [id, el] of [...tileEls]) {
    if (!known.has(id)) {
      el.remove();
      tileEls.delete(id);
    }
  }

  if (result.pairs >= 2) {
    board.classList.remove('combo-flash');
    requestAnimationFrame(() => board.classList.add('combo-flash'));
  }

  animateScore(state.score);
  floatGain(result.gained);
  bestEl.textContent = String(best);
  comboEl.textContent = String(state.bestCombo);
  btnUndo.disabled = undoStack.length === 0;
  if (best > beforeBest) bump(bestEl);
  if (state.bestCombo > before.bestCombo) bump(comboEl);

  overlay.hidden = !state.over;
  if (state.over) {
    overScore.textContent = `スコア ${state.score}`;
    announce(`手詰まり。スコア${state.score}点。「もう一度」で再開できます。`);
    btnRetry.focus();
  }
}

function startNew(size: number, withSeed?: number): void {
  seedGame(withSeed ?? randomSeed());
  best = loadBest(size);
  state = newGame(rng.next, size);
  undoStack = [];
  persist();
  renderAll();
  board.focus();
  announce(`${size}×${size}の新しいゲームを開始`);
}

function undo(): void {
  const prev = undoStack.pop();
  if (!prev) return;
  state = prev;
  persist();
  renderAll();
  board.focus();
}

function setSize(size: number): void {
  if (size === state.size) return;
  startNew(size);
}

function share(): void {
  const url = `${location.origin}${location.pathname}?seed=${seed}&size=${state.size}`;
  const done = (ok: boolean): void =>
    showToast(ok ? '共有リンクをコピーしました' : 'コピーできませんでした');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(
      () => done(true),
      () => done(fallbackCopy(url)),
    );
  } else {
    done(fallbackCopy(url));
  }
}

function fallbackCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/* 入力 */
const KEY_DIRS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
  const dir = KEY_DIRS[e.key];
  if (dir) {
    e.preventDefault();
    applyMove(dir);
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'z' || k === 'u') {
    e.preventDefault();
    undo();
  } else if (k === 'n') {
    e.preventDefault();
    startNew(state.size);
  }
});

let touchStart: { x: number; y: number } | null = null;
board.addEventListener('pointerdown', (e) => {
  touchStart = { x: e.clientX, y: e.clientY };
  // 指がスワイプ中に盤外へ出ても pointerup を盤で受け取れるよう捕捉する
  if (e.pointerType !== 'mouse') {
    try {
      board.setPointerCapture(e.pointerId);
    } catch {
      // 捕捉できない環境でも通常どおり動く
    }
  }
});
board.addEventListener('pointercancel', () => {
  touchStart = null;
});
board.addEventListener('pointerup', (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x;
  const dy = e.clientY - touchStart.y;
  touchStart = null;
  if (Math.hypot(dx, dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) applyMove(dx > 0 ? 'right' : 'left');
  else applyMove(dy > 0 ? 'down' : 'up');
});

btnUndo.addEventListener('click', undo);
btnNew.addEventListener('click', () => startNew(state.size));
btnRetry.addEventListener('click', () => startNew(state.size));
btnTheme.addEventListener('click', cycleTheme);
btnShare.addEventListener('click', share);
sizeGroup.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.seg-btn');
  if (btn?.dataset.size) setSize(Number(btn.dataset.size));
});

/* 初期化 */
applyTheme();

try {
  const legacy = localStorage.getItem(LEGACY_BEST_KEY);
  if (legacy !== null && localStorage.getItem(bestKey(SIZE)) === null) {
    localStorage.setItem(bestKey(SIZE), legacy);
  }
} catch {
  // 移行できなくても新規ベストから始まる
}

const params = new URLSearchParams(location.search);
const urlSeed = params.get('seed');
const urlSize = Number(params.get('size'));
if (urlSeed !== null && /^\d+$/.test(urlSeed)) {
  const size = (BOARD_SIZES as readonly number[]).includes(urlSize) ? urlSize : SIZE;
  startNew(size, Number(urlSeed));
  // リロード時に同じ配置へ戻らないようクエリを消す(進行は通常どおり保存される)
  try {
    history.replaceState(null, '', location.pathname);
  } catch {
    // 履歴を触れない環境でも続行する
  }
} else {
  const saved = restore();
  if (saved) {
    seedGame(saved.seed, saved.draws);
    state = saved.state;
    best = loadBest(state.size);
    undoStack = [];
    renderAll();
    board.focus();
  } else {
    startNew(SIZE);
  }
}
