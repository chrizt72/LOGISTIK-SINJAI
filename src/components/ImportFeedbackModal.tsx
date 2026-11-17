import React from 'react';
import {
  CheckCircle2,
  FileSpreadsheet,
  ExternalLink,
  Camera,
  Download,
  RefreshCw,
  AlertCircle,
  X,
  ArrowRight,
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
  onViewInSpreadsheetTable: () => void;
  onScanAgain: () => void;
  onOpenGoogleSyncModal: () => void;
  onRetryGoogleSheetSync?: () => void;
}

export const ImportFeedbackModal: React.FC<ImportFeedbackModalProps> = ({
  feedback,
  onClose,
  onViewInSpreadsheetTable,
  onScanAgain,
  onOpenGoogleSyncModal,
  onRetryGoogleSheetSync,
}) => {
  if (!feedback || !feedback.isOpen) return null;

  const isInbound = feedback.mode === 'MASUK';
  const count = feedback.importedRows.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-xs p-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:p-4"
      onClick={onClose}
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
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isInbound
              ? 'bg-emerald-600 text-white border-emerald-700'
              : 'bg-amber-600 text-white border-amber-700'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider opacity-90">
                {isInbound
                  ? 'IMPORT MATERIAL MASUK BERHASIL'
                  : 'IMPORT MATERIAL KELUAR BERHASIL'}
              </div>
              <h3 className="text-base sm:text-lg font-bold truncate">
                {count} SN Berhasil Masuk ke Spreadsheet!
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
          {/* Summary Stats Strip */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">
                Jumlah Diimport
              </div>
              <div className="text-base sm:text-lg font-mono font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {count} Baris SN
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">
                Sheet Tujuan
              </div>
              <div className="text-xs sm:text-sm font-mono font-bold text-sky-700 dark:text-sky-300 mt-1 truncate">
                {isInbound ? 'MATERIAL_MASUK' : 'MATERIAL_MASUK & MIMS'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">
                Status Keterangan
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

          {/* Google Sheets Live Sync Status Card */}
          {feedback.googleSheetSyncStatus === 'SYNCING' && (
            <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 flex items-center gap-3 text-xs text-sky-950 dark:text-sky-100">
              <RefreshCw className="w-5 h-5 text-sky-600 animate-spin shrink-0" />
              <div>
                <div className="font-bold">Menyinkronkan Otomatis ke Google Sheets...</div>
                <p className="text-[11px] opacity-85 mt-0.5">
                  Menulis {count} baris SN langsung ke file Google Spreadsheet Anda.
                </p>
              </div>
            </div>
          )}

          {feedback.googleSheetSyncStatus === 'SYNCED' && (
            <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5 text-emerald-950 dark:text-emerald-100">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">
                    Tersimpan Otomatis ke Google Sheets: &quot;{feedback.googleSheetTitle}&quot;
                  </div>
                  <p className="text-[11px] opacity-90 mt-0.5">
                    Tab <code className="font-mono font-bold">{feedback.googleSheetTab}</code>
                    {!isInbound && ' & Tab EKSEKUSI_MIMS'} telah diperbarui secara real-time.
                  </p>
                </div>
              </div>
              {feedback.googleSheetUrl && (
                <a
                  href={feedback.googleSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[38px] px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap"
                >
                  <span>Buka Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {feedback.googleSheetSyncStatus === 'NOT_CONNECTED' && (
            <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800 space-y-2.5 text-xs">
              <div className="flex items-start gap-2.5 text-amber-950 dark:text-amber-100">
                <FileSpreadsheet className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">
                    Data Telah Masuk ke Tabel Spreadsheet Aplikasi ({count} Baris)
                  </div>
                  <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                    Untuk mengirim otomatis ke akun Google Sheets / Google Drive Anda, hubungkan
                    file Google Spreadsheet Anda atau unduh file CSV di bawah ini:
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenGoogleSyncModal();
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 rounded-xl flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Hubungkan / Kirim ke Google Sheets</span>
                </button>
                <a
                  href={isInbound ? '/api/export/csv' : '/api/export/eksekusi-mims-csv'}
                  download={
                    isInbound
                      ? 'LOGISTIK_SINJAI_MATERIAL_MASUK.csv'
                      : 'LOGISTIK_SINJAI_EKSEKUSI_MIMS.csv'
                  }
                  className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh CSV Spreadsheet</span>
                </a>
              </div>
            </div>
          )}

          {feedback.googleSheetSyncStatus === 'ERROR' && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 space-y-2 text-xs text-red-950 dark:text-red-100">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">
                    Tersimpan di Tabel Aplikasi, Namun Gagal Menulis ke Google Sheets Cloud:
                  </div>
                  <p className="text-[11px] mt-0.5">{feedback.googleSheetError}</p>
                </div>
              </div>
              {onRetryGoogleSheetSync && (
                <button
                  type="button"
                  onClick={onRetryGoogleSheetSync}
                  className="min-h-[36px] px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                >
                  Coba Kirim Ulang ke Google Sheets
                </button>
              )}
            </div>
          )}

          {/* List of Imported Rows */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
              <span>Rincian Baris yang Masuk ke Spreadsheet:</span>
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
                        Baris #{row.rowNumber}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-600 dark:text-slate-300">{row.noMaterial}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">Batch {row.noBatch}</span>
                    </div>
                    <div className="font-bold text-slate-900 dark:text-white break-all mt-0.5">
                      {row.snMaterial}
                    </div>
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
            <span>Scan QR Lagi</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              onViewInSpreadsheetTable();
            }}
            className="min-h-[46px] px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Lihat Baris Baru di Tabel Spreadsheet</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
