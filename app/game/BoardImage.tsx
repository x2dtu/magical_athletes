import { Player } from "./types";

// Coordinates as percentages [x%, y%] for each of the 31 spaces (0-30)
// Board is U-shaped: top-left → top-right → down right side → bottom-right → bottom-left
const SPACE_POSITIONS: [number, number][] = [
  // Top row: spaces 0-12 (left to right)
  [12, 18], // 0 - START
  [24.65, 18],
  [31.0, 18],
  [37.35, 18],
  [43.7, 18],
  [50.05, 18],
  [56.4, 18],
  [62.75, 18],
  [69.1, 18],
  [75.45, 18],
  [81.8, 18],
  [88.15, 18],
  [94.5, 18],
  // Right column: spaces 13-15 (top to bottom)
  [94.5, 39.5], // 13
  [94.5, 61], // 14
  [94.5, 82.5], // 15
  // Bottom row: spaces 16-30 (right to left)
  [88.15, 82.5], // 16
  [81.8, 82.5], // 17
  [75.45, 82.5], // 18
  [69.1, 82.5], // 19
  [62.75, 82.5], // 20
  [56.4, 82.5], // 21
  [50.05, 82.5], // 22
  [43.7, 82.5], // 23
  [37.35, 82.5], // 24
  [31.0, 82.5], // 25
  [24.65, 82.5], // 26
  [18.3, 82.5], // 27
  [11.95, 82.5], // 28
  [5.6, 82.5], // 29
  [5.6, 70], // 30 - FINISH
];

export default function BoardImage({ players }: { players: Player[] }) {
  return (
    <div className="relative w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/game_board.webp" alt="Game Board" className="w-full rounded-lg" />
      {/* Player tokens overlaid on the board */}
      {SPACE_POSITIONS.map(([x, y], spaceIndex) => {
        const playersHere = players.filter((p) => p.position === spaceIndex && !p.finished);
        if (playersHere.length === 0) return null;
        return (
          <div
            key={spaceIndex}
            className="absolute flex gap-0.5 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {playersHere.map((p) => (
              <div
                key={p.id}
                className="w-4 h-4 rounded-full border-2 border-white shadow-md sm:w-5 sm:h-5"
                style={{ backgroundColor: p.color }}
                title={p.name}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
