export const SIZE = 4;
/** この和になったタイルどうしが消える */
export const TARGET_SUM = 10;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
}

export interface GameState {
  tiles: Tile[];
  score: number;
  /** 1手で消えたペア数の累計ではなく、これまでの最大連鎖(同時消し)数 */
  bestCombo: number;
  over: boolean;
  nextId: number;
}

export interface MoveResult {
  state: GameState;
  /** 1つでもタイルが動いたか。動かない方向はスポーンも起きない */
  moved: boolean;
  /** この手で消えたペア数 */
  pairs: number;
  /** 消えたタイル(衝突位置まで動いた状態)。UIのフェード演出用 */
  removed: Tile[];
  /** この手で得た点 */
  gained: number;
}

export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 小さい数ほど出やすい重み(10-値)でスポーン値を選ぶ */
export function spawnValue(rng: () => number): number {
  const weights = Array.from({ length: 9 }, (_, i) => 10 - (i + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let v = 1; v <= 9; v++) {
    roll -= weights[v - 1] ?? 0;
    if (roll < 0) return v;
  }
  return 9;
}

function emptyCells(tiles: readonly Tile[]): { row: number; col: number }[] {
  const used = new Set(tiles.map((t) => `${t.row}:${t.col}`));
  const out: { row: number; col: number }[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!used.has(`${r}:${c}`)) out.push({ row: r, col: c });
    }
  }
  return out;
}

export function spawnTile(state: GameState, rng: () => number): GameState {
  const cells = emptyCells(state.tiles);
  const cell = cells[Math.floor(rng() * cells.length)];
  if (!cell) return state;
  const tile: Tile = { id: state.nextId, value: spawnValue(rng), row: cell.row, col: cell.col };
  return { ...state, tiles: [...state.tiles, tile], nextId: state.nextId + 1 };
}

export function newGame(rng: () => number): GameState {
  let state: GameState = { tiles: [], score: 0, bestCombo: 0, over: false, nextId: 1 };
  state = spawnTile(state, rng);
  state = spawnTile(state, rng);
  return state;
}

interface LineSpec {
  /** 移動方向の先頭から順に走査するためのセル列 */
  cells: { row: number; col: number }[];
}

function linesFor(dir: Direction): LineSpec[] {
  const lines: LineSpec[] = [];
  for (let i = 0; i < SIZE; i++) {
    const cells: { row: number; col: number }[] = [];
    for (let j = 0; j < SIZE; j++) {
      if (dir === 'left') cells.push({ row: i, col: j });
      else if (dir === 'right') cells.push({ row: i, col: SIZE - 1 - j });
      else if (dir === 'up') cells.push({ row: j, col: i });
      else cells.push({ row: SIZE - 1 - j, col: i });
    }
    lines.push({ cells });
  }
  return lines;
}

/**
 * 1手ぶんのスライド。各列を移動方向の先頭から詰め、
 * 直前に置いたタイルとの和がちょうど10なら両方消える(1タイル1回まで)。
 */
export function move(state: GameState, dir: Direction, rng: () => number): MoveResult {
  const byPos = new Map(state.tiles.map((t) => [`${t.row}:${t.col}`, t]));
  const survivors: Tile[] = [];
  const removed: Tile[] = [];
  let moved = false;
  let pairs = 0;

  for (const line of linesFor(dir)) {
    const lineTiles = line.cells
      .map((c) => byPos.get(`${c.row}:${c.col}`))
      .filter((t): t is Tile => t !== undefined);
    const placed: Tile[] = [];
    for (const tile of lineTiles) {
      const prev = placed[placed.length - 1];
      if (prev && prev.value + tile.value === TARGET_SUM) {
        // 衝突位置(prevのマス)まで動かしてから両方消す
        const collided: Tile = { ...tile, row: prev.row, col: prev.col };
        removed.push({ ...prev }, collided);
        placed.pop();
        pairs += 1;
        moved = true;
        continue;
      }
      const slot = line.cells[placed.length];
      if (!slot) continue;
      const next: Tile = { ...tile, row: slot.row, col: slot.col };
      if (next.row !== tile.row || next.col !== tile.col) moved = true;
      placed.push(next);
    }
    survivors.push(...placed);
  }

  if (!moved) {
    return { state, moved: false, pairs: 0, removed: [], gained: 0 };
  }

  // 同時消しは2組目から1組ごとに+10のボーナス
  const gained = pairs * TARGET_SUM + Math.max(0, pairs - 1) * TARGET_SUM;
  let next: GameState = {
    ...state,
    tiles: survivors,
    score: state.score + gained,
    bestCombo: Math.max(state.bestCombo, pairs),
  };
  next = spawnTile(next, rng);
  next = { ...next, over: isStuck(next.tiles) };
  return { state: next, moved: true, pairs, removed, gained };
}

/** 空きがなく、隣接にも和10の組がなければ手詰まり */
export function isStuck(tiles: readonly Tile[]): boolean {
  if (tiles.length < SIZE * SIZE) return false;
  const grid = new Map(tiles.map((t) => [`${t.row}:${t.col}`, t.value]));
  for (const t of tiles) {
    const right = grid.get(`${t.row}:${t.col + 1}`);
    const down = grid.get(`${t.row + 1}:${t.col}`);
    if (right !== undefined && t.value + right === TARGET_SUM) return false;
    if (down !== undefined && t.value + down === TARGET_SUM) return false;
  }
  return true;
}
