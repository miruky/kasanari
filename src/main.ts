import './style.css';
import { SIZE, createRng, move, newGame } from './lib';
import type { Direction, GameState } from './lib';

const BEST_KEY = 'kasanari:best';
const STATE_KEY = 'kasanari:state';

const LOGO_SVG = `<svg viewBox="0 0 64 64" role="img" aria-label="kasanariのロゴ" class="logo">
  <rect x="7" y="20" width="33" height="33" rx="8" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linejoin="round"/>
  <rect x="24" y="9" width="33" height="33" rx="8" fill="var(--accent)"/>
  <text x="40.5" y="26.5" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="700" fill="#fff" font-family="system-ui, sans-serif">10</text>
</svg>`;

const GITHUB_SVG = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>`;

function mustFind<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`${selector} が見つからない`);
  return el;
}

const app = mustFind<HTMLDivElement>('#app');

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
    <div class="board-wrap">
      <div class="board" id="board" tabindex="0"
        aria-label="盤面。矢印キーかスワイプでタイルを動かす">
        <div class="cells" aria-hidden="true">${'<div class="cell"></div>'.repeat(SIZE * SIZE)}</div>
        <div class="tiles" id="tiles"></div>
        <div class="overlay" id="overlay" hidden>
          <p class="over-title">手詰まり</p>
          <p class="over-score" id="over-score"></p>
          <button type="button" class="primary" id="btn-retry">もう一度</button>
        </div>
      </div>
    </div>
    <p class="help">矢印キー・WASD・スワイプで全タイルが滑る。ぶつかった2枚の和が10だと消えて10点。同時に複数組消すとボーナス。</p>
  </main>
  <footer class="site-footer">
    <p>スコアはこのブラウザにだけ保存される。MIT License</p>
  </footer>
`;

const board = mustFind<HTMLDivElement>('#board');
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

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const rng = createRng(Date.now() >>> 0);
let state: GameState;
let undoState: GameState | null = null;
let best = 0;
const tileEls = new Map<number, HTMLDivElement>();

try {
  best = Number(localStorage.getItem(BEST_KEY) ?? '0') || 0;
} catch {
  best = 0;
}

function restoreState(): GameState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as { tiles?: unknown }).tiles) &&
      typeof (parsed as { score?: unknown }).score === 'number'
    ) {
      const s = parsed as GameState;
      if (!s.over && s.tiles.length > 0) return s;
    }
  } catch {
    // 壊れた保存値は捨てる
  }
  return null;
}

function persist(): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // 保存できなくても遊べる
  }
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

function renderHud(): void {
  cancelAnimationFrame(scoreRaf);
  displayedScore = state.score;
  scoreEl.textContent = String(state.score);
  bestEl.textContent = String(best);
  comboEl.textContent = String(state.bestCombo);
  btnUndo.disabled = undoState === null;
}

function renderAll(): void {
  tilesLayer.textContent = '';
  tileEls.clear();
  state.tiles.forEach((t, i) => createTileEl(t.id, t.value, t.row, t.col, i * 45));
  overlay.hidden = !state.over;
  if (state.over) overScore.textContent = `スコア ${state.score}`;
  renderHud();
}

function applyMove(dir: Direction): void {
  if (state.over) return;
  const before = state;
  const beforeBest = best;
  const result = move(state, dir, rng);
  if (!result.moved) return;
  undoState = before;
  state = result.state;
  if (state.score > best) best = state.score;
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
  btnUndo.disabled = undoState === null;
  if (best > beforeBest) bump(bestEl);
  if (state.bestCombo > before.bestCombo) bump(comboEl);

  overlay.hidden = !state.over;
  if (state.over) overScore.textContent = `スコア ${state.score}`;
}

function startNew(): void {
  state = newGame(rng);
  undoState = null;
  persist();
  renderAll();
  board.focus();
}

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
  const dir = KEY_DIRS[e.key];
  if (!dir) return;
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
  e.preventDefault();
  applyMove(dir);
});

let touchStart: { x: number; y: number } | null = null;
board.addEventListener('pointerdown', (e) => {
  touchStart = { x: e.clientX, y: e.clientY };
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

btnUndo.addEventListener('click', () => {
  if (!undoState) return;
  state = undoState;
  undoState = null;
  persist();
  renderAll();
});

btnNew.addEventListener('click', startNew);
btnRetry.addEventListener('click', startNew);

state = restoreState() ?? newGame(rng);
renderAll();
board.focus();
