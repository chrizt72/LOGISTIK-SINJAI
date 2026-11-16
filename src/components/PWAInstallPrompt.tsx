import React, { useState } from 'react';
import { Download, Smartphone, ExternalLink, X, CheckCircle2, WifiOff } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Automatically hide when already running as an installed standalone PWA
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuideModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className="min-h-[38px] sm:min-h-[40px] px-3 sm:px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs"
        title="Instal Pintasan Aplikasi di Chrome / Layar Utama HP"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Instal Aplikasi</span>
      </button>

      {showGuideModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:p-4"
          onClick={() => setShowGuideModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Grab Handle */}
            <div className="sm:hidden pt-1 pb-1">
              <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
            </div>

            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Instal Pintasan SIMLOG PLN dari Chrome
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 rounded-xl"
                aria-label="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isInIframe && (
              <div className="p-3.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 space-y-2.5 text-xs">
                <p className="text-sky-950 dark:text-sky-100 leading-relaxed">
                  <strong>Buka di Tab Chrome Penuh:</strong> Agar tombol <em>Install App</em> bawaan
                  Google Chrome muncul secara langsung, buka aplikasi ini di tab baru terlebih dahulu:
                </p>
                <a
                  href={typeof window !== 'undefined' ? window.location.href : '/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[44px] px-4 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Buka Aplikasi di Tab Chrome Baru</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}

            {isIOS ? (
              <div className="space-y-2.5 text-xs text-slate-700 dark:text-slate-300">
                <div className="font-bold text-slate-900 dark:text-white">
                  Cara Instal di iPhone / iPad (Safari / Chrome):
                </div>
                <ol className="list-decimal list-inside space-y-2 leading-relaxed">
                  <li>
                    Ketuk ikon <strong>Bagikan (Share)</strong> di bilah navigasi browser.
                  </li>
                  <li>
                    Gulir ke bawah dan pilih <strong>Tambah ke Layar Utama (Add to Home Screen)</strong>.
                  </li>
                  <li>
                    Ketuk <strong>Tambah</strong> di pojok kanan atas untuk membuat pintasan{' '}
                    <strong>SIMLOG PLN</strong>.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Chrome di HP Android:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                    <li>
                      Ketuk ikon <strong>Menu Titik Tiga (⋮)</strong> di pojok kanan atas Google
                      Chrome.
                    </li>
                    <li>
                      Pilih menu <strong>&quot;Tambahkan ke layar utama&quot;</strong> atau{' '}
                      <strong>&quot;Instal aplikasi&quot;</strong>.
                    </li>
                    <li>
                      Ketuk <strong>Instal</strong> — pintasan <strong>SIMLOG PLN</strong> akan
                      muncul di layar utama HP seperti aplikasi native.
                    </li>
                  </ol>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Google Chrome di Laptop / PC:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 leading-relaxed">
                    <li>
                      Klik ikon <strong>Instal SIMLOG PLN</strong> (ikon monitor dengan panah unduh)
                      di sisi kanan kolom URL (Address Bar) Chrome.
                    </li>
                    <li>
                      Klik <strong>Instal</strong> untuk membuat pintasan di Desktop.
                    </li>
                  </ol>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full min-h-[46px] px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Mengerti &amp; Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+82px)] md:bottom-4 left-4 right-4 sm:right-auto z-50 flex items-center gap-2.5 rounded-xl bg-amber-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0 animate-pulse" />
      <span>Mode Offline — Menampilkan data stok gudang tersimpan.</span>
    </div>
  );
};
