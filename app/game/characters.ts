import { Character, Phase, EventType, GameEvent } from "./types";

const BOARD_SIZE = 30;

export const CHARACTERS: Character[] = [
  {
    id: "heckler",
    name: "Heckler",
    description: "When a racer ends their turn within 1 space of where they started, I move 2.",
    image: "Heckler.png",
    abilities: [
      {
        phase: Phase.TURN_END,
        check: (ctx) => {
          const { event, owner, players } = ctx;
          if (event.type !== EventType.TURN_END) return null;
          if (owner.finished) return null;

          const distance = Math.abs(event.to - event.from);
          if (distance > 1) return null;

          const newPos = Math.min(owner.position + 2, BOARD_SIZE);
          if (newPos === owner.position) return null;

          const updatedPlayers = players.map((p) =>
            p.id === owner.id ? { ...p, position: newPos, finished: newPos >= BOARD_SIZE } : p,
          );

          const moveEvent: GameEvent = {
            type: EventType.PLAYER_MOVED,
            playerId: owner.id,
            from: owner.position,
            to: newPos,
          };

          return {
            players: updatedPlayers,
            events: [moveEvent],
            log: [`${owner.name} (Heckler) mocks the short move and advances 2 to space ${newPos}.`],
          };
        },
      },
    ],
  },
  {
    id: "baba-yaga",
    name: "Baba Yaga",
    description:
      "Any character that lands on Baba Yaga's space gets tripped. If Baba Yaga lands on others, they get tripped.",
    image: "Baba_Yaga.png",
    abilities: [
      {
        phase: Phase.REACT,
        check: (ctx) => {
          const { event, owner, players } = ctx;
          if (event.type !== EventType.PLAYER_MOVED) return null;
          if (owner.finished) return null;

          // Case 1: Someone else landed on Baba Yaga's space
          if (event.playerId !== owner.id && event.to === owner.position) {
            const mover = players.find((p) => p.id === event.playerId)!;
            if (mover.tripped || mover.finished) return null;

            const updatedPlayers = players.map((p) => (p.id === event.playerId ? { ...p, tripped: true } : p));
            return {
              players: updatedPlayers,
              events: [],
              log: [`${mover.name} landed on ${owner.name} (Baba Yaga) and got tripped!`],
            };
          }

          // Case 2: Baba Yaga landed on a space with others
          if (event.playerId === owner.id) {
            const victims = players.filter(
              (p) => p.id !== owner.id && p.position === event.to && !p.tripped && !p.finished,
            );
            if (victims.length === 0) return null;

            const victimIds = new Set(victims.map((v) => v.id));
            const updatedPlayers = players.map((p) => (victimIds.has(p.id) ? { ...p, tripped: true } : p));
            return {
              players: updatedPlayers,
              events: [],
              log: victims.map((v) => `${owner.name} (Baba Yaga) landed on ${v.name} and tripped them!`),
            };
          }

          return null;
        },
      },
    ],
  },
  {
    id: "romantic",
    name: "Romantic",
    description: "Moves forward 2 whenever any character lands on a space with exactly one other character.",
    image: "Romantic.png",
    abilities: [
      {
        phase: Phase.REACT,
        check: (ctx) => {
          const { event, owner, players } = ctx;
          if (event.type !== EventType.PLAYER_MOVED) return null;
          if (owner.finished) return null;

          // Count how many players are on the space the mover landed on
          const playersOnSpace = players.filter((p) => p.position === event.to && !p.finished);

          // Trigger when exactly 2 players share the space (the mover + one other)
          if (playersOnSpace.length !== 2) return null;

          const newPos = Math.min(owner.position + 2, BOARD_SIZE);
          if (newPos === owner.position) return null;

          const updatedPlayers = players.map((p) =>
            p.id === owner.id ? { ...p, position: newPos, finished: newPos >= BOARD_SIZE } : p,
          );

          const moveEvent: GameEvent = {
            type: EventType.PLAYER_MOVED,
            playerId: owner.id,
            from: owner.position,
            to: newPos,
          };

          return {
            players: updatedPlayers,
            events: [moveEvent],
            log: [
              `${owner.name} (Romantic) swoons at the pair on space ${event.to} and advances 2 to space ${newPos}.`,
            ],
          };
        },
      },
    ],
  },
  {
    id: "party-animal",
    name: "Party Animal",
    description:
      "Before my main move, all racers move 1 space towards me. Each other racer on my space gives me +1 to my main move.",
    image: "Party_Animal.png",
    abilities: [
      {
        phase: Phase.TURN_START,
        check: (ctx) => {
          const { owner, players } = ctx;
          // Only triggers on Party Animal's own turn
          if (ctx.event.playerId !== owner.id) return null;

          const movedEvents: GameEvent[] = [];
          const movedNames: string[] = [];
          const updatedPlayers = players.map((p) => {
            if (p.id === owner.id || p.finished || p.position === 0) return p;
            let newPos: number;
            if (p.position < owner.position) {
              newPos = Math.min(p.position + 1, BOARD_SIZE);
            } else if (p.position > owner.position) {
              newPos = p.position - 1;
            } else {
              return p;
            }
            movedEvents.push({ type: EventType.PLAYER_MOVED, playerId: p.id, from: p.position, to: newPos });
            movedNames.push(p.name);
            return { ...p, position: newPos };
          });

          if (movedEvents.length === 0) return null;

          return {
            players: updatedPlayers,
            events: movedEvents,
            log: [`${owner.name} (Party Animal) pulls ${movedNames.join(", ")} closer.`],
          };
        },
      },
      {
        phase: Phase.PRE_ROLL,
        check: (ctx) => {
          const { owner, players } = ctx;
          const othersOnSpace = players.filter(
            (p) => p.id !== owner.id && p.position === owner.position && !p.finished
          );
          if (othersOnSpace.length === 0) return null;

          const bonus = othersOnSpace.length;
          return {
            players,
            events: [],
            log: [`${owner.name} (Party Animal) parties with ${bonus} other(s) on his space: +${bonus} to roll!`],
            rollModifier: bonus,
          };
        },
      },
    ],
  },
];
