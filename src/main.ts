import './style.css';
import { SIZE, createRng, move, newGame } from './lib';
import type { Direction, GameState } from './lib';

const BEST_KEY = 'kasanari:best';
const STATE_KEY = 'kasanari:state';

const LOGO_SVG = `<svg viewBox="0 0 64 64" role="img" aria-label="kasanariのロゴ" class="logo">
  <g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <rect x="8" y="20" width="36" height="36" rx="7"/>
  </g>
  <rect x="24" y="8" width="32" height="32" rx="7" fill="var(--accent)" opacity="0.85"/>
  <text x="40" y="31" text-anchor="middle" font-size="18" font-weight="700" fill="#fff" font-family="system-ui">10</text>
</svg>`;

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
      <div>
        <h1>kasanari</h1>
        <p class="tagline">足して10になる数字を重ねて消すスライドパズル</p>
      </div>
    </div>
    <a class="repo-link" href="https://github.com/miruky/kasanari" rel="noopener">GitHub</a>
  </header>
  <main class="stage">
    <div class="hud">
      <div class="stat"><span class="stat-label">スコア</span><span id="score">0</span></div>
      <div class="stat"><span class="stat-label">ベスト</span><span id="best">0</span></div>
      <div class="stat"><span class="stat-label">最大同時消し</span><span id="combo">0</span></div>
      <span class="spacer"></span>
      <button type="button" id="btn-undo">1手もどす</button>
      <button type="button" id="btn-new" class="primary">新しいゲーム</button>
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
const scoreEl = mustFind<HTMLSpanElement>('#score');
const bestEl = mustFind<HTMLSpanElement>('#best');
const comboEl = mustFind<HTMLSpanElement>('#combo');
const btnUndo = mustFind<HTMLButtonElement>('#btn-undo');
const btnNew = mustFind<HTMLButtonElement>('#btn-new');
const btnRetry = mustFind<HTMLButtonElement>('#btn-retry');

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

function createTileEl(id: number, value: number, row: number, col: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `tile v${value} pop`;
  el.textContent = String(value);
  tilePosition(el, row, col);
  tilesLayer.append(el);
  tileEls.set(id, el);
  return el;
}

function renderHud(): void {
  scoreEl.textContent = String(state.score);
  bestEl.textContent = String(best);
  comboEl.textContent = String(state.bestCombo);
  btnUndo.disabled = undoState === null;
}

function renderAll(): void {
  tilesLayer.textContent = '';
  tileEls.clear();
  for (const t of state.tiles) createTileEl(t.id, t.value, t.row, t.col);
  overlay.hidden = !state.over;
  if (state.over) overScore.textContent = `スコア ${state.score}`;
  renderHud();
}

function applyMove(dir: Direction): void {
  if (state.over) return;
  const before = state;
  const result = move(state, dir, rng);
  if (!result.moved) return;
  undoState = before;
  state = result.state;
  if (state.score > best) best = state.score;
  persist();

  // 消えるタイルは衝突位置まで滑らせてからフェードさせる
  for (const t of result.removed) {
    const el = tileEls.get(t.id);
    if (!el) continue;
    tilePosition(el, t.row, t.col);
    el.classList.add('vanish');
    tileEls.delete(t.id);
    setTimeout(() => el.remove(), 320);
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
  overlay.hidden = !state.over;
  if (state.over) overScore.textContent = `スコア ${state.score}`;
  renderHud();
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
