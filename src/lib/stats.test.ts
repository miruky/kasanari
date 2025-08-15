import { describe, expect, it } from 'vitest';
import { emptyStats, isStats, recordGame } from './stats';

describe('recordGame', () => {
  it('回数を1増やし、コンボとスコアは最大を残す', () => {
    let s = emptyStats();
    s = recordGame(s, 120, 2);
    expect(s).toEqual({ games: 1, bestCombo: 2, bestScore: 120 });
    s = recordGame(s, 80, 3);
    expect(s).toEqual({ games: 2, bestCombo: 3, bestScore: 120 });
    s = recordGame(s, 200, 1);
    expect(s).toEqual({ games: 3, bestCombo: 3, bestScore: 200 });
  });
});

describe('isStats', () => {
  it('正しい形だけを受け入れる', () => {
    expect(isStats(emptyStats())).toBe(true);
    expect(isStats({ games: 5, bestCombo: 2, bestScore: 300 })).toBe(true);
  });

  it('壊れた値や負数・欠けたキーは弾く', () => {
    expect(isStats(null)).toBe(false);
    expect(isStats({ games: -1, bestCombo: 0, bestScore: 0 })).toBe(false);
    expect(isStats({ games: 1, bestCombo: 0 })).toBe(false);
    expect(isStats({ games: 'x', bestCombo: 0, bestScore: 0 })).toBe(false);
  });
});
