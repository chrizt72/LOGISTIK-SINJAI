import React from 'react';
import {
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Camera,
  Trash2,
  X,
  Plus,
  Check,
} from 'lucide-react';

export interface ScannedSnItemPreview {
  snMaterial: string;
  noMaterial: string;
  spesifikasi: string;
  kategori: string;
  noBatch: string;
  qrType: 'TUNGGAL' | 'BUNDLE';
  rowNumber?: number;
  validationStatus:
    | 'VALID_MASUK'
    | 'VALID_KELUAR'
    | 'DUPLIKAT_SHEET'
    | 'SUDAH_TERPAKAI'
    | 'TIDAK_DITEMUKAN';
  validationNote: string;
}

interface QrScannedListPopupProps {
  isOpen: boolean;
  mode: 'MASUK' | 'KELUAR';
  qrType: 'TUNGGAL' | 'BUNDLE';
  latestScannedItems: ScannedSnItemPreview[];
  totalReadyInColumn: number;
  isImporting: boolean;
  onClose: () => void;
  onSwitchMode: (newMode: 'MASUK' | 'KELUAR') => void;
  onScanMoreCamera: () => void;
  onRemoveItem: (snMaterial: string) => void;
  onImportNow: (targetMode: 'MASUK' | 'KELUAR') => Promise<void>;
}

export const QrScannedListPopup: React.FC<QrScannedListPopupProps> = ({
  isOpen,
  mode,
  latestScannedItems,
  totalReadyInColumn,
  isImporting,
  onClose,
  onScanMoreCamera,
  onRemoveItem,
}) => {
  if (!isOpen || latestScannedItems.length === 0) return null;

  const listCount = Math.max(totalReadyInColumn, latestScannedItems.length);

  const alreadyTerpakaiItems = latestScannedItems.filter(
    (i) => i.validationStatus === 'SUDAH_TERPAKAI'
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:p-4"
      onClick={() => !isImporting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1">
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
              <QrCode className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase bg-sky-600 text-white">
                  {listCount} SN TERSCAN
                </span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  · {mode === 'MASUK' ? 'Material Masuk' : 'Material Keluar'}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate mt-0.5">
                List SN yang Terscan
              </h3>
            </div>
          </div>

          <button
            type="button"
            disabled={isImporting}
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 rounded-xl transition-colors shrink-0"
            aria-label="Tutup popup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: List SN yang Terscan */}
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto flex-1">
          {alreadyTerpakaiItems.length > 0 && mode === 'KELUAR' && (
            <div className="p-3 rounded-xl bg-red-50/90 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-2.5 text-xs text-red-900 dark:text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">
                  Peringatan: {alreadyTerpakaiItems.length} SN sudah berstatus TERPAKAI sebelumnya.
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
            <span>Daftar SN Material Hasil Scan:</span>
            <span className="font-mono text-[11px] text-slate-500 tabular-nums">
              Total: {latestScannedItems.length} SN
            </span>
          </div>

          <div className="max-h-[48vh] overflow-y-auto space-y-2 pr-1">
            {latestScannedItems.map((item, index) => {
              const isWarning =
                mode === 'KELUAR' && item.validationStatus === 'SUDAH_TERPAKAI';

              return (
                <div
                  key={`${item.snMaterial}-${index}`}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2.5 text-xs ${
                    isWarning
                      ? 'bg-red-50/60 dark:bg-red-950/25 border-red-200 dark:border-red-800/70'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      className={`min-w-[28px] h-7 px-1.5 rounded-lg font-mono text-[11px] font-bold flex items-center justify-center shrink-0 tabular-nums ${
                        isWarning
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-900 text-white dark:bg-sky-600'
                      }`}
                    >
                      #{index + 1}
                    </span>
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-white break-all tabular-nums">
                        {item.snMaterial}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                          {item.noMaterial}
                        </span>{' '}
                        · Batch {item.noBatch} · {item.spesifikasi}
                      </div>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold ${
                            isWarning
                              ? 'text-red-600 dark:text-red-400'
                              : mode === 'MASUK'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {mode === 'MASUK'
                              ? item.rowNumber
                                ? `Baris #${item.rowNumber} · STOK SIAP`
                                : 'Baris Baru · STOK SIAP'
                              : item.validationNote}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.snMaterial)}
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-red-600 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shrink-0"
                    title="Hapus SN ini dari List"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions — 2 Tombol Pilihan: + SCAN MATERIAL atau SELESAI */}
        <div className="p-4 sm:px-5 sm:py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isImporting}
              onClick={onScanMoreCamera}
              className="min-h-[48px] px-4 py-3 text-xs sm:text-sm font-bold text-sky-800 dark:text-sky-200 bg-sky-100 hover:bg-sky-200 dark:bg-sky-950/80 border-2 border-sky-500 dark:border-sky-600 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <Camera className="w-4 h-4 shrink-0" />
              <span>+ SCAN MATERIAL</span>
            </button>

            <button
              type="button"
              disabled={isImporting}
              onClick={onClose}
              className={`min-h-[48px] px-4 py-3 text-xs sm:text-sm font-bold text-white rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] ${
                mode === 'MASUK'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>SELESAI ({listCount} SN)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
