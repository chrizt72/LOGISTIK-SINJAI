import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  Search,
  Plus,
  Trash2,
  FileText,
  Share2,
  MapPin,
  AlertCircle,
  Loader2,
  Users,
  User,
  Check,
  X,
  Navigation,
  Zap,
  PlusCircle,
  History,
} from 'lucide-react';
import { TrafoManagementSection } from './TrafoManagementSection';
import {
  YANTEK_PELAKSANA_UNITS,
  YantekDatabaseSegment,
  YantekWorkItemInput,
  YantekRealisasiReport,
} from '../types/warehouse';
import {
  SpreadsheetMetadata,
  extractSpreadsheetId,
  getAccessToken,
  googleSignIn,
  hasValidCachedAccessToken,
  isLogistikSpreadsheetTitle,
  syncYantekReportsToAllTeknikSheets,
} from '../services/googleWorkspace';
import { DEFAULT_TEKNIK_SINJAI_DATA } from '../data/teknikSinjaiDatabase';
import {
  downloadYantekReportPdf,
  shareYantekReportViaWhatsApp,
} from '../utils/yantekPdfExport';
import {
  formatPemeliharaanKms,
  getRealisasiPemeliharaanDetails,
} from '../utils/pemeliharaanCalculation';

interface RealisasiYantekViewProps {
  segments: YantekDatabaseSegment[];
  pekerjaanCatalog: string[];
  reports: YantekRealisasiReport[];
  accessToken: string | null;
  needsAuth: boolean;
  onUpdateDatabaseFromSheet: (
    newSegments: YantekDatabaseSegment[],
    newPekerjaan: string[]
  ) => void;
  onReportCreated: (newReport: YantekRealisasiReport, allReports: YantekRealisasiReport[]) => void;
  onDeleteReport?: (reportId: string) => Promise<void>;
  onTriggerSound?: (kind: 'scan' | 'error' | 'commit') => void;
}

const TEKNIK_SHEET_STORAGE_KEY = 'simlog_sinjai_teknik_sheet_v1';

export const RealisasiYantekView: React.FC<RealisasiYantekViewProps> = ({
  segments,
  pekerjaanCatalog,
  reports,
  accessToken,
  needsAuth,
  onReportCreated,
  onTriggerSound,
}) => {
  // Sub-menu state: Input Realisasi Yantek | Manajemen Trafo | + Sisip Trafo | Riwayat Trafo
  const [activeSubMenu, setActiveSubMenu] = useState<'input' | 'mutasi' | 'sisip' | 'riwayat'>('input');

  // 1. Pilih Pelaksana state
  const [selectedUnit, setSelectedUnit] = useState<string>(YANTEK_PELAKSANA_UNITS[0]);
  const [namaPetugas, setNamaPetugas] = useState<string>('');
  const [tanggalLaporan, setTanggalLaporan] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  // 2. Pilih Segment state + Popup Konfirmasi
  const [segmentQuery, setSegmentQuery] = useState<string>('');
  const [isSegmentDropdownOpen, setIsSegmentDropdownOpen] = useState<boolean>(false);
  const [pendingSegmentForConfirm, setPendingSegmentForConfirm] =
    useState<YantekDatabaseSegment | null>(null);
  const [confirmedSegment, setConfirmedSegment] = useState<YantekDatabaseSegment | null>(
    null
  );

  // 3. Input Pekerjaan + Volume state
  const [pekerjaanQuery, setPekerjaanQuery] = useState<string>('');
  const [isPekerjaanDropdownOpen, setIsPekerjaanDropdownOpen] = useState<boolean>(false);
  const [volumeInput, setVolumeInput] = useState<string>('');
  const [pekerjaanList, setPekerjaanList] = useState<YantekWorkItemInput[]>([]);

  // Koordinat Awal & Akhir + Realisasi WO & P0
  const [koordinatAwal, setKoordinatAwal] = useState<string>('');
  const [koordinatAkhir, setKoordinatAkhir] = useState<string>('');
  const [realisasiWo, setRealisasiWo] = useState<string>('');
  const [realisasiP0, setRealisasiP0] = useState<string>('0');
  const [isLocatingGps, setIsLocatingGps] = useState<'awal' | 'akhir' | null>(null);

  // Submission & Feedback state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [completedReportModal, setCompletedReportModal] =
    useState<YantekRealisasiReport | null>(null);
  const [sheetSyncWarning, setSheetSyncWarning] = useState<string | null>(null);
  const [isRetryingSheetSync, setIsRetryingSheetSync] = useState<boolean>(false);

  const [connectedTeknikSheet, setConnectedTeknikSheet] =
    useState<SpreadsheetMetadata | null>(() => {
      try {
        const raw = localStorage.getItem(TEKNIK_SHEET_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SpreadsheetMetadata;
        if (parsed?.title && isLogistikSpreadsheetTitle(parsed.title)) {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    });
  const [teknikSheetUrlInput, setTeknikSheetUrlInput] = useState<string>(
    connectedTeknikSheet?.spreadsheetUrl || ''
  );

  const namaPetugasInputRef = useRef<HTMLInputElement>(null);
  const pekerjaanInputRef = useRef<HTMLInputElement>(null);
  const volumeInputRef = useRef<HTMLInputElement>(null);
  const lastAutoSyncedCountRef = useRef<number>(-1);

  useEffect(() => {
    try {
      if (connectedTeknikSheet) {
        localStorage.setItem(
          TEKNIK_SHEET_STORAGE_KEY,
          JSON.stringify(connectedTeknikSheet)
        );
      } else {
        localStorage.removeItem(TEKNIK_SHEET_STORAGE_KEY);
      }
    } catch {
      // Ignore storage error
    }
  }, [connectedTeknikSheet]);

  // Background auto-sync to TEKNIK SINJAI when logged in and reports exist
  useEffect(() => {
    let cancelled = false;

    const autoDiscoverAndSyncTeknikSinjai = async () => {
      if (reports.length === 0 || isSubmitting) return;
      const activeToken = (await getAccessToken()) || accessToken;
      if (!activeToken) return;

      if (lastAutoSyncedCountRef.current === reports.length) {
        return;
      }

      try {
        const preferredId =
          connectedTeknikSheet && !isLogistikSpreadsheetTitle(connectedTeknikSheet.title)
            ? connectedTeknikSheet.spreadsheetId
            : extractSpreadsheetId(teknikSheetUrlInput);

        const { primaryMeta } = await syncYantekReportsToAllTeknikSheets(
          activeToken,
          reports,
          preferredId || undefined
        );

        if (cancelled) return;
        lastAutoSyncedCountRef.current = reports.length;
        setConnectedTeknikSheet(primaryMeta);
        setTeknikSheetUrlInput(primaryMeta.spreadsheetUrl);
        setSheetSyncWarning(null);
      } catch (err) {
        lastAutoSyncedCountRef.current = -1;
        console.warn('Auto-discover TEKNIK SINJAI skipped:', err);
      }
    };

    autoDiscoverAndSyncTeknikSinjai();
    return () => {
      cancelled = true;
    };
  }, [accessToken, needsAuth, reports.length, isSubmitting]);

  const selectableSegments = useMemo(() => {
    const validFromProps = segments.filter(
      (s) =>
        s.rowNumber >= 2 &&
        s.rowNumber <= 203 &&
        Boolean(s.segment.trim()) &&
        !/^(UNIT\s+\d+|UNIT\s+KP|HVB\s+)/i.test(s.segment.trim())
    );
    if (validFromProps.length > 0) {
      return validFromProps;
    }
    return DEFAULT_TEKNIK_SINJAI_DATA.segments.filter(
      (s) => s.rowNumber >= 2 && s.rowNumber <= 203 && Boolean(s.segment.trim())
    );
  }, [segments]);

  const filteredSegments = useMemo(() => {
    const q = segmentQuery.trim().toUpperCase();
    if (!q) return selectableSegments;
    const matches = selectableSegments.filter((s) =>
      s.segment.toUpperCase().includes(q)
    );
    return matches.sort((a, b) => {
      const aStarts = a.segment.toUpperCase().startsWith(q) ? 0 : 1;
      const bStarts = b.segment.toUpperCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.rowNumber - b.rowNumber;
    });
  }, [selectableSegments, segmentQuery]);

  const filteredPekerjaan = useMemo(() => {
    const q = pekerjaanQuery.trim().toUpperCase();
    if (!q) return pekerjaanCatalog;
    return pekerjaanCatalog.filter((p) => p.toUpperCase().includes(q));
  }, [pekerjaanCatalog, pekerjaanQuery]);

  const handleSelectSegmentCandidate = (seg: YantekDatabaseSegment) => {
    setSegmentQuery(seg.segment);
    setIsSegmentDropdownOpen(false);
    setFormError(null);
    setPendingSegmentForConfirm(seg);
  };

  const handleManualSegmentTrigger = () => {
    const q = segmentQuery.trim().toUpperCase();
    if (!q) {
      setFormError('Silakan ketik atau pilih nama Segment terlebih dahulu.');
      setIsSegmentDropdownOpen(true);
      return;
    }
    const exactMatch =
      selectableSegments.find((s) => s.segment.toUpperCase() === q) ||
      filteredSegments[0];
    if (!exactMatch) {
      setFormError(
        `Segment "${segmentQuery.trim()}" tidak ditemukan. Silakan pilih Segment dari daftar yang tersedia.`
      );
      setIsSegmentDropdownOpen(true);
      return;
    }
    setIsSegmentDropdownOpen(false);
    setFormError(null);
    setPendingSegmentForConfirm(exactMatch);
  };

  const handleConfirmSegmentAndUnit = () => {
    if (!pendingSegmentForConfirm) return;
    setConfirmedSegment(pendingSegmentForConfirm);
    setSegmentQuery(pendingSegmentForConfirm.segment);
    setPendingSegmentForConfirm(null);
    setFormError(null);
    if (onTriggerSound) onTriggerSound('scan');

    setTimeout(() => {
      pekerjaanInputRef.current?.focus();
    }, 120);
  };

  const handleAddPekerjaanItem = () => {
    const cleanPekerjaan = pekerjaanQuery.trim();
    const numericVol = Number(volumeInput);

    if (!cleanPekerjaan) {
      setFormError('Silakan pilih atau ketik Detail Pekerjaan terlebih dahulu.');
      pekerjaanInputRef.current?.focus();
      return;
    }
    if (!Number.isFinite(numericVol) || numericVol <= 0) {
      setFormError('Volume harus diisi dengan angka lebih dari 0.');
      volumeInputRef.current?.focus();
      return;
    }

    setPekerjaanList((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.detailPekerjaan.trim().toUpperCase() === cleanPekerjaan.toUpperCase()
      );
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          volume: numericVol,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: `PKJ-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          detailPekerjaan: cleanPekerjaan,
          volume: numericVol,
        },
      ];
    });
    setPekerjaanQuery('');
    setVolumeInput('');
    setIsPekerjaanDropdownOpen(false);
    setFormError(null);
    if (onTriggerSound) onTriggerSound('scan');

    setTimeout(() => {
      pekerjaanInputRef.current?.focus();
    }, 80);
  };

  const handleRemovePekerjaanItem = (id: string) => {
    setPekerjaanList((prev) => prev.filter((item) => item.id !== id));
  };

  const handleGetGpsCoordinate = (target: 'awal' | 'akhir') => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setFormError('Browser tidak mendukung fitur GPS otomatis. Silakan ketik koordinat.');
      return;
    }
    setIsLocatingGps(target);
    setFormError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coordStr = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(
          6
        )}`;
        if (target === 'awal') {
          setKoordinatAwal(coordStr);
        } else {
          setKoordinatAkhir(coordStr);
        }
        setIsLocatingGps(null);
      },
      () => {
        setIsLocatingGps(null);
        setFormError(
          'Gagal mengambil titik GPS otomatis. Pastikan izin lokasi aktif atau ketik secara manual.'
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const syncSingleReportToTeknikSheet = async (
    reportToSync: YantekRealisasiReport,
    allReportsList: YantekRealisasiReport[] = reports,
    overrideToken?: string | null
  ): Promise<boolean> => {
    const combinedReports = [
      reportToSync,
      ...allReportsList.filter((r) => r.id !== reportToSync.id),
    ];

    const activeToken = overrideToken || (await getAccessToken()) || accessToken;
    if (!activeToken) {
      lastAutoSyncedCountRef.current = -1;
      setSheetSyncWarning(
        'Sesi Google berakhir. Klik tombol "Sinkronkan ke Spreadsheet" di bawah untuk mengirim laporan ke Sheet YANTEK (gid=896667653).'
      );
      return false;
    }

    const preferredId =
      connectedTeknikSheet && !isLogistikSpreadsheetTitle(connectedTeknikSheet.title)
        ? connectedTeknikSheet.spreadsheetId
        : extractSpreadsheetId(teknikSheetUrlInput);

    try {
      const { primaryMeta } = await syncYantekReportsToAllTeknikSheets(
        activeToken,
        combinedReports,
        preferredId || undefined
      );

      lastAutoSyncedCountRef.current = combinedReports.length;
      setConnectedTeknikSheet(primaryMeta);
      setTeknikSheetUrlInput(primaryMeta.spreadsheetUrl);
      setSheetSyncWarning(null);
      return true;
    } catch (sheetErr) {
      lastAutoSyncedCountRef.current = -1;
      console.warn('Sync Yantek warning:', sheetErr);
      setSheetSyncWarning(
        'Laporan tersimpan di aplikasi, namun sesi Google perlu disegarkan. Klik tombol "Sinkronkan ke Spreadsheet" di bawah untuk mengirim ke Sheet YANTEK (gid=896667653).'
      );
      return false;
    }
  };

  const handleRetrySyncFromModal = async () => {
    if (!completedReportModal || isRetryingSheetSync) return;
    setIsRetryingSheetSync(true);
    try {
      let tokenToUse: string | null = null;
      if (!hasValidCachedAccessToken()) {
        const authRes = await googleSignIn();
        tokenToUse = authRes?.accessToken || null;
      } else {
        tokenToUse = (await getAccessToken()) || accessToken;
      }
      if (tokenToUse) {
        await syncSingleReportToTeknikSheet(completedReportModal, reports, tokenToUse);
      }
    } catch (err) {
      console.warn('Retry sync Yantek failed:', err);
    } finally {
      setIsRetryingSheetSync(false);
    }
  };

  const handleSubmitLaporanSelesai = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);
    setSheetSyncWarning(null);

    if (!selectedUnit) {
      setFormError('Silakan pilih Unit Pelaksana terlebih dahulu.');
      return;
    }

    if (!namaPetugas.trim()) {
      setFormError('Silakan isi Nama Petugas terlebih dahulu.');
      namaPetugasInputRef.current?.focus();
      return;
    }

    if (!confirmedSegment) {
      if (segmentQuery.trim()) {
        handleManualSegmentTrigger();
      } else {
        setFormError('Silakan pilih dan konfirmasi Segment terlebih dahulu.');
      }
      return;
    }

    const rawPekerjaanList: YantekWorkItemInput[] = [...pekerjaanList];
    const pendingPekerjaan = pekerjaanQuery.trim();
    if (
      pendingPekerjaan &&
      !rawPekerjaanList.some(
        (item) => item.detailPekerjaan.trim().toUpperCase() === pendingPekerjaan.toUpperCase()
      )
    ) {
      const vol = Number(volumeInput);
      if (Number.isFinite(vol) && vol > 0) {
        rawPekerjaanList.push({
          id: `PKJ-${Date.now()}`,
          detailPekerjaan: pendingPekerjaan,
          volume: vol,
        });
      }
    }

    const seenPekerjaanNames = new Set<string>();
    const finalPekerjaanList = rawPekerjaanList.filter((item) => {
      const key = item.detailPekerjaan.trim().toUpperCase();
      if (!key || seenPekerjaanNames.has(key)) return false;
      seenPekerjaanNames.add(key);
      return true;
    });

    if (finalPekerjaanList.length === 0) {
      setFormError('Silakan input minimal 1 Detail Pekerjaan beserta Volume.');
      pekerjaanInputRef.current?.focus();
      return;
    }

    if (!koordinatAwal.trim() || !koordinatAkhir.trim()) {
      setFormError('Titik Koordinat Awal dan Titik Koordinat Akhir wajib diisi.');
      return;
    }

    if (realisasiWo.trim() === '') {
      setFormError('Jumlah Realisasi WO wajib diisi oleh petugas.');
      return;
    }

    const numWo = Number(realisasiWo);
    const numP0 = Number(realisasiP0);
    if (!Number.isFinite(numWo) || numWo < 0 || !Number.isFinite(numP0) || numP0 < 0) {
      setFormError('Jumlah Realisasi WO dan P0 harus berupa angka valid.');
      return;
    }

    // Obtain a fresh Google token synchronously inside the click gesture if expired
    let freshClickToken: string | null = null;
    if (!hasValidCachedAccessToken()) {
      try {
        const authRes = await googleSignIn();
        if (authRes?.accessToken) {
          freshClickToken = authRes.accessToken;
        }
      } catch {
        // Handled gracefully in syncSingleReportToTeknikSheet
      }
    }

    setIsSubmitting(true);
    try {
      const pemeliharaanSummary = getRealisasiPemeliharaanDetails(finalPekerjaanList);
      const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');
      let savedReport: YantekRealisasiReport = {
        id: `YNTK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        reportRowNumber: reports.length + 2,
        timestampLaporan: nowIso,
        tanggalLaporan,
        unitPelaksana: selectedUnit,
        petugasPelapor: namaPetugas.trim(),
        penyulang: confirmedSegment.penyulang,
        keypoint: confirmedSegment.keypoint,
        segment: confirmedSegment.segment,
        panjangKms: confirmedSegment.panjangKms,
        pekerjaanList: finalPekerjaanList,
        koordinatAwal: koordinatAwal.trim(),
        koordinatAkhir: koordinatAkhir.trim(),
        realisasiWo: numWo,
        realisasiP0: numP0,
        realisasiPemeliharaanKms: pemeliharaanSummary.realisasiPemeliharaanKms,
      };
      let updatedReports: YantekRealisasiReport[] = [savedReport, ...reports];

      try {
        const res = await fetch('/api/yantek/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tanggalLaporan,
            unitPelaksana: selectedUnit,
            petugasPelapor: namaPetugas.trim(),
            penyulang: confirmedSegment.penyulang,
            keypoint: confirmedSegment.keypoint,
            segment: confirmedSegment.segment,
            panjangKms: confirmedSegment.panjangKms,
            pekerjaanList: finalPekerjaanList,
            koordinatAwal: koordinatAwal.trim(),
            koordinatAkhir: koordinatAkhir.trim(),
            realisasiWo: numWo,
            realisasiP0: numP0,
            realisasiPemeliharaanKms: pemeliharaanSummary.realisasiPemeliharaanKms,
          }),
        });

        const rawText = await res.text();
        const trimmed = rawText.trim();
        if (trimmed && !trimmed.startsWith('<')) {
          const data = JSON.parse(trimmed);
          if (!res.ok || data?.success === false) {
            throw new Error(data?.message || 'Gagal menyimpan laporan.');
          }
          if (data?.report) {
            savedReport = data.report;
          }
          if (Array.isArray(data?.reports)) {
            updatedReports = data.reports;
          }
        }
      } catch (apiErr: any) {
        if (
          apiErr instanceof Error &&
          !apiErr.message.includes('Unexpected token') &&
          !apiErr.message.includes('is not valid JSON') &&
          !apiErr.message.includes('Failed to fetch')
        ) {
          throw apiErr;
        }
      }

      onReportCreated(savedReport, updatedReports);
      await syncSingleReportToTeknikSheet(savedReport, updatedReports, freshClickToken);

      if (onTriggerSound) onTriggerSound('commit');

      setPekerjaanList([]);
      setPekerjaanQuery('');
      setVolumeInput('');
      setKoordinatAwal('');
      setKoordinatAkhir('');
      setRealisasiWo('');
      setRealisasiP0('0');
      setCompletedReportModal(savedReport);
    } catch (err: any) {
      if (onTriggerSound) onTriggerSound('error');
      setFormError(err?.message || 'Gagal mengirim laporan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-Menu Realisasi Yantek: Input Yantek, Manajemen Trafo, Sisip Trafo, Riwayat Trafo */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-1.5 sm:p-2 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveSubMenu('input')}
          className={`min-h-[42px] px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors ${
            activeSubMenu === 'input'
              ? 'bg-[#083d54] text-[#facc15] shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Input Realisasi Yantek</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubMenu('mutasi')}
          className={`min-h-[42px] px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors ${
            activeSubMenu === 'mutasi'
              ? 'bg-[#0b4f6c] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-[#ea580c] shrink-0" />
          <span className="truncate">Manajemen Trafo</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubMenu('sisip')}
          className={`min-h-[42px] px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors ${
            activeSubMenu === 'sisip'
              ? 'bg-purple-600 text-white shadow-sm'
              : 'text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40'
          }`}
        >
          <PlusCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Sisip Trafo</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubMenu('riwayat')}
          className={`min-h-[42px] px-2.5 sm:px-3.5 py-2 rounded-xl text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors ${
            activeSubMenu === 'riwayat'
              ? 'bg-[#126b82] text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <History className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Riwayat Trafo</span>
        </button>
      </div>

      {activeSubMenu !== 'input' ? (
        <TrafoManagementSection
          mode={activeSubMenu}
          onChangeMode={(nextMode) => setActiveSubMenu(nextMode)}
          sourceMenu="YANTEK"
          segments={segments}
          unitOptions={YANTEK_PELAKSANA_UNITS}
          defaultUnit={selectedUnit}
          accessToken={accessToken}
          onTriggerSound={onTriggerSound}
        />
      ) : (
        <>
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        {formError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="font-medium">{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmitLaporanSelesai} className="space-y-5">
          {/* LANGKAH 1: DATA PELAKSANA */}
          <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#0b4f6c] text-[#facc15] font-mono text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Data Pelaksana
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Unit Pelaksana <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Users className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={selectedUnit}
                    onChange={(e) => {
                      setSelectedUnit(e.target.value);
                      setFormError(null);
                    }}
                    className="w-full min-h-[46px] pl-10 pr-4 py-2.5 text-xs sm:text-sm font-bold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {YANTEK_PELAKSANA_UNITS.map((unitName) => (
                      <option key={unitName} value={unitName}>
                        {unitName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Tanggal <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={tanggalLaporan}
                  onChange={(e) => setTanggalLaporan(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 py-2.5 text-xs sm:text-sm font-mono font-semibold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nama Petugas <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={namaPetugasInputRef}
                  type="text"
                  required
                  value={namaPetugas}
                  onChange={(e) => {
                    setNamaPetugas(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="Masukkan nama petugas..."
                  className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm font-semibold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
          </div>

          {/* LANGKAH 2: PILIH SEGMENT */}
          <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-sky-600 text-white font-mono text-xs font-bold flex items-center justify-center">
                2
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Pilih Segment Pekerjaan
              </h3>
            </div>

            <div className="relative">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nama Segment <span className="text-rose-500">*</span>
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={segmentQuery}
                    onFocus={() => setIsSegmentDropdownOpen(true)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSegmentQuery(val);
                      if (
                        confirmedSegment &&
                        val.trim().toUpperCase() !== confirmedSegment.segment.toUpperCase()
                      ) {
                        setConfirmedSegment(null);
                      }
                      setIsSegmentDropdownOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleManualSegmentTrigger();
                      }
                    }}
                    placeholder="Ketik atau pilih nama segment..."
                    className="w-full min-h-[46px] pl-10 pr-9 py-2.5 text-xs sm:text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {segmentQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSegmentQuery('');
                        setConfirmedSegment(null);
                        setIsSegmentDropdownOpen(true);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      title="Bersihkan"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleManualSegmentTrigger}
                  className="min-h-[46px] px-4 py-2.5 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Pilih Segment</span>
                </button>
              </div>

              {isSegmentDropdownOpen && (
                <div className="mt-1.5 max-h-60 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl divide-y divide-slate-100 dark:divide-slate-800 z-30">
                  <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    <span>Daftar Segment</span>
                    <button
                      type="button"
                      onClick={() => setIsSegmentDropdownOpen(false)}
                      className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    >
                      Tutup
                    </button>
                  </div>
                  {filteredSegments.length > 0 ? (
                    filteredSegments.map((seg) => (
                      <button
                        key={`${seg.rowNumber}-${seg.segment}-${seg.keypoint}`}
                        type="button"
                        onClick={() => handleSelectSegmentCandidate(seg)}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                      >
                        <div className="font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                          {seg.segment}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          <span>Penyulang: {seg.penyulang}</span>
                          <span aria-hidden="true">·</span>
                          <span>Keypoint: {seg.keypoint}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="px-3.5 py-3 text-xs text-slate-500 dark:text-slate-400">
                      Segment tidak ditemukan.
                    </div>
                  )}
                </div>
              )}
            </div>

            {confirmedSegment && (
              <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono flex-1">
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      UNIT PELAKSANA
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {selectedUnit}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      SEGMENT
                    </span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {confirmedSegment.segment}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      KEYPOINT
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {confirmedSegment.keypoint}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      PENYULANG
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {confirmedSegment.penyulang}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPendingSegmentForConfirm(confirmedSegment)}
                  className="min-h-[38px] px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl shrink-0"
                >
                  Ubah
                </button>
              </div>
            )}
          </div>

          {/* LANGKAH 3: DETAIL PEKERJAAN & KOORDINAT */}
          <div
            className={`p-4 rounded-2xl border space-y-4 transition-opacity ${
              confirmedSegment
                ? 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                : 'bg-slate-50/40 dark:bg-slate-800/20 border-slate-200/70 dark:border-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-slate-900 dark:bg-sky-600 text-white font-mono text-xs font-bold flex items-center justify-center">
                3
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Detail Pekerjaan &amp; Koordinat
              </h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
              <div className="lg:col-span-7 relative">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Detail Pekerjaan <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={pekerjaanInputRef}
                    type="text"
                    value={pekerjaanQuery}
                    onFocus={() => setIsPekerjaanDropdownOpen(true)}
                    onChange={(e) => {
                      setPekerjaanQuery(e.target.value);
                      setIsPekerjaanDropdownOpen(true);
                    }}
                    placeholder="Ketik atau pilih detail pekerjaan..."
                    className="w-full min-h-[46px] pl-10 pr-9 py-2.5 text-xs sm:text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {pekerjaanQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setPekerjaanQuery('');
                        setIsPekerjaanDropdownOpen(true);
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {isPekerjaanDropdownOpen && filteredPekerjaan.length > 0 && (
                  <div className="mt-1.5 max-h-56 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl divide-y divide-slate-100 dark:divide-slate-800 z-20">
                    <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      <span>Daftar Pekerjaan</span>
                      <button
                        type="button"
                        onClick={() => setIsPekerjaanDropdownOpen(false)}
                        className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
                      >
                        Tutup
                      </button>
                    </div>
                    {filteredPekerjaan.map((pek, idx) => (
                      <button
                        key={`${idx}-${pek}`}
                        type="button"
                        onClick={() => {
                          setPekerjaanQuery(pek);
                          setIsPekerjaanDropdownOpen(false);
                          setTimeout(() => volumeInputRef.current?.focus(), 60);
                        }}
                        className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm text-slate-800 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors"
                      >
                        {pek}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="lg:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Volume <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={volumeInputRef}
                  type="number"
                  min="0.01"
                  step="any"
                  value={volumeInput}
                  onChange={(e) => setVolumeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddPekerjaanItem();
                    }
                  }}
                  placeholder="Isi jumlah"
                  className="w-full min-h-[46px] px-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="lg:col-span-3 lg:pt-5">
                <button
                  type="button"
                  onClick={handleAddPekerjaanItem}
                  className="w-full min-h-[46px] px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>Tambah Pekerjaan</span>
                </button>
              </div>
            </div>

            {pekerjaanList.length > 0 && (
              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                  <span>Daftar Pekerjaan ({pekerjaanList.length})</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">
                    Total Volume:{' '}
                    {pekerjaanList.reduce((acc, item) => acc + (Number(item.volume) || 0), 0)}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pekerjaanList.map((item, index) => (
                    <div
                      key={item.id}
                      className="py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono font-bold text-slate-500">
                          {index + 1}.
                        </span>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {item.detailPekerjaan}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          Vol: {item.volume}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePekerjaanItem(item.id)}
                          className="p-1 text-rose-500 hover:text-rose-700 rounded-lg"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Titik Koordinat Awal <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleGetGpsCoordinate('awal')}
                    disabled={isLocatingGps === 'awal'}
                    className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                  >
                    {isLocatingGps === 'awal' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Navigation className="w-3 h-3" />
                        <span>Ambil GPS</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={koordinatAwal}
                    onChange={(e) => setKoordinatAwal(e.target.value)}
                    placeholder="-5.124512, 120.253610"
                    className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Titik Koordinat Akhir <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => handleGetGpsCoordinate('akhir')}
                    disabled={isLocatingGps === 'akhir'}
                    className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                  >
                    {isLocatingGps === 'akhir' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Navigation className="w-3 h-3" />
                        <span>Ambil GPS</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={koordinatAkhir}
                    onChange={(e) => setKoordinatAkhir(e.target.value)}
                    placeholder="-5.128940, 120.258120"
                    className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Jumlah Realisasi WO <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={realisasiWo}
                  onChange={(e) => setRealisasiWo(e.target.value)}
                  placeholder="Isi jumlah WO"
                  className="w-full min-h-[46px] px-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Jumlah Realisasi P0 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={realisasiP0}
                  onChange={(e) => setRealisasiP0(e.target.value)}
                  placeholder="0"
                  className="w-full min-h-[46px] px-3.5 py-2.5 text-xs sm:text-sm font-mono font-bold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end border-t border-slate-200 dark:border-slate-800">
              <button
                type="submit"
                disabled={isSubmitting}
                aria-label="Kirim Laporan"
                className="w-full sm:w-auto sm:min-w-[180px] min-h-[50px] px-6 py-3 text-xs sm:text-sm font-bold text-white bg-[#ea580c] hover:bg-[#c2410c] disabled:opacity-60 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                {isSubmitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Kirim Laporan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* LOADING OVERLAY MODAL (SIMBOL LOADING SAAT PENGIRIMAN DATA) */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#083d54]/60 backdrop-blur-xs p-4">
          <div className="w-24 h-24 rounded-3xl bg-white dark:bg-slate-900 border border-cyan-200 dark:border-cyan-800 shadow-2xl flex items-center justify-center">
            <Loader2 className="w-11 h-11 text-[#ea580c] animate-spin" />
          </div>
        </div>
      )}

      {/* POP UP 1: KONFIRMASI SEGMENT */}
      {pendingSegmentForConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4"
          onClick={() => setPendingSegmentForConfirm(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-sky-600 shrink-0" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                  Konfirmasi Segment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingSegmentForConfirm(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">Unit Pelaksana:</span>
                <span className="font-bold text-slate-900 dark:text-white">{selectedUnit}</span>
              </div>
              {namaPetugas.trim() && (
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400">Nama Petugas:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {namaPetugas.trim()}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">Segment:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {pendingSegmentForConfirm.segment}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">Keypoint:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {pendingSegmentForConfirm.keypoint}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Penyulang:</span>
                <span className="font-bold text-sky-700 dark:text-sky-400">
                  {pendingSegmentForConfirm.penyulang}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setPendingSegmentForConfirm(null)}
                className="min-h-[44px] px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Pilih Ulang
              </button>
              <button
                type="button"
                onClick={handleConfirmSegmentAndUnit}
                className="min-h-[44px] px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-xs"
              >
                <Check className="w-4 h-4 shrink-0" />
                <span>Konfirmasi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POP UP 2: DATA BERHASIL DIKIRIM */}
      {completedReportModal &&
        (() => {
          const pemeliharaanDetails = getRealisasiPemeliharaanDetails(
            completedReportModal.pekerjaanList
          );
          const totalPemeliharaanKms =
            completedReportModal.realisasiPemeliharaanKms ??
            pemeliharaanDetails.realisasiPemeliharaanKms;

          return (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:pb-4"
              onClick={() => setCompletedReportModal(null)}
            >
              <div
                className="w-full max-w-lg max-h-[calc(100vh-7rem)] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-4 sm:p-5 space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                      Data Berhasil Dikirim
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompletedReportModal(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                  <div className="font-mono font-bold text-slate-900 dark:text-white">
                    {completedReportModal.unitPelaksana}
                    {completedReportModal.petugasPelapor
                      ? ` (${completedReportModal.petugasPelapor})`
                      : ''}{' '}
                    · {completedReportModal.segment}
                  </div>
                  <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    Penyulang: {completedReportModal.penyulang} · Keypoint:{' '}
                    {completedReportModal.keypoint}
                  </div>
                  <div className="pt-1 border-t border-slate-200 dark:border-slate-700 space-y-1">
                    {completedReportModal.pekerjaanList.map((item, i) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 font-mono">
                        <span className="min-w-0 break-words">
                          {i + 1}. {item.detailPekerjaan}
                        </span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums shrink-0">
                          Vol: {item.volume}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Kolom Realisasi Pemeliharaan (KMS) */}
                  <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800 dark:text-slate-100">
                        Realisasi Pemeliharaan
                      </span>
                      <span className="font-mono text-sm font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatPemeliharaanKms(totalPemeliharaanKms)} KMS
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-emerald-800/80 dark:text-emerald-300/80 tabular-nums">
                      (Perampalan Pohon: {formatPemeliharaanKms(pemeliharaanDetails.volumePerampalan)} + Penebangan Pohon: {formatPemeliharaanKms(pemeliharaanDetails.volumePenebangan)}) × 0,1 = {formatPemeliharaanKms(totalPemeliharaanKms)} KMS
                    </div>
                  </div>

                  <div className="pt-1 border-t border-slate-200 dark:border-slate-700 font-mono text-[11px] text-slate-500">
                    Koordinat: {completedReportModal.koordinatAwal} s/d{' '}
                    {completedReportModal.koordinatAkhir} | WO: {completedReportModal.realisasiWo} | P0:{' '}
                    {completedReportModal.realisasiP0}
                  </div>
                </div>

            {sheetSyncWarning && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 space-y-2.5 text-xs">
                <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{sheetSyncWarning}</span>
                </div>
                <button
                  type="button"
                  disabled={isRetryingSheetSync}
                  onClick={handleRetrySyncFromModal}
                  className="w-full min-h-[42px] px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  {isRetryingSheetSync ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Sinkronkan ke Spreadsheet</span>
                    </>
                  )}
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => downloadYantekReportPdf(completedReportModal)}
                className="min-h-[46px] px-4 py-2.5 text-xs font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Unduh PDF</span>
              </button>

              <button
                type="button"
                onClick={() => shareYantekReportViaWhatsApp(completedReportModal)}
                className="min-h-[46px] px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs"
              >
                <Share2 className="w-4 h-4 shrink-0" />
                <span>Bagikan WhatsApp</span>
              </button>
            </div>

            <div className="pt-1 text-right">
              <button
                type="button"
                onClick={() => setCompletedReportModal(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Tutup
              </button>
            </div>
            </div>
          </div>
          );
        })()}
        </>
      )}
    </div>
  );
};
