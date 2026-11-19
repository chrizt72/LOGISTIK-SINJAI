import React, { useState } from 'react';
import { FileSpreadsheet, AlertTriangle, Check, X, RefreshCw } from 'lucide-react';
import { MaterialRow } from '../types/warehouse';

export interface PendingSheetsMutation {
  type: 'CREATE_NEW_SHEET' | 'OVERWRITE_SHEET' | 'APPEND_INBOUND' | 'UPDATE_OUTBOUND';
  title: string;
  description: string;
  spreadsheetTitle: string;
  sheetTabName: string;
  affectedRows: MaterialRow[];
  totalCount: number;
  onConfirm: () => Promise<void>;
}

interface GoogleSheetsConfirmModalProps {
  mutation: PendingSheetsMutation | null;
  onCancel: () => void;
}

export const GoogleSheetsConfirmModal: React.FC<GoogleSheetsConfirmModalProps> = ({
  mutation,
  onCancel,
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  if (!mutation) return null;

  const handleConfirm = async () => {
    setIsExecuting(true);
    setExecError(null);
    try {
      await mutation.onConfirm();
    } catch (err: any) {
      setExecError(
        err?.message || 'Gagal menulis data ke Google Sheets. Pastikan Anda sudah login Google.'
      );
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 pb-[calc(env(safe-area-inset-bottom,0px)+68px)] sm:p-4"
      onClick={() => !isExecuting && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[82vh] sm:max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1">
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              Konfirmasi Perubahan Google Sheets
            </h3>
          </div>
          <button
            type="button"
            disabled={isExecuting}
            onClick={onCancel}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 rounded-xl transition-colors shrink-0"
            aria-label="Batal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {execError && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-900 dark:text-red-200 font-semibold">
              {execError}
            </div>
          )}
          <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-950 dark:text-amber-100">
              <div className="font-bold">{mutation.title}</div>
              <p className="leading-relaxed opacity-90">{mutation.description}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Target File Google Drive:</span>
              <span className="font-semibold text-slate-900 dark:text-white truncate">
                {mutation.spreadsheetTitle}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Nama Sheet (Tab):</span>
              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                {mutation.sheetTabName}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">Jumlah Baris Terdampak:</span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {mutation.totalCount.toLocaleString('id-ID')} Baris
              </span>
            </div>
          </div>

          {mutation.affectedRows.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Rincian Item yang Akan Diperbarui di Google Sheets:
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {mutation.affectedRows.slice(0, 8).map((row) => (
                  <div
                    key={row.snMaterial}
                    className="p-2.5 rounded-lg bg-slate-100/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs font-mono"
                  >
                    <div className="min-w-0 truncate">
                      <span className="text-slate-500">#{row.rowNumber}</span>{' '}
                      <span className="font-bold text-slate-900 dark:text-white">
                        {row.snMaterial}
                      </span>
                    </div>
                    <span
                      className={`font-bold shrink-0 ${
                        row.status === 'TERPAKAI'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      Status: {row.status}
                    </span>
                  </div>
                ))}
                {mutation.affectedRows.length > 8 && (
                  <div className="text-[11px] font-mono text-slate-500 text-center py-1">
                    ...dan {(mutation.affectedRows.length - 8).toLocaleString('id-ID')} baris
                    lainnya
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={isExecuting}
              onClick={onCancel}
              className="min-h-[46px] px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isExecuting}
              onClick={handleConfirm}
              className="min-h-[46px] px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Menyimpan ke Google Sheets...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Konfirmasi &amp; Perbarui Google Sheets</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
