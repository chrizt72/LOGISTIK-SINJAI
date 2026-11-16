import React from 'react';

interface BarcodeGraphicProps {
  value: string;
  height?: number;
  showText?: boolean;
  className?: string;
}

// Deterministic visual 1D barcode renderer representing Serial Number (SN)
export const BarcodeGraphic: React.FC<BarcodeGraphicProps> = ({
  value,
  height = 36,
  showText = true,
  className = '',
}) => {
  const cleanVal = (value || 'PLN02190000224').trim().toUpperCase();

  const bars: { width: number; dark: boolean }[] = [
    { width: 2, dark: true },
    { width: 1, dark: false },
    { width: 1, dark: true },
    { width: 2, dark: false },
  ];

  for (let i = 0; i < cleanVal.length; i++) {
    const code = cleanVal.charCodeAt(i);
    const w1 = (code % 3) + 1;
    const s1 = ((code >> 1) % 2) + 1;
    const w2 = ((code >> 2) % 3) + 1;
    const s2 = ((code >> 3) % 2) + 1;
    bars.push({ width: w1, dark: true });
    bars.push({ width: s1, dark: false });
    bars.push({ width: w2, dark: true });
    bars.push({ width: s2, dark: false });
  }

  bars.push({ width: 2, dark: true });
  bars.push({ width: 1, dark: false });
  bars.push({ width: 2, dark: true });

  const totalUnits = bars.reduce((acc, b) => acc + b.width, 0);

  let currentX = 0;
  return (
    <div className={`inline-flex flex-col items-center bg-white px-2.5 py-1.5 rounded border border-slate-200 ${className}`}>
      <svg
        viewBox={`0 0 ${totalUnits} ${height}`}
        className="w-full max-w-[240px]"
        style={{ height: `${height}px` }}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Barcode ${cleanVal}`}
      >
        {bars.map((bar, idx) => {
          const x = currentX;
          currentX += bar.width;
          if (!bar.dark) return null;
          return (
            <rect
              key={idx}
              x={x}
              y={0}
              width={bar.width}
              height={height}
              fill="#0f172a"
            />
          );
        })}
      </svg>
      {showText && (
        <span className="mt-1 font-mono text-[10px] tracking-wider text-slate-800 font-semibold tabular-nums">
          {cleanVal}
        </span>
      )}
    </div>
  );
};
