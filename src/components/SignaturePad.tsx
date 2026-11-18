import React, { useRef, useState, useEffect } from 'react';
import { RotateCcw, PenTool, Check } from 'lucide-react';

interface SignaturePadProps {
  label: string;
  roleDescription?: string;
  initialSignature?: string;
  onSave: (dataUrl: string) => void;
  name: string;
  nip: string;
  onNameChange: (val: string) => void;
  onNipChange: (val: string) => void;
}

export const SignaturePad: React.FC<SignaturePadProps> = ({
  label,
  roleDescription,
  initialSignature,
  onSave,
  name,
  nip,
  onNameChange,
  onNipChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState<boolean>(Boolean(initialSignature));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#083d54';

    if (initialSignature) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = initialSignature;
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasStroke(false);
    }
  }, [initialSignature]);

  const getPointerCoords = (
    e: React.PointerEvent<HTMLCanvasElement>
  ): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPointerCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasStroke(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getPointerCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onSave(canvas.toDataURL('image/png'));
    }
  };

  const handleReset = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasStroke(false);
    onSave('');
  };

  const handleDrawSampleParaf = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = '#083d54';
    ctx.lineWidth = 2.6;
    ctx.moveTo(150, 95);
    ctx.bezierCurveTo(185, 35, 220, 115, 245, 70);
    ctx.bezierCurveTo(265, 40, 285, 105, 330, 82);
    ctx.bezierCurveTo(360, 72, 395, 78, 430, 85);
    ctx.stroke();
    setHasStroke(true);
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
            <PenTool className="w-4 h-4 text-[#0b4f6c] dark:text-[#facc15]" />
            <span>{label}</span>
          </div>
          {roleDescription && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {roleDescription}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="min-h-[34px] px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 rounded-xl flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={handleDrawSampleParaf}
            className="min-h-[34px] px-3 py-1 text-xs font-semibold text-[#0b4f6c] dark:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100 rounded-xl flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Contoh Paraf</span>
          </button>
        </div>
      </div>

      <div className="relative rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white overflow-hidden">
        {!hasStroke && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-slate-400 select-none">
            Tanda tangan di sini (sentuh &amp; gores)
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={600}
          height={150}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full h-36 touch-none cursor-crosshair block"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
            Nama Lengkap
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Masukkan nama lengkap petugas..."
            className="w-full min-h-[42px] px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
            NIP / No. Pegawai
          </label>
          <input
            type="text"
            value={nip}
            onChange={(e) => onNipChange(e.target.value)}
            placeholder="Contoh: 8914022ZY"
            className="w-full min-h-[42px] px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </div>
    </div>
  );
};
