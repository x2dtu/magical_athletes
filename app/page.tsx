"use client";

import dynamic from "next/dynamic";

const GameBoard = dynamic(() => import("./game/GameBoard"), { ssr: false });

export default function Home() {
  return <GameBoard />;
}
