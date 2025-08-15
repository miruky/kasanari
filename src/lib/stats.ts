/**
 * 端末に残す通算成績。1ゲームのスコアと盤面に依らず、これまでの遊んだ回数・
 * 最高コンボ・最高スコアだけを薄く積む。盤面状態(GameState)とは独立に保存する。
 */
export interface Stats {
  /** これまでに終局(手詰まり)まで遊んだ回数 */
  games: number;
  /** 1ゲーム内の最大同時消し数の、通算での最大 */
  bestCombo: number;
  /** 通算の最高スコア */
  bestScore: number;
}

export function emptyStats(): Stats {
  return { games: 0, bestCombo: 0, bestScore: 0 };
}

/** 1ゲーム終了ぶんを積む。回数を1増やし、コンボとスコアは大きい方を残す。 */
export function recordGame(stats: Stats, score: number, combo: number): Stats {
  return {
    games: stats.games + 1,
    bestCombo: Math.max(stats.bestCombo, combo),
    bestScore: Math.max(stats.bestScore, score),
  };
}

export function isStats(value: unknown): value is Stats {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<Stats>;
  return (
    typeof s.games === 'number' &&
    s.games >= 0 &&
    Number.isFinite(s.games) &&
    typeof s.bestCombo === 'number' &&
    s.bestCombo >= 0 &&
    Number.isFinite(s.bestCombo) &&
    typeof s.bestScore === 'number' &&
    s.bestScore >= 0 &&
    Number.isFinite(s.bestScore)
  );
}
