// --- Core game entities ---

export interface Player {
  id: string;
  name: string;
  position: number; // 0 = start, BOARD_SIZE = finish
  color: string;
  finished: boolean;
  tripped: boolean;
  characterId: string;
  isHuman: boolean;
}

export interface BoardSpace {
  index: number;
  // Future: effect that triggers on landing
}

export interface Character {
  id: string;
  name: string;
  description: string;
  abilities: AbilityTrigger[];
}

// --- Phase system ---

export enum Phase {
  TURN_START = "TURN_START", // beginning of turn, before roll (e.g., Party Animal moves others)
  PRE_ROLL = "PRE_ROLL",     // can modify the dice roll
  MOVE = "MOVE",             // primary movement happens (engine-driven, not an ability phase)
  LAND = "LAND",             // board space effects trigger on landing
  REACT = "REACT",           // reactive abilities (Heckler, Romantic, Baba Yaga)
  TURN_END = "TURN_END",     // cleanup / end-of-turn effects
}

// --- Events ---

export enum EventType {
  TURN_START = "TURN_START",
  PLAYER_MOVED = "PLAYER_MOVED",   // a player changed position (for any reason)
  PLAYER_LANDED = "PLAYER_LANDED", // a player finished moving and is now on a space
  TURN_END = "TURN_END",           // a player's turn has fully resolved
}

export interface GameEvent {
  type: EventType;
  playerId: string;
  from: number;
  to: number;
}

// --- Ability system ---

export interface ResolutionContext {
  event: GameEvent;
  owner: Player;          // the ability owner's current state
  players: Player[];      // all players' current state
}

export interface AbilityResult {
  players: Player[];      // updated player states
  events: GameEvent[];    // new events caused by this ability
  log: string[];          // messages to display
  rollModifier?: number;  // added to dice roll (PRE_ROLL phase)
}

export interface AbilityTrigger {
  phase: Phase;
  priority?: number;      // lower = earlier within same phase (default 0)
  check: (ctx: ResolutionContext) => AbilityResult | null;
}

// --- Game state ---

export interface LogEntry {
  turn: number;
  message: string;
  color?: string; // player color for ability-triggered logs
}

export interface GameState {
  players: Player[];
  board: BoardSpace[];
  currentPlayerIndex: number;
  turn: number;
  log: LogEntry[];
  finished: boolean;
  placements: Player[];
  requiredPlacements: number;
  characters: Character[]; // all characters in the game
}
