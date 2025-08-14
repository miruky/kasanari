import { describe, expect, it } from 'vitest';
import { BOARD_SIZES, createRng, isStuck, move, newGame, resumableRng, spawnValue } from './engine';
import type { Direction, GameState, Tile } from './engine';

function stateWith(tiles: [number, number, number][], size = 4): GameState {
  // [row, col, value] の組から盤面を作る
  return {
    size,
    tiles: tiles.map(([row, col, value], i) => ({ id: i + 1, value, row, col })),
    score: 0,
    bestCombo: 0,
    over: false,
    nextId: 100,
  };
}

const at = (tiles: readonly Tile[], row: number, col: number) =>
  tiles.find((t) => t.row === row && t.col === col);

describe('スライド', () => {
  it('タイルは移動方向の端まで詰まる', () => {
    const s = stateWith([[0, 2, 3]]);
    const r = move(s, 'left', createRng(1));
    expect(r.moved).toBe(true);
    // スポーンで1枚増える
    expect(r.state.tiles).toHaveLength(2);
    expect(at(r.state.tiles, 0, 0)?.value).toBe(3);
  });

  it('動きのない手は無効で、スポーンも起きない', () => {
    const s = stateWith([[0, 0, 3]]);
    const r = move(s, 'left', createRng(1));
    expect(r.moved).toBe(false);
    expect(r.state).toBe(s);
  });

  it('和が10にならない2枚は重ならず並ぶ', () => {
    const s = stateWith([
      [0, 1, 3],
      [0, 3, 4],
    ]);
    const r = move(s, 'left', createRng(1));
    expect(at(r.state.tiles, 0, 0)?.value).toBe(3);
    expect(at(r.state.tiles, 0, 1)?.value).toBe(4);
    expect(r.pairs).toBe(0);
  });
});

describe('和10の消滅', () => {
  it('ぶつかった2枚の和が10ならどちらも消えて10点入る', () => {
    const s = stateWith([
      [0, 0, 3],
      [0, 2, 7],
    ]);
    const r = move(s, 'left', createRng(1));
    expect(r.pairs).toBe(1);
    expect(r.gained).toBe(10);
    // 消えた2枚は同じマスで重なって消える(演出用)
    expect(r.removed).toHaveLength(2);
    expect(new Set(r.removed.map((t) => `${t.row}:${t.col}`)).size).toBe(1);
    // 盤上はスポーンの1枚だけ
    expect(r.state.tiles).toHaveLength(1);
  });

  it('[1,9,1]を左に寄せると先頭の組だけが消える', () => {
    const s = stateWith([
      [0, 0, 1],
      [0, 1, 9],
      [0, 2, 1],
    ]);
    const r = move(s, 'left', createRng(1));
    expect(r.pairs).toBe(1);
    const remaining = r.state.tiles.filter((t) => t.row === 0 && t.col === 0);
    expect(remaining[0]?.value).toBe(1);
  });

  it('同時に2組消すとボーナスがつく', () => {
    const s = stateWith([
      [0, 0, 2],
      [0, 1, 8],
      [1, 0, 6],
      [1, 1, 4],
    ]);
    const r = move(s, 'left', createRng(1));
    expect(r.pairs).toBe(2);
    expect(r.gained).toBe(30);
    expect(r.state.bestCombo).toBe(2);
  });

  it('3組同時消しは10+20点のボーナスで50点', () => {
    const s = stateWith([
      [0, 0, 2],
      [0, 1, 8],
      [1, 0, 6],
      [1, 1, 4],
      [2, 0, 1],
      [2, 1, 9],
    ]);
    const r = move(s, 'left', createRng(1));
    expect(r.pairs).toBe(3);
    expect(r.gained).toBe(50);
    expect(r.removed).toHaveLength(6);
  });

  it('1枚のタイルが1手で2回消えることはない', () => {
    // [5,5,5] 左寄せ: 先頭の2枚が消え、3枚目は残る
    const s = stateWith([
      [0, 0, 5],
      [0, 1, 5],
      [0, 2, 5],
    ]);
    const r = move(s, 'left', createRng(1));
    expect(r.pairs).toBe(1);
    expect(at(r.state.tiles, 0, 0)?.value).toBe(5);
  });
});

describe('手詰まり', () => {
  it('空きがあれば手詰まりではない', () => {
    expect(isStuck(stateWith([[0, 0, 1]]).tiles, 4)).toBe(false);
  });

  it('満杯でも隣接に和10の組があれば続行できる', () => {
    const tiles: [number, number, number][] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) tiles.push([r, c, 1]);
    }
    tiles[1] = [0, 1, 9]; // 1の隣に9
    expect(isStuck(stateWith(tiles).tiles, 4)).toBe(false);
  });

  it('満杯で和10の隣接がなければ手詰まり', () => {
    const tiles: [number, number, number][] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) tiles.push([r, c, ((r + c) % 2 === 0 ? 1 : 2) as number]);
    }
    expect(isStuck(stateWith(tiles).tiles, 4)).toBe(true);
  });
});

describe('盤面サイズ', () => {
  it('5×5・6×6でも初期配置は盤内に収まり2枚から始まる', () => {
    for (const size of BOARD_SIZES) {
      const s = newGame(createRng(7), size);
      expect(s.size).toBe(size);
      expect(s.tiles).toHaveLength(2);
      for (const t of s.tiles) {
        expect(t.row).toBeGreaterThanOrEqual(0);
        expect(t.row).toBeLessThan(size);
        expect(t.col).toBeGreaterThanOrEqual(0);
        expect(t.col).toBeLessThan(size);
      }
    }
  });

  it('6×6では端まで滑り、状態のサイズが保たれる', () => {
    const s = stateWith([[0, 2, 3]], 6);
    const r = move(s, 'right', createRng(1));
    expect(r.moved).toBe(true);
    expect(r.state.size).toBe(6);
    // 一番右(col 5)まで移動する
    const slid = r.state.tiles.find((t) => t.value === 3);
    expect(slid?.col).toBe(5);
  });

  it('5×5の満杯盤で和10の隣接がなければ手詰まり', () => {
    const tiles: [number, number, number][] = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) tiles.push([r, c, (r + c) % 2 === 0 ? 1 : 2]);
    }
    expect(isStuck(stateWith(tiles, 5).tiles, 5)).toBe(true);
  });

  it('どの方向に動かしてもタイルは盤外へ出ない', () => {
    const dirs: Direction[] = ['up', 'down', 'left', 'right'];
    for (const size of BOARD_SIZES) {
      let s = newGame(createRng(size * 3 + 1), size);
      for (let i = 0; i < 40; i++) {
        const r = move(s, dirs[i % 4] as Direction, createRng(i + 1));
        s = r.state;
        for (const t of s.tiles) {
          expect(t.row).toBeGreaterThanOrEqual(0);
          expect(t.row).toBeLessThan(size);
          expect(t.col).toBeGreaterThanOrEqual(0);
          expect(t.col).toBeLessThan(size);
        }
        if (s.over) break;
      }
    }
  });
});

describe('状態の不変性', () => {
  it('move は受け取った状態を書き換えない', () => {
    const s = stateWith([
      [0, 0, 3],
      [0, 2, 7],
    ]);
    const snapshot = structuredClone(s);
    move(s, 'left', createRng(1));
    expect(s).toEqual(snapshot);
  });

  it('有効な手のあとは盤上のタイルが必ず1枚増減する', () => {
    // 3+7 が消えて2枚減り、スポーンで1枚増えるので差し引き1枚減る
    const s = stateWith([
      [0, 0, 3],
      [0, 2, 7],
      [3, 3, 5],
    ]);
    const r = move(s, 'left', createRng(2));
    expect(r.state.tiles.length).toBe(s.tiles.length - 1);
  });
});

describe('乱数とスポーン', () => {
  it('同じシードからは同じゲームが始まる', () => {
    const a = newGame(createRng(5));
    const b = newGame(createRng(5));
    expect(a.tiles).toEqual(b.tiles);
  });

  it('新規ゲームはどのシードでも2枚から始まる', () => {
    for (let seed = 1; seed < 40; seed++) {
      expect(newGame(createRng(seed)).tiles).toHaveLength(2);
    }
  });

  it('スポーン値は1から9に収まり、小さい値が出やすい', () => {
    const rng = createRng(9);
    const counts = new Map<number, number>();
    for (let i = 0; i < 5000; i++) {
      const v = spawnValue(rng);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(9);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    expect(counts.get(1) ?? 0).toBeGreaterThan(counts.get(9) ?? 0);
  });
});

describe('再開可能な乱数', () => {
  it('同じシードからは同じ列を返し、消費回数を数える', () => {
    const a = resumableRng(123);
    const seq = [a.next(), a.next(), a.next()];
    expect(a.draws()).toBe(3);
    const b = resumableRng(123);
    expect([b.next(), b.next(), b.next()]).toEqual(seq);
  });

  it('skip すれば途中から同じ展開を再現できる(保存・再開の土台)', () => {
    const full = resumableRng(777);
    const all = [full.next(), full.next(), full.next(), full.next()];
    const resumed = resumableRng(777, 2); // 最初の2つは消費済みとして再開
    expect(resumed.draws()).toBe(2);
    expect([resumed.next(), resumed.next()]).toEqual([all[2], all[3]]);
  });

  it('同じシードと size から同一の初期盤を作れる(配置の共有)', () => {
    const a = newGame(resumableRng(2024).next, 5);
    const b = newGame(resumableRng(2024).next, 5);
    expect(a.tiles).toEqual(b.tiles);
  });
});
