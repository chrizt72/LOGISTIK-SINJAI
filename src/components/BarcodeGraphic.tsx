import React from 'react';

interface BarcodeGraphicProps {
  value: string;
  height?: number;
  showText?: boolean;
  className?: string;
}

// Deterministic visual 2D QR Code SVG renderer representing Serial Number (SN)
export const BarcodeGraphic: React.FC<BarcodeGraphicProps> = ({
  value,
  height = 128,
  showText = true,
  className = '',
}) => {
  const cleanVal = (value || 'PLN0219000022402639005330251').trim().toUpperCase();
  const size = 21; // Standard Version 1 QR Matrix 21x21
  const qrSize = Math.max(96, height);

  const isFinderModule = (r: number, c: number): boolean | null => {
    const checkCorner = (r0: number, c0: number) => {
      const dr = r - r0;
      const dc = c - c0;
      if (dr >= 0 && dr < 7 && dc >= 0 && dc < 7) {
        if (dr === 0 || dr === 6 || dc === 0 || dc === 6) return true;
        if (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4) return true;
        return false;
      }
      if (dr >= -1 && dr <= 7 && dc >= -1 && dc <= 7) {
        return false; // Quiet separator around finder
      }
      return null;
    };

    const tl = checkCorner(0, 0);
    if (tl !== null) return tl;
    const tr = checkCorner(0, size - 7);
    if (tr !== null) return tr;
    const bl = checkCorner(size - 7, 0);
    if (bl !== null) return bl;

    // Timing patterns
    if (r === 6) return c % 2 === 0;
    if (c === 6) return r % 2 === 0;
    return null;
  };

  const cells: { r: number; c: number }[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const finder = isFinderModule(r, c);
      if (finder !== null) {
        if (finder) cells.push({ r, c });
        continue;
      }
      const charIdx = (r * size + c) % cleanVal.length;
      const code = cleanVal.charCodeAt(charIdx);
      const hash = ((code * 31 + r * 17 + c * 13) ^ (code >> (c % 5))) & 0xff;
      if (hash % 2 === 0) {
        cells.push({ r, c });
      }
    }
  }

  return (
    <div
      className={`inline-flex flex-col items-center bg-white p-3 rounded-xl border border-slate-200 ${className}`}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        style={{ width: `${qrSize}px`, height: `${qrSize}px` }}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`QR Code ${cleanVal}`}
      >
        {cells.map((cell, idx) => (
          <rect
            key={idx}
            x={cell.c}
            y={cell.r}
            width={1}
            height={1}
            fill="#0f172a"
          />
        ))}
      </svg>
      {showText && (
        <span className="mt-2 font-mono text-[11px] tracking-wider text-slate-800 font-bold tabular-nums break-all text-center">
          {cleanVal}
        </span>
      )}
    </div>
  );
};
