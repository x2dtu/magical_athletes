const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};

export default function DieFace({ value }: { value: number }) {
  const dots = DOT_POSITIONS[value] ?? [];
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20" aria-label={`Die showing ${value}`}>
      <rect x="5" y="5" width="90" height="90" rx="12" fill="white" stroke="#333" strokeWidth="3" />
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="8" fill="#333" />
      ))}
    </svg>
  );
}
