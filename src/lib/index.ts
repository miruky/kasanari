export {
  BOARD_SIZES,
  SIZE,
  TARGET_SUM,
  createRng,
  isStuck,
  isValidState,
  move,
  newGame,
  resumableRng,
  spawnTile,
  spawnValue,
  suggestDirection,
} from './engine';
export type { Direction, GameState, MoveResult, ResumableRng, Tile } from './engine';
export { emptyStats, isStats, recordGame } from './stats';
export type { Stats } from './stats';
