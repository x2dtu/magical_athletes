import { GameState, LogEntry, Player, EventType, GameEvent, SpaceEffect } from "./types";
import type { BoardSpace } from "./types";
import { CHARACTERS } from "./characters";
import { resolveReactPhase, resolveTurnStartPhase, resolvePreRollPhase, resolveTurnEndPhase } from "./resolution";

const BOARD_SIZE = 30;
const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c"];

export interface TurnStep {
  players: Player[];
  message: string;
  color?: string;
  source?: "ability" | "space";
  soundHint?: "trip" | "ability" | "move_space" | "point";
}

export interface TurnResult {
  state: GameState;
  steps: TurnStep[]; // intermediate states for animated playback
}

const SPACE_EFFECTS: Record<number, SpaceEffect> = {
  1: { type: "gain_point", amount: 1 },
  5: { type: "trip" },
  7: { type: "move", offset: 3 },
  11: { type: "move", offset: 1 },
  13: { type: "gain_point", amount: 1 },
  16: { type: "move", offset: -4 },
  17: { type: "trip" },
  23: { type: "move", offset: 2 },
  24: { type: "move", offset: -2 },
  26: { type: "trip" },
};

export function createBoard(): BoardSpace[] {
  return Array.from({ length: BOARD_SIZE + 1 }, (_, i) => ({
    index: i,
    effect: SPACE_EFFECTS[i],
  }));
}

const AI_NAMES = [
  "Luna",
  "Jasper",
  "Sage",
  "Ember",
  "Rowan",
  "Ivy",
  "Felix",
  "Hazel",
  "Orion",
  "Maple",
  "Finn",
  "Wren",
  "Atlas",
  "Clover",
  "Rune",
  "Briar",
];

function pickRandomNames(count: number): string[] {
  const shuffled = [...AI_NAMES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function createPlayers(count: number, humanCount: number = 1): Player[] {
  const chars = CHARACTERS;
  const aiNames = pickRandomNames(count - humanCount);
  let aiIndex = 0;
  return Array.from({ length: count }, (_, i) => {
    const isHuman = i < humanCount;
    const name = isHuman ? "Player" : aiNames[aiIndex++];
    return {
      id: `player-${i}`,
      name,
      position: 0,
      color: PLAYER_COLORS[i],
      finished: false,
      tripped: false,
      characterId: chars[i % chars.length].id,
      isHuman,
      points: 0,
    };
  });
}

export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function rollForCurrentPlayer(): number {
  return rollDie();
}

export function initGame(playerCount: number = 4, requiredPlacements: number = 2, humanCount: number = 1): GameState {
  return {
    players: createPlayers(playerCount, humanCount),
    board: createBoard(),
    currentPlayerIndex: 0,
    turn: 1,
    log: [],
    finished: false,
    placements: [],
    requiredPlacements,
    characters: CHARACTERS,
  };
}

/** Apply a turn with a known roll value. Returns final state + animation steps. */
export function applyMove(state: GameState, roll: number): TurnResult {
  if (state.finished) return { state, steps: [] };

  const player = state.players[state.currentPlayerIndex];
  if (player.finished) return { state: advanceToNextPlayer(state), steps: [] };

  const steps: TurnStep[] = [];
  const turnLogs: string[] = [];

  // --- TURN_START phase ---
  const turnStartResult = resolveTurnStartPhase(player.id, state.players, state.characters, state.board);
  let players = turnStartResult.players;
  turnLogs.push(...turnStartResult.log);
  steps.push(...turnStartResult.steps);

  // If the current player got tripped during TURN_START, skip roll and get up instead
  const playerAfterStart = players.find((p) => p.id === player.id)!;
  if (playerAfterStart.tripped) {
    players = players.map((p) => (p.id === player.id ? { ...p, tripped: false } : p));
    const getUpMsg = `${playerAfterStart.name} gets back up.`;
    turnLogs.push(getUpMsg);
    steps.push({ players: [...players], message: getUpMsg });

    // Run TURN_END (moved 0)
    const turnEndResult = resolveTurnEndPhase(
      player.id,
      playerAfterStart.position,
      players,
      state.characters,
      state.board,
    );
    players = turnEndResult.players;
    turnLogs.push(...turnEndResult.log);
    steps.push(...turnEndResult.steps);

    const newLog: LogEntry[] = steps.map((step) => ({ turn: state.turn, message: step.message, color: step.color }));
    return { state: { ...state, players, log: [...state.log, ...newLog] }, steps };
  }

  // --- PRE_ROLL phase ---
  const preRollResult = resolvePreRollPhase(player.id, players, state.characters);
  players = preRollResult.players;
  turnLogs.push(...preRollResult.log);
  if (preRollResult.log.length > 0) {
    for (const msg of preRollResult.log) {
      steps.push({ players: [...players], message: msg });
    }
  }
  const effectiveRoll = Math.max(0, roll + preRollResult.rollModifier);

  // --- MOVE phase ---
  const currentPlayer = players.find((p) => p.id === player.id)!;
  const startPosition = currentPlayer.position;
  const endPosition = Math.min(currentPlayer.position + effectiveRoll, BOARD_SIZE);

  players = players.map((p) =>
    p.id === player.id ? { ...p, position: endPosition, finished: endPosition >= BOARD_SIZE } : p,
  );

  const moveMsg =
    effectiveRoll !== roll
      ? `${currentPlayer.name} rolled ${roll} (+${preRollResult.rollModifier} bonus = ${effectiveRoll}) and moved from ${startPosition} to ${endPosition}.`
      : `${currentPlayer.name} rolled ${roll} and moved from ${startPosition} to ${endPosition}.`;
  turnLogs.push(moveMsg);
  steps.push({ players: [...players], message: moveMsg });

  // --- REACT phase ---
  const moveEvent: GameEvent = {
    type: EventType.PLAYER_MOVED,
    playerId: player.id,
    from: startPosition,
    to: endPosition,
  };

  const reactResult = resolveReactPhase([moveEvent], players, state.characters, state.board);
  players = reactResult.players;
  turnLogs.push(...reactResult.log);
  steps.push(...reactResult.steps);

  // --- TURN_END phase ---
  const turnEndResult = resolveTurnEndPhase(player.id, startPosition, players, state.characters, state.board);
  players = turnEndResult.players;
  turnLogs.push(...turnEndResult.log);
  steps.push(...turnEndResult.steps);

  // --- Check for placements ---
  const movedPlayer = players.find((p) => p.id === player.id)!;
  const justFinished = movedPlayer.finished && !state.placements.some((p) => p.id === movedPlayer.id);
  const newPlacements = justFinished ? [...state.placements, movedPlayer] : state.placements;

  if (justFinished) {
    const PLACEMENT_POINTS = [5, 3];
    const pointsAwarded = PLACEMENT_POINTS[newPlacements.length - 1] ?? 0;
    players = players.map((p) => (p.id === movedPlayer.id ? { ...p, points: p.points + pointsAwarded } : p));
    const placeMsg = `${movedPlayer.name} takes ${ordinalPlace(newPlacements.length)}! (+${pointsAwarded} pts)`;
    turnLogs.push(placeMsg);
    steps.push({ players: [...players], message: placeMsg });
  }

  const gameOver = newPlacements.length >= state.requiredPlacements;
  const newLog: LogEntry[] = steps.map((step) => ({ turn: state.turn, message: step.message, color: step.color }));

  const finalState: GameState = {
    ...state,
    players,
    log: [...state.log, ...newLog],
    finished: gameOver,
    placements: newPlacements,
  };

  return { state: finalState, steps };
}

/** Advance to the next player's turn */
export function endTurn(state: GameState): GameState {
  return advanceToNextPlayer(state);
}

/** Handle a tripped player getting back up (moved 0 — triggers TURN_END) */
export function getUp(state: GameState): TurnResult {
  const player = state.players[state.currentPlayerIndex];

  const steps: TurnStep[] = [];

  // --- TURN_START phase still fires even when tripped ---
  const turnStartResult = resolveTurnStartPhase(player.id, state.players, state.characters, state.board);
  let players = turnStartResult.players;
  steps.push(...turnStartResult.steps);

  // Clear tripped
  players = players.map((p) => (p.id === player.id ? { ...p, tripped: false } : p));
  const getUpMsg = `${player.name} gets back up.`;
  steps.push({ players: [...players], message: getUpMsg });

  // Getting up = moving 0, so run TURN_END phase
  const turnEndResult = resolveTurnEndPhase(player.id, player.position, players, state.characters, state.board);
  players = turnEndResult.players;
  steps.push(...turnEndResult.steps);

  const allLogs: LogEntry[] = [
    ...turnStartResult.log.map((message) => ({ turn: state.turn, message })),
    { turn: state.turn, message: getUpMsg },
    ...turnEndResult.log.map((message) => ({ turn: state.turn, message })),
    ...turnEndResult.steps.map((s) => ({ turn: state.turn, message: s.message, color: s.color })),
  ];

  const finalState: GameState = {
    ...state,
    players,
    log: [...state.log, ...allLogs],
  };

  return { state: finalState, steps };
}

/** Convenience: roll + move in one call (used by auto-play) */
export function processTurn(state: GameState): TurnResult {
  const player = state.players[state.currentPlayerIndex];
  if (player.tripped) return getUp(state);
  return applyMove(state, rollForCurrentPlayer());
}

function advanceToNextPlayer(state: GameState): GameState {
  if (state.finished) return state;

  let next = (state.currentPlayerIndex + 1) % state.players.length;
  let attempts = 0;
  while (state.players[next].finished && attempts < state.players.length) {
    next = (next + 1) % state.players.length;
    attempts++;
  }

  return { ...state, currentPlayerIndex: next, turn: state.turn + 1 };
}

function ordinalPlace(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]) + " place";
}
