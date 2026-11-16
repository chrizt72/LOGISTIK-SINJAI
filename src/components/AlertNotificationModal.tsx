import React from 'react';
import { AlertTriangle, XOctagon, CheckCircle2, X, FileSpreadsheet } from 'lucide-react';
import { MaterialRow } from '../types/warehouse';

export interface SystemAlertState {
  isOpen: boolean;
  severity: 'error-duplicate' | 'error-mismatch' | 'error-notfound' | 'success';
  title: string;
  message: string;
  snMaterial?: string;
  existingRow?: MaterialRow;
  mismatchDetails?: {
    expectedCount: number;
    scannedCount: number;
    difference: number;
  };
  duplicatesList?: {
    snMaterial: string;
    rowNumber?: number;
    status?: string;
    reason: string;
  }[];
}

interface AlertNotificationModalProps {
  alert: SystemAlertState | null;
  onClose: () => void;
}

export const AlertNotificationModal: React.FC<AlertNotificationModalProps> = ({
  alert,
  onClose,
}) => {
  if (!alert || !alert.isOpen) return null;

  const isSuccess = alert.severity === 'success';
  const isMismatch = alert.severity === 'error-mismatch';
  const isDuplicate = alert.severity === 'error-duplicate';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alert-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Bottom Sheet Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1 bg-white dark:bg-slate-900">
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
        </div>

        {/* Top Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isSuccess
              ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/70'
              : isMismatch
              ? 'bg-red-50/90 dark:bg-red-950/50 border-red-200 dark:border-red-800/80'
              : 'bg-amber-50/90 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/80'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {isSuccess ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : isMismatch ? (
              <XOctagon className="w-6 h-6 text-red-600 dark:text-red-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                {isSuccess
                  ? 'Notifikasi Transaksi Gudang'
                  : isMismatch
                  ? 'Peringatan Error — Ketidakcocokan Jumlah'
                  : isDuplicate
                  ? 'Peringatan — Barcode Sudah Pernah Di-scan'
                  : 'Notifikasi Peringatan Sistem'}
              </p>
              <h3
                id="alert-modal-title"
                className={`text-base font-bold leading-snug ${
                  isSuccess
                    ? 'text-emerald-950 dark:text-emerald-100'
                    : isMismatch
                    ? 'text-red-950 dark:text-red-100'
                    : 'text-amber-950 dark:text-amber-100'
                }`}
              >
                {alert.title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-xl transition-colors shrink-0"
            aria-label="Tutup notifikasi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {alert.message}
          </p>

          {/* Details when a Duplicate Barcode was scanned */}
          {alert.snMaterial && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  SN MATERIAL (Kolom B):
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums break-all">
                  {alert.snMaterial}
                </span>
              </div>

              {alert.existingRow && (
                <>
                  <div className="h-px bg-slate-200 dark:bg-slate-700" />
                  <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">
                        Posisi Sheet &quot;MATERIAL&quot;:
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums flex items-center gap-1 mt-0.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                        Baris #{alert.existingRow.rowNumber}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">
                        Status Kolom O:
                      </span>
                      <span
                        className={`font-mono font-bold mt-0.5 block ${
                          alert.existingRow.status === 'STOK TERPAKAI'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {alert.existingRow.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">
                        No. Material &amp; Batch:
                      </span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                        {alert.existingRow.noMaterial} · {alert.existingRow.noBatch}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400 block">
                        Tanggal (Kolom A):
                      </span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                        {alert.existingRow.tanggalHistory}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Details when Quantity Mismatch happens during Outbound */}
          {alert.mismatchDetails && (
            <div className="p-3.5 rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-800/70">
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                    Target Keluar
                  </span>
                  <span className="text-base sm:text-lg font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {alert.mismatchDetails.expectedCount} Unit
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                    Di-scan
                  </span>
                  <span className="text-base sm:text-lg font-mono font-bold text-red-600 dark:text-red-400 tabular-nums">
                    {alert.mismatchDetails.scannedCount} Unit
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                    Selisih
                  </span>
                  <span className="text-base sm:text-lg font-mono font-bold text-red-700 dark:text-red-300 tabular-nums">
                    {alert.mismatchDetails.difference > 0
                      ? `+${alert.mismatchDetails.difference}`
                      : `${alert.mismatchDetails.difference}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Details when multiple duplicates exist */}
          {alert.duplicatesList && alert.duplicatesList.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
              {alert.duplicatesList.map((dup, i) => (
                <div
                  key={i}
                  className="px-3 py-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-slate-50 dark:bg-slate-800/50"
                >
                  <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 break-all">
                    {dup.snMaterial}
                  </span>
                  <span className="text-amber-700 dark:text-amber-400">{dup.reason}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 pb-1">
            <button
              type="button"
              onClick={onClose}
              className={`w-full min-h-[48px] px-5 py-3 text-sm font-semibold rounded-xl transition-transform active:scale-[0.99] whitespace-nowrap shrink-0 ${
                isSuccess
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : isMismatch
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-slate-200 text-white dark:text-slate-900'
              }`}
            >
              Mengerti &amp; Tutup Peringatan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
