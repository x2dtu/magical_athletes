"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { GameState, Player } from "./types";
import { initGame, rollForCurrentPlayer, applyMove, getUp, endTurn, TurnStep } from "./engine";
import { CHARACTERS } from "./characters";
import DieFace from "./DieFace";

const BOARD_SIZE = 30;

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// --- Turn state machine ---

type TurnPhase =
  | { type: "ANNOUNCING"; name: string; color: string }
  | { type: "WAITING_FOR_ACTION" }  // human: show Roll/GetUp; AI: auto-act
  | { type: "SHOWING_ROLL"; roll: number }  // die visible, about to apply
  | { type: "ANIMATING"; steps: TurnStep[]; index: number }
  | { type: "WAITING_FOR_END_TURN" }  // human clicks End Turn
  | { type: "GAME_OVER" };

const DELAY = { announce: 800, roll: 1000, step: 800, endPause: 600 };
const DELAY_INSTANT = { announce: 300, roll: 300, step: 0, endPause: 100 };

export default function GameBoard() {
  const [game, setGame] = useState<GameState>(() => initGame(4));
  const [phase, setPhase] = useState<TurnPhase>({ type: "WAITING_FOR_ACTION" });
  const [animated, setAnimated] = useState(true);
  const [displayPlayers, setDisplayPlayers] = useState<Player[] | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const prevTurnRef = useRef(game.turn);

  const d = animated ? DELAY : DELAY_INSTANT;
  const currentPlayer = game.players[game.currentPlayerIndex];
  const shownPlayers = displayPlayers ?? game.players;

  // Scroll log to top on new entries
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [game.log.length]);

  // Advance phase when game/turn changes are triggered by setGame
  const effectivePhase: TurnPhase = useMemo(
    () => (game.finished ? { type: "GAME_OVER" } : phase),
    [game.finished, phase]
  );

  function advanceTurn() {
    setGame((prev) => {
      const next = endTurn(prev);
      const cp = next.players[next.currentPlayerIndex];
      setPhase({ type: "ANNOUNCING", name: cp.name, color: cp.color });
      setDisplayPlayers(null);
      return next;
    });
  }

  // State machine driver
  useEffect(() => {
    switch (effectivePhase.type) {
      case "ANNOUNCING": {
        const timer = setTimeout(() => setPhase({ type: "WAITING_FOR_ACTION" }), d.announce);
        return () => clearTimeout(timer);
      }
      case "WAITING_FOR_ACTION": {
        // AI auto-acts
        if (!currentPlayer.isHuman && !game.finished) {
          if (currentPlayer.tripped) {
            const timer = setTimeout(() => {
              const result = getUp(game);
              setGame(result.state);
              if (animated && result.steps.length > 0) {
                setPhase({ type: "ANIMATING", steps: result.steps, index: 0 });
                setDisplayPlayers(result.steps[0].players);
              } else {
                advanceTurn();
              }
            }, d.roll);
            return () => clearTimeout(timer);
          }
          const timer = setTimeout(() => {
            const roll = rollForCurrentPlayer();
            setPhase({ type: "SHOWING_ROLL", roll });
          }, d.roll);
          return () => clearTimeout(timer);
        }
        break;
      }
      case "SHOWING_ROLL": {
        const timer = setTimeout(() => {
          const result = applyMove(game, effectivePhase.roll);
          setGame(result.state);
          if (animated && result.steps.length > 0) {
            setPhase({ type: "ANIMATING", steps: result.steps, index: 0 });
            setDisplayPlayers(result.steps[0].players);
          } else {
            if (currentPlayer.isHuman) {
              setPhase({ type: "WAITING_FOR_END_TURN" });
            } else {
              advanceTurn();
            }
          }
        }, d.roll);
        return () => clearTimeout(timer);
      }
      case "ANIMATING": {
        const { steps, index } = effectivePhase;
        if (index >= steps.length) {
          // Animation done
          const timer = setTimeout(() => {
            setDisplayPlayers(null);
            if (currentPlayer.isHuman) {
              setPhase({ type: "WAITING_FOR_END_TURN" });
            } else {
              advanceTurn();
            }
          }, d.endPause);
          return () => clearTimeout(timer);
        }
        const timer = setTimeout(() => {
          setDisplayPlayers(steps[index].players);
          setPhase({ type: "ANIMATING", steps, index: index + 1 });
        }, d.step);
        return () => clearTimeout(timer);
      }
      default:
        break;
    }
  }, [effectivePhase, game, currentPlayer, animated, d]);

  // --- Human actions ---

  function handleRoll() {
    const roll = rollForCurrentPlayer();
    setPhase({ type: "SHOWING_ROLL", roll });
  }

  function handleGetUp() {
    const result = getUp(game);
    setGame(result.state);
    if (animated && result.steps.length > 0) {
      setPhase({ type: "ANIMATING", steps: result.steps, index: 0 });
      setDisplayPlayers(result.steps[0].players);
    } else {
      setPhase({ type: "WAITING_FOR_END_TURN" });
    }
  }

  function handleEndTurn() {
    setDisplayPlayers(null);
    advanceTurn();
  }

  function reset() {
    setGame(initGame(4));
    setPhase({ type: "WAITING_FOR_ACTION" });
    setDisplayPlayers(null);
    prevTurnRef.current = 1;
  }

  // --- Derived state ---

  const roll = effectivePhase.type === "SHOWING_ROLL" ? effectivePhase.roll : null;
  const isHumanTurn = currentPlayer.isHuman;
  const showRollButton = isHumanTurn && effectivePhase.type === "WAITING_FOR_ACTION" && !currentPlayer.tripped;
  const showGetUpButton = isHumanTurn && effectivePhase.type === "WAITING_FOR_ACTION" && currentPlayer.tripped;
  const showEndTurnButton = isHumanTurn && effectivePhase.type === "WAITING_FOR_END_TURN";
  const announcing = effectivePhase.type === "ANNOUNCING" ? effectivePhase : null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl mx-auto relative">
      {/* Turn announcement popup */}
      {announcing && (
        <div
          className="fixed top-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg text-white font-bold text-lg z-50 animate-fade-in"
          style={{ backgroundColor: announcing.color }}
        >
          {announcing.name}&apos;s turn
        </div>
      )}

      <h1 className="text-2xl font-bold text-center">Magical Athletes</h1>

      {/* Current player indicator */}
      {!game.finished && (
        <div className="text-center text-sm text-gray-600">
          <span className="inline-block w-3 h-3 rounded-full mr-1" style={{ backgroundColor: currentPlayer.color }} />
          {currentPlayer.name}&apos;s turn
          {currentPlayer.tripped && " (tripped!)"}
          {!currentPlayer.isHuman && " (AI)"}
        </div>
      )}

      {/* Die display */}
      <div className="flex justify-center h-24 items-center">
        {roll !== null && <DieFace value={roll} />}
      </div>

      {/* Controls */}
      <div className="flex gap-3 justify-center flex-wrap">
        {showRollButton && (
          <button onClick={handleRoll} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Roll Die
          </button>
        )}
        {showGetUpButton && (
          <button onClick={handleGetUp} className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700">
            Get Up
          </button>
        )}
        {showEndTurnButton && (
          <button onClick={handleEndTurn} className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
            End Turn
          </button>
        )}
        <button onClick={reset} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
          Reset
        </button>
        <button
          onClick={() => setAnimated((prev) => !prev)}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          {animated ? "Mode: 🎬 Animated" : "Mode: ⚡ Instant"}
        </button>
      </div>

      {/* Placements banner */}
      {game.placements.length > 0 && (
        <div className="text-center p-3 bg-yellow-100 rounded border border-yellow-300">
          {game.placements.map((p, i) => (
            <div key={p.id} className="text-lg font-bold">
              {["🥇", "🥈", "🥉"][i] ?? "🏅"} {ordinal(i + 1)}: {p.name}
            </div>
          ))}
        </div>
      )}

      {/* Board */}
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: BOARD_SIZE + 1 }, (_, i) => {
          const playersHere = shownPlayers.filter((p) => p.position === i && !p.finished);
          const isStart = i === 0;
          const isFinish = i === BOARD_SIZE;
          return (
            <div
              key={i}
              className={`relative h-12 border rounded flex items-center justify-center text-xs ${
                isStart ? "bg-green-100 border-green-400" : isFinish ? "bg-red-100 border-red-400" : "bg-gray-50 border-gray-300"
              }`}
            >
              <span className="text-gray-400">{i}</span>
              <div className="absolute inset-0 flex items-center justify-center gap-0.5">
                {playersHere.map((p) => (
                  <div key={p.id} className="w-3 h-3 rounded-full border border-white" style={{ backgroundColor: p.color }} title={p.name} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Players */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shownPlayers.map((p, i) => (
          <div
            key={p.id}
            className={`p-3 rounded border ${i === game.currentPlayerIndex && !game.finished ? "border-2 border-blue-500" : "border-gray-200"}`}
          >
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="font-medium text-sm">{p.name}</span>
              {p.isHuman && <span className="text-xs text-blue-500">(You)</span>}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Position: {p.position}/{BOARD_SIZE} {p.finished && "✅"}{p.tripped && " 🤕"}
            </div>
            {p.characterId && (
              <div className="text-xs text-gray-400 mt-1 italic">
                {CHARACTERS.find((c) => c.id === p.characterId)?.description}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Log — newest first */}
      <div ref={logRef} className="border rounded p-3 max-h-48 overflow-y-auto">
        <h2 className="font-semibold mb-2 text-sm">Game Log</h2>
        {game.log.length === 0 ? (
          <p className="text-xs text-gray-400">No moves yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {[...game.log].reverse().map((entry, i) => (
              <div
                key={i}
                className="text-xs text-gray-600 px-2 py-0.5 rounded"
                style={entry.color ? { backgroundColor: `${entry.color}20` } : undefined}
              >
                <span className="text-gray-400">T{entry.turn}:</span> {entry.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
