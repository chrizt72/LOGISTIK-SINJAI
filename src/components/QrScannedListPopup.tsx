import React from 'react';
import {
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Camera,
  FileSpreadsheet,
  Trash2,
  X,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
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
  qrType,
  latestScannedItems,
  totalReadyInColumn,
  isImporting,
  onClose,
  onSwitchMode,
  onScanMoreCamera,
  onRemoveItem,
  onImportNow,
}) => {
  if (!isOpen || latestScannedItems.length === 0) return null;

  const isBundle = qrType === 'BUNDLE' || latestScannedItems.length > 1;
  const importCount = Math.max(totalReadyInColumn, latestScannedItems.length);

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
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isBundle
                  ? 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300'
                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {isBundle ? <Layers className="w-5 h-5" /> : <QrCode className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase ${
                    isBundle ? 'bg-sky-600 text-white' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {isBundle
                    ? `QR BUNDLE (${latestScannedItems.length} SN)`
                    : 'QR MATERIAL TUNGGAL (1 SN)'}
                </span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  · Siap Import Spreadsheet
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate mt-0.5">
                Deretan SN Hasil Scan QR Code
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

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1">
          {/* Mode Selector Pill inside Popup so Officer can choose Masuk vs Keluar directly */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
              Pilih Tujuan Import Spreadsheet:
            </div>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                disabled={isImporting}
                onClick={() => onSwitchMode('MASUK')}
                className={`min-h-[40px] px-3 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  mode === 'MASUK'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <ArrowDownLeft className="w-4 h-4 shrink-0" />
                <span>Material Masuk (STOK SIAP)</span>
              </button>
              <button
                type="button"
                disabled={isImporting}
                onClick={() => onSwitchMode('KELUAR')}
                className={`min-h-[40px] px-3 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  mode === 'KELUAR'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <ArrowUpRight className="w-4 h-4 shrink-0" />
                <span>Material Keluar (TERPAKAI)</span>
              </button>
            </div>
          </div>

          {/* Summary Banner */}
          <div
            className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
              mode === 'MASUK'
                ? 'bg-emerald-50/90 dark:bg-emerald-950/35 border-emerald-200 dark:border-emerald-800/80 text-emerald-950 dark:text-emerald-100'
                : 'bg-amber-50/90 dark:bg-amber-950/35 border-amber-200 dark:border-amber-800/80 text-amber-950 dark:text-amber-100'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <CheckCircle2
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  mode === 'MASUK'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              />
              <div className="space-y-0.5">
                <div className="font-bold">
                  {latestScannedItems.length} SN Telah Masuk ke Kolom List Siap Import Spreadsheet
                </div>
                <p className="text-[11px] opacity-90 leading-relaxed">
                  {mode === 'MASUK'
                    ? 'Klik tombol Import di bawah untuk memasukkan deretan SN ini ke Sheet "MATERIAL_MASUK" dengan status STOK SIAP.'
                    : 'Klik tombol Import di bawah untuk mengubah status SN ini menjadi TERPAKAI pada "MATERIAL_MASUK" & mencatat ke "EKSEKUSI_MIMS".'}
                </p>
              </div>
            </div>
            <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 shrink-0 tabular-nums">
              Siap: {importCount} SN
            </span>
          </div>

          {alreadyTerpakaiItems.length > 0 && mode === 'KELUAR' && (
            <div className="p-3 rounded-xl bg-red-50/90 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-2.5 text-xs text-red-900 dark:text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">
                  Peringatan: {alreadyTerpakaiItems.length} SN sudah berstatus TERPAKAI sebelumnya.
                </span>{' '}
                <span>
                  Jika Anda ingin mengaktifkan kembali SN tersebut menjadi STOK SIAP, pilih tombol{' '}
                  <strong>Material Masuk (STOK SIAP)</strong> di atas.
                </span>
              </div>
            </div>
          )}

          {/* Scrollable List of Scanned SNs (1 to 20+) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Daftar Urutan Serial Number (SN) Ter-scan:</span>
              <span className="font-mono text-[11px] text-slate-500">
                {latestScannedItems.length} Baris SN
              </span>
            </div>

            <div className="max-h-[38vh] overflow-y-auto space-y-2 pr-1">
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
                                  ? `Baris #${item.rowNumber} · Siap Diimport ke MATERIAL_MASUK (STOK SIAP)`
                                  : 'Baris Baru · Siap Diimport ke MATERIAL_MASUK (STOK SIAP)'
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
                      title="Hapus SN ini dari Kolom List Siap Import"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions — Primary Import Button Always Active & Prominent */}
        <div className="p-4 sm:px-5 sm:py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900 space-y-2.5">
          <button
            type="button"
            disabled={isImporting}
            onClick={() => onImportNow(mode)}
            className={`w-full min-h-[48px] px-5 py-3 text-xs sm:text-sm font-bold text-white rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm ${
              mode === 'MASUK'
                ? 'bg-emerald-600 hover:bg-emerald-700'
                : 'bg-amber-600 hover:bg-amber-700'
            } disabled:opacity-50`}
          >
            {isImporting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                <span>Mengimport Data ke Spreadsheet...</span>
              </>
            ) : (
              <>
                <FileSpreadsheet className="w-5 h-5 shrink-0" />
                <span>
                  {mode === 'MASUK'
                    ? `Import Sekarang (${importCount} SN) ke MATERIAL_MASUK — Status: STOK SIAP`
                    : `Import Sekarang (${importCount} SN) Keluar — Status: TERPAKAI & MIMS`}
                </span>
              </>
            )}
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={isImporting}
              onClick={onScanMoreCamera}
              className="min-h-[42px] px-3.5 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-xl flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Camera className="w-4 h-4 shrink-0" />
              <span>Scan QR Lagi</span>
            </button>

            <button
              type="button"
              disabled={isImporting}
              onClick={onClose}
              className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 rounded-xl transition-colors whitespace-nowrap"
            >
              Lihat Kolom List ({importCount} SN)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
