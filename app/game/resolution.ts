import { Player, GameEvent, EventType, Phase, AbilityTrigger, ResolutionContext, Character, BoardSpace } from "./types";

/**
 * Snapshot the game state as a string for loop detection.
 * A state is defined by all player positions + tripped statuses.
 */
function stateSnapshot(players: Player[]): string {
  return players.map((p) => `${p.id}:${p.position}:${p.tripped ? 1 : 0}`).join("|");
}

/**
 * Collect all ability triggers for a given phase from all players' characters.
 * Returns them sorted by priority (lower first).
 */
function getTriggersForPhase(
  phase: Phase,
  players: Player[],
  characters: Character[],
): { trigger: AbilityTrigger; owner: Player }[] {
  const results: { trigger: AbilityTrigger; owner: Player }[] = [];

  for (const player of players) {
    if (player.finished) continue;
    const char = characters.find((c) => c.id === player.characterId);
    if (!char) continue;
    for (const trigger of char.abilities) {
      if (trigger.phase === phase) {
        results.push({ trigger, owner: player });
      }
    }
  }

  results.sort((a, b) => (a.trigger.priority ?? 0) - (b.trigger.priority ?? 0));
  return results;
}

export interface ResolutionStep {
  players: Player[];
  message: string;
  color?: string;
  source?: "ability" | "space";
  soundHint?: "trip" | "ability" | "move_space" | "point";
}

export interface ResolutionResult {
  players: Player[];
  log: string[];
  steps: ResolutionStep[]; // intermediate states for animation
}

/**
 * Resolve a set of events through all REACT-phase abilities.
 * Cascades: if an ability produces new events, those are processed next.
 * Loop detection: if we see a repeated state snapshot, stop immediately.
 */
export function resolveReactPhase(
  initialEvents: GameEvent[],
  players: Player[],
  characters: Character[],
  board: BoardSpace[] = [],
): ResolutionResult {
  const allLogs: string[] = [];
  const steps: ResolutionStep[] = [];
  let currentPlayers = players;
  let pendingEvents = [...initialEvents];
  const visitedStates = new Set<string>();

  visitedStates.add(stateSnapshot(currentPlayers));

  while (pendingEvents.length > 0) {
    const nextEvents: GameEvent[] = [];
    const triggers = getTriggersForPhase(Phase.REACT, currentPlayers, characters);

    for (const event of pendingEvents) {
      // Process character abilities
      for (const { trigger, owner } of triggers) {
        const currentOwner = currentPlayers.find((p) => p.id === owner.id)!;
        if (currentOwner.finished) continue;

        const ctx: ResolutionContext = {
          event,
          owner: currentOwner,
          players: currentPlayers,
        };

        const result = trigger.check(ctx);
        if (!result) continue;

        currentPlayers = result.players;
        allLogs.push(...result.log);
        for (const msg of result.log) {
          steps.push({ players: [...currentPlayers], message: msg, color: currentOwner.color, source: "ability" });
        }

        const snapshot = stateSnapshot(currentPlayers);
        if (visitedStates.has(snapshot)) {
          const loopMsg = "⚠️ Loop detected — resolution stopped.";
          allLogs.push(loopMsg);
          steps.push({ players: [...currentPlayers], message: loopMsg });
          return { players: currentPlayers, log: allLogs, steps };
        }
        visitedStates.add(snapshot);

        nextEvents.push(...result.events);
      }

      // Process board space effects for the moved player
      if (event.type === EventType.PLAYER_MOVED) {
        const mover = currentPlayers.find((p) => p.id === event.playerId)!;
        if (mover.finished || mover.position !== event.to) continue;
        const space = board[event.to];
        if (!space?.effect) continue;

        const effect = space.effect;
        if (effect.type === "gain_point") {
          currentPlayers = currentPlayers.map((p) =>
            p.id === mover.id ? { ...p, points: p.points + effect.amount } : p,
          );
          const msg = `${mover.name} lands on a bonus space and gains ${effect.amount} point!`;
          allLogs.push(msg);
          steps.push({ players: [...currentPlayers], message: msg, color: mover.color, source: "space", soundHint: "point" });
        } else if (effect.type === "trip") {
          if (!mover.tripped) {
            currentPlayers = currentPlayers.map((p) => (p.id === mover.id ? { ...p, tripped: true } : p));
            const msg = `${mover.name} lands on a trap and gets tripped!`;
            allLogs.push(msg);
            steps.push({ players: [...currentPlayers], message: msg, color: mover.color, source: "space", soundHint: "trip" });
          }
        } else if (effect.type === "move") {
          const newPos = Math.max(0, Math.min(event.to + effect.offset, 30));
          if (newPos !== event.to) {
            currentPlayers = currentPlayers.map((p) =>
              p.id === mover.id ? { ...p, position: newPos, finished: newPos >= 30 } : p,
            );
            const dir = effect.offset > 0 ? "forward" : "backward";
            const msg = `${mover.name} lands on a space and moves ${dir} ${Math.abs(effect.offset)} to space ${newPos}!`;
            allLogs.push(msg);
            steps.push({ players: [...currentPlayers], message: msg, color: mover.color, source: "space", soundHint: "move_space" });

            const snapshot = stateSnapshot(currentPlayers);
            if (visitedStates.has(snapshot)) {
              const loopMsg = "⚠️ Loop detected — resolution stopped.";
              allLogs.push(loopMsg);
              steps.push({ players: [...currentPlayers], message: loopMsg });
              return { players: currentPlayers, log: allLogs, steps };
            }
            visitedStates.add(snapshot);

            nextEvents.push({ type: EventType.PLAYER_MOVED, playerId: mover.id, from: event.to, to: newPos });
          }
        }
      }
    }

    pendingEvents = nextEvents;
  }

  return { players: currentPlayers, log: allLogs, steps };
}

/**
 * Resolve TURN_START phase abilities (e.g., Party Animal).
 * These fire once at the beginning of a turn, not reactively.
 */
export function resolveTurnStartPhase(
  currentPlayerId: string,
  players: Player[],
  characters: Character[],
  board: BoardSpace[] = [],
): ResolutionResult {
  const allLogs: string[] = [];
  const steps: ResolutionStep[] = [];
  let currentPlayers = players;
  const triggers = getTriggersForPhase(Phase.TURN_START, currentPlayers, characters);

  const event: GameEvent = {
    type: EventType.TURN_START,
    playerId: currentPlayerId,
    from: 0,
    to: 0,
  };

  for (const { trigger, owner } of triggers) {
    const currentOwner = currentPlayers.find((p) => p.id === owner.id)!;
    if (currentOwner.finished) continue;

    const ctx: ResolutionContext = { event, owner: currentOwner, players: currentPlayers };
    const result = trigger.check(ctx);
    if (!result) continue;

    currentPlayers = result.players;
    allLogs.push(...result.log);
    for (const msg of result.log) {
      steps.push({ players: [...currentPlayers], message: msg, color: currentOwner.color, source: "ability" });
    }

    if (result.events.length > 0) {
      const reactResult = resolveReactPhase(result.events, currentPlayers, characters, board);
      currentPlayers = reactResult.players;
      allLogs.push(...reactResult.log);
      steps.push(...reactResult.steps);
    }
  }

  return { players: currentPlayers, log: allLogs, steps };
}

export interface PreRollResult {
  players: Player[];
  rollModifier: number;
  log: string[];
}

/**
 * Resolve PRE_ROLL phase abilities (e.g., Party Animal dice bonus).
 * Returns the total roll modifier to add to the base roll.
 */
export function resolvePreRollPhase(
  currentPlayerId: string,
  players: Player[],
  characters: Character[],
): PreRollResult {
  const allLogs: string[] = [];
  let currentPlayers = players;
  let totalModifier = 0;
  const triggers = getTriggersForPhase(Phase.PRE_ROLL, currentPlayers, characters);

  const event: GameEvent = {
    type: EventType.TURN_START, // reuse; it's the current player's context
    playerId: currentPlayerId,
    from: 0,
    to: 0,
  };

  for (const { trigger, owner } of triggers) {
    // Only the current player's PRE_ROLL abilities fire
    if (owner.id !== currentPlayerId) continue;
    const currentOwner = currentPlayers.find((p) => p.id === owner.id)!;
    if (currentOwner.finished) continue;

    const ctx: ResolutionContext = { event, owner: currentOwner, players: currentPlayers };
    const result = trigger.check(ctx);
    if (!result) continue;

    currentPlayers = result.players;
    totalModifier += result.rollModifier ?? 0;
    allLogs.push(...result.log);
  }

  return { players: currentPlayers, rollModifier: totalModifier, log: allLogs };
}

/**
 * Resolve TURN_END phase abilities (e.g., Heckler reacting to net turn movement).
 * Fires after all REACT resolution is complete.
 */
export function resolveTurnEndPhase(
  currentPlayerId: string,
  turnStartPosition: number,
  players: Player[],
  characters: Character[],
  board: BoardSpace[] = [],
): ResolutionResult {
  const allLogs: string[] = [];
  const steps: ResolutionStep[] = [];
  let currentPlayers = players;

  const activePlayer = currentPlayers.find((p) => p.id === currentPlayerId)!;
  const event: GameEvent = {
    type: EventType.TURN_END,
    playerId: currentPlayerId,
    from: turnStartPosition,
    to: activePlayer.position,
  };

  const triggers = getTriggersForPhase(Phase.TURN_END, currentPlayers, characters);

  for (const { trigger, owner } of triggers) {
    const currentOwner = currentPlayers.find((p) => p.id === owner.id)!;
    if (currentOwner.finished) continue;

    const ctx: ResolutionContext = { event, owner: currentOwner, players: currentPlayers };
    const result = trigger.check(ctx);
    if (!result) continue;

    currentPlayers = result.players;
    allLogs.push(...result.log);
    for (const msg of result.log) {
      steps.push({ players: [...currentPlayers], message: msg, color: currentOwner.color, source: "ability" });
    }

    // If turn-end abilities cause movement, resolve reactions
    if (result.events.length > 0) {
      const reactResult = resolveReactPhase(result.events, currentPlayers, characters, board);
      currentPlayers = reactResult.players;
      allLogs.push(...reactResult.log);
      steps.push(...reactResult.steps);
    }
  }

  return { players: currentPlayers, log: allLogs, steps };
}
