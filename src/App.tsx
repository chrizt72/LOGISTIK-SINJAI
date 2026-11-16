import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ScanBarcode,
  Camera,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  AlertTriangle,
  CheckCircle2,
  XOctagon,
  Trash2,
  Download,
  FileSpreadsheet,
  Plus,
  Minus,
  History,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Eye,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  Clock,
  Copy,
  Check,
} from 'lucide-react';
import {
  MaterialRow,
  EksekusiMimsRow,
  MaterialCatalogItem,
  ScanLogEntry,
  WarehouseStats,
} from './types/warehouse';
import {
  playScanSuccessBeep,
  playScanErrorAlarm,
  playCommitSuccessChime,
} from './utils/sound';
import { CameraScannerModal } from './components/CameraScannerModal';
import {
  AlertNotificationModal,
  SystemAlertState,
} from './components/AlertNotificationModal';
import { BarcodeGraphic } from './components/BarcodeGraphic';
import { SpreadsheetSyncModal } from './components/SpreadsheetSyncModal';
import {
  GoogleSheetsConfirmModal,
  PendingSheetsMutation,
} from './components/GoogleSheetsConfirmModal';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallPrompt';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  getAccessToken,
  logoutGoogle,
  SpreadsheetMetadata,
  readMaterialRowsFromGoogleSheet,
  createNewWarehouseGoogleSheet,
  overwriteGoogleSheetRows,
  overwriteEksekusiMimsSheetRows,
  appendInboundRowsToGoogleSheet,
  updateOutboundStatusInGoogleSheet,
  EKSEKUSI_MIMS_HEADERS,
  mimsRowToSheetValues,
} from './services/googleWorkspace';

type ActiveSection = 'keluar' | 'masuk' | 'spreadsheet' | 'riwayat';

interface QueuedInboundItem {
  snMaterial: string;
  noMaterial: string;
  spesifikasi: string;
  kategori: string;
  noBatch: string;
}

export default function App() {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [eksekusiMimsRows, setEksekusiMimsRows] = useState<EksekusiMimsRow[]>([]);
  const [logs, setLogs] = useState<ScanLogEntry[]>([]);
  const [stats, setStats] = useState<WarehouseStats | null>(null);
  const [catalog, setCatalog] = useState<MaterialCatalogItem[]>([]);
  const [sheetConfig, setSheetConfig] = useState({
    spreadsheetName: 'LOGISTIK_SINJAI',
    sheetName: 'MATERIAL',
    mimsSheetName: 'EKSEKUSI_MIMS',
    gid: '0',
    googleSheetUrl: '',
    lastSyncedAt: '',
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Navigation & UI state
  const [activeSection, setActiveSection] = useState<ActiveSection>('keluar');
  const [activeSpreadsheetTab, setActiveSpreadsheetTab] = useState<'MATERIAL' | 'EKSEKUSI_MIMS'>(
    'MATERIAL'
  );
  const [copiedMimsFormat, setCopiedMimsFormat] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [showMobileMetaForm, setShowMobileMetaForm] = useState<boolean>(false);
  const [systemAlert, setSystemAlert] = useState<SystemAlertState | null>(null);
  const [inlineBanner, setInlineBanner] = useState<{
    type: 'error' | 'warning' | 'success';
    title: string;
    message: string;
  } | null>(null);
  const [previewBarcodeRow, setPreviewBarcodeRow] = useState<MaterialRow | null>(null);

  // Google Workspace (Sheets & Drive) Authentication & Sync State
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [connectedSheet, setConnectedSheet] = useState<SpreadsheetMetadata | null>(null);
  const [selectedSheetTab, setSelectedSheetTab] = useState<string>('MATERIAL');
  const [pendingSheetsMutation, setPendingSheetsMutation] =
    useState<PendingSheetsMutation | null>(null);

  // Officer & Document info
  const [petugas, setPetugas] = useState<string>('Petugas Gudang ULP Sinjai');
  const [noDokumen, setNoDokumen] = useState<string>('BON-SINJAI-2026-01');

  // Outbound (Material Keluar) State
  const [outboundScanInput, setOutboundScanInput] = useState<string>('');
  const [expectedOutboundQty, setExpectedOutboundQty] = useState<number>(3);
  const [expectedOutboundMat, setExpectedOutboundMat] = useState<string>('ALL');
  const [outboundQueue, setOutboundQueue] = useState<MaterialRow[]>([]);
  const [isProcessingOutbound, setIsProcessingOutbound] = useState<boolean>(false);

  // Inbound (Material Masuk) State
  const [inboundScanInput, setInboundScanInput] = useState<string>('');
  const [selectedInboundMat, setSelectedInboundMat] = useState<string>('2190224');
  const [inboundBatchNo, setInboundBatchNo] = useState<string>('15');
  const [inboundAutoSave, setInboundAutoSave] = useState<boolean>(true);
  const [inboundQueue, setInboundQueue] = useState<QueuedInboundItem[]>([]);
  const [isProcessingInbound, setIsProcessingInbound] = useState<boolean>(false);

  // Spreadsheet Table Filter & Pagination State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'SIAP PAKAI' | 'STOK TERPAKAI' | 'BARU_MASUK'
  >('ALL');
  const [materialFilter, setMaterialFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const rowsPerPage = 20;

  const outboundInputRef = useRef<HTMLInputElement>(null);
  const inboundInputRef = useRef<HTMLInputElement>(null);

  const fetchWarehouseData = useCallback(async () => {
    try {
      const res = await fetch('/api/materials');
      if (!res.ok) throw new Error('Gagal memuat data gudang');
      const data = await res.json();
      setRows(data.rows || []);
      setEksekusiMimsRows(data.eksekusiMimsRows || []);
      setLogs(data.logs || []);
      setStats(data.stats || null);
      setCatalog(data.catalog || []);
      if (data.sheetConfig) setSheetConfig(data.sheetConfig);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWarehouseData();
  }, [fetchWarehouseData]);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      () => {
        setGoogleUser(null);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    setIsSigningIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
        setInlineBanner({
          type: 'success',
          title: 'Berhasil Masuk ke Google Workspace',
          message: `Terhubung sebagai ${result.user.email}. Sekarang Anda dapat memilih atau membuat Sheet "MATERIAL" langsung di Google Sheets.`,
        });
      }
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      setInlineBanner({
        type: 'error',
        title: 'Gagal Masuk dengan Google',
        message: err?.message || 'Autentikasi Google dibatalkan atau gagal.',
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setAccessToken(null);
    setNeedsAuth(true);
    setConnectedSheet(null);
  };

  const handlePullFromGoogleSheet = async (
    spreadsheetId: string,
    tabTitle: string,
    title: string,
    url: string
  ) => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    const pulledRows = await readMaterialRowsFromGoogleSheet(token, spreadsheetId, tabTitle);
    if (pulledRows.length === 0) {
      setInlineBanner({
        type: 'warning',
        title: `Sheet "${tabTitle}" Kosong`,
        message: `Sheet "${tabTitle}" pada "${title}" belum memiliki baris material. Klik "Kirim ${rows.length} Baris" untuk mengisi data awal.`,
      });
      return;
    }

    const res = await fetch('/api/sync/import-rows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: pulledRows,
        spreadsheetName: title,
        sheetName: tabTitle,
        googleSheetUrl: url,
        userEmail: googleUser?.email || '',
      }),
    });
    const data = await res.json();
    if (data.rows) setRows(data.rows);
    if (data.stats) setStats(data.stats);
    if (data.logs) setLogs(data.logs);
    if (data.sheetConfig) setSheetConfig(data.sheetConfig);

    setInlineBanner({
      type: 'success',
      title: `Berhasil Memuat ${pulledRows.length} Baris dari Google Sheets`,
      message: data.message,
    });
  };

  const requestOverwriteGoogleSheet = (
    spreadsheetId: string,
    tabTitle: string,
    title: string
  ) => {
    setPendingSheetsMutation({
      type: 'OVERWRITE_SHEET',
      title: `Perbarui Isi Sheet "${tabTitle}" pada Google Spreadsheet "${title}"?`,
      description: `Tindakan ini akan memperbarui dan menulis ${rows.length} baris data stok material (Kolom A s/d Kolom O) ke tab "${tabTitle}" di Google Sheets milik Anda.`,
      spreadsheetTitle: title,
      sheetTabName: tabTitle,
      affectedRows: rows,
      totalCount: rows.length,
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) {
          setNeedsAuth(true);
          setPendingSheetsMutation(null);
          return;
        }
        await overwriteGoogleSheetRows(token, spreadsheetId, tabTitle, rows);
        setPendingSheetsMutation(null);
        setInlineBanner({
          type: 'success',
          title: 'Data Gudang Berhasil Disimpan ke Google Sheets!',
          message: `Seluruh ${rows.length} baris berhasil disinkronkan ke "${title}" (Tab: ${tabTitle}).`,
        });
      },
    });
  };

  const requestCreateNewGoogleSheet = (newTitle: string) => {
    const cleanTitle = newTitle.trim() || 'LOGISTIK_SINJAI - MATERIAL & EKSEKUSI_MIMS';
    setPendingSheetsMutation({
      type: 'CREATE_NEW_SHEET',
      title: `Buat File Google Spreadsheet Baru "${cleanTitle}" di Google Drive?`,
      description: `Sistem akan membuat file Google Spreadsheet baru dengan 2 Sheet: "MATERIAL" (${rows.length} baris stok) dan "EKSEKUSI_MIMS" (${eksekusiMimsRows.length} baris material keluar lengkap dengan Timestamp).`,
      spreadsheetTitle: cleanTitle,
      sheetTabName: 'MATERIAL & EKSEKUSI_MIMS',
      affectedRows: rows,
      totalCount: rows.length,
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) {
          setNeedsAuth(true);
          setPendingSheetsMutation(null);
          return;
        }
        const meta = await createNewWarehouseGoogleSheet(
          token,
          cleanTitle,
          rows,
          eksekusiMimsRows
        );
        setConnectedSheet(meta);
        setSelectedSheetTab('MATERIAL');
        setSheetConfig((prev) => ({
          ...prev,
          spreadsheetName: meta.title,
          sheetName: 'MATERIAL',
          mimsSheetName: 'EKSEKUSI_MIMS',
          googleSheetUrl: meta.spreadsheetUrl,
        }));
        setPendingSheetsMutation(null);
        setInlineBanner({
          type: 'success',
          title: `File Google Spreadsheet "${meta.title}" Berhasil Dibuat!`,
          message: `Sheet "MATERIAL" (${rows.length} baris) & Sheet "EKSEKUSI_MIMS" telah dibuat di Google Drive Anda.`,
        });
      },
    });
  };

  const requestSyncMimsSheet = (spreadsheetId: string, title: string) => {
    setPendingSheetsMutation({
      type: 'OVERWRITE_SHEET',
      title: `Format & Sinkronkan Sheet "EKSEKUSI_MIMS" pada "${title}"?`,
      description: `Tindakan ini akan memformat header otomatis (Kolom A: TIMESTAMP EKSEKUSI s/d Kolom R: REF BARIS MATERIAL) dan menulis ${eksekusiMimsRows.length} baris data Material Keluar ke tab "EKSEKUSI_MIMS" di Google Sheets Anda.`,
      spreadsheetTitle: title,
      sheetTabName: 'EKSEKUSI_MIMS',
      affectedRows: eksekusiMimsRows.map((m) => ({
        rowNumber: m.mimsRowNumber,
        tanggalHistory: m.timestampEksekusi,
        snMaterial: m.snMaterial,
        noMaterial: m.noMaterial,
        spesifikasi: m.spesifikasi,
        statusTransaksi: m.statusTransaksi,
        kategori: m.kategori,
        noBatch: m.noBatch,
        valuationType: m.valuationType,
        plant: m.plant,
        storLoc: m.storLoc,
        companyCode: m.companyCode,
        unitInduk: m.unitInduk,
        unit: m.unit,
        storLocName: m.storLocName,
        status: m.status,
      })),
      totalCount: eksekusiMimsRows.length,
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) {
          setNeedsAuth(true);
          setPendingSheetsMutation(null);
          return;
        }
        await overwriteEksekusiMimsSheetRows(
          token,
          spreadsheetId,
          eksekusiMimsRows,
          'EKSEKUSI_MIMS'
        );
        setPendingSheetsMutation(null);
        setInlineBanner({
          type: 'success',
          title: 'Sheet "EKSEKUSI_MIMS" Berhasil Disinkronkan ke Google Sheets!',
          message: `Format kolom otomatis beserta ${eksekusiMimsRows.length} baris Material Keluar & Timestamp telah disimpan ke tab "EKSEKUSI_MIMS".`,
        });
      },
    });
  };

  const promptInboundGoogleSheetsSync = useCallback(
    (addedRows: MaterialRow[]) => {
      if (!connectedSheet || !accessToken || needsAuth || addedRows.length === 0) return;
      setPendingSheetsMutation({
        type: 'APPEND_INBOUND',
        title: `Tambahkan ${addedRows.length} Baris Material Masuk ke Google Sheets?`,
        description: `Apakah Anda ingin menambahkan ${addedRows.length} baris baru hasil scan Material Masuk ke Google Spreadsheet "${connectedSheet.title}" (Tab: ${selectedSheetTab}) dengan Kolom O = "SIAP PAKAI"?`,
        spreadsheetTitle: connectedSheet.title,
        sheetTabName: selectedSheetTab,
        affectedRows: addedRows,
        totalCount: addedRows.length,
        onConfirm: async () => {
          const token = await getAccessToken();
          if (!token) {
            setNeedsAuth(true);
            setPendingSheetsMutation(null);
            return;
          }
          await appendInboundRowsToGoogleSheet(
            token,
            connectedSheet.spreadsheetId,
            selectedSheetTab,
            addedRows
          );
          setPendingSheetsMutation(null);
          setInlineBanner({
            type: 'success',
            title: 'Baris Material Masuk Ditambahkan ke Google Sheets!',
            message: `${addedRows.length} baris baru berhasil ditambahkan ke "${connectedSheet.title}" (${selectedSheetTab}) dengan Kolom O = SIAP PAKAI.`,
          });
        },
      });
    },
    [connectedSheet, accessToken, needsAuth, selectedSheetTab]
  );

  const promptOutboundGoogleSheetsSync = useCallback(
    (updatedRows: MaterialRow[], addedMims: EksekusiMimsRow[] = []) => {
      if (!connectedSheet || !accessToken || needsAuth || updatedRows.length === 0) return;
      setPendingSheetsMutation({
        type: 'UPDATE_OUTBOUND',
        title: `Update Sheet "MATERIAL" & Tambahkan ${updatedRows.length} Baris ke Sheet "EKSEKUSI_MIMS"?`,
        description: `Konfirmasi: (1) Mengubah Kolom O menjadi "STOK TERPAKAI" pada Sheet "${selectedSheetTab}", dan (2) Menambahkan ${updatedRows.length} baris keluar baru lengkap dengan TIMESTAMP EKSEKUSI ke Sheet "EKSEKUSI_MIMS" di Google Spreadsheet "${connectedSheet.title}".`,
        spreadsheetTitle: connectedSheet.title,
        sheetTabName: `${selectedSheetTab} + EKSEKUSI_MIMS`,
        affectedRows: updatedRows,
        totalCount: updatedRows.length,
        onConfirm: async () => {
          const token = await getAccessToken();
          if (!token) {
            setNeedsAuth(true);
            setPendingSheetsMutation(null);
            return;
          }
          await updateOutboundStatusInGoogleSheet(
            token,
            connectedSheet.spreadsheetId,
            selectedSheetTab,
            updatedRows,
            addedMims
          );
          setPendingSheetsMutation(null);
          setInlineBanner({
            type: 'success',
            title: 'Google Sheets "MATERIAL" & "EKSEKUSI_MIMS" Berhasil Diperbarui!',
            message: `${updatedRows.length} baris diubah menjadi STOK TERPAKAI pada Sheet "${selectedSheetTab}" dan otomatis ditambahkan beserta Timestamp ke Sheet "EKSEKUSI_MIMS".`,
          });
        },
      });
    },
    [connectedSheet, accessToken, needsAuth, selectedSheetTab]
  );

  const triggerSound = useCallback(
    (kind: 'scan' | 'error' | 'commit') => {
      if (!soundEnabled) return;
      if (kind === 'scan') playScanSuccessBeep();
      else if (kind === 'error') playScanErrorAlarm();
      else playCommitSuccessChime();
    },
    [soundEnabled]
  );

  // ============================================================================
  // 1. HANDLER SCAN BARCODE MATERIAL KELUAR (OUTBOUND)
  // ============================================================================
  const handleScanOutboundSN = useCallback(
    async (rawSN: string) => {
      const cleanedSN = rawSN.trim().toUpperCase();
      if (!cleanedSN) return;

      setOutboundScanInput('');

      try {
        const res = await fetch('/api/scan/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            snMaterial: cleanedSN,
            mode: 'KELUAR',
            sessionScannedSNs: outboundQueue.map((r) => r.snMaterial),
            petugas,
          }),
        });

        const data = await res.json();
        if (data.stats) setStats(data.stats);
        if (data.logs) setLogs(data.logs);

        if (!res.ok || !data.valid) {
          triggerSound('error');
          const isDup =
            data.errorType === 'DUPLICATE_IN_SESSION' ||
            data.errorType === 'ALREADY_USED_OUTBOUND';

          setInlineBanner({
            type: 'error',
            title: data.title || 'Peringatan Scan Barcode Gagal',
            message: data.message,
          });

          setSystemAlert({
            isOpen: true,
            severity: isDup ? 'error-duplicate' : 'error-notfound',
            title: data.title || 'Peringatan Scan Barcode',
            message: data.message,
            snMaterial: cleanedSN,
            existingRow: data.existingRow,
          });
          return;
        }

        const matchedRow: MaterialRow = data.existingRow;

        if (expectedOutboundMat !== 'ALL' && matchedRow.noMaterial !== expectedOutboundMat) {
          triggerSound('error');
          const msg = `Ketidakcocokan Material: Barcode SN ${cleanedSN} adalah No. Material ${matchedRow.noMaterial} (${matchedRow.spesifikasi}), tidak sesuai dengan permintaan No. Material ${expectedOutboundMat}.`;
          setInlineBanner({
            type: 'error',
            title: 'Peringatan Error: Ketidakcocokan Jenis Material!',
            message: msg,
          });
          setSystemAlert({
            isOpen: true,
            severity: 'error-mismatch',
            title: 'Peringatan Error: Ketidakcocokan Jenis Material!',
            message: msg,
            snMaterial: cleanedSN,
            existingRow: matchedRow,
          });
          return;
        }

        const nextCount = outboundQueue.length + 1;
        setOutboundQueue((prev) => [...prev, matchedRow]);

        if (expectedOutboundQty > 0 && nextCount > expectedOutboundQty) {
          triggerSound('error');
          const diff = nextCount - expectedOutboundQty;
          const mismatchMsg = `Jumlah barcode yang di-scan (${nextCount} unit) MELEBIHI Target Jumlah Pengeluaran (${expectedOutboundQty} unit) sebanyak +${diff} unit!`;

          fetch('/api/log-mismatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              expectedCount: expectedOutboundQty,
              scannedCount: nextCount,
              petugas,
              noDokumen,
              reason: `PERINGATAN OVER-SCAN MATERIAL KELUAR: Target ${expectedOutboundQty} unit, di-scan ${nextCount} unit (+${diff} unit).`,
            }),
          })
            .then((r) => r.json())
            .then((d) => {
              if (d.stats) setStats(d.stats);
              if (d.logs) setLogs(d.logs);
            })
            .catch(() => {});

          setInlineBanner({
            type: 'error',
            title: 'Peringatan Error: Ketidakcocokan Jumlah Material Keluar (Melebihi Target)!',
            message: mismatchMsg,
          });

          setSystemAlert({
            isOpen: true,
            severity: 'error-mismatch',
            title: 'Peringatan Error: Ketidakcocokan Jumlah Material Keluar!',
            message: mismatchMsg,
            snMaterial: cleanedSN,
            existingRow: matchedRow,
            mismatchDetails: {
              expectedCount: expectedOutboundQty,
              scannedCount: nextCount,
              difference: diff,
            },
          });
          return;
        }

        triggerSound('scan');
        setInlineBanner({
          type: 'success',
          title: `Scan Barcode Berhasil (${nextCount}/${expectedOutboundQty} Unit)`,
          message: `SN ${cleanedSN} (Baris #${matchedRow.rowNumber} · No. Material ${matchedRow.noMaterial}) masuk ke daftar pengeluaran.`,
        });
      } catch (err) {
        console.error(err);
      }
    },
    [outboundQueue, petugas, expectedOutboundMat, expectedOutboundQty, noDokumen, triggerSound]
  );

  const handleCommitOutbound = async () => {
    if (outboundQueue.length === 0) {
      triggerSound('error');
      setInlineBanner({
        type: 'error',
        title: 'Daftar Scan Material Keluar Kosong',
        message:
          'Silakan lakukan scan barcode Serial Number (SN) material yang akan dikeluarkan terlebih dahulu.',
      });
      return;
    }

    setIsProcessingOutbound(true);
    try {
      const res = await fetch('/api/scan/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snList: outboundQueue.map((r) => r.snMaterial),
          expectedCount: expectedOutboundQty,
          expectedNoMaterial: expectedOutboundMat,
          petugas,
          noDokumen,
        }),
      });

      const data = await res.json();
      if (data.stats) setStats(data.stats);
      if (data.logs) setLogs(data.logs);

      if (!res.ok || !data.success) {
        triggerSound('error');
        const isMismatch = data.errorType === 'QUANTITY_MISMATCH';

        setInlineBanner({
          type: 'error',
          title: data.title || 'Peringatan Error Pengeluaran Material',
          message: data.message,
        });

        setSystemAlert({
          isOpen: true,
          severity: isMismatch ? 'error-mismatch' : 'error-duplicate',
          title: data.title || 'Peringatan Error Pengeluaran Material',
          message: data.message,
          mismatchDetails: data.details,
        });
        return;
      }

      triggerSound('commit');
      setRows(data.rows || []);
      if (Array.isArray(data.eksekusiMimsRows)) {
        setEksekusiMimsRows(data.eksekusiMimsRows);
      }
      setOutboundQueue([]);
      setInlineBanner({
        type: 'success',
        title: 'Material Keluar & Sheet "EKSEKUSI_MIMS" Diperbarui Otomatis!',
        message: data.message,
      });
      setSystemAlert({
        isOpen: true,
        severity: 'success',
        title: 'Kolom O → STOK TERPAKAI & Masuk ke Sheet "EKSEKUSI_MIMS"',
        message: data.message,
      });
      if (Array.isArray(data.updatedRows) && data.updatedRows.length > 0) {
        promptOutboundGoogleSheetsSync(data.updatedRows, data.addedMimsRows || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessingOutbound(false);
    }
  };

  // ============================================================================
  // 2. HANDLER SCAN BARCODE MATERIAL MASUK (INBOUND)
  // ============================================================================
  const handleScanInboundSN = useCallback(
    async (rawSN: string) => {
      const cleanedSN = rawSN.trim().toUpperCase();
      if (!cleanedSN) return;

      setInboundScanInput('');

      try {
        const res = await fetch('/api/scan/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            snMaterial: cleanedSN,
            mode: 'MASUK',
            sessionScannedSNs: inboundQueue.map((i) => i.snMaterial),
            petugas,
          }),
        });

        const data = await res.json();
        if (data.stats) setStats(data.stats);
        if (data.logs) setLogs(data.logs);

        if (!res.ok || !data.valid) {
          triggerSound('error');
          setInlineBanner({
            type: 'error',
            title: data.title || 'Peringatan: Barcode Sudah Pernah Di-scan!',
            message: data.message,
          });
          setSystemAlert({
            isOpen: true,
            severity: 'error-duplicate',
            title: data.title || 'Peringatan: Barcode Sudah Pernah Di-scan!',
            message: data.message,
            snMaterial: cleanedSN,
            existingRow: data.existingRow,
          });
          return;
        }

        const detected: MaterialCatalogItem =
          data.detectedCatalog ||
          catalog.find((c) => c.noMaterial === selectedInboundMat) ||
          catalog[0];

        const newItem: QueuedInboundItem = {
          snMaterial: cleanedSN,
          noMaterial: detected ? detected.noMaterial : selectedInboundMat,
          spesifikasi: detected
            ? detected.spesifikasi
            : 'MTR;kWH E-PR;;1P;230V;5-60A;1;;2W',
          kategori: detected ? detected.kategori : 'kWh Meter',
          noBatch: inboundBatchNo || (detected ? detected.defaultBatch : '15'),
        };

        if (inboundAutoSave) {
          setIsProcessingInbound(true);
          const commitRes = await fetch('/api/scan/inbound', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              items: [newItem],
              petugas,
              noDokumen,
            }),
          });
          const commitData = await commitRes.json();
          setIsProcessingInbound(false);

          if (commitData.stats) setStats(commitData.stats);
          if (commitData.logs) setLogs(commitData.logs);

          if (!commitRes.ok || !commitData.success) {
            triggerSound('error');
            setSystemAlert({
              isOpen: true,
              severity: 'error-duplicate',
              title: commitData.title || 'Gagal Menambah Material Masuk',
              message: commitData.message,
              snMaterial: cleanedSN,
              duplicatesList: commitData.duplicates,
            });
            return;
          }

          triggerSound('commit');
          setRows(commitData.rows || []);
          const addedRow = commitData.addedRows?.[0];
          setInlineBanner({
            type: 'success',
            title: `Baris Baru #${addedRow?.rowNumber || ''} Ditambahkan ke Sheet "MATERIAL"`,
            message: `SN ${cleanedSN} (${newItem.noMaterial}) otomatis masuk ke Spreadsheet dengan keterangan Kolom O = "SIAP PAKAI".`,
          });
          if (Array.isArray(commitData.addedRows) && commitData.addedRows.length > 0) {
            promptInboundGoogleSheetsSync(commitData.addedRows);
          }
        } else {
          triggerSound('scan');
          setInboundQueue((prev) => [...prev, newItem]);
          setInlineBanner({
            type: 'success',
            title: 'Barcode Material Masuk Valid',
            message: `SN ${cleanedSN} ditambahkan ke antrean masuk (Siap disimpan ke baris baru Sheet "MATERIAL" dengan Kolom O = SIAP PAKAI).`,
          });
        }
      } catch (err) {
        console.error(err);
        setIsProcessingInbound(false);
      }
    },
    [
      inboundQueue,
      petugas,
      catalog,
      selectedInboundMat,
      inboundBatchNo,
      inboundAutoSave,
      noDokumen,
      triggerSound,
      promptInboundGoogleSheetsSync,
    ]
  );

  const handleCommitInboundBatch = async () => {
    if (inboundQueue.length === 0) return;
    setIsProcessingInbound(true);
    try {
      const res = await fetch('/api/scan/inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: inboundQueue,
          petugas,
          noDokumen,
        }),
      });
      const data = await res.json();
      if (data.stats) setStats(data.stats);
      if (data.logs) setLogs(data.logs);

      if (!res.ok || !data.success) {
        triggerSound('error');
        setSystemAlert({
          isOpen: true,
          severity: 'error-duplicate',
          title: data.title || 'Peringatan Barcode Duplikat',
          message: data.message,
          duplicatesList: data.duplicates,
        });
        return;
      }

      triggerSound('commit');
      setRows(data.rows || []);
      setInboundQueue([]);
      setInlineBanner({
        type: 'success',
        title: 'Material Masuk Berhasil Ditambahkan ke Spreadsheet!',
        message: data.message,
      });
      setSystemAlert({
        isOpen: true,
        severity: 'success',
        title: 'Baris Baru Ditambahkan (Kolom O: SIAP PAKAI)',
        message: data.message,
      });
      if (Array.isArray(data.addedRows) && data.addedRows.length > 0) {
        promptInboundGoogleSheetsSync(data.addedRows);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessingInbound(false);
    }
  };

  // ============================================================================
  // 3. SIMULASI SCAN CEPAT
  // ============================================================================
  const simulateValidOutboundScan = () => {
    const queuedSet = new Set(outboundQueue.map((r) => r.snMaterial));
    const available = rows.find(
      (r) =>
        r.status === 'SIAP PAKAI' &&
        !queuedSet.has(r.snMaterial) &&
        (expectedOutboundMat === 'ALL' || r.noMaterial === expectedOutboundMat)
    );
    if (!available) {
      triggerSound('error');
      setInlineBanner({
        type: 'warning',
        title: 'Stok Siap Pakai Tidak Tersedia untuk Filter Ini',
        message: 'Tidak ada baris dengan status SIAP PAKAI yang belum di-scan pada filter ini.',
      });
      return;
    }
    handleScanOutboundSN(available.snMaterial);
  };

  const simulateDuplicateScan = (mode: 'KELUAR' | 'MASUK') => {
    if (mode === 'KELUAR') {
      if (outboundQueue.length > 0) {
        handleScanOutboundSN(outboundQueue[0].snMaterial);
        return;
      }
      const alreadyUsed = rows.find((r) => r.status === 'STOK TERPAKAI');
      if (alreadyUsed) {
        handleScanOutboundSN(alreadyUsed.snMaterial);
        return;
      }
      const firstAvail = rows[0];
      if (firstAvail) {
        setOutboundQueue([firstAvail]);
        setTimeout(() => {
          handleScanOutboundSN(firstAvail.snMaterial);
        }, 80);
      }
    } else {
      const existingRow = rows[0];
      if (existingRow) {
        handleScanInboundSN(existingRow.snMaterial);
      }
    }
  };

  const simulateMismatchOutbound = async () => {
    let currentQueue = [...outboundQueue];
    if (currentQueue.length === 0 && rows.length > 0) {
      const avail = rows.find((r) => r.status === 'SIAP PAKAI') || rows[0];
      currentQueue = [avail];
      setOutboundQueue(currentQueue);
    }
    const targetToTest = currentQueue.length === 3 ? 5 : 3;
    setExpectedOutboundQty(targetToTest);

    const res = await fetch('/api/scan/outbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snList: currentQueue.map((r) => r.snMaterial),
        expectedCount: targetToTest,
        expectedNoMaterial: expectedOutboundMat,
        petugas,
        noDokumen,
      }),
    });
    const data = await res.json();
    if (data.stats) setStats(data.stats);
    if (data.logs) setLogs(data.logs);

    triggerSound('error');
    setInlineBanner({
      type: 'error',
      title: data.title || 'Peringatan Error: Ketidakcocokan Jumlah Material Keluar!',
      message: data.message,
    });
    setSystemAlert({
      isOpen: true,
      severity: 'error-mismatch',
      title: data.title || 'Peringatan Error: Ketidakcocokan Jumlah Material Keluar!',
      message: data.message,
      mismatchDetails: data.details,
    });
  };

  const simulateValidInboundNewSN = () => {
    const matNo = selectedInboundMat || '2190224';
    const suffix = matNo.slice(-3);
    const random9 = String(Math.floor(100000000 + Math.random() * 899999999));
    const generatedSN = `PLN02190000${suffix}02639${random9}`;
    handleScanInboundSN(generatedSN);
  };

  // ============================================================================
  // 4. FILTERED SPREADSHEET ROWS & PAGINATION
  // ============================================================================
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return rows.filter((r) => {
      if (statusFilter === 'SIAP PAKAI' && r.status !== 'SIAP PAKAI') return false;
      if (statusFilter === 'STOK TERPAKAI' && r.status !== 'STOK TERPAKAI') return false;
      if (statusFilter === 'BARU_MASUK' && r.lastScanType !== 'MASUK') return false;
      if (materialFilter !== 'ALL' && r.noMaterial !== materialFilter) return false;
      if (!q) return true;
      return (
        r.snMaterial.toUpperCase().includes(q) ||
        r.noMaterial.toUpperCase().includes(q) ||
        r.spesifikasi.toUpperCase().includes(q) ||
        r.noBatch.toUpperCase().includes(q) ||
        String(r.rowNumber).includes(q)
      );
    });
  }, [rows, searchQuery, statusFilter, materialFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, materialFilter]);

  const isQuantityMatched =
    outboundQueue.length === expectedOutboundQty && expectedOutboundQty > 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* =====================================================================
          TOP BAR CONTRACT: 3 Zones separated by gap-8
          Compact 52px height on mobile to obey 15% sticky surface cap
      ====================================================================== */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 h-13 sm:h-15 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('keluar');
          }}
          className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 font-display"
        >
          SIMLOG PLN ULP Sinjai
        </a>

        {/* Zone 2: 4 concise single-line text navigation links (Desktop/Tablet) */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() => setActiveSection('keluar')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'keluar'
                ? 'border-sky-600 text-slate-900 dark:text-white font-semibold'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Material Keluar
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('masuk')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'masuk'
                ? 'border-sky-600 text-slate-900 dark:text-white font-semibold'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Material Masuk
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('spreadsheet')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'spreadsheet'
                ? 'border-sky-600 text-slate-900 dark:text-white font-semibold'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Sheet MATERIAL
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('riwayat')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === 'riwayat'
                ? 'border-sky-600 text-slate-900 dark:text-white font-semibold'
                : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Riwayat Scan
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setIsSyncModalOpen(true)}
            className="min-h-[38px] sm:min-h-[40px] px-3 sm:px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            Sinkronisasi Sheet
          </button>
        </div>
      </header>

      {/* =====================================================================
          MAIN WORKSPACE CONTAINER
          pb-32 on mobile so content clears the Floating Bottom Navigation Dock
      ====================================================================== */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-3.5 sm:px-6 pt-4 pb-32 md:pb-8 space-y-5">
        {/* Contextual Header & KPI Cards */}
        <section className="space-y-3.5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                <span>UIW SULSELRABAR</span>
                <span aria-hidden="true">·</span>
                <span>ULP SINJAI</span>
                <span aria-hidden="true">·</span>
                <span>Gd ULP Sinjai (7417 / 2500)</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                  Sheet: MATERIAL (GID=0)
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
                  Monitoring Stok &amp; Scan Barcode SN
                </h1>
                <div className="flex items-center gap-1.5 md:hidden shrink-0">
                  <PWAInstallButton />
                  {/* Mobile Audio Toggle */}
                  <button
                    type="button"
                    onClick={() => setSoundEnabled((prev) => !prev)}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 shrink-0"
                    aria-label="Aktifkan atau matikan suara beep"
                  >
                    {soundEnabled ? (
                      <Volume2 className="w-5 h-5 text-sky-600" />
                    ) : (
                      <VolumeX className="w-5 h-5 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop Mode Switcher & Audio Toggle */}
            <div className="hidden md:flex flex-wrap items-center gap-2">
              <PWAInstallButton />
              <div className="flex items-center gap-1 p-1 bg-slate-200/80 dark:bg-slate-900 border border-slate-300/70 dark:border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveSection('keluar')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    activeSection === 'keluar'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-amber-600" />
                  <span>Scan Material Keluar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('masuk')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    activeSection === 'masuk'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Scan Material Masuk</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('spreadsheet')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    activeSection === 'spreadsheet'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-sky-600" />
                  <span>Tabel Spreadsheet ({rows.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('riwayat')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    activeSection === 'riwayat'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <History className="w-3.5 h-3.5 text-slate-500" />
                  <span>Log Transaksi</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSoundEnabled((prev) => !prev)}
                className="min-h-[40px] px-3 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {soundEnabled ? (
                  <>
                    <Volume2 className="w-4 h-4 text-sky-600" />
                    <span>Suara Beep Aktif</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-4 h-4 text-slate-400" />
                    <span>Suara Nonaktif</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 2x2 Mobile / 4-Column Desktop Quantitative KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                Total Baris Sheet
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-1">
                <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {stats ? stats.totalRows.toLocaleString('id-ID') : rows.length}
                </span>
                <span className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                  +{stats?.inboundAddedCount || 0} baru
                </span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                Kolom O: SIAP PAKAI
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-1">
                <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {stats
                    ? stats.siapPakaiCount.toLocaleString('id-ID')
                    : rows.filter((r) => r.status === 'SIAP PAKAI').length}
                </span>
                <span className="text-[11px] text-slate-500 truncate">Tersedia</span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                Kolom O: STOK TERPAKAI
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-1">
                <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                  {stats
                    ? stats.stokTerpakaiCount.toLocaleString('id-ID')
                    : rows.filter((r) => r.status === 'STOK TERPAKAI').length}
                </span>
                <span className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                  {stats?.outboundUsedCount || 0} keluar
                </span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                Alert Duplikat &amp; Selisih
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-1">
                <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
                  {(stats?.duplicateAlertCount || 0) + (stats?.mismatchAlertCount || 0)}
                </span>
                <span className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                  {stats?.duplicateAlertCount || 0} dup · {stats?.mismatchAlertCount || 0} jml
                </span>
              </div>
            </div>
          </div>

          {/* Google Workspace (Google Sheets & Drive) Live Connection Bar */}
          <div className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  {connectedSheet
                    ? `Google Sheets Terhubung: ${connectedSheet.title} (Tab: ${selectedSheetTab})`
                    : googleUser && accessToken && !needsAuth
                    ? `Terhubung ke Google Workspace (${googleUser.email})`
                    : 'Sinkronisasi Langsung Google Sheets & Google Drive'}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {connectedSheet
                    ? 'Setiap scan Material Masuk (SIAP PAKAI) dan Keluar (STOK TERPAKAI) dapat diperbarui langsung ke Google Sheets.'
                    : googleUser && accessToken && !needsAuth
                    ? 'Pilih file Spreadsheet dari Google Drive atau buat Sheet "MATERIAL" (GID=0) baru.'
                    : 'Masuk dengan Google untuk menghubungkan Sheet "MATERIAL" (GID=0) di akun Google Sheets Anda.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {needsAuth || !accessToken ? (
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isSigningIn}
                  className="gsi-material-button"
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
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsSyncModalOpen(true)}
                    className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors whitespace-nowrap"
                  >
                    {connectedSheet ? 'Kelola Google Sheet' : 'Pilih / Buat Google Sheet'}
                  </button>
                  {connectedSheet && (
                    <button
                      type="button"
                      onClick={() =>
                        requestOverwriteGoogleSheet(
                          connectedSheet.spreadsheetId,
                          selectedSheetTab,
                          connectedSheet.title
                        )
                      }
                      className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap"
                    >
                      Sinkronkan {rows.length} Baris
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* Live Inline Notification Banner */}
        {inlineBanner && (
          <div
            role="status"
            className={`p-3.5 sm:p-4 rounded-2xl border flex items-start justify-between gap-3 ${
              inlineBanner.type === 'error'
                ? 'bg-red-50/95 dark:bg-red-950/50 border-red-200 dark:border-red-800/80 text-red-950 dark:text-red-100'
                : inlineBanner.type === 'warning'
                ? 'bg-amber-50/95 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800/80 text-amber-950 dark:text-amber-100'
                : 'bg-emerald-50/95 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/80 text-emerald-950 dark:text-emerald-100'
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              {inlineBanner.type === 'error' ? (
                <XOctagon className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              ) : inlineBanner.type === 'warning' ? (
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <h2 className="text-xs font-bold leading-snug">{inlineBanner.title}</h2>
                <p className="text-xs mt-0.5 opacity-90 leading-relaxed break-words">
                  {inlineBanner.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInlineBanner(null)}
              className="min-h-[36px] px-2 text-xs font-semibold underline opacity-80 hover:opacity-100 whitespace-nowrap shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {/* ===================================================================
            SECTION 1: SCAN MATERIAL KELUAR (OUTBOUND)
            Mobile-first ergonomics with 48px Camera Trigger, tactile +/- stepper,
            and mobile card queue
        ==================================================================== */}
        {activeSection === 'keluar' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Barcode Scanner Input & Quantity Control (5 cols) */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3.5">
                <div>
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Pengeluaran Stok Gudang
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-display">
                    Scan Barcode Material Keluar
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    Otomatis memperbarui <strong className="text-slate-800 dark:text-slate-200">Kolom O</strong> menjadi{' '}
                    <strong className="text-amber-700 dark:text-amber-400">STOK TERPAKAI</strong>.
                  </p>
                </div>

                {/* Mobile toggle for Officer/Bon fields */}
                <button
                  type="button"
                  onClick={() => setShowMobileMetaForm((prev) => !prev)}
                  className="sm:hidden min-h-[44px] px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center gap-1 shrink-0"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Bon</span>
                  {showMobileMetaForm ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {/* Primary Mobile Camera Button (48px height, thumb friendly) */}
              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="w-full min-h-[48px] px-4 py-3 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 active:scale-[0.99] rounded-xl transition-all flex items-center justify-center gap-2.5 shadow-xs"
              >
                <Camera className="w-5 h-5" />
                <span>Buka Kamera Scan Barcode SN</span>
              </button>

              {/* Barcode Scanner Input Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleScanOutboundSN(outboundScanInput);
                }}
                className="space-y-2"
              >
                <label
                  htmlFor="outbound-barcode-input"
                  className="block text-xs font-bold text-slate-900 dark:text-white"
                >
                  Input / Scanner Barcode (SN MATERIAL — Kolom B)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <ScanBarcode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={outboundInputRef}
                      id="outbound-barcode-input"
                      type="text"
                      value={outboundScanInput}
                      onChange={(e) => setOutboundScanInput(e.target.value)}
                      placeholder="PLN0219000022402639..."
                      className="w-full min-h-[46px] pl-10 pr-3 py-2.5 text-xs sm:text-sm font-mono bg-slate-50 dark:bg-slate-950 border-2 border-sky-600/80 dark:border-sky-500 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="min-h-[46px] px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0"
                  >
                    Scan SN
                  </button>
                </div>
              </form>

              {/* Tactile Target Quantity Stepper + Presets */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="outbound-target-qty"
                    className="text-xs font-bold text-slate-800 dark:text-slate-200"
                  >
                    Target Jumlah Material Keluar
                  </label>
                  <span className="text-[11px] font-mono text-slate-500">
                    Wajib cocok saat proses
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpectedOutboundQty((q) => Math.max(1, q - 1))}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 active:scale-95 transition-transform"
                    aria-label="Kurangi target jumlah"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    id="outbound-target-qty"
                    type="number"
                    min={1}
                    max={500}
                    value={expectedOutboundQty}
                    onChange={(e) =>
                      setExpectedOutboundQty(Math.max(1, parseInt(e.target.value || '1', 10)))
                    }
                    className="flex-1 min-h-[44px] text-center px-3 py-2 text-base font-mono font-bold tabular-nums bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setExpectedOutboundQty((q) => q + 1)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 active:scale-95 transition-transform"
                    aria-label="Tambah target jumlah"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Preset Qty Buttons */}
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 5, 10].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setExpectedOutboundQty(preset)}
                      className={`min-h-[38px] py-1.5 text-xs font-mono font-semibold rounded-lg border transition-colors ${
                        expectedOutboundQty === preset
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-sky-600 dark:border-sky-600'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {preset} Unit
                    </button>
                  ))}
                </div>

                {/* Filter No Material */}
                <div className="pt-1">
                  <label
                    htmlFor="outbound-mat-filter"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Filter No. Material (Kolom C)
                  </label>
                  <select
                    id="outbound-mat-filter"
                    value={expectedOutboundMat}
                    onChange={(e) => setExpectedOutboundMat(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="ALL">Semua No. Material</option>
                    {catalog.map((c) => (
                      <option key={c.noMaterial} value={c.noMaterial}>
                        {c.noMaterial} — {c.spesifikasi.slice(0, 28)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Officer & Bon Number (Always visible on sm+, toggleable on mobile) */}
              <div
                className={`${
                  showMobileMetaForm ? 'grid' : 'hidden sm:grid'
                } grid-cols-1 sm:grid-cols-2 gap-3 pt-1`}
              >
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Nama Petugas Scan
                  </label>
                  <input
                    type="text"
                    value={petugas}
                    onChange={(e) => setPetugas(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    No. Bon / PK Pengeluaran
                  </label>
                  <input
                    type="text"
                    value={noDokumen}
                    onChange={(e) => setNoDokumen(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                  />
                </div>
              </div>

              {/* Quick Simulation / Testing Controls (Touch-friendly grid on mobile) */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Simulasi Scan &amp; Uji Notifikasi Error:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={simulateValidOutboundScan}
                    className="min-h-[44px] px-3 py-2 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl transition-colors"
                  >
                    + Scan 1 SN Siap Pakai
                  </button>
                  <button
                    type="button"
                    onClick={() => simulateDuplicateScan('KELUAR')}
                    className="min-h-[44px] px-3 py-2 text-xs font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-xl transition-colors"
                  >
                    Uji Barcode Duplikat
                  </button>
                  <button
                    type="button"
                    onClick={simulateMismatchOutbound}
                    className="min-h-[44px] px-3 py-2 text-xs font-semibold bg-red-50 hover:bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-xl transition-colors"
                  >
                    Uji Error Selisih Jumlah
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Outbound Scan Session Queue & Quantity Verification (7 cols) */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                    Verifikasi Jumlah &amp; Antrean Scan Keluar
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Validasi kecocokan jumlah barcode yang di-scan terhadap Target Jumlah Keluar.
                  </p>
                </div>

                {/* Live Counter Comparison Box */}
                <div
                  className={`px-3.5 py-2.5 rounded-xl border text-xs font-mono tabular-nums flex items-center justify-between sm:justify-start gap-3 ${
                    outboundQueue.length === 0
                      ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      : isQuantityMatched
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                      : 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800 text-red-900 dark:text-red-200'
                  }`}
                >
                  <div>
                    <span className="text-[11px] block opacity-75">Di-scan / Target</span>
                    <span className="text-base font-bold">
                      {outboundQueue.length} / {expectedOutboundQty} Unit
                    </span>
                  </div>
                  <div className="h-7 w-px bg-current opacity-20" />
                  <div className="font-sans font-semibold text-right sm:text-left">
                    {outboundQueue.length === 0
                      ? 'Menunggu Scan'
                      : isQuantityMatched
                      ? 'Jumlah Cocok'
                      : outboundQueue.length < expectedOutboundQty
                      ? `Kurang ${expectedOutboundQty - outboundQueue.length} Unit`
                      : `Lebih +${outboundQueue.length - expectedOutboundQty} Unit`}
                  </div>
                </div>
              </div>

              {/* Real-time Mismatch Warning Box */}
              {outboundQueue.length > 0 && !isQuantityMatched && (
                <div className="p-3.5 rounded-xl bg-red-50/80 dark:bg-red-950/40 border border-red-200 dark:border-red-800/80 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-red-900 dark:text-red-200 leading-relaxed">
                    <span className="font-bold block">
                      Peringatan Ketidakcocokan Jumlah Material Keluar:
                    </span>
                    Target pengeluaran <strong>{expectedOutboundQty} unit</strong>, namun barcode SN
                    yang di-scan saat ini <strong>{outboundQueue.length} unit</strong> (selisih{' '}
                    {Math.abs(expectedOutboundQty - outboundQueue.length)} unit).
                  </div>
                </div>
              )}

              {/* Scanned Outbound Items: Mobile Cards (<768px) + Desktop Table (>=768px) */}
              {outboundQueue.length === 0 ? (
                <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
                  <ScanBarcode className="w-9 h-9 text-slate-400 mx-auto stroke-1" />
                  <div className="space-y-1 max-w-md mx-auto">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Belum Ada Barcode Material Keluar yang Di-scan
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Gunakan kamera / scanner barcode atau ketuk tombol di bawah untuk simulasi scan
                      1 SN dari Sheet MATERIAL.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={simulateValidOutboundScan}
                    className="min-h-[44px] px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 rounded-xl transition-colors"
                  >
                    + Simulasi Scan 1 Material Siap Pakai
                  </button>
                </div>
              ) : (
                <>
                  {/* MOBILE CARD LIST FOR OUTBOUND QUEUE */}
                  <div className="md:hidden space-y-2.5">
                    {outboundQueue.map((item, idx) => (
                      <div
                        key={item.snMaterial}
                        className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                            <span>Urutan #{idx + 1}</span>
                            <span>·</span>
                            <span>Baris Sheet #{item.rowNumber}</span>
                          </div>
                          <div className="font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-white break-all tabular-nums">
                            {item.snMaterial}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                            <span className="font-mono font-semibold">{item.noMaterial}</span> ·{' '}
                            {item.spesifikasi}
                          </div>
                          <div className="text-[11px] font-mono pt-0.5">
                            <span className="text-emerald-700 dark:text-emerald-400">
                              SIAP PAKAI
                            </span>
                            <span className="mx-1.5 text-slate-400">→</span>
                            <span className="font-bold text-amber-700 dark:text-amber-400">
                              STOK TERPAKAI
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setOutboundQueue((prev) =>
                              prev.filter((r) => r.snMaterial !== item.snMaterial)
                            )
                          }
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-red-600 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shrink-0"
                          aria-label="Hapus item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* DESKTOP TABLE FOR OUTBOUND QUEUE */}
                  <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                          <th className="py-2.5 px-3">No</th>
                          <th className="py-2.5 px-3">Baris Sheet</th>
                          <th className="py-2.5 px-3">Kolom B: SN MATERIAL</th>
                          <th className="py-2.5 px-3">Kolom C &amp; D: Material</th>
                          <th className="py-2.5 px-3">Perubahan Kolom O</th>
                          <th className="py-2.5 px-3 text-right">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                        {outboundQueue.map((item, idx) => (
                          <tr
                            key={item.snMaterial}
                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                          >
                            <td className="py-2.5 px-3 font-mono tabular-nums text-slate-500">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                              #{item.rowNumber}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                              {item.snMaterial}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                                {item.noMaterial}
                              </span>
                              <span className="mx-1.5 text-slate-400">·</span>
                              <span className="text-slate-500 dark:text-slate-400">
                                {item.spesifikasi}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px]">
                              <span className="text-emerald-700 dark:text-emerald-400">
                                SIAP PAKAI
                              </span>
                              <span className="mx-1.5 text-slate-400">→</span>
                              <span className="font-bold text-amber-700 dark:text-amber-400">
                                STOK TERPAKAI
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setOutboundQueue((prev) =>
                                    prev.filter((r) => r.snMaterial !== item.snMaterial)
                                  )
                                }
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                                title="Hapus dari daftar scan keluar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Outbound Commit Actions (Full-width 48px buttons on mobile) */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2">
                <div className="flex items-center gap-2">
                  {outboundQueue.length > 0 && !isQuantityMatched && (
                    <button
                      type="button"
                      onClick={() => setExpectedOutboundQty(outboundQueue.length)}
                      className="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap"
                    >
                      Samakan Target ({outboundQueue.length} Unit)
                    </button>
                  )}
                  {outboundQueue.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOutboundQueue([])}
                      className="min-h-[44px] px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 rounded-xl transition-colors whitespace-nowrap"
                    >
                      Reset Antrean
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleCommitOutbound}
                  disabled={isProcessingOutbound}
                  className={`min-h-[48px] px-5 py-3 text-xs sm:text-sm font-bold text-white rounded-xl transition-all active:scale-[0.99] flex items-center justify-center gap-2 whitespace-nowrap ${
                    isQuantityMatched
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-sm'
                      : 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-700'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4 shrink-0" />
                  <span>Proses Keluar &amp; Masuk ke Sheet EKSEKUSI_MIMS</span>
                </button>
              </div>

              {/* Automatic Sheet "EKSEKUSI_MIMS" Format & Timestamp Preview Card */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Otomasi Sheet &quot;EKSEKUSI_MIMS&quot; ({eksekusiMimsRows.length} Baris
                      Tercatat)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSpreadsheetTab('EKSEKUSI_MIMS');
                      setActiveSection('spreadsheet');
                    }}
                    className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
                  >
                    <span>Lihat Tabel Sheet EKSEKUSI_MIMS</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Setiap material yang dikeluarkan otomatis membentuk baris baru pada Sheet{' '}
                  <code className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    EKSEKUSI_MIMS
                  </code>{' '}
                  dengan format: <strong>Kolom A = TIMESTAMP EKSEKUSI (YYYY-MM-DD HH:mm:ss)</strong>
                  , <strong>Kolom B = SN MATERIAL</strong>, <strong>Kolom C–N = Data Material</strong>
                  , <strong>Kolom O = STOK TERPAKAI</strong>,{' '}
                  <strong>Kolom P = NO DOKUMEN ({noDokumen})</strong>, dan{' '}
                  <strong>Kolom Q = PETUGAS ({petugas})</strong>.
                </p>

                {eksekusiMimsRows.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/60 space-y-1.5">
                    <div className="text-[11px] font-semibold text-amber-900 dark:text-amber-300">
                      Baris Terakhir Masuk ke Sheet &quot;EKSEKUSI_MIMS&quot;:
                    </div>
                    {eksekusiMimsRows
                      .slice(-2)
                      .reverse()
                      .map((m) => (
                        <div
                          key={`${m.mimsRowNumber}-${m.snMaterial}`}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono bg-white dark:bg-slate-900 p-2 rounded-lg border border-amber-200/60 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-amber-700 dark:text-amber-400">
                              #{m.mimsRowNumber}
                            </span>
                            <span className="text-slate-500 tabular-nums">
                              [{m.timestampEksekusi}]
                            </span>
                            <span className="font-bold text-slate-900 dark:text-white truncate">
                              {m.snMaterial}
                            </span>
                          </div>
                          <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                            {m.noMaterial} · {m.status}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SECTION 2: SCAN MATERIAL MASUK (INBOUND)
            Appends new row to Sheet "MATERIAL" with Column O = "SIAP PAKAI"
        ==================================================================== */}
        {activeSection === 'masuk' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Inbound Scanner Form (5 cols) */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3.5">
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Penerimaan Stok Gudang
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-display">
                  Scan Barcode Material Masuk
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Menambah baris baru pada Sheet <code className="font-mono">MATERIAL</code> dengan{' '}
                  <strong className="text-emerald-700 dark:text-emerald-400">
                    Kolom O = SIAP PAKAI
                  </strong>
                  .
                </p>
              </div>

              {/* Primary Mobile Camera Button */}
              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="w-full min-h-[48px] px-4 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] rounded-xl transition-all flex items-center justify-center gap-2.5 shadow-xs"
              >
                <Camera className="w-5 h-5" />
                <span>Buka Kamera Scan Material Masuk</span>
              </button>

              {/* Inbound Barcode Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleScanInboundSN(inboundScanInput);
                }}
                className="space-y-2"
              >
                <label
                  htmlFor="inbound-barcode-input"
                  className="block text-xs font-bold text-slate-900 dark:text-white"
                >
                  Scan Barcode Material Masuk (SN MATERIAL — Kolom B)
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <ScanBarcode className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={inboundInputRef}
                      id="inbound-barcode-input"
                      type="text"
                      value={inboundScanInput}
                      onChange={(e) => setInboundScanInput(e.target.value)}
                      placeholder="PLN0219000022402639..."
                      className="w-full min-h-[46px] pl-10 pr-3 py-2.5 text-xs sm:text-sm font-mono bg-slate-50 dark:bg-slate-950 border-2 border-emerald-600/80 dark:border-emerald-500 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isProcessingInbound}
                    className="min-h-[46px] px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors whitespace-nowrap shrink-0"
                  >
                    Tambah SN
                  </button>
                </div>
              </form>

              {/* Material Specification Template Selection */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                <div>
                  <label
                    htmlFor="inbound-mat-select"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Katalog No. Material &amp; Spesifikasi
                  </label>
                  <select
                    id="inbound-mat-select"
                    value={selectedInboundMat}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedInboundMat(val);
                      const found = catalog.find((c) => c.noMaterial === val);
                      if (found) setInboundBatchNo(found.defaultBatch);
                    }}
                    className="w-full min-h-[42px] px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    {catalog.map((c) => (
                      <option key={c.noMaterial} value={c.noMaterial}>
                        {c.noMaterial} — {c.spesifikasi}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      No. Batch (Kolom G)
                    </label>
                    <input
                      type="text"
                      value={inboundBatchNo}
                      onChange={(e) => setInboundBatchNo(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Status Kolom O
                    </label>
                    <input
                      type="text"
                      value="SIAP PAKAI"
                      disabled
                      className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    Mode Simpan:
                  </span>
                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setInboundAutoSave(true)}
                      className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        inboundAutoSave
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Langsung
                    </button>
                    <button
                      type="button"
                      onClick={() => setInboundAutoSave(false)}
                      className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                        !inboundAutoSave
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-semibold'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Antrean
                    </button>
                  </div>
                </div>
              </div>

              {/* Quick Simulation Buttons for Inbound */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Simulasi Scan Material Masuk &amp; Uji Duplikat:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={simulateValidInboundNewSN}
                    className="min-h-[44px] px-3 py-2 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Simulasi Scan SN Baru</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => simulateDuplicateScan('MASUK')}
                    className="min-h-[44px] px-3 py-2 text-xs font-semibold bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-xl transition-colors"
                  >
                    Uji Error SN Sudah Terdaftar
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Newly Added Rows in Spreadsheet (7 cols) */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3.5">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white font-display">
                    {inboundAutoSave
                      ? 'Baris Material Masuk Terbaru pada Sheet "MATERIAL"'
                      : `Antrean Material Masuk (${inboundQueue.length} Unit)`}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Menampilkan baris terakhir pada Sheet &quot;MATERIAL&quot; beserta status Kolom O
                    = SIAP PAKAI.
                  </p>
                </div>
                {!inboundAutoSave && inboundQueue.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCommitInboundBatch}
                    disabled={isProcessingInbound}
                    className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors whitespace-nowrap"
                  >
                    Simpan {inboundQueue.length} Baris ke Spreadsheet
                  </button>
                )}
              </div>

              {/* Mobile Cards for Latest Added Rows */}
              <div className="md:hidden space-y-2.5">
                {rows
                  .slice(-8)
                  .reverse()
                  .map((r) => (
                    <div
                      key={r.snMaterial}
                      className={`p-3.5 rounded-xl border space-y-1 ${
                        r.lastScanType === 'MASUK'
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/70'
                          : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          Baris #{r.rowNumber} · {r.tanggalHistory}
                        </span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {r.status}
                        </span>
                      </div>
                      <div className="font-mono font-bold text-xs text-slate-900 dark:text-white break-all tabular-nums">
                        {r.snMaterial}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                        <span className="font-mono font-semibold">{r.noMaterial}</span> ·{' '}
                        {r.spesifikasi}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Desktop Table for Latest Added Rows */}
              <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3">Baris #</th>
                      <th className="py-2.5 px-3">Kolom A: TANGGAL HISTORY</th>
                      <th className="py-2.5 px-3">Kolom B: SN MATERIAL</th>
                      <th className="py-2.5 px-3">Kolom C &amp; D: Spesifikasi</th>
                      <th className="py-2.5 px-3">Kolom O: STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {rows
                      .slice(-10)
                      .reverse()
                      .map((r) => (
                        <tr
                          key={r.snMaterial}
                          className={`${
                            r.lastScanType === 'MASUK'
                              ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                              : ''
                          } hover:bg-slate-50 dark:hover:bg-slate-800/40`}
                        >
                          <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                            #{r.rowNumber}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                            {r.tanggalHistory}
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                            {r.snMaterial}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-mono font-semibold">{r.noMaterial}</span>
                            <span className="mx-1.5 text-slate-400">·</span>
                            <span className="text-slate-500 dark:text-slate-400">
                              {r.spesifikasi}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                            {r.status}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            REKAPITULASI STOK PER NOMOR MATERIAL
            2-column tap cards on Mobile, Full table on Desktop
        ==================================================================== */}
        {stats && stats.byMaterialNo.length > 0 && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-600 shrink-0" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                  Rekapitulasi Stok per Nomor Material (Gd ULP Sinjai)
                </h2>
              </div>
              <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                Ketuk material untuk memfilter daftar
              </span>
            </div>

            {/* Mobile 2-Column Tap Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:hidden gap-2.5">
              {stats.byMaterialNo.map((group) => {
                const isSelected = materialFilter === group.noMaterial;
                return (
                  <button
                    key={group.noMaterial}
                    type="button"
                    onClick={() => {
                      setMaterialFilter(isSelected ? 'ALL' : group.noMaterial);
                      setActiveSection('spreadsheet');
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-sky-50 dark:bg-sky-950/50 border-sky-500'
                        : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white tabular-nums">
                        {group.noMaterial}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {group.total} unit
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">
                      {group.spesifikasi}
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono mt-2 pt-1.5 border-t border-slate-200/70 dark:border-slate-700/60">
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        Siap: {group.siapPakai}
                      </span>
                      <span className="text-amber-700 dark:text-amber-400 font-semibold">
                        Pakai: {group.stokTerpakai}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2 px-3">Kolom C: NO MATERIAL</th>
                    <th className="py-2 px-3">Kolom D: SPESIFIKASI</th>
                    <th className="py-2 px-3">Kolom F: KATEGORI</th>
                    <th className="py-2 px-3 text-right">Total Unit</th>
                    <th className="py-2 px-3 text-right">Kolom O: SIAP PAKAI</th>
                    <th className="py-2 px-3 text-right">Kolom O: STOK TERPAKAI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {stats.byMaterialNo.map((group) => (
                    <tr
                      key={group.noMaterial}
                      onClick={() => {
                        setMaterialFilter(
                          materialFilter === group.noMaterial ? 'ALL' : group.noMaterial
                        );
                        setActiveSection('spreadsheet');
                      }}
                      className={`cursor-pointer transition-colors ${
                        materialFilter === group.noMaterial
                          ? 'bg-sky-50/70 dark:bg-sky-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        {group.noMaterial}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-700 dark:text-slate-300">
                        {group.spesifikasi}
                      </td>
                      <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                        {group.kategori}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums">
                        {group.total.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {group.siapPakai.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                        {group.stokTerpakai.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ===================================================================
            SECTION 3: LIVE SPREADSHEET VIEW
            Supports switching between Sheet 1: "MATERIAL" (GID=0) and
            Sheet 2: "EKSEKUSI_MIMS" (Automatic Outbound Rows + Timestamp)
        ==================================================================== */}
        {(activeSection === 'spreadsheet' ||
          activeSection === 'keluar' ||
          activeSection === 'masuk') && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            {/* Google Spreadsheet Sheet Tab Bar (Sheet 1: MATERIAL | Sheet 2: EKSEKUSI_MIMS) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveSpreadsheetTab('MATERIAL')}
                  className={`min-h-[42px] px-4 py-2 text-xs font-bold rounded-xl border transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                    activeSpreadsheetTab === 'MATERIAL'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Sheet 1: MATERIAL (GID=0)</span>
                  <span className="font-mono text-[11px] opacity-90 tabular-nums">
                    ({rows.length})
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSpreadsheetTab('EKSEKUSI_MIMS')}
                  className={`min-h-[42px] px-4 py-2 text-xs font-bold rounded-xl border transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                    activeSpreadsheetTab === 'EKSEKUSI_MIMS'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Sheet 2: EKSEKUSI_MIMS</span>
                  <span className="font-mono text-[11px] opacity-90 tabular-nums">
                    ({eksekusiMimsRows.length} Keluar)
                  </span>
                </button>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {activeSpreadsheetTab === 'MATERIAL'
                  ? 'Stok Gudang Utama (Kolom A – O)'
                  : 'Otomatis Material Keluar + Timestamp (Kolom A – R)'}
              </div>
            </div>

            {activeSpreadsheetTab === 'EKSEKUSI_MIMS' ? (
              /* ===============================================================
                 SHEET 2: "EKSEKUSI_MIMS" (AUTOMATIC OUTBOUND + TIMESTAMP)
              ================================================================ */
              <div className="space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span className="font-mono font-bold">Sheet: &quot;EKSEKUSI_MIMS&quot;</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {eksekusiMimsRows.length} baris tercatat otomatis
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-display">
                      Data Otomatis Material Keluar &amp; Timestamp Eksekusi MIMS (Kolom A – R)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Setiap material yang dikeluarkan dari Sheet <code className="font-mono">MATERIAL</code>{' '}
                      otomatis masuk ke sheet ini lengkap dengan <strong>TIMESTAMP EKSEKUSI</strong>{' '}
                      pada Kolom A.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {eksekusiMimsRows.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const tsv = [
                            EKSEKUSI_MIMS_HEADERS.join('\t'),
                            ...eksekusiMimsRows.map((r) => mimsRowToSheetValues(r).join('\t')),
                          ].join('\n');
                          navigator.clipboard.writeText(tsv);
                          setCopiedMimsFormat(true);
                          setTimeout(() => setCopiedMimsFormat(false), 2000);
                        }}
                        className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                      >
                        {copiedMimsFormat ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-600" />
                            <span>Format Tersalin (Siap Paste)</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>Salin Format Tabel (TSV)</span>
                          </>
                        )}
                      </button>
                    )}

                    <a
                      href="/api/export/eksekusi-mims-csv"
                      download="LOGISTIK_SINJAI_EKSEKUSI_MIMS.csv"
                      className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Download className="w-4 h-4" />
                      <span>Unduh CSV EKSEKUSI_MIMS</span>
                    </a>
                  </div>
                </div>

                {/* Format Schema Reference Strip (Columns A to R) */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Struktur Format Otomatis Sheet &quot;EKSEKUSI_MIMS&quot; (18 Kolom: A s/d R):
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
                    {EKSEKUSI_MIMS_HEADERS.map((colName, idx) => {
                      const colLetter = String.fromCharCode(65 + idx);
                      const isHighlight =
                        colLetter === 'A' ||
                        colLetter === 'B' ||
                        colLetter === 'O' ||
                        colLetter === 'P';
                      return (
                        <span
                          key={colName}
                          className={`px-2 py-1 rounded border ${
                            isHighlight
                              ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 font-bold'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {colLetter}: {colName}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {eksekusiMimsRows.length === 0 ? (
                  <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
                    <Clock className="w-9 h-9 text-amber-500 mx-auto stroke-1" />
                    <div className="space-y-1 max-w-lg mx-auto">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        Sheet &quot;EKSEKUSI_MIMS&quot; Saat Ini Masih Kosong (0 Baris)
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                        Sesuai konfigurasi sumber data, Sheet <code className="font-mono">EKSEKUSI_MIMS</code>{' '}
                        dimulai dalam keadaan kosong dan akan terisi otomatis lengkap dengan{' '}
                        <strong>TIMESTAMP EKSEKUSI</strong> setiap kali petugas memproses pengeluaran
                        material.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const avail = rows.find((r) => r.status === 'SIAP PAKAI');
                        if (!avail) return;
                        const res = await fetch('/api/scan/outbound', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            snList: [avail.snMaterial],
                            expectedCount: 1,
                            expectedNoMaterial: 'ALL',
                            petugas,
                            noDokumen,
                          }),
                        });
                        const data = await res.json();
                        if (data.success) {
                          triggerSound('commit');
                          setRows(data.rows || []);
                          setEksekusiMimsRows(data.eksekusiMimsRows || []);
                          if (data.stats) setStats(data.stats);
                          if (data.logs) setLogs(data.logs);
                          setInlineBanner({
                            type: 'success',
                            title: '1 Baris Otomatis Masuk ke Sheet "EKSEKUSI_MIMS"!',
                            message: data.message,
                          });
                        }
                      }}
                      className="min-h-[44px] px-4 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors"
                    >
                      + Simulasikan 1 Material Keluar → Masuk ke Sheet EKSEKUSI_MIMS
                    </button>
                  </div>
                ) : (
                  <>
                    {/* MOBILE CARD VIEW FOR SHEET EKSEKUSI_MIMS */}
                    <div className="md:hidden space-y-2.5">
                      {eksekusiMimsRows
                        .slice()
                        .reverse()
                        .map((m) => (
                          <div
                            key={`${m.mimsRowNumber}-${m.snMaterial}`}
                            className="p-3.5 rounded-2xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/70 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                              <span className="font-bold text-amber-800 dark:text-amber-300">
                                EKSEKUSI_MIMS Baris #{m.mimsRowNumber}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-white bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded tabular-nums">
                                {m.timestampEksekusi}
                              </span>
                            </div>
                            <div className="font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-white break-all tabular-nums">
                              {m.snMaterial}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300">
                              <span className="font-mono font-semibold">{m.noMaterial}</span> ·
                              Batch <span className="font-mono">{m.noBatch}</span> ·{' '}
                              <span className="font-mono text-[11px]">{m.spesifikasi}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-amber-200/60 dark:border-amber-800/50 text-[11px] font-mono">
                              <div>
                                <span className="text-slate-500 block">Kolom O (STATUS):</span>
                                <span className="font-bold text-amber-700 dark:text-amber-400">
                                  {m.status}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block">Bon &amp; Ref:</span>
                                <span className="text-slate-800 dark:text-slate-200">
                                  {m.noDokumen} (MATERIAL!#{m.sourceMaterialRowNumber})
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* DESKTOP FULL 18-COLUMN TABLE FOR SHEET EKSEKUSI_MIMS */}
                    <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-amber-50/80 dark:bg-amber-950/40 border-b border-slate-200 dark:border-slate-700 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200">
                            <th className="py-2.5 px-2.5">Baris</th>
                            <th className="py-2.5 px-2.5">A · TIMESTAMP EKSEKUSI</th>
                            <th className="py-2.5 px-2.5">B · SN MATERIAL</th>
                            <th className="py-2.5 px-2.5">C · NO MAT</th>
                            <th className="py-2.5 px-2.5">D · SPESIFIKASI</th>
                            <th className="py-2.5 px-2.5">E · STATUS TRANSAKSI</th>
                            <th className="py-2.5 px-2.5">G · BATCH</th>
                            <th className="py-2.5 px-2.5">I/J · PLANT/SLOC</th>
                            <th className="py-2.5 px-2.5">M/N · UNIT GUDANG</th>
                            <th className="py-2.5 px-2.5">O · STATUS</th>
                            <th className="py-2.5 px-2.5">P · NO DOKUMEN</th>
                            <th className="py-2.5 px-2.5">Q · PETUGAS</th>
                            <th className="py-2.5 px-2.5">R · REF BARIS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                          {eksekusiMimsRows
                            .slice()
                            .reverse()
                            .map((m) => (
                              <tr
                                key={`${m.mimsRowNumber}-${m.snMaterial}`}
                                className="hover:bg-amber-50/30 dark:hover:bg-amber-950/20"
                              >
                                <td className="py-2 px-2.5 font-mono tabular-nums font-bold text-amber-700 dark:text-amber-400">
                                  #{m.mimsRowNumber}
                                </td>
                                <td className="py-2 px-2.5 font-mono tabular-nums font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                  {m.timestampEksekusi}
                                </td>
                                <td className="py-2 px-2.5 font-mono tabular-nums font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                  {m.snMaterial}
                                </td>
                                <td className="py-2 px-2.5 font-mono tabular-nums font-semibold">
                                  {m.noMaterial}
                                </td>
                                <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                  {m.spesifikasi}
                                </td>
                                <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {m.statusTransaksi}
                                </td>
                                <td className="py-2 px-2.5 font-mono tabular-nums">
                                  {m.noBatch}
                                </td>
                                <td className="py-2 px-2.5 font-mono text-[11px] whitespace-nowrap">
                                  {m.plant} / {m.storLoc}
                                </td>
                                <td className="py-2 px-2.5 text-[11px] whitespace-nowrap">
                                  {m.unit} · {m.storLocName}
                                </td>
                                <td className="py-2 px-2.5 font-mono font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                  {m.status}
                                </td>
                                <td className="py-2 px-2.5 font-mono text-[11px] whitespace-nowrap">
                                  {m.noDokumen}
                                </td>
                                <td className="py-2 px-2.5 text-[11px] whitespace-nowrap">
                                  {m.petugas}
                                </td>
                                <td className="py-2 px-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                                  MATERIAL!Baris #{m.sourceMaterialRowNumber}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* ===============================================================
                 SHEET 1: "MATERIAL" (GID=0, KOLOM A - O)
              ================================================================ */
              <>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                        Sheet: &quot;MATERIAL&quot; (GID=0)
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {filteredRows.length.toLocaleString('id-ID')} /{' '}
                        {rows.length.toLocaleString('id-ID')} baris
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-display">
                      Data Spreadsheet Material Gudang (Kolom A – Kolom O)
                    </h2>
                  </div>

                  {/* Filter & Search Controls */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    {/* Horizontal Scrollable Filter Tabs on Mobile */}
                    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto">
                      {(
                        [
                          { id: 'ALL', label: 'Semua' },
                          { id: 'SIAP PAKAI', label: 'SIAP PAKAI' },
                          { id: 'STOK TERPAKAI', label: 'STOK TERPAKAI' },
                          { id: 'BARU_MASUK', label: 'Baru Masuk' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setStatusFilter(tab.id)}
                          className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                            statusFilter === tab.id
                              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-semibold'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Search Input + CSV Export */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 sm:min-w-[220px]">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Cari SN (Kolom B), Batch..."
                          className="w-full min-h-[42px] pl-9 pr-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>

                      <a
                        href="/api/export/csv"
                        download="LOGISTIK_SINJAI_MATERIAL_GID_0.csv"
                        className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline">Ekspor CSV</span>
                      </a>
                    </div>
                  </div>
                </div>

                {isLoading ? (
                  <div className="space-y-2.5 py-6">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div
                        key={n}
                        className="h-14 bg-slate-100 dark:bg-slate-800/60 animate-pulse rounded-xl"
                      />
                    ))}
                  </div>
                ) : filteredRows.length === 0 ? (
                  <div className="py-12 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Tidak Ada Baris Material yang Sesuai Filter
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setStatusFilter('ALL');
                        setMaterialFilter('ALL');
                      }}
                      className="min-h-[44px] px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-xl"
                    >
                      Reset Pencarian &amp; Filter
                    </button>
                  </div>
                ) : (
                  <>
                    {/* MOBILE CARD LIST FOR SPREADSHEET (<768px) */}
                    <div className="md:hidden space-y-2.5">
                      {paginatedRows.map((row) => {
                        const isTerpakai = row.status === 'STOK TERPAKAI';
                        const isInOutboundQueue = outboundQueue.some(
                          (q) => q.snMaterial === row.snMaterial
                        );
                        return (
                          <div
                            key={`${row.rowNumber}-${row.snMaterial}`}
                            className={`p-3.5 rounded-2xl border space-y-2.5 ${
                              isTerpakai
                                ? 'bg-amber-50/35 dark:bg-amber-950/15 border-amber-200/80 dark:border-amber-800/60'
                                : row.lastScanType === 'MASUK'
                                ? 'bg-emerald-50/35 dark:bg-emerald-950/15 border-emerald-200/80 dark:border-emerald-800/60'
                                : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            {/* Top Metadata Row */}
                            <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                              <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                                Baris #{row.rowNumber} · {row.tanggalHistory}
                              </span>
                              <span
                                className={`font-bold ${
                                  isTerpakai
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                                }`}
                              >
                                Kolom O: {row.status}
                              </span>
                            </div>

                            {/* Middle SN & Spec */}
                            <div className="space-y-1">
                              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                Kolom B (SN MATERIAL):
                              </div>
                              <div className="font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-white break-all tabular-nums">
                                {row.snMaterial}
                              </div>
                              <div className="text-xs text-slate-600 dark:text-slate-300 pt-0.5">
                                <span className="font-mono font-semibold">{row.noMaterial}</span> ·
                                Batch <span className="font-mono">{row.noBatch}</span> ·{' '}
                                <span className="font-mono text-[11px]">{row.spesifikasi}</span>
                              </div>
                            </div>

                            {/* Bottom Touch Action Buttons (44px min height) */}
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setPreviewBarcodeRow(row)}
                                className="min-h-[42px] px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center justify-center gap-1.5"
                              >
                                <Eye className="w-3.5 h-3.5 text-sky-600" />
                                <span>Lihat Barcode</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSection('keluar');
                                  handleScanOutboundSN(row.snMaterial);
                                }}
                                className={`min-h-[42px] px-3 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 ${
                                  isTerpakai || isInOutboundQueue
                                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300'
                                    : 'bg-slate-900 dark:bg-sky-600 text-white'
                                }`}
                              >
                                <ScanBarcode className="w-3.5 h-3.5" />
                                <span>
                                  {isTerpakai
                                    ? 'Uji Scan Ulang'
                                    : isInOutboundQueue
                                    ? 'Di Antrean'
                                    : 'Scan Keluar'}
                                </span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* DESKTOP SPREADSHEET TABLE (>=768px) */}
                    <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300">
                            <th className="py-2.5 px-2.5">Baris</th>
                            <th className="py-2.5 px-2.5">A · TANGGAL HISTORY</th>
                            <th className="py-2.5 px-2.5">B · SN MATERIAL (Barcode)</th>
                            <th className="py-2.5 px-2.5">C · NO MAT</th>
                            <th className="py-2.5 px-2.5">D · SPESIFIKASI</th>
                            <th className="py-2.5 px-2.5">E · STATUS TRANSAKSI</th>
                            <th className="py-2.5 px-2.5">G · BATCH</th>
                            <th className="py-2.5 px-2.5">M/N · UNIT GUDANG</th>
                            <th className="py-2.5 px-2.5">O · STATUS</th>
                            <th className="py-2.5 px-2.5 text-right">Aksi Scan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                          {paginatedRows.map((row) => {
                            const isTerpakai = row.status === 'STOK TERPAKAI';
                            const isInOutboundQueue = outboundQueue.some(
                              (q) => q.snMaterial === row.snMaterial
                            );
                            return (
                              <tr
                                key={`${row.rowNumber}-${row.snMaterial}`}
                                className={`transition-colors ${
                                  isTerpakai
                                    ? 'bg-amber-50/30 dark:bg-amber-950/15 hover:bg-amber-50/60'
                                    : row.lastScanType === 'MASUK'
                                    ? 'bg-emerald-50/30 dark:bg-emerald-950/15 hover:bg-emerald-50/60'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                }`}
                              >
                                <td className="py-2 px-2.5 font-mono tabular-nums text-slate-500">
                                  #{row.rowNumber}
                                </td>
                                <td className="py-2 px-2.5 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {row.tanggalHistory}
                                </td>
                                <td className="py-2 px-2.5 font-mono tabular-nums font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                  <div className="flex items-center gap-1.5">
                                    <span>{row.snMaterial}</span>
                                    <button
                                      type="button"
                                      onClick={() => setPreviewBarcodeRow(row)}
                                      className="p-1 text-slate-400 hover:text-sky-600 rounded"
                                      title="Lihat visual Barcode 1D"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 font-mono tabular-nums font-semibold text-slate-800 dark:text-slate-200">
                                  {row.noMaterial}
                                </td>
                                <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                  {row.spesifikasi}
                                </td>
                                <td className="py-2 px-2.5 text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {row.statusTransaksi}
                                </td>
                                <td className="py-2 px-2.5 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                                  {row.noBatch}
                                </td>
                                <td className="py-2 px-2.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                  {row.unit} · {row.storLocName}
                                </td>
                                <td className="py-2 px-2.5 font-mono font-bold whitespace-nowrap">
                                  {isTerpakai ? (
                                    <span className="text-amber-700 dark:text-amber-400">
                                      STOK TERPAKAI
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700 dark:text-emerald-400">
                                      SIAP PAKAI
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-2.5 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveSection('keluar');
                                      handleScanOutboundSN(row.snMaterial);
                                    }}
                                    className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                                      isTerpakai || isInOutboundQueue
                                        ? 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                        : 'bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 text-white'
                                    }`}
                                  >
                                    {isTerpakai
                                      ? 'Uji Scan Ulang'
                                      : isInOutboundQueue
                                      ? 'Sudah di Antrean'
                                      : 'Scan Keluar'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* Touch-Friendly Pagination Footer */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-slate-600 dark:text-slate-400">
                  <div className="font-mono tabular-nums">
                    Halaman {currentPage} / {totalPages} · Baris{' '}
                    {filteredRows.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1}–
                    {Math.min(currentPage * rowsPerPage, filteredRows.length)}
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center gap-1 font-semibold"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Sebelumnya</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 disabled:opacity-40 flex items-center justify-center gap-1 font-semibold"
                    >
                      <span>Berikutnya</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {/* ===================================================================
            SECTION 4: RIWAYAT TRANSAKSI & LOG PERINGATAN SCAN
            Mobile Cards on <768px + Desktop Table on >=768px
        ==================================================================== */}
        {activeSection === 'riwayat' && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3.5">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-display">
                Riwayat Scan Barcode &amp; Log Notifikasi Peringatan
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Mencatat aktivitas Material Masuk, Material Keluar, serta peringatan error duplikat
                scan &amp; ketidakcocokan jumlah.
              </p>
            </div>

            {/* Mobile Log Cards */}
            <div className="md:hidden space-y-2.5">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                    <span className="font-bold">
                      {log.type === 'MASUK' && (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          MATERIAL MASUK
                        </span>
                      )}
                      {log.type === 'KELUAR' && (
                        <span className="text-amber-700 dark:text-amber-400">
                          MATERIAL KELUAR
                        </span>
                      )}
                      {log.type === 'ERROR_DUPLIKAT' && (
                        <span className="text-red-600 dark:text-red-400">
                          ALERT DUPLIKAT SCAN
                        </span>
                      )}
                      {log.type === 'ERROR_JUMLAH' && (
                        <span className="text-red-600 dark:text-red-400">
                          ERROR SELISIH JUMLAH
                        </span>
                      )}
                      {log.type === 'ERROR_TIDAK_DITEMUKAN' && (
                        <span className="text-amber-600 dark:text-amber-400">
                          SN TIDAK TERDAFTAR
                        </span>
                      )}
                    </span>
                    <span className="text-slate-500 tabular-nums">{log.timestamp}</span>
                  </div>
                  <div className="font-mono font-bold text-slate-900 dark:text-white break-all">
                    SN: {log.snMaterial}
                  </div>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                    {log.message}
                  </p>
                  <div className="text-[11px] text-slate-500 pt-0.5">Petugas: {log.petugas}</div>
                </div>
              ))}
            </div>

            {/* Desktop Log Table */}
            <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 px-3">Waktu Transaksi</th>
                    <th className="py-2.5 px-3">Jenis Aktivitas</th>
                    <th className="py-2.5 px-3">SN MATERIAL (Kolom B)</th>
                    <th className="py-2.5 px-3">Keterangan / Notifikasi Sistem</th>
                    <th className="py-2.5 px-3">Petugas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {log.timestamp}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap">
                        {log.type === 'MASUK' && (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            MATERIAL MASUK
                          </span>
                        )}
                        {log.type === 'KELUAR' && (
                          <span className="text-amber-700 dark:text-amber-400">
                            MATERIAL KELUAR
                          </span>
                        )}
                        {log.type === 'ERROR_DUPLIKAT' && (
                          <span className="text-red-600 dark:text-red-400">
                            ALERT DUPLIKAT SCAN
                          </span>
                        )}
                        {log.type === 'ERROR_JUMLAH' && (
                          <span className="text-red-600 dark:text-red-400">
                            ERROR SELISIH JUMLAH
                          </span>
                        )}
                        {log.type === 'ERROR_TIDAK_DITEMUKAN' && (
                          <span className="text-amber-600 dark:text-amber-400">
                            SN TIDAK TERDAFTAR
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                        {log.snMaterial}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">
                        {log.message}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {log.petugas}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* =====================================================================
          MOBILE FLOATING BOTTOM NAVIGATION DOCK (md:hidden)
          Elevated above mobile OS gesture / 3-button navigation bar
      ====================================================================== */}
      <div className="md:hidden fixed left-3 right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+14px)] z-40 pointer-events-none">
        <nav
          aria-label="Navigasi Utama Mobile"
          className="pointer-events-auto mx-auto max-w-md bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700/90 rounded-2xl shadow-xl shadow-slate-950/15 grid grid-cols-4 items-center gap-1 p-1.5"
        >
          <button
            type="button"
            onClick={() => setActiveSection('keluar')}
            className={`min-h-[46px] flex flex-col items-center justify-center rounded-xl transition-all ${
              activeSection === 'keluar'
                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold shadow-2xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <ArrowUpRight className="w-5 h-5" />
              {outboundQueue.length > 0 && (
                <span className="absolute -top-1.5 -right-3 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                  {outboundQueue.length}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">
              Scan Keluar
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('masuk')}
            className={`min-h-[46px] flex flex-col items-center justify-center rounded-xl transition-all ${
              activeSection === 'masuk'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold shadow-2xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ArrowDownLeft className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">
              Scan Masuk
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('spreadsheet')}
            className={`min-h-[46px] flex flex-col items-center justify-center rounded-xl transition-all ${
              activeSection === 'spreadsheet'
                ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-bold shadow-2xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">
              Spreadsheet
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('riwayat')}
            className={`min-h-[46px] flex flex-col items-center justify-center rounded-xl transition-all ${
              activeSection === 'riwayat'
                ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-bold shadow-2xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <History className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-0.5 whitespace-nowrap">
              Riwayat
            </span>
          </button>
        </nav>
      </div>

      {/* =====================================================================
          BARCODE 1D PREVIEW FLOATING BOTTOM SHEET / MODAL
      ====================================================================== */}
      {previewBarcodeRow && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:p-4"
          onClick={() => setPreviewBarcodeRow(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden pt-1 pb-1">
              <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
            </div>

            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[11px] font-mono text-slate-500">
                  Baris Spreadsheet #{previewBarcodeRow.rowNumber} · Kolom B
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Label Barcode Serial Number (SN)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewBarcodeRow(null)}
                className="min-h-[40px] px-2 text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                Tutup
              </button>
            </div>

            <div className="flex flex-col items-center justify-center py-4 px-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
              <BarcodeGraphic value={previewBarcodeRow.snMaterial} height={54} />
              <div className="mt-3 text-xs text-slate-600 dark:text-slate-400 text-center space-y-0.5">
                <div>
                  No. Material:{' '}
                  <strong className="font-mono">{previewBarcodeRow.noMaterial}</strong> · Batch:{' '}
                  <strong className="font-mono">{previewBarcodeRow.noBatch}</strong>
                </div>
                <div className="font-mono text-[11px]">{previewBarcodeRow.spesifikasi}</div>
                <div>
                  Status Kolom O:{' '}
                  <strong
                    className={`font-mono ${
                      previewBarcodeRow.status === 'STOK TERPAKAI'
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    {previewBarcodeRow.status}
                  </strong>
                </div>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => {
                  const sn = previewBarcodeRow.snMaterial;
                  setPreviewBarcodeRow(null);
                  setActiveSection('keluar');
                  handleScanOutboundSN(sn);
                }}
                className="w-full min-h-[48px] px-4 py-3 text-xs sm:text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl"
              >
                Simulasikan Scan Barcode Ini
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODALS: CAMERA SCANNER, ALERT NOTIFICATION, SPREADSHEET SYNC
      ====================================================================== */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onDetected={(sn) => {
          if (activeSection === 'masuk') {
            handleScanInboundSN(sn);
          } else {
            handleScanOutboundSN(sn);
          }
        }}
        modeLabel={activeSection === 'masuk' ? 'Material Masuk' : 'Material Keluar'}
      />

      <AlertNotificationModal
        alert={systemAlert}
        onClose={() => setSystemAlert(null)}
      />

      <SpreadsheetSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        sheetConfig={sheetConfig}
        totalRows={rows.length}
        mimsRowsCount={eksekusiMimsRows.length}
        googleUser={googleUser}
        accessToken={accessToken}
        needsAuth={needsAuth}
        isSigningIn={isSigningIn}
        connectedSheet={connectedSheet}
        selectedSheetTab={selectedSheetTab}
        onSelectSheetTab={(tab) => setSelectedSheetTab(tab)}
        onGoogleLogin={handleGoogleLogin}
        onGoogleLogout={handleGoogleLogout}
        onConnectSpreadsheet={(meta, tabTitle) => {
          setConnectedSheet(meta);
          setSelectedSheetTab(tabTitle);
          setSheetConfig((prev) => ({
            ...prev,
            spreadsheetName: meta.title,
            sheetName: tabTitle,
            googleSheetUrl: meta.spreadsheetUrl,
          }));
          setInlineBanner({
            type: 'success',
            title: `Google Spreadsheet "${meta.title}" Terhubung`,
            message: `Tab aktif: "${tabTitle}". Setiap Material Keluar otomatis diperbarui di Sheet MATERIAL & ditambahkan beserta Timestamp ke Sheet EKSEKUSI_MIMS.`,
          });
        }}
        onPullFromGoogleSheet={handlePullFromGoogleSheet}
        onRequestOverwriteGoogleSheet={requestOverwriteGoogleSheet}
        onRequestSyncMimsSheet={requestSyncMimsSheet}
        onRequestCreateNewGoogleSheet={requestCreateNewGoogleSheet}
        onSyncUrl={async (url) => {
          const res = await fetch('/api/sync/sheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ googleSheetUrl: url }),
          });
          const data = await res.json();
          if (data.rows) setRows(data.rows);
          if (data.stats) setStats(data.stats);
          if (data.logs) setLogs(data.logs);
          if (data.sheetConfig) setSheetConfig(data.sheetConfig);
          setInlineBanner({
            type: 'success',
            title: 'Sinkronisasi Spreadsheet Berhasil',
            message: data.message,
          });
        }}
        onResetData={async () => {
          const res = await fetch('/api/reset', { method: 'POST' });
          const data = await res.json();
          if (data.rows) setRows(data.rows);
          if (Array.isArray(data.eksekusiMimsRows)) setEksekusiMimsRows(data.eksekusiMimsRows);
          if (data.stats) setStats(data.stats);
          if (data.logs) setLogs(data.logs);
          setOutboundQueue([]);
          setInboundQueue([]);
          setInlineBanner({
            type: 'success',
            title: 'Data Spreadsheet Direset ke Awal',
            message: data.message,
          });
        }}
      />

      <GoogleSheetsConfirmModal
        mutation={pendingSheetsMutation}
        onCancel={() => setPendingSheetsMutation(null)}
      />

      <OfflineIndicator />

      {/* Quiet Footer (Desktop) */}
      <footer className="hidden md:block mt-auto border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-4 px-6">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div>
            PT PLN (Persero) UIW Sulselrabar · ULP Sinjai · Gudang Logistik ULP Sinjai (Plant 7417 / Stor Loc 2500)
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/api/export/csv"
              download="LOGISTIK_SINJAI_MATERIAL_GID_0.csv"
              className="hover:text-slate-900 dark:hover:text-white underline"
            >
              Unduh Spreadsheet MATERIAL (GID=0)
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
