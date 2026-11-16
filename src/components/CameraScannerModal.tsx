import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, AlertCircle, RefreshCw } from 'lucide-react';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (sn: string) => void;
  modeLabel: string;
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onDetected,
  modeLabel,
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const regionId = 'html5qr-code-full-region';

    const startCamera = async () => {
      setIsStarting(true);
      setErrorMsg(null);
      try {
        const html5QrCode = new Html5Qrcode(regionId);
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 12,
            qrbox: { width: 260, height: 130 },
          },
          (decodedText) => {
            if (!mounted) return;
            const cleaned = decodedText.trim().toUpperCase();
            const now = Date.now();
            if (
              lastScannedRef.current.text === cleaned &&
              now - lastScannedRef.current.time < 1800
            ) {
              return;
            }
            lastScannedRef.current = { text: cleaned, time: now };
            onDetected(cleaned);
          },
          () => {
            // Frame scan error ignored
          }
        );
      } catch (err: unknown) {
        if (mounted) {
          const message =
            err instanceof Error
              ? err.message
              : 'Kamera tidak dapat diakses pada perangkat ini.';
          setErrorMsg(
            `Kamera tidak tersedia atau izin ditolak (${message}). Anda tetap dapat menggunakan Scanner Barcode USB/Bluetooth atau tombol Simulasi Scan Cepat.`
          );
        }
      } finally {
        if (mounted) setIsStarting(false);
      }
    };

    const timer = setTimeout(startCamera, 150);

    return () => {
      mounted = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        const sc = scannerRef.current;
        scannerRef.current = null;
        if (sc.isScanning) {
          sc.stop()
            .then(() => sc.clear())
            .catch(() => {});
        }
      }
    };
  }, [isOpen, onDetected]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1">
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <Camera className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              Kamera Scan Barcode — {modeLabel}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-xl transition-colors shrink-0"
            aria-label="Tutup kamera"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Arahkan kamera smartphone ke Barcode 1D (Code-128) pada kWh Meter PLN untuk memindai Nomor Serial Number (Kolom B).
          </p>

          <div className="relative w-full min-h-[240px] bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800">
            <div id="html5qr-code-full-region" className="w-full" />
            {isStarting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300 text-xs bg-slate-950/80">
                <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
                <span>Mengaktifkan kamera belakang...</span>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                {errorMsg}
              </div>
            </div>
          )}

          <div className="pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[48px] px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              Selesai / Tutup Kamera
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
