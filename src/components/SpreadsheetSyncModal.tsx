import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Download,
  RefreshCw,
  X,
  RotateCcw,
  Plus,
  Upload,
  FolderOpen,
  ExternalLink,
  LogOut,
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy,
  Check,
  Smartphone,
  ShieldAlert,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  DriveSpreadsheetFile,
  SpreadsheetMetadata,
  extractSpreadsheetId,
  listDriveSpreadsheets,
  getSpreadsheetMetadata,
  initializeAndFormatEmptySpreadsheet,
  isTeknikSpreadsheetTitle,
  detectBrowserEnvironment,
  FIREBASE_PROJECT_ID,
  OAUTH_CLIENT_ID,
  FIREBASE_AUTH_DOMAINS_URL,
  GCP_OAUTH_CLIENTS_URL,
  GCP_OAUTH_CONSENT_AUDIENCE_URL,
} from '../services/googleWorkspace';

interface SpreadsheetSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  sheetConfig: {
    spreadsheetName: string;
    sheetName: string;
    mimsSheetName?: string;
    gid: string;
    googleSheetUrl: string;
    lastSyncedAt: string;
  };
  totalRows: number;
  mimsRowsCount: number;
  googleUser: User | null;
  accessToken: string | null;
  needsAuth: boolean;
  isSigningIn: boolean;
  authDomainError?: string | null;
  connectedSheet: SpreadsheetMetadata | null;
  selectedSheetTab: string;
  onSelectSheetTab: (tabTitle: string) => void;
  onGoogleLogin: () => Promise<void>;
  onDirectGisLogin?: () => Promise<void>;
  onGoogleLogout: () => Promise<void>;
  onConnectSpreadsheet: (meta: SpreadsheetMetadata, tabTitle: string) => void;
  onPullFromGoogleSheet: (
    spreadsheetId: string,
    tabTitle: string,
    title: string,
    url: string
  ) => Promise<void>;
  onRequestOverwriteGoogleSheet: (
    spreadsheetId: string,
    tabTitle: string,
    title: string
  ) => void;
  onRequestSyncMimsSheet: (spreadsheetId: string, title: string) => void;
  onRequestCreateNewGoogleSheet: (newTitle: string) => void;
  onSyncUrl: (url: string) => Promise<void>;
  onResetData: () => Promise<void>;
}

export const SpreadsheetSyncModal: React.FC<SpreadsheetSyncModalProps> = ({
  isOpen,
  onClose,
  sheetConfig,
  totalRows,
  mimsRowsCount,
  googleUser,
  accessToken,
  needsAuth,
  isSigningIn,
  authDomainError,
  connectedSheet,
  selectedSheetTab,
  onSelectSheetTab,
  onGoogleLogin,
  onDirectGisLogin,
  onGoogleLogout,
  onConnectSpreadsheet,
  onPullFromGoogleSheet,
  onRequestOverwriteGoogleSheet,
  onRequestSyncMimsSheet,
  onRequestCreateNewGoogleSheet,
  onSyncUrl,
  onResetData,
}) => {
  const [urlInput, setUrlInput] = useState(sheetConfig.googleSheetUrl || '');
  const [newSheetTitle, setNewSheetTitle] = useState('LOGISTIK SINJAI');
  const [driveFiles, setDriveFiles] = useState<DriveSpreadsheetFile[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [isInspectingSheet, setIsInspectingSheet] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showDomainHelper, setShowDomainHelper] = useState<boolean>(false);
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);

  const browserEnv = detectBrowserEnvironment();
  const currentHostname = browserEnv.currentHostname;
  const currentOrigin = browserEnv.currentOrigin;
  const recommendedDomains = Array.from(
    new Set(
      [
        currentHostname,
        'ais-pre-g4euqkdwgi6vuxxz4t7zwz-898819267110.asia-southeast1.run.app',
        'ais-dev-g4euqkdwgi6vuxxz4t7zwz-898819267110.asia-southeast1.run.app',
      ].filter(Boolean)
    )
  );

  useEffect(() => {
    if (authDomainError) {
      setShowDomainHelper(true);
    }
  }, [authDomainError]);

  useEffect(() => {
    if (isOpen && accessToken && !needsAuth) {
      loadDriveFiles(accessToken);
    }
  }, [isOpen, accessToken, needsAuth]);

  const loadDriveFiles = async (token: string) => {
    setIsLoadingDrive(true);
    setLocalError(null);
    try {
      const files = await listDriveSpreadsheets(token);
      setDriveFiles(files);
    } catch (err: any) {
      setLocalError(err?.message || 'Gagal memuat file Google Spreadsheet dari Google Drive.');
    } finally {
      setIsLoadingDrive(false);
    }
  };

  if (!isOpen) return null;

  const handleCopyDomain = async (domain: string) => {
    try {
      await navigator.clipboard.writeText(domain);
      setCopiedDomain(domain);
      setTimeout(() => setCopiedDomain(null), 2500);
    } catch {
      // ignore clipboard error
    }
  };

  const handleInspectSpreadsheetId = async (idOrUrl: string) => {
    const sheetId = extractSpreadsheetId(idOrUrl);
    if (!sheetId) {
      setLocalError('Masukkan Link Google Spreadsheet atau ID yang valid.');
      return;
    }
    if (!accessToken) {
      await onSyncUrl(idOrUrl);
      return;
    }

    setIsInspectingSheet(true);
    setLocalError(null);
    try {
      const preMeta = await getSpreadsheetMetadata(accessToken, sheetId);
      if (isTeknikSpreadsheetTitle(preMeta.title)) {
        setLocalError(
          `Spreadsheet "${preMeta.title}" adalah sumber data untuk Menu Yantek & Realisasi HVB. Untuk Menu Logistik, silakan gunakan Spreadsheet "LOGISTIK SINJAI".`
        );
        return;
      }
      const meta = await initializeAndFormatEmptySpreadsheet(accessToken, sheetId).catch(() =>
        preMeta
      );
      const preferredTab =
        meta.sheets.find(
          (s) =>
            s.title.toUpperCase() === 'MATERIAL_MASUK' ||
            s.title.toUpperCase() === 'MATERIAL'
        )?.title ||
        meta.sheets.find((s) => s.sheetId === 0)?.title ||
        meta.sheets[0]?.title ||
        'MATERIAL_MASUK';
      onConnectSpreadsheet(meta, preferredTab);
      setUrlInput(meta.spreadsheetUrl);
    } catch (err: any) {
      setLocalError(err?.message || 'Gagal membaca atau memformat Google Spreadsheet.');
    } finally {
      setIsInspectingSheet(false);
    }
  };

  const handlePullRows = async () => {
    if (!connectedSheet) return;
    setIsPulling(true);
    setLocalError(null);
    try {
      await onPullFromGoogleSheet(
        connectedSheet.spreadsheetId,
        selectedSheetTab,
        connectedSheet.title,
        connectedSheet.spreadsheetUrl
      );
    } catch (err: any) {
      setLocalError(err?.message || 'Gagal menarik data dari Google Sheets.');
    } finally {
      setIsPulling(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await onResetData();
      onClose();
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 pb-[calc(env(safe-area-inset-bottom,0px)+68px)] sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[82vh] sm:max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Grab Handle */}
        <div className="sm:hidden pt-2.5 pb-1">
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
        </div>

        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              Integrasi &amp; Format Otomatis Spreadsheet &quot;LOGISTIK_SINJAI&quot;
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-xl transition-colors shrink-0"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Info Banner on 3-Sheet Architecture for Empty LOGISTIK_SINJAI */}
          <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/70 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 font-bold text-amber-950 dark:text-amber-200">
              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Format Otomatis 3 Sheet pada Spreadsheet Kosong &quot;LOGISTIK_SINJAI&quot;
              </span>
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Saat menghubungkan file <code className="font-mono font-bold">LOGISTIK_SINJAI</code>{' '}
              yang masih berupa <strong>sheet kosong</strong>, aplikasi otomatis menyesuaikan nama
              tab &amp; header kolom sesuai inputan aplikasi:{' '}
              <code className="font-mono font-bold">MATERIAL_MASUK</code> (gid=0 · Kolom A–O untuk
              Menu Masuk Scan &amp; Manual),{' '}
              <code className="font-mono font-bold">MATERIAL_KELUAR</code> (gid=164626621 · Kolom
              A–R untuk Menu Keluar Scan &amp; Manual), dan{' '}
              <code className="font-mono font-bold">REKAP_STOK</code> (gid=164626622 · Kolom A–G
              untuk Menu Rekap Stok).
            </p>
          </div>

          {/* Google Workspace Authentication Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Koneksi Akun Google Workspace (Sheets &amp; Drive API)</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {googleUser && accessToken && !needsAuth
                    ? `Terhubung sebagai ${googleUser.displayName || googleUser.email} (${googleUser.email}). Mendukung penulisan otomatis ke Sheet MATERIAL_MASUK (gid=0) & MATERIAL_KELUAR (gid=164626621).`
                    : 'Masuk dengan Google untuk menyinkronkan Sheet MATERIAL_MASUK & MATERIAL_KELUAR (gid=164626621) langsung ke Google Spreadsheet Anda.'}
                </p>
              </div>

              {googleUser && accessToken && !needsAuth ? (
                <button
                  type="button"
                  onClick={onGoogleLogout}
                  className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 rounded-xl flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Keluar Akun</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={onGoogleLogin}
                    disabled={isSigningIn}
                    className="gsi-material-button shrink-0"
                  >
                    <div className="gsi-material-button-state"></div>
                    <div className="gsi-material-button-content-wrapper">
                      <div className="gsi-material-button-icon">
                        <svg
                          version="1.1"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 48 48"
                          xmlnsXlink="http://www.w3.org/1999/xlink"
                          style={{ display: 'block' }}
                        >
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          ></path>
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          ></path>
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          ></path>
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          ></path>
                          <path fill="none" d="M0 0h48v48H0z"></path>
                        </svg>
                      </div>
                      <span className="gsi-material-button-contents">
                        {isSigningIn ? 'Menghubungkan...' : 'Sign in with Google'}
                      </span>
                      <span style={{ display: 'none' }}>Sign in with Google</span>
                    </div>
                  </button>

                  {onDirectGisLogin && (
                    <button
                      type="button"
                      onClick={onDirectGisLogin}
                      disabled={isSigningIn}
                      className="min-h-[40px] px-3 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Smartphone className="w-3.5 h-3.5 shrink-0" />
                      <span>Login Mode Mobile (OAuth Langsung)</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {(!googleUser || needsAuth) && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/70 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowDomainHelper((prev) => !prev)}
                  className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1.5"
                >
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {showDomainHelper
                      ? 'Sembunyikan Solusi Error auth/unauthorized-domain di HP'
                      : 'Muncul Error "Firebase: Error (auth/unauthorized-domain)" saat Login di HP? Klik di sini'}
                  </span>
                </button>
              </div>
            )}

            {/* Mobile OAuth 2.0 Diagnostic & Fix Card */}
            {showDomainHelper && (
              <div className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-bold text-amber-950 dark:text-amber-100">
                      Solusi Error Kebijakan OAuth 2.0 Google / Unauthorized Domain di HP:
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      Jika petugas di HP melihat pesan{' '}
                      <em>&quot;Akses diblokir: tidak mematuhi kebijakan OAuth 2.0 Google&quot;</em>:
                      pastikan link dibuka di <strong>Chrome/Safari</strong> (bukan browser dalam
                      WhatsApp/Telegram), lalu daftarkan Origin &amp; Domain berikut pada project{' '}
                      <code className="font-mono font-bold">{FIREBASE_PROJECT_ID}</code>:
                    </p>
                  </div>
                </div>

                {browserEnv.isInAppBrowser && (
                  <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100 space-y-2">
                    <div className="font-bold">
                      Terdeteksi Browser Dalam Aplikasi ({browserEnv.inAppName})
                    </div>
                    <p className="text-[11px]">
                      Google OAuth 2.0 memblokir WebView. Buka aplikasi ini di Google Chrome /
                      Safari.
                    </p>
                    {browserEnv.chromeIntentUrl && (
                      <a
                        href={browserEnv.chromeIntentUrl}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-[#0b4f6c] rounded-lg"
                      >
                        <span>Buka di Google Chrome</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}

                {/* Step 1: Copy Origin for Google Cloud Credentials */}
                {currentOrigin && (
                  <div className="space-y-1.5">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      1. Salin Origin URL untuk Google Cloud OAuth Client (
                      <code className="font-mono text-[10px]">{OAUTH_CLIENT_ID}</code>):
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700">
                      <code className="font-mono text-[11px] text-slate-800 dark:text-slate-200 truncate">
                        {currentOrigin}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyDomain(currentOrigin)}
                        className="min-h-[32px] px-2.5 py-1 text-[11px] font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 rounded-lg flex items-center gap-1 shrink-0"
                      >
                        {copiedDomain === currentOrigin ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin Origin</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <a
                        href={GCP_OAUTH_CLIENTS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[36px] px-3 py-1.5 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Authorized JavaScript Origins</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                      <a
                        href={GCP_OAUTH_CONSENT_AUDIENCE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[36px] px-3 py-1.5 text-[11px] font-bold text-amber-950 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Publish App / Test Users</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    </div>
                  </div>
                )}

                {/* Step 2: Copy Domain(s) for Firebase Auth */}
                <div className="space-y-1.5">
                  <div className="font-semibold text-slate-900 dark:text-white">
                    2. Salin Hostname untuk Firebase Console → Authorized Domains:
                  </div>
                  <div className="space-y-1.5">
                    {recommendedDomains.map((dom) => (
                      <div
                        key={dom}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700"
                      >
                        <code className="font-mono text-[11px] text-slate-800 dark:text-slate-200 truncate">
                          {dom}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyDomain(dom)}
                          className="min-h-[32px] px-2.5 py-1 text-[11px] font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 rounded-lg flex items-center gap-1 shrink-0"
                        >
                          {copiedDomain === dom ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Tersalin</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Salin Domain</span>
                            </>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                  <a
                    href={FIREBASE_AUTH_DOMAINS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full min-h-[38px] px-3.5 py-2 text-xs font-bold text-amber-950 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>Buka Firebase Auth Settings ({FIREBASE_PROJECT_ID})</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>

                {/* Step 3: Alternative Without Login */}
                <div className="pt-2 border-t border-amber-200/80 dark:border-amber-800/60 text-[11px] text-slate-700 dark:text-slate-300">
                  <strong>Tips Petugas Lapangan:</strong> Jika Admin sudah login di laptop pada URL
                  server yang sama, perangkat HP otomatis memakai sesi server aktif. Anda juga
                  dapat langsung menempelkan <strong>Link Google Spreadsheet</strong> di bawah.
                </div>
              </div>
            )}
          </div>

          {(localError || authDomainError) && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-start gap-2.5 text-xs text-red-900 dark:text-red-200">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{localError || authDomainError}</span>
            </div>
          )}

          {/* Connected Google Sheet Active Box */}
          {connectedSheet && (
            <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-emerald-950 dark:text-emerald-100 truncate">
                    Terhubung: {connectedSheet.title}
                  </span>
                </div>
                <a
                  href={connectedSheet.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 underline flex items-center gap-1"
                >
                  <span>Buka di Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Pilih Sheet (Tab) Utama:
                  </label>
                  <select
                    value={selectedSheetTab}
                    onChange={(e) => onSelectSheetTab(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    {connectedSheet.sheets.map((s) => (
                      <option key={s.sheetId} value={s.title}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handlePullRows}
                    disabled={isPulling}
                    className="min-h-[42px] px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPulling ? 'animate-spin' : ''}`} />
                    <span>Muat Baris</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onRequestOverwriteGoogleSheet(
                        connectedSheet.spreadsheetId,
                        selectedSheetTab,
                        connectedSheet.title
                      )
                    }
                    className="min-h-[42px] px-3 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Kirim MATERIAL_MASUK</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-emerald-200/70 dark:border-emerald-800/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  Format Sheet Kosong (<code className="font-mono font-bold">MATERIAL_MASUK</code>,{' '}
                  <code className="font-mono font-bold">MATERIAL_KELUAR</code>,{' '}
                  <code className="font-mono font-bold">REKAP_STOK</code>):
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleInspectSpreadsheetId(connectedSheet.spreadsheetId)}
                    disabled={isInspectingSheet}
                    className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isInspectingSheet ? 'animate-spin' : ''}`} />
                    <span>Format 3 Sheet Sesuai Input Aplikasi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onRequestSyncMimsSheet(connectedSheet.spreadsheetId, connectedSheet.title)
                    }
                    className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Kirim MATERIAL_KELUAR ({mimsRowsCount})</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Create New Google Spreadsheet or Pick from Google Drive when authenticated */}
          {accessToken && !needsAuth && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Create New Spreadsheet in Drive */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-emerald-600" />
                  <span>Buat Spreadsheet Baru (3 Sheet Lengkap)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Membuat file Google Spreadsheet baru dengan Tab{' '}
                  <code className="font-mono">MATERIAL_MASUK</code> (gid=0 · {totalRows} baris),{' '}
                  <code className="font-mono">MATERIAL_KELUAR</code> (gid=164626621 · {mimsRowsCount} baris), &amp;{' '}
                  <code className="font-mono">REKAP_STOK</code> (gid=164626622).
                </p>
                <input
                  type="text"
                  value={newSheetTitle}
                  onChange={(e) => setNewSheetTitle(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                  placeholder="Nama File Spreadsheet Baru"
                />
                <button
                  type="button"
                  onClick={() => onRequestCreateNewGoogleSheet(newSheetTitle)}
                  className="w-full min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat File di Google Sheets</span>
                </button>
              </div>

              {/* Pick Existing Spreadsheet from Google Drive */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <FolderOpen className="w-4 h-4 text-sky-600" />
                    <span>Pilih dari Google Drive Anda</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadDriveFiles(accessToken)}
                    disabled={isLoadingDrive}
                    className="text-[11px] font-semibold text-sky-600 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingDrive ? 'animate-spin' : ''}`} />
                    <span>Segarkan</span>
                  </button>
                </div>

                {isLoadingDrive ? (
                  <div className="text-xs text-slate-500 py-4 text-center">
                    Memuat daftar Spreadsheet dari Google Drive...
                  </div>
                ) : (() => {
                  const logistikCandidates = driveFiles.filter(
                    (f) => !isTeknikSpreadsheetTitle(f.name)
                  );
                  if (logistikCandidates.length === 0) {
                    return (
                      <div className="text-xs text-slate-500 py-4 text-center">
                        Belum ada file Google Spreadsheet Logistik yang ditemukan di Drive.
                      </div>
                    );
                  }
                  return (
                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                      {logistikCandidates.map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          onClick={() => handleInspectSpreadsheetId(file.id)}
                          className="w-full p-2.5 text-left rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-sky-500 transition-colors flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {file.name}
                          </span>
                          <span className="text-[11px] font-semibold text-sky-600 shrink-0">
                            Hubungkan
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Link Google Spreadsheet URL / ID */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleInspectSpreadsheetId(urlInput);
            }}
            className="space-y-2"
          >
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
              Hubungkan via Link / ID Google Spreadsheet
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
                className="flex-1 min-h-[44px] px-3.5 py-2.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
              />
              <button
                type="submit"
                disabled={isInspectingSheet}
                className="min-h-[44px] px-4 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${isInspectingSheet ? 'animate-spin' : ''}`} />
                <span>Hubungkan Sheet</span>
              </button>
            </div>
          </form>

          {/* Actions Footer */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <a
                href="/api/export/csv"
                download="LOGISTIK_SINJAI_MATERIAL_MASUK.csv"
                className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Unduh CSV MATERIAL_MASUK</span>
              </a>
              <a
                href="/api/export/eksekusi-mims-csv"
                download="LOGISTIK_SINJAI_MATERIAL_KELUAR.csv"
                className="min-h-[44px] px-3.5 py-2 text-xs font-semibold text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Unduh CSV MATERIAL_KELUAR ({mimsRowsCount})</span>
              </a>
              <button
                type="button"
                onClick={handleReset}
                disabled={isResetting}
                className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Awal</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 sm:bg-transparent rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
