import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
  X,
  AlertCircle,
  RefreshCw,
  QrCode,
  Layers,
  ImageUp,
  SwitchCamera,
} from 'lucide-react';

interface CameraScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDetected: (rawQrPayload: string) => void;
  modeLabel: string;
  sampleSingleSn?: string;
  sampleBundleSns?: string[];
}

export const CameraScannerModal: React.FC<CameraScannerModalProps> = ({
  isOpen,
  onClose,
  onDetected,
  modeLabel,
  sampleSingleSn = 'PLN0219000022402639005330251',
  sampleBundleSns = [],
}) => {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [selectedCameraIdx, setSelectedCameraIdx] = useState<number>(0);
  const [manualBundleText, setManualBundleText] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState<boolean>(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  const lastScannedRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const regionId = 'html5qr-code-full-region';

    const startCamera = async () => {
      setIsStarting(true);
      setErrorMsg(null);

      try {
        if (scannerRef.current) {
          try {
            if (scannerRef.current.isScanning) {
              await scannerRef.current.stop();
            }
            scannerRef.current.clear();
          } catch {
            // ignore cleanup error
          }
          scannerRef.current = null;
        }

        const html5QrCode = new Html5Qrcode(regionId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          useBarCodeDetectorIfSupported: true,
          verbose: false,
        });
        scannerRef.current = html5QrCode;

        let cameraConfig: { facingMode: string } | string = { facingMode: 'environment' };
        try {
          const devices = await Html5Qrcode.getCameras();
          if (mounted && Array.isArray(devices) && devices.length > 0) {
            setCameras(devices);
            const backCamIndex = devices.findIndex((d) =>
              /back|rear|environment|belakang/i.test(d.label)
            );
            const idxToUse =
              selectedCameraIdx < devices.length
                ? selectedCameraIdx
                : backCamIndex >= 0
                ? backCamIndex
                : devices.length - 1;
            cameraConfig = devices[idxToUse].id;
          }
        } catch {
          cameraConfig = { facingMode: 'environment' };
        }

        await html5QrCode.start(
          cameraConfig,
          {
            fps: 15,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const boxSize = Math.max(190, Math.floor(minEdge * 0.8));
              return { width: boxSize, height: boxSize };
            },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (!mounted) return;
            const cleaned = String(decodedText || '').trim();
            if (!cleaned) return;

            const now = Date.now();
            if (
              lastScannedRef.current.text === cleaned &&
              now - lastScannedRef.current.time < 1500
            ) {
              return;
            }
            lastScannedRef.current = { text: cleaned, time: now };

            // Otomatis tutup kamera dan munculkan Popup Deretan SN yang Terscan
            onCloseRef.current();
            onDetectedRef.current(cleaned);
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
            `Kamera tidak dapat dibuka (${message}). Anda dapat memilih foto QR Code dari galeri atau menggunakan tombol uji scan di bawah.`
          );
        }
      } finally {
        if (mounted) setIsStarting(false);
      }
    };

    const timer = setTimeout(startCamera, 180);

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
  }, [isOpen, selectedCameraIdx]);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const tempScanner = scannerRef.current || new Html5Qrcode('html5qr-code-full-region');
      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      const decodedText = await tempScanner.scanFile(file, true);
      if (decodedText && decodedText.trim()) {
        onClose();
        onDetected(decodedText.trim());
      }
    } catch {
      setErrorMsg(
        'QR Code tidak terbaca pada gambar tersebut. Pastikan gambar QR Code terlihat jelas dan tidak buram.'
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSimulateSingleQr = () => {
    onClose();
    onDetected(sampleSingleSn);
  };

  const handleSimulateBundleQr = () => {
    let list = sampleBundleSns.slice(0, 10);
    if (list.length === 0) {
      list = Array.from({ length: 10 }, (_, idx) => {
        const num = String(5330251 + idx).padStart(7, '0');
        return `PLN021900002240263900${num}`;
      });
    }
    const bundlePayload = list.join('\n');
    onClose();
    onDetected(bundlePayload);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1">
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <Camera className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                Kamera Scan QR Code — {modeLabel}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Mendukung QR Tunggal (1 SN) &amp; QR Bundle (1–20 SN)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={() => setSelectedCameraIdx((prev) => (prev + 1) % cameras.length)}
                className="min-h-[40px] px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center gap-1"
                title="Ganti Kamera"
              >
                <SwitchCamera className="w-4 h-4 text-sky-600" />
                <span className="hidden sm:inline">Kamera</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-xl transition-colors shrink-0"
              aria-label="Tutup kamera"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto">
          {/* Supported QR Types Info */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/70 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <div className="font-bold text-slate-900 dark:text-white">QR Material Tunggal</div>
                <div className="text-slate-500 dark:text-slate-400">Menampilkan 1 SN</div>
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/70 flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-600 shrink-0" />
              <div>
                <div className="font-bold text-slate-900 dark:text-white">QR Bundle Material</div>
                <div className="text-slate-500 dark:text-slate-400">Berisi 1 s/d 20 SN sekaligus</div>
              </div>
            </div>
          </div>

          {/* Camera Viewport */}
          <div className="relative w-full min-h-[250px] bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center border-2 border-sky-500/70">
            <div id="html5qr-code-full-region" className="w-full" />
            {isStarting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300 text-xs bg-slate-950/85">
                <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
                <span>Mengaktifkan kamera belakang untuk membaca QR Code...</span>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                {errorMsg}
              </div>
            </div>
          )}

          {/* Scan from Image / Quick Test Buttons for Single & Bundle QR */}
          <div className="space-y-2 pt-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[42px] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <ImageUp className="w-4 h-4 text-sky-600 shrink-0" />
                <span>Scan Foto QR</span>
              </button>

              <button
                type="button"
                onClick={handleSimulateSingleQr}
                className="min-h-[42px] px-3 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <QrCode className="w-4 h-4 shrink-0" />
                <span>Uji QR Tunggal (1 SN)</span>
              </button>

              <button
                type="button"
                onClick={handleSimulateBundleQr}
                className="min-h-[42px] px-3 py-2 text-xs font-bold text-sky-800 dark:text-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <Layers className="w-4 h-4 shrink-0" />
                <span>Uji QR Bundle (10 SN)</span>
              </button>
            </div>
          </div>

          {/* Toggleable Paste Bundle QR Payload */}
          <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowManualInput((prev) => !prev)}
              className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
            >
              {showManualInput
                ? 'Sembunyikan Input Teks QR Bundle'
                : 'Tempel Hasil Scanner Fisik / Deretan QR Bundle (1–20 SN)'}
            </button>

            {showManualInput && (
              <div className="mt-2 space-y-2">
                <textarea
                  rows={3}
                  value={manualBundleText}
                  onChange={(e) => setManualBundleText(e.target.value)}
                  placeholder={
                    'PLN0219000022402639005330251\nPLN0219000022402639005330252\n(1 s/d 20 SN dipisahkan baris baru atau koma)'
                  }
                  className="w-full p-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!manualBundleText.trim()) return;
                    const text = manualBundleText.trim();
                    setManualBundleText('');
                    onClose();
                    onDetected(text);
                  }}
                  className="w-full min-h-[42px] px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl"
                >
                  Proses Deretan SN &amp; Tampilkan Popup List
                </button>
              </div>
            )}
          </div>

          <div className="pt-1">
            <button
              type="button"
              onClick={onClose}
              className="w-full min-h-[46px] px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Tutup Kamera
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
