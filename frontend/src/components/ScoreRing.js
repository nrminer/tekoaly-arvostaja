export const ScoreRing = ({ score = 0, size = "default" }) => {
  const normalized = Math.max(0, Math.min(10, Number(score) || 0));
  const dimension = size === "large" ? 92 : 58;
  const stroke = size === "large" ? 8 : 6;
  const radius = (dimension - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 10) * circumference;

  return (
    <div className="relative inline-grid place-items-center" style={{ width: dimension, height: dimension }}>
      <svg width={dimension} height={dimension} role="img" aria-label={`Score ${normalized} out of 10`}>
        <circle className="score-ring-bg" cx={dimension / 2} cy={dimension / 2} r={radius} fill="none" strokeWidth={stroke} />
        <circle
          className="score-ring-progress"
          cx={dimension / 2}
          cy={dimension / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${dimension / 2} ${dimension / 2})`}
        />
      </svg>
      <span className="absolute font-heading text-sm font-semibold">{normalized}</span>
    </div>
  );
};
