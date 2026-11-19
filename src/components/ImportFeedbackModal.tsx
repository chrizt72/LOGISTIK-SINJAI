import React from 'react';
import {
  CheckCircle2,
  Camera,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { MaterialRow, EksekusiMimsRow } from '../types/warehouse';

export interface ImportFeedbackState {
  isOpen: boolean;
  mode: 'MASUK' | 'KELUAR';
  importedRows: MaterialRow[];
  mimsRows?: EksekusiMimsRow[];
  timestamp: string;
  message: string;
  googleSheetSyncStatus: 'IDLE' | 'SYNCING' | 'SYNCED' | 'NOT_CONNECTED' | 'ERROR';
  googleSheetTitle?: string;
  googleSheetTab?: string;
  googleSheetUrl?: string;
  googleSheetError?: string;
}

interface ImportFeedbackModalProps {
  feedback: ImportFeedbackState | null;
  onClose: () => void;
  onViewInSpreadsheetTable: (targetTab?: 'MATERIAL_MASUK' | 'MATERIAL_KELUAR') => void;
  onScanAgain: () => void;
  onOpenGoogleSyncModal: () => void;
  onRetryGoogleSheetSync?: () => void;
}

export const ImportFeedbackModal: React.FC<ImportFeedbackModalProps> = ({
  feedback,
  onClose,
  onScanAgain,
  onRetryGoogleSheetSync,
}) => {
  if (!feedback || !feedback.isOpen) return null;

  const isInbound = feedback.mode === 'MASUK';
  const count = feedback.importedRows.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 pb-[calc(env(safe-area-inset-bottom,0px)+68px)] sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[82vh] sm:max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden pt-2.5 pb-1">
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
        </div>

        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isInbound
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'bg-amber-600 text-white border-amber-700'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              {feedback.googleSheetSyncStatus === 'SYNCING' ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold truncate">
                Data Berhasil Dikirim
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[42px] min-w-[42px] flex items-center justify-center text-white/80 hover:text-white rounded-xl transition-colors shrink-0"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">
                Jumlah Material
              </div>
              <div className="text-base sm:text-lg font-mono font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {count} Unit
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">
                Nama Petugas
              </div>
              <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white mt-1 truncate">
                {feedback.importedRows[0]?.petugas || '-'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">
                Status
              </div>
              <div
                className={`text-xs sm:text-sm font-mono font-bold mt-1 ${
                  isInbound
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {isInbound ? 'STOK SIAP' : 'TERPAKAI'}
              </div>
            </div>
          </div>

          {feedback.googleSheetSyncStatus === 'SYNCING' && (
            <div className="py-4 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-sky-600 animate-spin" />
            </div>
          )}

          {feedback.googleSheetSyncStatus === 'ERROR' && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 space-y-2 text-xs text-red-950 dark:text-red-100">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <p className="text-[11px]">{feedback.googleSheetError}</p>
              </div>
              {onRetryGoogleSheetSync && (
                <button
                  type="button"
                  onClick={onRetryGoogleSheetSync}
                  className="min-h-[36px] px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  Kirim Ulang
                </button>
              )}
            </div>
          )}

          {/* List of Rows */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Rincian Material</span>
              <span className="font-mono text-[11px] text-slate-500">{feedback.timestamp}</span>
            </div>

            <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
              {feedback.importedRows.map((row, idx) => (
                <div
                  key={`${row.snMaterial}-${idx}`}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs font-mono"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="font-bold text-sky-700 dark:text-sky-400">
                        #{idx + 1}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600 dark:text-slate-300">{row.noMaterial}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">Batch {row.noBatch}</span>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white break-all mt-0.5">
                      {row.snMaterial}
                    </div>
                    {row.petugas && (
                      <div className="text-[11px] font-sans text-slate-600 dark:text-slate-400 mt-0.5">
                        Nama Petugas: <span className="font-semibold">{row.petugas}</span>
                      </div>
                    )}
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                      row.status === 'TERPAKAI'
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                        : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="p-4 sm:px-5 sm:py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onScanAgain();
            }}
            className="min-h-[44px] px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Camera className="w-4 h-4 text-sky-600 shrink-0" />
            <span>Scan Lagi</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[46px] px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <span>Selesai</span>
          </button>
        </div>
      </div>
    </div>
  );
};
