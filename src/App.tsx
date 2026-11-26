import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  QrCode,
  Camera,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  AlertTriangle,
  CheckCircle2,
  XOctagon,
  Download,
  FileSpreadsheet,
  Plus,
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
  Trash2,
  RefreshCw,
  LogOut,
  LogIn,
  Package,
  Wrench,
  ClipboardCheck,
  ExternalLink,
  ShieldAlert,
  Smartphone,
  Lock,
} from 'lucide-react';
import {
  MaterialRow,
  EksekusiMimsRow,
  MaterialCatalogItem,
  ScanLogEntry,
  WarehouseStats,
  YantekRealisasiReport,
  HvbRealisasiReport,
  HvbEvidenRecord,
  YantekDatabaseSegment,
} from './types/warehouse';
import { DEFAULT_TEKNIK_SINJAI_DATA } from './data/teknikSinjaiDatabase';
import { RealisasiYantekView } from './components/RealisasiYantekView';
import { RealisasiHvbView } from './components/RealisasiHvbView';
import {
  playScanSuccessBeep,
  playScanErrorAlarm,
  playCommitSuccessChime,
} from './utils/sound';
import { parseQrPayloadToSNList } from './utils/qrParser';
import { CameraScannerModal } from './components/CameraScannerModal';
import {
  QrScannedListPopup,
  ScannedSnItemPreview,
} from './components/QrScannedListPopup';
import {
  ImportFeedbackModal,
  ImportFeedbackState,
} from './components/ImportFeedbackModal';
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
  signInWithGoogleIdentityServices,
  refreshServerOAuthSession,
  detectBrowserEnvironment,
  FIREBASE_PROJECT_ID,
  OAUTH_CLIENT_ID,
  getActiveOAuthClientId,
  setCustomOAuthClientId,
  hasCustomOAuthClientId,
  FIREBASE_AUTH_DOMAINS_URL,
  GCP_OAUTH_CLIENTS_URL,
  GCP_OAUTH_CONSENT_AUDIENCE_URL,
  getAccessToken,
  logoutGoogle,
  SpreadsheetMetadata,
  extractSpreadsheetId,
  listDriveSpreadsheets,
  findAllLogistikSinjaiSpreadsheets,
  findLogistikSinjaiSpreadsheet,
  isTeknikSpreadsheetTitle,
  normalizeSpreadsheetDateTime,
  readMaterialRowsFromGoogleSheet,
  createNewWarehouseGoogleSheet,
  initializeAndFormatEmptySpreadsheet,
  overwriteGoogleSheetRows,
  overwriteEksekusiMimsSheetRows,
  appendInboundRowsToGoogleSheet,
  updateOutboundStatusInGoogleSheet,
  SPREADSHEET_HEADERS,
  EKSEKUSI_MIMS_HEADERS,
  REKAP_STOK_HEADERS,
  mimsRowToSheetValues,
  syncYantekReportsToAllTeknikSheets,
  syncHvbReportsToAllTeknikSheets,
  getStoredHvbEvidenRecords,
  saveStoredHvbEvidenRecords,
} from './services/googleWorkspace';

type ActiveModule = 'logistik' | 'yantek' | 'hvb';
type ActiveSection =
  | 'masuk'
  | 'keluar'
  | 'rekap'
  | 'yantek'
  | 'hvb'
  | 'spreadsheet'
  | 'riwayat';

const DEFAULT_MATERIAL_CATALOG: MaterialCatalogItem[] = [
  {
    noMaterial: '2190224',
    spesifikasi: 'MTR;kWH E-PR;;1P;230V;5-60A;1;;2W',
    kategori: 'kWh Meter',
    defaultBatch: '15',
    valuationType: 'NORMAL',
    plant: '7417',
    storLoc: '2500',
    companyCode: '74',
    unitInduk: 'UIW SULSELRABAR',
    unit: 'ULP SINJAI',
    storLocName: 'Gd ULP Sinjai',
  },
  {
    noMaterial: '2190502',
    spesifikasi: 'MTR;kWH E;;1P;230V;5-60A;1;;2W',
    kategori: 'kWh Meter',
    defaultBatch: '102',
    valuationType: 'NORMAL',
    plant: '7417',
    storLoc: '2500',
    companyCode: '74',
    unitInduk: 'UIW SULSELRABAR',
    unit: 'ULP SINJAI',
    storLocName: 'Gd ULP Sinjai',
  },
  {
    noMaterial: '2190218',
    spesifikasi: 'MTR;kWH E;;3P;230/400V;5-80A;1;;4W',
    kategori: 'kWh Meter',
    defaultBatch: '260701',
    valuationType: 'NORMAL',
    plant: '7417',
    storLoc: '2500',
    companyCode: '74',
    unitInduk: 'UIW SULSELRABAR',
    unit: 'ULP SINJAI',
    storLocName: 'Gd ULP Sinjai',
  },
  {
    noMaterial: '2190252',
    spesifikasi: 'MTR;kWH E-PR;;3P;230/400V;5-80A;1;;4W',
    kategori: 'kWh Meter',
    defaultBatch: '0392J',
    valuationType: 'NORMAL',
    plant: '7417',
    storLoc: '2500',
    companyCode: '74',
    unitInduk: 'UIW SULSELRABAR',
    unit: 'ULP SINJAI',
    storLocName: 'Gd ULP Sinjai',
  },
  {
    noMaterial: '2190267',
    spesifikasi: 'MTR;kWH E;;1P;220/240V;5-100A;1;ST;2W',
    kategori: 'kWh Meter',
    defaultBatch: '6',
    valuationType: 'NORMAL',
    plant: '7417',
    storLoc: '2500',
    companyCode: '74',
    unitInduk: 'UIW SULSELRABAR',
    unit: 'ULP SINJAI',
    storLocName: 'Gd ULP Sinjai',
  },
  {
    noMaterial: '2190438',
    spesifikasi: 'MTR;kWHE;;3P;57.7/100V-230/400;5A;0.5;4W',
    kategori: 'kWh Meter',
    defaultBatch: '507G',
    valuationType: 'NORMAL',
    plant: '7417',
    storLoc: '2500',
    companyCode: '74',
    unitInduk: 'UIW SULSELRABAR',
    unit: 'ULP SINJAI',
    storLocName: 'Gd ULP Sinjai',
  },
];

const NETLIFY_STATIC_CACHE_KEY = 'sinjai_benderang_static_cache_v1';

interface ReadyInboundItem {
  snMaterial: string;
  noMaterial: string;
  spesifikasi: string;
  kategori: string;
  noBatch: string;
  qrType: 'TUNGGAL' | 'BUNDLE';
}

interface ReadyOutboundItem extends MaterialRow {
  qrType: 'TUNGGAL' | 'BUNDLE';
}

const CONNECTED_SHEET_STORAGE_KEY = 'simlog_sinjai_connected_sheet_v1';
const SELECTED_TAB_STORAGE_KEY = 'simlog_sinjai_selected_tab_v1';

export default function App() {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [eksekusiMimsRows, setEksekusiMimsRows] = useState<EksekusiMimsRow[]>([]);
  const [yantekReports, setYantekReports] = useState<YantekRealisasiReport[]>([]);
  const [hvbReports, setHvbReports] = useState<HvbRealisasiReport[]>([]);
  const [hvbEvidenList, setHvbEvidenList] = useState<HvbEvidenRecord[]>(() =>
    getStoredHvbEvidenRecords()
  );
  const [yantekSegments, setYantekSegments] = useState<YantekDatabaseSegment[]>(
    DEFAULT_TEKNIK_SINJAI_DATA.segments
  );
  const [yantekPekerjaanCatalog, setYantekPekerjaanCatalog] = useState<string[]>(
    DEFAULT_TEKNIK_SINJAI_DATA.pekerjaanCatalog
  );
  const [logs, setLogs] = useState<ScanLogEntry[]>([]);
  const [stats, setStats] = useState<WarehouseStats | null>(null);
  const [catalog, setCatalog] = useState<MaterialCatalogItem[]>(DEFAULT_MATERIAL_CATALOG);
  const hasBackendServerRef = useRef<boolean>(false);
  const [sheetConfig, setSheetConfig] = useState({
    spreadsheetName: 'LOGISTIK_SINJAI',
    sheetName: 'MATERIAL_MASUK',
    mimsSheetName: 'MATERIAL_KELUAR',
    gid: '0',
    googleSheetUrl: '',
    lastSyncedAt: '',
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Navigation & UI state — Pisahkan setiap menu (Logistik, Yantek, Realisasi HVB)
  const [selectedModule, setSelectedModule] = useState<ActiveModule>('logistik');
  const [activeSection, setActiveSection] = useState<ActiveSection>('masuk');
  const [isLoginPageOpen, setIsLoginPageOpen] = useState<boolean>(true);
  const [activeSpreadsheetTab, setActiveSpreadsheetTab] = useState<
    'MATERIAL_MASUK' | 'MATERIAL_KELUAR'
  >('MATERIAL_MASUK');
  const [copiedMimsFormat, setCopiedMimsFormat] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isCameraOpen, setIsCameraOpen] = useState<boolean>(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState<boolean>(false);
  const [showMobileMetaForm, setShowMobileMetaForm] = useState<boolean>(false);
  const [systemAlert, setSystemAlert] = useState<SystemAlertState | null>(null);
  const [importFeedback, setImportFeedback] = useState<ImportFeedbackState | null>(null);
  const [inlineBanner, setInlineBanner] = useState<{
    type: 'error' | 'warning' | 'success';
    title: string;
    message: string;
  } | null>(null);
  const [previewBarcodeRow, setPreviewBarcodeRow] = useState<MaterialRow | null>(null);

  // Popup Deretan SN yang Terscan State
  const [qrPopupState, setQrPopupState] = useState<{
    isOpen: boolean;
    mode: 'MASUK' | 'KELUAR';
    qrType: 'TUNGGAL' | 'BUNDLE';
    items: ScannedSnItemPreview[];
  }>({
    isOpen: false,
    mode: 'KELUAR',
    qrType: 'TUNGGAL',
    items: [],
  });

  // Google Workspace (Sheets & Drive) Authentication & Sync State
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [authDomainError, setAuthDomainError] = useState<string | null>(null);
  const [showOAuthTroubleshooting, setShowOAuthTroubleshooting] = useState<boolean>(false);
  const [copiedAuthKey, setCopiedAuthKey] = useState<string | null>(null);
  const [isCheckingServerSession, setIsCheckingServerSession] = useState<boolean>(false);
  const [customClientIdInput, setCustomClientIdInput] = useState<string>(() =>
    hasCustomOAuthClientId() ? getActiveOAuthClientId() : ''
  );
  const [activeClientId, setActiveClientId] = useState<string>(() => getActiveOAuthClientId());
  const browserEnv = useMemo(() => detectBrowserEnvironment(), []);
  const [connectedSheet, setConnectedSheet] = useState<SpreadsheetMetadata | null>(() => {
    try {
      const saved = localStorage.getItem(CONNECTED_SHEET_STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as SpreadsheetMetadata;
      // Menu Logistik hanya menggunakan Spreadsheet LOGISTIK SINJAI (bukan TEKNIK SINJAI)
      if (parsed?.title && isTeknikSpreadsheetTitle(parsed.title)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const [selectedSheetTab, setSelectedSheetTab] = useState<string>(() => {
    try {
      return localStorage.getItem(SELECTED_TAB_STORAGE_KEY) || 'MATERIAL_MASUK';
    } catch {
      return 'MATERIAL_MASUK';
    }
  });
  const [pendingSheetsMutation, setPendingSheetsMutation] =
    useState<PendingSheetsMutation | null>(null);

  useEffect(() => {
    try {
      if (connectedSheet) {
        localStorage.setItem(CONNECTED_SHEET_STORAGE_KEY, JSON.stringify(connectedSheet));
      } else {
        localStorage.removeItem(CONNECTED_SHEET_STORAGE_KEY);
      }
    } catch {
      // Ignore storage error
    }
  }, [connectedSheet]);

  useEffect(() => {
    try {
      if (selectedSheetTab) {
        localStorage.setItem(SELECTED_TAB_STORAGE_KEY, selectedSheetTab);
      }
    } catch {
      // Ignore storage error
    }
  }, [selectedSheetTab]);

  // Officer & Document info
  const [petugas, setPetugas] = useState<string>('');
  const [noDokumen, setNoDokumen] = useState<string>('BON-SINJAI-2026-01');

  // Outbound (Material Keluar) State & Kolom List Siap Import
  const [outboundSubMenu, setOutboundSubMenu] = useState<'scan' | 'manual'>('scan');
  const [outboundScanInput, setOutboundScanInput] = useState<string>('');
  const [outboundNamaMaterial, setOutboundNamaMaterial] = useState<string>('');
  const [outboundNonQrCode, setOutboundNonQrCode] = useState<string>('');
  const [outboundNonQrQty, setOutboundNonQrQty] = useState<number>(1);
  const [expectedOutboundMat, setExpectedOutboundMat] = useState<string>('ALL');
  const [outboundReadyList, setOutboundReadyList] = useState<ReadyOutboundItem[]>([]);
  const [isProcessingOutbound, setIsProcessingOutbound] = useState<boolean>(false);

  // Inbound (Material Masuk) State & Kolom List Siap Import
  const [inboundSubMenu, setInboundSubMenu] = useState<'scan' | 'manual'>('scan');
  const [inboundScanInput, setInboundScanInput] = useState<string>('');
  const [inboundNamaMaterial, setInboundNamaMaterial] = useState<string>('');
  const [inboundNonQrCode, setInboundNonQrCode] = useState<string>('');
  const [inboundNonQrQty, setInboundNonQrQty] = useState<number>(1);
  const [selectedInboundMat, setSelectedInboundMat] = useState<string>('2190224');
  const [inboundBatchNo, setInboundBatchNo] = useState<string>('15');
  const [inboundReadyList, setInboundReadyList] = useState<ReadyInboundItem[]>([]);
  const [isProcessingInbound, setIsProcessingInbound] = useState<boolean>(false);

  // Spreadsheet Table Filter & Pagination State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'STOK SIAP' | 'TERPAKAI' | 'BARU_MASUK'
  >('ALL');
  const [materialFilter, setMaterialFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const rowsPerPage = 20;

  const outboundInputRef = useRef<HTMLInputElement>(null);
  const inboundInputRef = useRef<HTMLInputElement>(null);

  const fetchWarehouseData = useCallback(async () => {
    try {
      const res = await fetch('/api/materials');
      const rawText = await res.text();
      const trimmed = rawText.trim();
      if (!res.ok || !trimmed || trimmed.startsWith('<')) {
        // Static hosting fallback (e.g., Netlify)
        try {
          const cachedRaw = localStorage.getItem(NETLIFY_STATIC_CACHE_KEY);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (Array.isArray(cached.rows)) setRows(cached.rows);
            if (Array.isArray(cached.eksekusiMimsRows)) {
              setEksekusiMimsRows(cached.eksekusiMimsRows);
            }
            if (Array.isArray(cached.yantekReports)) setYantekReports(cached.yantekReports);
            if (Array.isArray(cached.hvbReports)) setHvbReports(cached.hvbReports);
            if (Array.isArray(cached.hvbEvidenList)) {
              setHvbEvidenList(cached.hvbEvidenList);
              saveStoredHvbEvidenRecords(cached.hvbEvidenList);
            }
          }
        } catch {
          // Ignore local cache parse error
        }
        return;
      }
      hasBackendServerRef.current = true;
      const data = JSON.parse(trimmed);
      setRows(data.rows || []);
      setEksekusiMimsRows(data.eksekusiMimsRows || []);
      if (Array.isArray(data.yantekReports)) {
        setYantekReports(data.yantekReports);
      }
      if (Array.isArray(data.hvbReports)) {
        setHvbReports(data.hvbReports);
      }
      if (Array.isArray(data.hvbEvidenList)) {
        setHvbEvidenList(data.hvbEvidenList);
        saveStoredHvbEvidenRecords(data.hvbEvidenList);
      }
      if (Array.isArray(data.yantekSegments) && data.yantekSegments.length > 0) {
        setYantekSegments(data.yantekSegments);
      }
      if (
        Array.isArray(data.yantekPekerjaanCatalog) &&
        data.yantekPekerjaanCatalog.length > 0
      ) {
        setYantekPekerjaanCatalog(data.yantekPekerjaanCatalog);
      }
      setLogs(data.logs || []);
      setStats(data.stats || null);
      if (Array.isArray(data.catalog) && data.catalog.length > 0) {
        setCatalog(data.catalog);
      }
      if (data.sheetConfig) setSheetConfig(data.sheetConfig);
    } catch (err) {
      console.warn('Info sinkronisasi awal:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    saveStoredHvbEvidenRecords(hvbEvidenList);
  }, [hvbEvidenList]);

  useEffect(() => {
    if (isLoading || hasBackendServerRef.current) return;
    try {
      localStorage.setItem(
        NETLIFY_STATIC_CACHE_KEY,
        JSON.stringify({
          rows,
          eksekusiMimsRows,
          yantekReports,
          hvbReports,
          hvbEvidenList,
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [isLoading, rows, eksekusiMimsRows, yantekReports, hvbReports, hvbEvidenList]);

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

  const detectCatalogForSn = useCallback(
    (sn: string): MaterialCatalogItem => {
      const cleaned = sn.trim().toUpperCase();
      for (const item of catalog) {
        const suffix = item.noMaterial.slice(-3);
        if (cleaned.startsWith(`PLN02190000${suffix}`) || cleaned.includes(item.noMaterial)) {
          return item;
        }
      }
      return (
        catalog.find((c) => c.noMaterial === selectedInboundMat) ||
        catalog[0] || {
          noMaterial: '2190224',
          spesifikasi: 'MTR;kWH E-PR;;1P;230V;5-60A;1;;2W',
          kategori: 'kWh Meter',
          defaultBatch: '15',
          valuationType: 'NORMAL',
          plant: '7417',
          storLoc: '2500',
          companyCode: '74',
          unitInduk: 'UIW SULSELRABAR',
          unit: 'ULP SINJAI',
          storLocName: 'Gd ULP Sinjai',
        }
      );
    },
    [catalog, selectedInboundMat]
  );

  const handleGoogleLogin = async () => {
    setIsSigningIn(true);
    setAuthDomainError(null);
    setInlineBanner(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
        setAuthDomainError(null);
        setShowOAuthTroubleshooting(false);
        setInlineBanner({
          type: 'success',
          title: 'Berhasil Masuk ke Google Workspace',
          message: `Terhubung sebagai ${result.user.email}.`,
        });
      }
    } catch (err: any) {
      const errCode = String(err?.code || '');
      const msg = String(err?.message || '');
      if (
        errCode === 'auth/popup-closed-by-user' ||
        errCode === 'auth/cancelled-popup-request' ||
        msg.includes('popup-closed-by-user') ||
        msg.includes('cancelled-popup-request')
      ) {
        return;
      }
      setAuthDomainError(
        msg ||
          'Login Google gagal atau diblokir kebijakan OAuth 2.0 Google. Periksa panduan di bawah.'
      );
      setShowOAuthTroubleshooting(true);
      setInlineBanner({
        type: 'error',
        title:
          errCode === 'oauth/disallowed-webview'
            ? 'Buka Aplikasi di Chrome / Safari'
            : 'Otorisasi Google OAuth 2.0 Diblokir',
        message:
          msg ||
          'Silakan periksa Origin & OAuth Consent Screen pada panduan di bawah, atau coba tombol "Login Google Mobile".',
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDirectGisLogin = async () => {
    setIsSigningIn(true);
    setAuthDomainError(null);
    setInlineBanner(null);
    try {
      const result = await signInWithGoogleIdentityServices('select_account');
      if (result) {
        setGoogleUser(result.user);
        setAccessToken(result.accessToken);
        setNeedsAuth(false);
        setAuthDomainError(null);
        setShowOAuthTroubleshooting(false);
        setInlineBanner({
          type: 'success',
          title: 'Berhasil Masuk via Google OAuth Mobile',
          message: `Terhubung sebagai ${result.user.email}. Silakan pilih salah satu menu akses di bawah untuk masuk ke menu yang dituju.`,
        });
      }
    } catch (err: any) {
      const errCode = String(err?.code || '');
      const msg = String(err?.message || '');
      if (
        errCode === 'auth/popup-closed-by-user' ||
        msg.includes('popup-closed-by-user')
      ) {
        return;
      }
      console.error('Direct GIS login failed:', err);
      const resolvedMsg =
        msg ||
        'Gagal login melalui Google Identity Services. Pastikan Origin aplikasi sudah terdaftar di Google Cloud Console & Firebase Console.';
      setAuthDomainError(resolvedMsg);
      setShowOAuthTroubleshooting(true);
      setInlineBanner({
        type: 'error',
        title:
          errCode === 'oauth/disallowed-webview'
            ? 'Buka Aplikasi di Chrome / Safari'
            : 'Login Google Mobile Diblokir OAuth 2.0',
        message: resolvedMsg,
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleRefreshServerSession = async () => {
    setIsCheckingServerSession(true);
    setInlineBanner(null);
    try {
      const sess = await refreshServerOAuthSession();
      if (sess) {
        setGoogleUser(sess.user);
        setAccessToken(sess.accessToken);
        setNeedsAuth(false);
        setAuthDomainError(null);
        setShowOAuthTroubleshooting(false);
        setInlineBanner({
          type: 'success',
          title: 'Sesi Google Server Aktif',
          message: `Berhasil menggunakan sesi aktif (${sess.user.email}).`,
        });
      } else {
        setInlineBanner({
          type: 'warning',
          title: 'Belum Ada Sesi Server Aktif',
          message:
            'Admin belum login Google pada server ini atau sesi sudah kedaluwarsa. Anda tetap dapat masuk ke menu layanan di bawah, atau Admin perlu mendaftarkan Origin & email petugas.',
        });
      }
    } finally {
      setIsCheckingServerSession(false);
    }
  };

  const handleCopyAuthValue = async (key: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedAuthKey(key);
      setTimeout(() => setCopiedAuthKey(null), 2200);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setAccessToken(null);
    setNeedsAuth(true);
    setConnectedSheet(null);
    setIsLoginPageOpen(true);
  };

  // Auto-sync saved Yantek & HVB reports whenever accessToken is active and reports are loaded
  const lastSyncedYantekTokenKeyRef = useRef<string>('');
  const lastSyncedHvbTokenKeyRef = useRef<string>('');
  useEffect(() => {
    if (!accessToken || needsAuth || isLoading) {
      return;
    }

    const yantekKey = `${accessToken.slice(-12)}:${yantekReports.length}`;
    if (yantekReports.length > 0 && lastSyncedYantekTokenKeyRef.current !== yantekKey) {
      lastSyncedYantekTokenKeyRef.current = yantekKey;
      syncYantekReportsToAllTeknikSheets(accessToken, yantekReports).catch(() => {
        lastSyncedYantekTokenKeyRef.current = '';
      });
    }

    const hvbKey = `${accessToken.slice(-12)}:${hvbReports.length}:${hvbEvidenList.length}`;
    if (
      (hvbReports.length > 0 || hvbEvidenList.length > 0) &&
      lastSyncedHvbTokenKeyRef.current !== hvbKey
    ) {
      lastSyncedHvbTokenKeyRef.current = hvbKey;
      syncHvbReportsToAllTeknikSheets(accessToken, hvbReports, undefined, hvbEvidenList).catch(
        () => {
          lastSyncedHvbTokenKeyRef.current = '';
        }
      );
    }
  }, [accessToken, needsAuth, isLoading, hvbReports, hvbEvidenList, yantekReports]);

  // Auto-discover, format, and repair date columns in LOGISTIK SINJAI spreadsheet when accessToken is active
  const formattedSpreadsheetIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!accessToken || needsAuth) return;

    const autoFormatTargetSpreadsheet = async () => {
      try {
        const candidateIds: string[] = [];
        if (connectedSheet && !isTeknikSpreadsheetTitle(connectedSheet.title)) {
          candidateIds.push(connectedSheet.spreadsheetId);
        }
        if (!isTeknikSpreadsheetTitle(sheetConfig.spreadsheetName || '')) {
          const cfgId = extractSpreadsheetId(sheetConfig.googleSheetUrl || '');
          if (cfgId && !candidateIds.includes(cfgId)) {
            candidateIds.push(cfgId);
          }
        }

        const driveFiles = await listDriveSpreadsheets(accessToken).catch(() => []);
        const matchedLogistikFiles = findAllLogistikSinjaiSpreadsheets(driveFiles);
        for (const f of matchedLogistikFiles.slice(0, 3)) {
          if (!candidateIds.includes(f.id)) {
            candidateIds.push(f.id);
          }
        }

        let primaryFormattedMeta: SpreadsheetMetadata | null = null;
        for (const id of candidateIds) {
          if (formattedSpreadsheetIdsRef.current.has(id)) continue;
          formattedSpreadsheetIdsRef.current.add(id);
          try {
            const formattedMeta = await initializeAndFormatEmptySpreadsheet(
              accessToken,
              id,
              rows,
              eksekusiMimsRows
            );
            if (!isTeknikSpreadsheetTitle(formattedMeta.title) && !primaryFormattedMeta) {
              primaryFormattedMeta = formattedMeta;
            }
          } catch {
            formattedSpreadsheetIdsRef.current.delete(id);
          }
        }

        if (primaryFormattedMeta) {
          setConnectedSheet(primaryFormattedMeta);
          setSelectedSheetTab('MATERIAL_MASUK');
          setSheetConfig((prev) => ({
            ...prev,
            spreadsheetName: primaryFormattedMeta!.title,
            sheetName: 'MATERIAL_MASUK',
            mimsSheetName: 'MATERIAL_KELUAR',
            googleSheetUrl: primaryFormattedMeta!.spreadsheetUrl,
          }));
        }
      } catch (err) {
        console.warn('Auto-format spreadsheet skipped:', err);
      }
    };

    autoFormatTargetSpreadsheet();
  }, [
    accessToken,
    needsAuth,
    isLoginPageOpen,
    selectedModule,
    connectedSheet?.spreadsheetId,
    sheetConfig.googleSheetUrl,
  ]);

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

    // Format empty sheets and headers first so Sheet1 / empty tabs become MATERIAL_MASUK, MATERIAL_KELUAR, REKAP_STOK
    const formattedMeta = await initializeAndFormatEmptySpreadsheet(
      token,
      spreadsheetId,
      rows,
      eksekusiMimsRows
    ).catch(() => null);

    if (formattedMeta) {
      setConnectedSheet(formattedMeta);
    }

    const effectiveTab =
      tabTitle.toUpperCase() === 'SHEET1' || tabTitle.toUpperCase() === 'LEMBAR1'
        ? 'MATERIAL_MASUK'
        : tabTitle;
    if (effectiveTab !== tabTitle) {
      setSelectedSheetTab(effectiveTab);
    }

    const pulledRows = await readMaterialRowsFromGoogleSheet(token, spreadsheetId, effectiveTab);
    if (pulledRows.length === 0) {
      setInlineBanner({
        type: 'success',
        title: `Spreadsheet Kosong "${title}" Telah Disesuaikan Formatnya!`,
        message: `Format 3 Sheet ("MATERIAL_MASUK" Kolom A–O, "MATERIAL_KELUAR" Kolom A–R gid=164626621, & "REKAP_STOK" Kolom A–G gid=164626622) telah disesuaikan dengan inputan aplikasi dan siap menerima data Scan & Manual.`,
      });
      return;
    }

    try {
      const res = await fetch('/api/sync/import-rows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: pulledRows,
          spreadsheetName: title,
          sheetName: effectiveTab,
          googleSheetUrl: url,
          userEmail: googleUser?.email || '',
        }),
      });
      const rawText = await res.text();
      const trimmed = rawText.trim();
      if (trimmed && !trimmed.startsWith('<')) {
        const data = JSON.parse(trimmed);
        if (data.rows) setRows(data.rows);
        if (data.stats) setStats(data.stats);
        if (data.logs) setLogs(data.logs);
        if (data.sheetConfig) setSheetConfig(data.sheetConfig);
      } else {
        setRows(pulledRows);
      }
    } catch {
      setRows(pulledRows);
    }
  };

  const requestOverwriteGoogleSheet = (
    spreadsheetId: string,
    tabTitle: string,
    title: string
  ) => {
    setPendingSheetsMutation({
      type: 'OVERWRITE_SHEET',
      title: `Perbarui Isi Sheet "${tabTitle}" pada Google Spreadsheet "${title}"?`,
      description: `Tindakan ini akan memperbarui dan menulis ${rows.length} baris data stok material ke tab "${tabTitle}" di Google Sheets milik Anda.`,
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
    const cleanTitle = newTitle.trim() || 'LOGISTIK_SINJAI';
    setPendingSheetsMutation({
      type: 'CREATE_NEW_SHEET',
      title: `Buat File Google Spreadsheet Baru "${cleanTitle}" di Google Drive?`,
      description: `Sistem akan membuat file Google Spreadsheet baru dengan 3 Sheet terformat sesuai inputan aplikasi: "MATERIAL_MASUK" (gid=0 · ${rows.length} baris), "MATERIAL_KELUAR" (gid=164626621 · ${eksekusiMimsRows.length} baris), dan "REKAP_STOK" (gid=164626622).`,
      spreadsheetTitle: cleanTitle,
      sheetTabName: 'MATERIAL_MASUK, MATERIAL_KELUAR & REKAP_STOK',
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
        setSelectedSheetTab('MATERIAL_MASUK');
        setSheetConfig((prev) => ({
          ...prev,
          spreadsheetName: meta.title,
          sheetName: 'MATERIAL_MASUK',
          mimsSheetName: 'MATERIAL_KELUAR',
          googleSheetUrl: meta.spreadsheetUrl,
        }));
        setPendingSheetsMutation(null);
        setInlineBanner({
          type: 'success',
          title: `File Google Spreadsheet "${meta.title}" Berhasil Dibuat!`,
          message: `3 Sheet ("MATERIAL_MASUK" gid=0, "MATERIAL_KELUAR" gid=164626621, & "REKAP_STOK" gid=164626622) telah dibuat di Google Drive Anda.`,
        });
      },
    });
  };

  const requestSyncMimsSheet = (spreadsheetId: string, title: string) => {
    setPendingSheetsMutation({
      type: 'OVERWRITE_SHEET',
      title: `Format & Sinkronkan Sheet "MATERIAL_KELUAR" (gid=164626621) pada "${title}"?`,
      description: `Tindakan ini akan menulis ${eksekusiMimsRows.length} baris data Material Keluar ke tab "MATERIAL_KELUAR" (gid=164626621) di Google Sheets Anda.`,
      spreadsheetTitle: title,
      sheetTabName: 'MATERIAL_KELUAR',
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
          'MATERIAL_KELUAR'
        );
        setPendingSheetsMutation(null);
        setInlineBanner({
          type: 'success',
          title: 'Sheet "MATERIAL_KELUAR" (gid=164626621) Berhasil Disinkronkan ke Google Sheets!',
          message: `${eksekusiMimsRows.length} baris Material Keluar telah disimpan ke tab "MATERIAL_KELUAR" (gid=164626621).`,
        });
      },
    });
  };

  const syncInboundToGoogleSheetsDirect = useCallback(
    async (addedRows: MaterialRow[], allCurrentRows?: MaterialRow[]) => {
      if (addedRows.length === 0) return;
      const token = (await getAccessToken()) || accessToken;

      if (!token || needsAuth) {
        setImportFeedback((prev) =>
          prev
            ? {
                ...prev,
                googleSheetSyncStatus: 'NOT_CONNECTED',
                googleSheetError: 'Silakan Login akun Google Anda agar data masuk ke Google Sheets.',
              }
            : null
        );
        return;
      }

      let targetSpreadsheetId =
        connectedSheet && !isTeknikSpreadsheetTitle(connectedSheet.title)
          ? connectedSheet.spreadsheetId
          : '';
      if (!targetSpreadsheetId && !isTeknikSpreadsheetTitle(sheetConfig.spreadsheetName || '')) {
        targetSpreadsheetId = extractSpreadsheetId(sheetConfig.googleSheetUrl || '');
      }
      let targetTitle =
        connectedSheet && !isTeknikSpreadsheetTitle(connectedSheet.title)
          ? connectedSheet.title
          : 'LOGISTIK SINJAI';
      let targetUrl =
        connectedSheet && !isTeknikSpreadsheetTitle(connectedSheet.title)
          ? connectedSheet.spreadsheetUrl
          : targetSpreadsheetId
          ? sheetConfig.googleSheetUrl ||
            `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit#gid=0`
          : '';

      setImportFeedback((prev) =>
        prev
          ? {
              ...prev,
              googleSheetSyncStatus: 'SYNCING',
              googleSheetTitle: targetTitle,
              googleSheetTab: selectedSheetTab || 'MATERIAL_MASUK',
              googleSheetUrl: targetUrl,
              googleSheetError: undefined,
            }
          : null
      );

      try {
        let createdFresh = false;
        if (!targetSpreadsheetId) {
          const driveFiles = await listDriveSpreadsheets(token).catch(() => []);
          const matchedSinjai = findLogistikSinjaiSpreadsheet(driveFiles);

          if (matchedSinjai) {
            targetSpreadsheetId = matchedSinjai.id;
            targetTitle = matchedSinjai.name;
            targetUrl =
              matchedSinjai.webViewLink ||
              `https://docs.google.com/spreadsheets/d/${matchedSinjai.id}/edit#gid=0`;
          } else {
            const createdMeta = await createNewWarehouseGoogleSheet(
              token,
              'LOGISTIK SINJAI',
              allCurrentRows || addedRows,
              eksekusiMimsRows
            );
            formattedSpreadsheetIdsRef.current.add(createdMeta.spreadsheetId);
            setConnectedSheet(createdMeta);
            setSelectedSheetTab('MATERIAL_MASUK');
            setSheetConfig((prev) => ({
              ...prev,
              spreadsheetName: createdMeta.title,
              sheetName: 'MATERIAL_MASUK',
              mimsSheetName: 'MATERIAL_KELUAR',
              googleSheetUrl: createdMeta.spreadsheetUrl,
            }));
            targetSpreadsheetId = createdMeta.spreadsheetId;
            targetTitle = createdMeta.title;
            targetUrl = createdMeta.spreadsheetUrl;
            createdFresh = true;
          }
        }

        const usedTab = createdFresh
          ? 'MATERIAL_MASUK'
          : await appendInboundRowsToGoogleSheet(
              token,
              targetSpreadsheetId,
              selectedSheetTab || 'MATERIAL_MASUK',
              addedRows,
              allCurrentRows || rows
            );

        setImportFeedback((prev) =>
          prev
            ? {
                ...prev,
                googleSheetSyncStatus: 'SYNCED',
                googleSheetTitle: targetTitle,
                googleSheetTab: usedTab,
                googleSheetUrl: targetUrl,
                googleSheetError: undefined,
              }
            : null
        );
      } catch (err: any) {
        const errMsg = err?.message || 'Gagal menulis baris ke Google Spreadsheet.';
        setImportFeedback((prev) =>
          prev
            ? {
                ...prev,
                googleSheetSyncStatus: 'ERROR',
                googleSheetError: errMsg,
              }
            : null
        );
        setInlineBanner({
          type: 'error',
          title: 'Gagal Mengirim Data ke Google Sheets',
          message: errMsg,
        });
      }
    },
    [connectedSheet, accessToken, needsAuth, selectedSheetTab, sheetConfig, rows, eksekusiMimsRows]
  );

  const syncOutboundToGoogleSheetsDirect = useCallback(
    async (
      updatedRows: MaterialRow[],
      addedMims: EksekusiMimsRow[] = [],
      allCurrentRows?: MaterialRow[]
    ) => {
      if (updatedRows.length === 0) return;
      const token = (await getAccessToken()) || accessToken;

      if (!token || needsAuth) {
        setImportFeedback((prev) =>
          prev
            ? {
                ...prev,
                googleSheetSyncStatus: 'NOT_CONNECTED',
                googleSheetError: 'Silakan Login akun Google Anda agar data masuk ke Google Sheets.',
              }
            : null
        );
        return;
      }

      let targetSpreadsheetId =
        connectedSheet && !isTeknikSpreadsheetTitle(connectedSheet.title)
          ? connectedSheet.spreadsheetId
          : '';
      if (!targetSpreadsheetId && !isTeknikSpreadsheetTitle(sheetConfig.spreadsheetName || '')) {
        targetSpreadsheetId = extractSpreadsheetId(sheetConfig.googleSheetUrl || '');
      }
      let targetTitle =
        connectedSheet && !isTeknikSpreadsheetTitle(connectedSheet.title)
          ? connectedSheet.title
          : 'LOGISTIK SINJAI';
      let targetUrl =
        connectedSheet && !isTeknikSpreadsheetTitle(connectedSheet.title)
          ? connectedSheet.spreadsheetUrl
          : targetSpreadsheetId
          ? sheetConfig.googleSheetUrl ||
            `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit#gid=0`
          : '';

      setImportFeedback((prev) =>
        prev
          ? {
              ...prev,
              googleSheetSyncStatus: 'SYNCING',
              googleSheetTitle: targetTitle,
              googleSheetTab: selectedSheetTab || 'MATERIAL_MASUK',
              googleSheetUrl: targetUrl,
              googleSheetError: undefined,
            }
          : null
      );

      try {
        let createdFresh = false;
        if (!targetSpreadsheetId) {
          const driveFiles = await listDriveSpreadsheets(token).catch(() => []);
          const matchedSinjai = findLogistikSinjaiSpreadsheet(driveFiles);

          if (matchedSinjai) {
            targetSpreadsheetId = matchedSinjai.id;
            targetTitle = matchedSinjai.name;
            targetUrl =
              matchedSinjai.webViewLink ||
              `https://docs.google.com/spreadsheets/d/${matchedSinjai.id}/edit#gid=0`;
          } else {
            const mergedMims =
              addedMims.length > 0 ? [...eksekusiMimsRows, ...addedMims] : eksekusiMimsRows;
            const createdMeta = await createNewWarehouseGoogleSheet(
              token,
              'LOGISTIK SINJAI',
              allCurrentRows || rows,
              mergedMims
            );
            formattedSpreadsheetIdsRef.current.add(createdMeta.spreadsheetId);
            setConnectedSheet(createdMeta);
            setSelectedSheetTab('MATERIAL_MASUK');
            setSheetConfig((prev) => ({
              ...prev,
              spreadsheetName: createdMeta.title,
              sheetName: 'MATERIAL_MASUK',
              mimsSheetName: 'MATERIAL_KELUAR',
              googleSheetUrl: createdMeta.spreadsheetUrl,
            }));
            targetSpreadsheetId = createdMeta.spreadsheetId;
            targetTitle = createdMeta.title;
            targetUrl = createdMeta.spreadsheetUrl;
            createdFresh = true;
          }
        }

        const usedTab = createdFresh
          ? 'MATERIAL_MASUK'
          : await updateOutboundStatusInGoogleSheet(
              token,
              targetSpreadsheetId,
              selectedSheetTab || 'MATERIAL_MASUK',
              updatedRows,
              addedMims,
              allCurrentRows || rows
            );

        setImportFeedback((prev) =>
          prev
            ? {
                ...prev,
                googleSheetSyncStatus: 'SYNCED',
                googleSheetTitle: targetTitle,
                googleSheetTab: usedTab,
                googleSheetUrl: targetUrl,
                googleSheetError: undefined,
              }
            : null
        );
      } catch (err: any) {
        const errMsg = err?.message || 'Gagal memperbarui status di Google Spreadsheet.';
        setImportFeedback((prev) =>
          prev
            ? {
                ...prev,
                googleSheetSyncStatus: 'ERROR',
                googleSheetError: errMsg,
              }
            : null
        );
        setInlineBanner({
          type: 'error',
          title: 'Gagal Mengirim Data Material Keluar ke Google Sheets',
          message: errMsg,
        });
      }
    },
    [connectedSheet, accessToken, needsAuth, selectedSheetTab, sheetConfig, rows, eksekusiMimsRows]
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
  // 1. HANDLER SCAN QR CODE (TUNGGAL 1 SN ATAU BUNDLE 1-20 SN) — MATERIAL KELUAR
  // Memunculkan Popup Deretan SN yang Terscan & Memasukkan ke Kolom List Siap Import
  // ============================================================================
  const handleScanOutboundSN = useCallback(
    (rawPayload: string) => {
      const { snList, qrType } = parseQrPayloadToSNList(rawPayload);
      if (snList.length === 0) return;

      setOutboundScanInput('');

      const existingMap = new Map<string, MaterialRow>();
      for (const r of rows) {
        existingMap.set(r.snMaterial.toUpperCase(), r);
      }

      const alreadyInReadySet = new Set(
        outboundReadyList.map((item) => item.snMaterial.toUpperCase())
      );

      const popupItems: ScannedSnItemPreview[] = [];
      const newReadyToAdd: ReadyOutboundItem[] = [];
      const customOutboundName = outboundNamaMaterial.trim();

      for (const sn of snList) {
        const cleanSn = sn.trim().toUpperCase();
        if (!cleanSn) continue;

        const matchedRow = existingMap.get(cleanSn);
        const detectedCat = detectCatalogForSn(cleanSn);
        const finalSpec =
          customOutboundName || matchedRow?.spesifikasi || detectedCat.spesifikasi;

        if (!matchedRow) {
          const syntheticRow: MaterialRow = {
            rowNumber: rows.length + newReadyToAdd.length + 2,
            tanggalHistory: new Date().toISOString().slice(0, 19).replace('T', ' '),
            snMaterial: cleanSn,
            noMaterial: detectedCat.noMaterial,
            spesifikasi: finalSpec,
            statusTransaksi: 'STOK SIAP ULP',
            kategori: detectedCat.kategori,
            noBatch: detectedCat.defaultBatch,
            valuationType: detectedCat.valuationType,
            plant: detectedCat.plant,
            storLoc: detectedCat.storLoc,
            companyCode: detectedCat.companyCode,
            unitInduk: detectedCat.unitInduk,
            unit: detectedCat.unit,
            storLocName: detectedCat.storLocName,
            status: 'STOK SIAP',
          };

          popupItems.push({
            snMaterial: cleanSn,
            noMaterial: detectedCat.noMaterial,
            spesifikasi: finalSpec,
            kategori: detectedCat.kategori,
            noBatch: detectedCat.defaultBatch,
            qrType,
            validationStatus: 'VALID_KELUAR',
            validationNote: 'STOK SIAP → TERPAKAI',
          });

          if (!alreadyInReadySet.has(cleanSn)) {
            alreadyInReadySet.add(cleanSn);
            newReadyToAdd.push({
              ...syntheticRow,
              qrType,
            });
          }
          continue;
        }

        if (matchedRow.status === 'TERPAKAI') {
          popupItems.push({
            snMaterial: cleanSn,
            noMaterial: matchedRow.noMaterial,
            spesifikasi: finalSpec,
            kategori: matchedRow.kategori,
            noBatch: matchedRow.noBatch,
            qrType,
            rowNumber: matchedRow.rowNumber,
            validationStatus: 'SUDAH_TERPAKAI',
            validationNote: 'SUDAH TERPAKAI',
          });
          continue;
        }

        popupItems.push({
          snMaterial: cleanSn,
          noMaterial: matchedRow.noMaterial,
          spesifikasi: finalSpec,
          kategori: matchedRow.kategori,
          noBatch: matchedRow.noBatch,
          qrType,
          rowNumber: matchedRow.rowNumber,
          validationStatus: 'VALID_KELUAR',
          validationNote: 'STOK SIAP → TERPAKAI',
        });

        if (!alreadyInReadySet.has(cleanSn)) {
          alreadyInReadySet.add(cleanSn);
          newReadyToAdd.push({
            ...matchedRow,
            spesifikasi: finalSpec,
            qrType,
          });
        }
      }

      if (newReadyToAdd.length > 0) {
        triggerSound('scan');
        setOutboundReadyList((prev) => [...prev, ...newReadyToAdd]);
      } else {
        triggerSound('error');
      }

      setQrPopupState((prev) => {
        const baseItems = prev.mode === 'KELUAR' ? prev.items : [];
        const existingSns = new Set(baseItems.map((i) => i.snMaterial.toUpperCase()));
        const merged = [...baseItems];
        for (const item of popupItems) {
          if (!existingSns.has(item.snMaterial.toUpperCase())) {
            existingSns.add(item.snMaterial.toUpperCase());
            merged.push(item);
          }
        }
        return {
          isOpen: true,
          mode: 'KELUAR',
          qrType,
          items: merged,
        };
      });
    },
    [rows, outboundReadyList, outboundNamaMaterial, detectCatalogForSn, triggerSound]
  );

  // ============================================================================
  // 2. HANDLER SCAN QR CODE OTOMATIS — MATERIAL MASUK
  // Hasil scan otomatis langsung masuk ke dalam List & dapat ditambah lagi
  // ============================================================================
  const handleScanInboundSN = useCallback(
    (rawPayload: string) => {
      const { snList, qrType } = parseQrPayloadToSNList(rawPayload);
      if (snList.length === 0) return;

      setInboundScanInput('');

      const existingMap = new Map<string, MaterialRow>();
      for (const r of rows) {
        existingMap.set(r.snMaterial.toUpperCase(), r);
      }

      const alreadyInReadySet = new Set(
        inboundReadyList.map((item) => item.snMaterial.toUpperCase())
      );

      const popupItems: ScannedSnItemPreview[] = [];
      const newReadyToAdd: ReadyInboundItem[] = [];
      const customInboundName = inboundNamaMaterial.trim();

      for (const sn of snList) {
        const cleanSn = sn.trim().toUpperCase();
        if (!cleanSn) continue;

        const existingRow = existingMap.get(cleanSn);
        const detectedCat = detectCatalogForSn(cleanSn);
        const batchToUse = inboundBatchNo || detectedCat.defaultBatch || '15';
        const finalSpec =
          customInboundName || existingRow?.spesifikasi || detectedCat.spesifikasi;

        popupItems.push({
          snMaterial: cleanSn,
          noMaterial: existingRow ? existingRow.noMaterial : detectedCat.noMaterial,
          spesifikasi: finalSpec,
          kategori: existingRow ? existingRow.kategori : detectedCat.kategori,
          noBatch: existingRow ? existingRow.noBatch : batchToUse,
          qrType,
          rowNumber: existingRow?.rowNumber,
          validationStatus: 'VALID_MASUK',
          validationNote: 'STOK SIAP',
        });

        if (!alreadyInReadySet.has(cleanSn)) {
          alreadyInReadySet.add(cleanSn);
          newReadyToAdd.push({
            snMaterial: cleanSn,
            noMaterial: existingRow ? existingRow.noMaterial : detectedCat.noMaterial,
            spesifikasi: finalSpec,
            kategori: existingRow ? existingRow.kategori : detectedCat.kategori,
            noBatch: existingRow ? existingRow.noBatch : batchToUse,
            qrType,
          });
        }
      }

      if (newReadyToAdd.length > 0) {
        triggerSound('scan');
        setInboundReadyList((prev) => [...prev, ...newReadyToAdd]);
      } else {
        triggerSound('scan');
      }

      setQrPopupState((prev) => {
        const baseItems = prev.mode === 'MASUK' ? prev.items : [];
        const existingSns = new Set(baseItems.map((i) => i.snMaterial.toUpperCase()));
        const merged = [...baseItems];
        for (const item of popupItems) {
          if (!existingSns.has(item.snMaterial.toUpperCase())) {
            existingSns.add(item.snMaterial.toUpperCase());
            merged.push(item);
          }
        }
        return {
          isOpen: true,
          mode: 'MASUK',
          qrType,
          items: merged,
        };
      });
    },
    [rows, inboundReadyList, inboundNamaMaterial, detectCatalogForSn, inboundBatchNo, triggerSound]
  );

  // ============================================================================
  // 2B. HANDLER INPUT MATERIAL TANPA QR (MASUK & KELUAR)
  // ============================================================================
  const handleAddNonQrInbound = () => {
    const selectedCat =
      catalog.find((c) => c.noMaterial === selectedInboundMat) ||
      catalog[0] || {
        noMaterial: '2190224',
        spesifikasi: 'Material Gudang Tanpa QR',
        kategori: 'Material Gudang',
        defaultBatch: '15',
      };
    const materialName =
      inboundNamaMaterial.trim() || selectedCat.spesifikasi || 'Material Gudang';
    const qty = Math.max(1, Math.min(100, Number(inboundNonQrQty) || 1));
    const baseCode =
      inboundNonQrCode.trim().toUpperCase() ||
      `NONQR-MSK-${Date.now().toString().slice(-6)}`;

    const existingReadySns = new Set(
      inboundReadyList.map((i) => i.snMaterial.toUpperCase())
    );
    const toAdd: ReadyInboundItem[] = [];

    for (let i = 0; i < qty; i++) {
      const code = qty === 1 ? baseCode : `${baseCode}-${i + 1}`;
      if (!existingReadySns.has(code)) {
        existingReadySns.add(code);
        toAdd.push({
          snMaterial: code,
          noMaterial: selectedInboundMat || selectedCat.noMaterial,
          spesifikasi: materialName,
          kategori: selectedCat.kategori || 'Material Gudang',
          noBatch: inboundBatchNo || selectedCat.defaultBatch || '15',
          qrType: qty > 1 ? 'BUNDLE' : 'TUNGGAL',
        });
      }
    }

    if (toAdd.length > 0) {
      triggerSound('scan');
      setInboundReadyList((prev) => [...prev, ...toAdd]);
      setInboundNonQrCode('');
      setInboundNonQrQty(1);
    }
  };

  const handleAddNonQrOutbound = () => {
    const selectedCat =
      catalog[0] || {
        noMaterial: '2190224',
        spesifikasi: 'Material Gudang Tanpa QR',
        kategori: 'Material Gudang',
        defaultBatch: '15',
        valuationType: 'NORMAL',
        plant: '7417',
        storLoc: '2500',
        companyCode: '74',
        unitInduk: 'UIW SULSELRABAR',
        unit: 'ULP SINJAI',
        storLocName: 'Gd ULP Sinjai',
      };
    const materialName =
      outboundNamaMaterial.trim() || selectedCat.spesifikasi || 'Material Gudang';
    const qty = Math.max(1, Math.min(100, Number(outboundNonQrQty) || 1));
    const baseCode =
      outboundNonQrCode.trim().toUpperCase() ||
      `NONQR-KLR-${Date.now().toString().slice(-6)}`;

    const existingReadySns = new Set(
      outboundReadyList.map((i) => i.snMaterial.toUpperCase())
    );
    const availableStockRows = rows.filter(
      (r) =>
        r.status === 'STOK SIAP' &&
        !existingReadySns.has(r.snMaterial.toUpperCase()) &&
        (outboundNonQrCode.trim()
          ? r.snMaterial.toUpperCase() === outboundNonQrCode.trim().toUpperCase() ||
            r.noMaterial.toUpperCase() === outboundNonQrCode.trim().toUpperCase()
          : outboundNamaMaterial.trim()
          ? r.spesifikasi.toUpperCase().includes(outboundNamaMaterial.trim().toUpperCase())
          : false)
    );

    const toAdd: ReadyOutboundItem[] = [];
    for (let i = 0; i < qty; i++) {
      const matchedStock = availableStockRows[i];
      const code = matchedStock
        ? matchedStock.snMaterial.toUpperCase()
        : qty === 1
        ? baseCode
        : `${baseCode}-${i + 1}`;

      if (!existingReadySns.has(code)) {
        existingReadySns.add(code);
        toAdd.push({
          rowNumber: matchedStock?.rowNumber || rows.length + toAdd.length + 2,
          tanggalHistory:
            matchedStock?.tanggalHistory ||
            new Date().toISOString().slice(0, 19).replace('T', ' '),
          snMaterial: code,
          noMaterial: matchedStock?.noMaterial || selectedCat.noMaterial,
          spesifikasi: outboundNamaMaterial.trim() || matchedStock?.spesifikasi || materialName,
          statusTransaksi: matchedStock?.statusTransaksi || 'STOK SIAP ULP',
          kategori: matchedStock?.kategori || selectedCat.kategori,
          noBatch: matchedStock?.noBatch || selectedCat.defaultBatch,
          valuationType: matchedStock?.valuationType || selectedCat.valuationType,
          plant: matchedStock?.plant || selectedCat.plant,
          storLoc: matchedStock?.storLoc || selectedCat.storLoc,
          companyCode: matchedStock?.companyCode || selectedCat.companyCode,
          unitInduk: matchedStock?.unitInduk || selectedCat.unitInduk,
          unit: matchedStock?.unit || selectedCat.unit,
          storLocName: matchedStock?.storLocName || selectedCat.storLocName,
          status: 'STOK SIAP',
          qrType: qty > 1 ? 'BUNDLE' : 'TUNGGAL',
        });
      }
    }

    if (toAdd.length > 0) {
      triggerSound('scan');
      setOutboundReadyList((prev) => [...prev, ...toAdd]);
      setOutboundNonQrCode('');
      setOutboundNonQrQty(1);
    }
  };

  // Switch Mode inside QrScannedListPopup (MASUK <-> KELUAR)
  const handleSwitchPopupMode = useCallback(
    (newMode: 'MASUK' | 'KELUAR') => {
      setQrPopupState((prev) => ({
        ...prev,
        mode: newMode,
      }));
      setActiveSection(newMode === 'MASUK' ? 'masuk' : 'keluar');

      const currentPopupItems = qrPopupState.items;
      if (newMode === 'MASUK') {
        const existingReadySns = new Set(
          inboundReadyList.map((i) => i.snMaterial.toUpperCase())
        );
        const toAdd: ReadyInboundItem[] = [];
        for (const item of currentPopupItems) {
          const clean = item.snMaterial.toUpperCase();
          if (!existingReadySns.has(clean)) {
            existingReadySns.add(clean);
            toAdd.push({
              snMaterial: clean,
              noMaterial: item.noMaterial !== '-' ? item.noMaterial : selectedInboundMat,
              spesifikasi: item.spesifikasi,
              kategori: item.kategori,
              noBatch: item.noBatch !== '-' ? item.noBatch : inboundBatchNo,
              qrType: item.qrType,
            });
          }
        }
        if (toAdd.length > 0) {
          setInboundReadyList((prev) => [...prev, ...toAdd]);
        }
      } else {
        const existingReadySns = new Set(
          outboundReadyList.map((i) => i.snMaterial.toUpperCase())
        );
        const existingMap = new Map<string, MaterialRow>();
        for (const r of rows) {
          existingMap.set(r.snMaterial.toUpperCase(), r);
        }
        const toAdd: ReadyOutboundItem[] = [];
        for (const item of currentPopupItems) {
          const clean = item.snMaterial.toUpperCase();
          if (!existingReadySns.has(clean)) {
            existingReadySns.add(clean);
            const matched = existingMap.get(clean);
            const cat = detectCatalogForSn(clean);
            toAdd.push({
              rowNumber: matched?.rowNumber || rows.length + toAdd.length + 2,
              tanggalHistory:
                matched?.tanggalHistory ||
                new Date().toISOString().slice(0, 19).replace('T', ' '),
              snMaterial: clean,
              noMaterial: matched?.noMaterial || cat.noMaterial,
              spesifikasi: matched?.spesifikasi || cat.spesifikasi,
              statusTransaksi: matched?.statusTransaksi || 'STOK SIAP ULP',
              kategori: matched?.kategori || cat.kategori,
              noBatch: matched?.noBatch || cat.defaultBatch,
              valuationType: matched?.valuationType || cat.valuationType,
              plant: matched?.plant || cat.plant,
              storLoc: matched?.storLoc || cat.storLoc,
              companyCode: matched?.companyCode || cat.companyCode,
              unitInduk: matched?.unitInduk || cat.unitInduk,
              unit: matched?.unit || cat.unit,
              storLocName: matched?.storLocName || cat.storLocName,
              status: matched?.status || 'STOK SIAP',
              qrType: item.qrType,
            });
          }
        }
        if (toAdd.length > 0) {
          setOutboundReadyList((prev) => [...prev, ...toAdd]);
        }
      }
    },
    [
      qrPopupState.items,
      inboundReadyList,
      outboundReadyList,
      rows,
      selectedInboundMat,
      inboundBatchNo,
      detectCatalogForSn,
    ]
  );

  const handleImportOutboundReadyList = async () => {
    const itemsToSend =
      outboundReadyList.length > 0
        ? outboundReadyList
        : qrPopupState.items.map((i) => ({
            snMaterial: i.snMaterial,
            noMaterial: i.noMaterial,
            spesifikasi: outboundNamaMaterial.trim() || i.spesifikasi,
            kategori: i.kategori,
            noBatch: i.noBatch,
          }));
    const snListToImport = itemsToSend.map((r) => r.snMaterial);

    if (snListToImport.length === 0) {
      triggerSound('error');
      setInlineBanner({
        type: 'warning',
        title: 'Daftar Siap Import Masih Kosong',
        message: 'Silakan scan QR Code atau input material terlebih dahulu sebelum menekan tombol Import.',
      });
      return;
    }

    setIsProcessingOutbound(true);

    try {
      const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
      let importedList: MaterialRow[] = [];
      let mimsAdded: EksekusiMimsRow[] = [];
      let nextRows: MaterialRow[] = [...rows];
      let nextMims: EksekusiMimsRow[] = [...eksekusiMimsRows];
      let handledByApi = false;

      try {
        const res = await fetch('/api/scan/outbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            snList: snListToImport,
            items: itemsToSend,
            expectedNoMaterial: 'ALL',
            petugas,
            noDokumen,
            autoRegisterMissing: true,
          }),
        });

        const rawText = await res.text();
        const trimmed = rawText.trim();
        if (trimmed && !trimmed.startsWith('<')) {
          const data = JSON.parse(trimmed);
          if (data.stats) setStats(data.stats);
          if (data.logs) setLogs(data.logs);

          if (!res.ok || data.success === false) {
            triggerSound('error');
            setInlineBanner({
              type: 'error',
              title: data.title || 'Peringatan Error Pengeluaran Material',
              message: data.message,
            });
            setSystemAlert({
              isOpen: true,
              severity: 'error-duplicate',
              title: data.title || 'Peringatan Error Pengeluaran Material',
              message: data.message,
            });
            return;
          }

          handledByApi = true;
          nextRows = Array.isArray(data.rows) ? data.rows : nextRows;
          nextMims = Array.isArray(data.eksekusiMimsRows) ? data.eksekusiMimsRows : nextMims;
          importedList = Array.isArray(data.updatedRows) ? data.updatedRows : [];
          mimsAdded = Array.isArray(data.addedMimsRows) ? data.addedMimsRows : [];
        }
      } catch {
        // Fallback ke pemrosesan lokal jika endpoint mengembalikan HTML / tidak terjangkau
      }

      if (!handledByApi) {
        importedList = itemsToSend.map((it, idx) => {
          const cleanSn = String(it.snMaterial || '').trim().toUpperCase();
          const detectedCat = detectCatalogForSn(cleanSn);
          return {
            rowNumber: rows.length + idx + 2,
            tanggalHistory: nowStr,
            snMaterial: cleanSn,
            noMaterial: it.noMaterial || detectedCat.noMaterial,
            spesifikasi: it.spesifikasi || detectedCat.spesifikasi,
            statusTransaksi: 'GI KELUAR STOK ULP',
            kategori: it.kategori || detectedCat.kategori,
            noBatch: it.noBatch || detectedCat.defaultBatch,
            valuationType: detectedCat.valuationType,
            plant: detectedCat.plant,
            storLoc: detectedCat.storLoc,
            companyCode: detectedCat.companyCode,
            unitInduk: detectedCat.unitInduk,
            unit: detectedCat.unit,
            storLocName: detectedCat.storLocName,
            status: 'TERPAKAI',
            lastScannedAt: nowStr,
            lastScanType: 'KELUAR',
            petugas,
            noDokumen,
          };
        });
        mimsAdded = importedList.map((row, idx) => ({
          mimsRowNumber: eksekusiMimsRows.length + idx + 2,
          timestampEksekusi: nowStr,
          snMaterial: row.snMaterial,
          noMaterial: row.noMaterial,
          spesifikasi: row.spesifikasi,
          statusTransaksi: 'GI KELUAR STOK ULP',
          kategori: row.kategori,
          noBatch: row.noBatch,
          valuationType: row.valuationType,
          plant: row.plant,
          storLoc: row.storLoc,
          companyCode: row.companyCode,
          unitInduk: row.unitInduk,
          unit: row.unit,
          storLocName: row.storLocName,
          status: 'TERPAKAI',
          noDokumen: noDokumen || 'BON-SINJAI',
          petugas: petugas.trim() || '-',
          sourceMaterialRowNumber: row.rowNumber,
        }));
        const updatedSnMap = new Map(importedList.map((r) => [r.snMaterial.toUpperCase(), r]));
        const existingUpdated = nextRows.map((r) =>
          updatedSnMap.has(r.snMaterial.toUpperCase())
            ? { ...r, status: 'TERPAKAI' as const, tanggalHistory: nowStr, lastScanType: 'KELUAR' as const }
            : r
        );
        const existingSnSet = new Set(nextRows.map((r) => r.snMaterial.toUpperCase()));
        const brandNewRows = importedList.filter(
          (r) => !existingSnSet.has(r.snMaterial.toUpperCase())
        );
        nextRows = [...existingUpdated, ...brandNewRows];
        nextMims = [...nextMims, ...mimsAdded];
      }

      triggerSound('commit');
      setRows(nextRows);
      setEksekusiMimsRows(nextMims);
      setOutboundReadyList([]);
      setPetugas('');
      setQrPopupState((prev) => ({ ...prev, isOpen: false, items: [] }));
      setCurrentPage(1);

      if (importedList.length > 0) {
        await syncOutboundToGoogleSheetsDirect(importedList, mimsAdded, nextRows);
      }

      setImportFeedback({
        isOpen: true,
        mode: 'KELUAR',
        importedRows: importedList,
        mimsRows: mimsAdded,
        timestamp: importedList[0]?.tanggalHistory || nowStr,
        message: `${importedList.length} material keluar berhasil dikirim.`,
        googleSheetSyncStatus: 'SYNCED',
      });
    } catch (err: any) {
      console.error(err);
      triggerSound('error');
      setInlineBanner({
        type: 'error',
        title: 'Gagal Mengirim Data Material Keluar',
        message: err?.message || 'Terjadi gangguan jaringan saat menyimpan data.',
      });
    } finally {
      setIsProcessingOutbound(false);
    }
  };

  const handleImportInboundReadyList = async () => {
    const itemsToImport: ReadyInboundItem[] =
      inboundReadyList.length > 0
        ? inboundReadyList
        : qrPopupState.items.map((i) => ({
            snMaterial: i.snMaterial,
            noMaterial: i.noMaterial !== '-' ? i.noMaterial : selectedInboundMat,
            spesifikasi: i.spesifikasi,
            kategori: i.kategori,
            noBatch: i.noBatch !== '-' ? i.noBatch : inboundBatchNo,
            qrType: i.qrType,
          }));

    if (itemsToImport.length === 0) {
      triggerSound('error');
      setInlineBanner({
        type: 'warning',
        title: 'Daftar Masih Kosong',
        message: 'Silakan scan QR Code atau tambah material terlebih dahulu.',
      });
      return;
    }

    setIsProcessingInbound(true);
    try {
      const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
      let addedList: MaterialRow[] = [];
      let nextRows: MaterialRow[] = [...rows];
      let handledByApi = false;

      try {
        const res = await fetch('/api/scan/inbound', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: itemsToImport,
            petugas,
            noDokumen,
            allowExistingUpdate: true,
          }),
        });
        const rawText = await res.text();
        const trimmed = rawText.trim();
        if (trimmed && !trimmed.startsWith('<')) {
          const data = JSON.parse(trimmed);
          if (data.stats) setStats(data.stats);
          if (data.logs) setLogs(data.logs);

          if (!res.ok || data.success === false) {
            triggerSound('error');
            setSystemAlert({
              isOpen: true,
              severity: 'error-duplicate',
              title: data.title || 'Peringatan QR Code Duplikat',
              message: data.message,
              duplicatesList: data.duplicates,
            });
            return;
          }

          handledByApi = true;
          addedList = Array.isArray(data.addedRows) ? data.addedRows : [];
          nextRows = Array.isArray(data.rows) ? data.rows : nextRows;
        }
      } catch {
        // Fallback ke pemrosesan lokal jika endpoint mengembalikan HTML / tidak terjangkau
      }

      if (!handledByApi) {
        addedList = itemsToImport.map((item, idx) => {
          const cleanSn = String(item.snMaterial || '').trim().toUpperCase();
          const detectedCat = detectCatalogForSn(cleanSn);
          return {
            rowNumber: rows.length + idx + 2,
            tanggalHistory: nowStr,
            snMaterial: cleanSn,
            noMaterial: item.noMaterial || detectedCat.noMaterial,
            spesifikasi: item.spesifikasi || detectedCat.spesifikasi,
            statusTransaksi: 'STOK SIAP ULP',
            kategori: item.kategori || detectedCat.kategori,
            noBatch: item.noBatch || detectedCat.defaultBatch,
            valuationType: detectedCat.valuationType,
            plant: detectedCat.plant,
            storLoc: detectedCat.storLoc,
            companyCode: detectedCat.companyCode,
            unitInduk: detectedCat.unitInduk,
            unit: detectedCat.unit,
            storLocName: detectedCat.storLocName,
            status: 'STOK SIAP',
            lastScannedAt: nowStr,
            lastScanType: 'MASUK',
            petugas,
            noDokumen,
          };
        });
        nextRows = [...nextRows, ...addedList];
      }

      triggerSound('commit');
      setRows(nextRows);
      setInboundReadyList([]);
      setPetugas('');
      setQrPopupState((prev) => ({ ...prev, isOpen: false, items: [] }));
      setCurrentPage(1);

      if (addedList.length > 0) {
        await syncInboundToGoogleSheetsDirect(addedList, nextRows);
      }

      setImportFeedback({
        isOpen: true,
        mode: 'MASUK',
        importedRows: addedList,
        timestamp: addedList[0]?.tanggalHistory || nowStr,
        message: `${addedList.length} material masuk berhasil dikirim.`,
        googleSheetSyncStatus: 'SYNCED',
      });
    } catch (err: any) {
      console.error(err);
      triggerSound('error');
      setInlineBanner({
        type: 'error',
        title: 'Gagal Mengirim Data Material Masuk',
        message: err?.message || 'Terjadi gangguan jaringan saat menyimpan data.',
      });
    } finally {
      setIsProcessingInbound(false);
    }
  };

  const handleClearRecapData = async () => {
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const rawText = await res.text();
      const trimmed = rawText.trim();
      if (trimmed && !trimmed.startsWith('<')) {
        const data = JSON.parse(trimmed);
        if (data.success) {
          setRows(data.rows || []);
          setEksekusiMimsRows(data.eksekusiMimsRows || []);
          if (data.stats) setStats(data.stats);
          if (data.logs) setLogs(data.logs);
        }
      } else {
        setRows([]);
        setEksekusiMimsRows([]);
        setStats(null);
      }
      setMaterialFilter('ALL');
      setCurrentPage(1);
      triggerSound('commit');
    } catch (err: any) {
      console.error(err);
      setRows([]);
      setEksekusiMimsRows([]);
    }
  };

  // Sample SN helpers for Camera / Quick Testing of Single (1 SN) & Bundle (1-20 SNs)
  const sampleOutboundSingleSn = useMemo(() => {
    const readySet = new Set(outboundReadyList.map((r) => r.snMaterial));
    const found = rows.find((r) => r.status === 'STOK SIAP' && !readySet.has(r.snMaterial));
    return found ? found.snMaterial : 'PLN0219000022402639005330251';
  }, [rows, outboundReadyList]);

  const sampleOutboundBundleSns = useMemo(() => {
    const readySet = new Set(outboundReadyList.map((r) => r.snMaterial));
    return rows
      .filter((r) => r.status === 'STOK SIAP' && !readySet.has(r.snMaterial))
      .slice(0, 10)
      .map((r) => r.snMaterial);
  }, [rows, outboundReadyList]);

  const generateSampleInboundBundle = useCallback(
    (count: number) => {
      const matNo = selectedInboundMat || '2190224';
      const suffix = matNo.slice(-3);
      const baseNum = Math.floor(1000000 + Math.random() * 8000000);
      return Array.from({ length: count }, (_, idx) => {
        return `PLN02190000${suffix}0263900${baseNum + idx}`;
      });
    },
    [selectedInboundMat]
  );

  // ============================================================================
  // 3. FILTERED SPREADSHEET ROWS & PAGINATION
  // Mengurutkan baris yang baru diimport/diupdate (MASUK / KELUAR) di urutan
  // paling atas Halaman 1 agar langsung terlihat begitu tombol Import ditekan!
  // ============================================================================
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    const matching = rows.filter((r) => {
      if (statusFilter === 'STOK SIAP' && r.status !== 'STOK SIAP') return false;
      if (statusFilter === 'TERPAKAI' && r.status !== 'TERPAKAI') return false;
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

    // Tampilkan baris yang baru di-scan/diimport (MASUK / KELUAR) di bagian paling atas
    return matching.slice().sort((a, b) => {
      const aScanned = a.lastScanType === 'MASUK' || a.lastScanType === 'KELUAR' ? 1 : 0;
      const bScanned = b.lastScanType === 'MASUK' || b.lastScanType === 'KELUAR' ? 1 : 0;
      if (aScanned !== bScanned) {
        return bScanned - aScanned;
      }
      if (aScanned && bScanned) {
        const timeA = a.lastScannedAt || a.tanggalHistory || '';
        const timeB = b.lastScannedAt || b.tanggalHistory || '';
        if (timeA !== timeB) return timeB.localeCompare(timeA);
        return b.rowNumber - a.rowNumber;
      }
      return a.rowNumber - b.rowNumber;
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

  const terpakaiRows = useMemo(
    () =>
      rows
        .filter((r) => r.status === 'TERPAKAI')
        .slice()
        .reverse(),
    [rows]
  );

  if (isLoginPageOpen) {
    const isGoogleAuthenticated = Boolean(googleUser && accessToken && !needsAuth);

    const handleEnterModule = (mod: ActiveModule) => {
      if (!isGoogleAuthenticated) {
        setInlineBanner({
          type: 'warning',
          title: 'Menu Terkunci',
          message:
            'Silakan login akun Google Workspace terlebih dahulu untuk membuka menu layanan.',
        });
        return;
      }
      setSelectedModule(mod);
      if (mod === 'logistik') {
        setActiveSection('masuk');
      } else if (mod === 'yantek') {
        setActiveSection('yantek');
      } else {
        setActiveSection('hvb');
      }
      setIsLoginPageOpen(false);
    };

    return (
      <div className="min-h-screen flex flex-col justify-between bg-gradient-to-b from-[#083d54] via-[#126b82] to-[#2c96ab] text-slate-900 dark:text-slate-100 px-3 sm:px-4 pt-5 pb-24 sm:py-8 overflow-x-clip">
        <div className="w-full max-w-md mx-auto my-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-white/30 dark:border-cyan-800/60 rounded-3xl p-4 sm:p-8 shadow-2xl shadow-[#04212e]/45 space-y-5 sm:space-y-6">
          {/* Brand Header */}
          <div className="text-center space-y-2.5">
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full mx-auto p-0.5 bg-gradient-to-br from-[#facc15] via-[#0b4f6c] to-[#ea580c] shadow-lg shadow-[#083d54]/30">
              <img
                src="/assets/aistudio/pln_up3_bulukumba_512x512_17c93b22.png"
                alt="Logo PLN UP3 Bulukumba"
                referrerPolicy="no-referrer"
                className="w-full h-full rounded-full object-cover bg-[#083d54]"
              />
            </div>
            <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0b4f6c] dark:text-[#facc15]">
              PLN UP3 Bulukumba · ULP Sinjai
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#083d54] dark:text-white font-display">
              SINJAI BENDERANG
            </h1>
          </div>

          {inlineBanner && (
            <div
              role="status"
              className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-2 ${
                inlineBanner.type === 'error'
                  ? 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
                  : 'bg-cyan-50 dark:bg-cyan-950/50 border-cyan-200 dark:border-cyan-800 text-cyan-950 dark:text-cyan-100'
              }`}
            >
              <div>
                <div className="font-bold">{inlineBanner.title}</div>
                <div className="mt-0.5 opacity-90">{inlineBanner.message}</div>
              </div>
              <button
                type="button"
                onClick={() => setInlineBanner(null)}
                className="font-semibold underline shrink-0"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Peringatan In-App Browser (WhatsApp / Telegram / IG) */}
          {browserEnv.isInAppBrowser && (!googleUser || needsAuth) && (
            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 space-y-2.5 text-xs text-amber-950 dark:text-amber-100">
              <div className="flex items-start gap-2">
                <Smartphone className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">
                    Terbuka di Browser {browserEnv.inAppName || 'Aplikasi'}
                  </div>
                  <p className="mt-0.5 leading-relaxed opacity-90">
                    Google memblokir login OAuth 2.0 di dalam WebView WhatsApp/Telegram/IG (
                    <code className="font-mono">disallowed_useragent</code>). Buka link ini di{' '}
                    <strong>Google Chrome</strong> atau <strong>Safari</strong> agar petugas bisa
                    login.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {browserEnv.chromeIntentUrl && (
                  <a
                    href={browserEnv.chromeIntentUrl}
                    className="flex-1 min-h-[38px] px-3 py-1.5 text-xs font-bold text-white bg-[#0b4f6c] hover:bg-[#083d54] rounded-xl flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>Buka di Google Chrome</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() =>
                    handleCopyAuthValue(
                      'appUrl',
                      typeof window !== 'undefined' ? window.location.href : ''
                    )
                  }
                  className="flex-1 min-h-[38px] px-3 py-1.5 text-xs font-bold text-amber-950 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl flex items-center justify-center gap-1.5"
                >
                  {copiedAuthKey === 'appUrl' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Link Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Link Aplikasi</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Google Login Section */}
          <div className="space-y-3 pt-1">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-300 text-center">
              Login Akun Google Workspace
            </div>

            {googleUser && accessToken && !needsAuth ? (
              <div className="p-3.5 rounded-2xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 space-y-2.5 text-center">
                <div className="text-xs font-semibold text-[#083d54] dark:text-cyan-200">
                  Terhubung sebagai:{' '}
                  <span className="font-mono font-bold">{googleUser.email}</span>
                </div>
                <div className="flex items-center justify-center">
                  <button
                    type="button"
                    onClick={handleGoogleLogout}
                    className="min-h-[36px] px-3 py-1.5 text-xs font-semibold text-rose-600 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 rounded-xl shrink-0"
                  >
                    Ganti Akun
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isSigningIn}
                  className="gsi-material-button w-full flex justify-center"
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

                <button
                  type="button"
                  onClick={handleDirectGisLogin}
                  disabled={isSigningIn}
                  className="w-full min-h-[42px] px-4 py-2 text-xs font-semibold text-[#0b4f6c] dark:text-cyan-300 bg-cyan-50 hover:bg-cyan-100 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 rounded-xl transition-colors"
                >
                  Login Google Mobile (OAuth Langsung)
                </button>

                <div className="w-full flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={handleRefreshServerSession}
                    disabled={isCheckingServerSession}
                    className="text-[11px] font-semibold text-[#0b4f6c] dark:text-cyan-300 hover:underline flex items-center gap-1"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${isCheckingServerSession ? 'animate-spin' : ''}`}
                    />
                    <span>Cek Sesi Server Admin</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowOAuthTroubleshooting((prev) => !prev)}
                    className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-1"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {showOAuthTroubleshooting
                        ? 'Tutup Panduan OAuth 2.0'
                        : 'Kendala OAuth 2.0 di HP?'}
                    </span>
                  </button>
                </div>

                {(showOAuthTroubleshooting || authDomainError) && (
                  <div className="w-full p-3.5 rounded-2xl bg-amber-50/95 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2.5 text-[11px] text-slate-700 dark:text-slate-200 text-left">
                    <div className="font-bold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Solusi Error &quot;Kebijakan OAuth 2.0 Google&quot; di HP:</span>
                    </div>

                    {browserEnv.isIOS && browserEnv.isStandalonePwa && (
                      <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100 leading-relaxed">
                        <strong>Pengguna iPhone (PWA Layar Utama):</strong> Safari iOS sering
                        memblokir popup OAuth di mode Layar Utama. Buka alamat web ini langsung
                        lewat aplikasi <strong>Safari</strong> untuk login Google.
                      </div>
                    )}

                    <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
                      <li>
                        <strong>Jangan buka link dari WhatsApp/Telegram/Google App:</strong> Buka
                        langsung melalui browser <strong>Chrome</strong> (Android) atau{' '}
                        <strong>Safari</strong> (iPhone).
                      </li>
                      <li>
                        <strong>
                          Daftarkan Origin &amp; Domain Netlify ke OAuth Client (atau pakai Project
                          GCP sendiri seperti <code className="font-mono">logistiksinjai</code>):
                        </strong>{' '}
                        Pastikan Origin di bawah masuk daftar <em>Authorized JavaScript origins</em>{' '}
                        Client ID{' '}
                        <code className="font-mono break-all">{activeClientId}</code>:
                        {browserEnv.currentOrigin && (
                          <div className="mt-1 space-y-1">
                            <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700">
                              <code className="font-mono text-[10px] truncate">
                                {browserEnv.currentOrigin}
                              </code>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyAuthValue('origin', browserEnv.currentOrigin)
                                }
                                className="px-2 py-1 text-[10px] font-bold text-white bg-slate-900 dark:bg-sky-600 rounded flex items-center gap-1 shrink-0"
                              >
                                {copiedAuthKey === 'origin' ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-400" />
                                    <span>Tersalin</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Salin Origin</span>
                                  </>
                                )}
                              </button>
                            </div>
                            <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700">
                              <code className="font-mono text-[10px] truncate">
                                {browserEnv.currentHostname}
                              </code>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyAuthValue('hostname', browserEnv.currentHostname)
                                }
                                className="px-2 py-1 text-[10px] font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 rounded flex items-center gap-1 shrink-0"
                              >
                                {copiedAuthKey === 'hostname' ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-500" />
                                    <span>Tersalin</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Salin Domain</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                      <li>
                        <strong>Publish OAuth Consent Screen / Tambah Email Petugas:</strong> Ubah
                        Audience ke <strong>In Production</strong> atau tambahkan Gmail petugas ke{' '}
                        <em>Test users</em>.
                      </li>
                    </ol>

                    {/* Optional Custom OAuth Client ID (untuk Admin yang memakai project GCP pribadi mis. logistiksinjai) */}
                    <div className="p-2.5 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-amber-200 dark:border-slate-700 space-y-1.5">
                      <div className="font-bold text-slate-900 dark:text-slate-100">
                        Pakai OAuth Client ID Sendiri (Opsional):
                      </div>
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        Jika project <code className="font-mono">{FIREBASE_PROJECT_ID}</code> tidak
                        bisa diedit, buat <strong>OAuth 2.0 Client ID (Web application)</strong> di
                        project GCP Anda (mis. <code className="font-mono">logistiksinjai</code>),
                        isi Origin Netlify di atas, lalu tempel Client ID di sini:
                      </p>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <input
                          type="text"
                          value={customClientIdInput}
                          onChange={(e) => setCustomClientIdInput(e.target.value)}
                          placeholder="xxxx.apps.googleusercontent.com"
                          className="min-w-0 flex-1 min-h-[34px] px-2.5 py-1 text-[11px] font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCustomOAuthClientId(customClientIdInput);
                            const nextId = getActiveOAuthClientId();
                            setActiveClientId(nextId);
                            setInlineBanner({
                              type: 'success',
                              title: customClientIdInput.trim()
                                ? 'OAuth Client ID Kustom Disimpan'
                                : 'OAuth Client ID Direset ke Default',
                              message: `Client ID aktif: ${nextId}. Silakan ketuk tombol "Sign in with Google".`,
                            });
                          }}
                          className="min-h-[34px] px-2.5 py-1 text-[10px] font-bold text-white bg-[#0b4f6c] hover:bg-[#083d54] rounded-lg shrink-0"
                        >
                          Simpan
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-1.5 pt-1">
                      <a
                        href={GCP_OAUTH_CLIENTS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[34px] px-3 py-1.5 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl flex items-center justify-center gap-1.5"
                      >
                        <span>Buka OAuth Credentials ({FIREBASE_PROJECT_ID})</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                      <a
                        href={GCP_OAUTH_CONSENT_AUDIENCE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[34px] px-3 py-1.5 text-[11px] font-bold text-amber-950 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl flex items-center justify-center gap-1.5"
                      >
                        <span>Buka OAuth Consent / Test Users</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                      <a
                        href={FIREBASE_AUTH_DOMAINS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[34px] px-3 py-1.5 text-[11px] font-bold text-amber-950 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl flex items-center justify-center gap-1.5"
                      >
                        <span>Buka Firebase Authorized Domains</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            <span className="flex-shrink mx-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              {!isGoogleAuthenticated && <Lock className="w-3 h-3 text-amber-600 shrink-0" />}
              <span>
                {isGoogleAuthenticated
                  ? 'Pilih Layanan'
                  : 'Menu Terkunci · Login Google Dulu'}
              </span>
            </span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
          </div>

          {/* 3 Tombol Halaman Depan Tanpa Tulisan "Menu" */}
          <div
            className={`space-y-2.5 transition-all duration-200 ${
              !isGoogleAuthenticated ? 'opacity-55 grayscale-[60%] select-none' : ''
            }`}
          >
            <button
              type="button"
              disabled={!isGoogleAuthenticated}
              aria-disabled={!isGoogleAuthenticated}
              onClick={() => handleEnterModule('logistik')}
              className={`w-full min-h-[52px] px-4 py-3 text-left text-white bg-[#0b4f6c] rounded-xl transition-colors flex items-center justify-between gap-3 shadow-sm ${
                isGoogleAuthenticated
                  ? 'hover:bg-[#083d54] cursor-pointer'
                  : 'cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Package className="w-5 h-5 text-[#facc15] shrink-0" />
                <div className="text-sm font-bold leading-tight">Logistik</div>
              </div>
              {isGoogleAuthenticated ? (
                <LogIn className="w-4 h-4 text-[#facc15] shrink-0" />
              ) : (
                <Lock className="w-4 h-4 text-slate-200 shrink-0" />
              )}
            </button>

            <button
              type="button"
              disabled={!isGoogleAuthenticated}
              aria-disabled={!isGoogleAuthenticated}
              onClick={() => handleEnterModule('yantek')}
              className={`w-full min-h-[52px] px-4 py-3 text-left text-white bg-[#ea580c] rounded-xl transition-colors flex items-center justify-between gap-3 shadow-sm ${
                isGoogleAuthenticated
                  ? 'hover:bg-[#c2410c] cursor-pointer'
                  : 'cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Wrench className="w-5 h-5 text-white shrink-0" />
                <div className="text-sm font-bold leading-tight">Realisasi Yantek</div>
              </div>
              {isGoogleAuthenticated ? (
                <LogIn className="w-4 h-4 shrink-0" />
              ) : (
                <Lock className="w-4 h-4 text-slate-200 shrink-0" />
              )}
            </button>

            <button
              type="button"
              disabled={!isGoogleAuthenticated}
              aria-disabled={!isGoogleAuthenticated}
              onClick={() => handleEnterModule('hvb')}
              className={`w-full min-h-[52px] px-4 py-3 text-left text-white bg-[#126b82] rounded-xl transition-colors flex items-center justify-between gap-3 shadow-sm ${
                isGoogleAuthenticated
                  ? 'hover:bg-[#0b4f6c] cursor-pointer'
                  : 'cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <ClipboardCheck className="w-5 h-5 text-[#facc15] shrink-0" />
                <div className="text-sm font-bold leading-tight">Realisasi HVB</div>
              </div>
              {isGoogleAuthenticated ? (
                <LogIn className="w-4 h-4 text-[#facc15] shrink-0" />
              ) : (
                <Lock className="w-4 h-4 text-slate-200 shrink-0" />
              )}
            </button>
          </div>

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
            <a
              href="/privacy.html"
              className="font-semibold text-[#0b4f6c] dark:text-cyan-300 hover:underline"
            >
              Privacy Policy / Kebijakan Privasi
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="/terms.html"
              className="font-semibold text-[#0b4f6c] dark:text-cyan-300 hover:underline"
            >
              Terms of Service
            </a>
          </div>
        </div>

        {/* Public Application Overview & Data Transparency Section (Visible Without Login) */}
        <section
          aria-label="Application Information and Google API Data Usage"
          className="w-full max-w-3xl mx-auto mt-5 sm:mt-8 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-white/30 dark:border-cyan-800/60 rounded-3xl p-4 sm:p-8 shadow-xl shadow-[#04212e]/30 space-y-5 sm:space-y-6"
        >
          <div className="space-y-2">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#0b4f6c] dark:text-[#facc15]">
              Public Application Information · Informasi Aplikasi
            </div>
            <h2 className="text-xl font-bold text-[#083d54] dark:text-white">
              Tentang SINJAI BENDERANG — PLN UP3 Bulukumba ULP Sinjai
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <strong>SINJAI BENDERANG</strong> is an operational warehouse &amp; field technical
              monitoring web application for <strong>PLN UP3 Bulukumba — ULP Sinjai</strong>. It
              helps authorized officers track material inventory, record Yantek &amp; HVB field
              work realizations, manage distribution transformer (Trafo) mutations/insertions, and
              synchronize records to their own Google Sheets.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-[#f2f7f9] dark:bg-slate-800/70 border border-cyan-900/10 dark:border-slate-700 space-y-1">
              <div className="font-bold text-[#083d54] dark:text-cyan-200 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-[#0b4f6c] dark:text-[#facc15] shrink-0" />
                <span>Logistik Material</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                QR/barcode scanning for inbound and outbound kWh meter stock, duplicate prevention,
                and real-time warehouse balance recapitulation.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#f2f7f9] dark:bg-slate-800/70 border border-cyan-900/10 dark:border-slate-700 space-y-1">
              <div className="font-bold text-[#083d54] dark:text-cyan-200 flex items-center gap-1.5">
                <Wrench className="w-4 h-4 text-[#ea580c] shrink-0" />
                <span>Realisasi Yantek &amp; HVB</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Field work realization reporting by feeder, keypoint, segment, WO/P0 volume, and GPS
                coordinates synced directly to authorized spreadsheets.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#f2f7f9] dark:bg-slate-800/70 border border-cyan-900/10 dark:border-slate-700 space-y-1">
              <div className="font-bold text-[#083d54] dark:text-cyan-200 flex items-center gap-1.5">
                <ClipboardCheck className="w-4 h-4 text-[#126b82] dark:text-[#facc15] shrink-0" />
                <span>Manajemen Trafo</span>
              </div>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Substation transformer mutation and insertion registry with official PDF Berita
                Acara generation and spreadsheet logging.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-cyan-50/80 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800/70 space-y-1.5 text-xs">
            <div className="font-bold text-[#083d54] dark:text-cyan-100">
              Google Workspace OAuth &amp; Data Usage Transparency
            </div>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              When you choose to sign in with Google, SINJAI BENDERANG requests Google profile,
              Google Drive, and Google Sheets permissions solely to locate, read, and update the
              operational spreadsheets authorized by you. OAuth access tokens remain strictly in
              active browser session memory, are never sold or shared with third parties, and comply
              with the Google API Services User Data Policy (Limited Use).
            </p>
          </div>

          <footer className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
            <div>
              &copy; 2026 SINJAI BENDERANG · PLN UP3 Bulukumba ULP Sinjai · Contact:{' '}
              <a
                href="mailto:chrizt72@gmail.com"
                className="font-semibold text-[#0b4f6c] dark:text-cyan-300 hover:underline"
              >
                chrizt72@gmail.com
              </a>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="/privacy.html"
                className="font-semibold text-[#0b4f6c] dark:text-cyan-300 hover:underline"
              >
                Privacy Policy
              </a>
              <a
                href="/terms.html"
                className="font-semibold text-[#0b4f6c] dark:text-cyan-300 hover:underline"
              >
                Terms of Service
              </a>
            </div>
          </footer>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f2f7f9] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* =====================================================================
          TOP BAR CONTRACT: 3 Zones separated by gap-8
          Setiap Menu Dipisah sesuai pilihan dari Halaman Login
      ====================================================================== */}
      <header className="sticky top-0 z-30 w-full max-w-full flex items-center justify-between gap-2 sm:gap-8 px-3 sm:px-6 h-14 sm:h-15 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-cyan-900/15 dark:border-cyan-800/40">
        {/* Zone 1: Brand mark with logo */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            if (selectedModule === 'logistik') {
              setActiveSection('masuk');
            } else if (selectedModule === 'yantek') {
              setActiveSection('yantek');
            } else {
              setActiveSection('hvb');
            }
          }}
          className="min-w-0 flex items-center gap-2 text-xs sm:text-base font-bold tracking-tight text-[#083d54] dark:text-white whitespace-nowrap font-display"
        >
          <img
            src="/assets/aistudio/pln_up3_bulukumba_512x512_17c93b22.png"
            alt="PLN UP3 Bulukumba"
            referrerPolicy="no-referrer"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover ring-1 ring-[#facc15] bg-[#083d54] shrink-0"
          />
          <span className="truncate">SINJAI BENDERANG</span>
        </a>

        {/* Zone 2: Navigation strictly scoped to selectedModule */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          {selectedModule === 'logistik' && (
            <>
              <button
                type="button"
                onClick={() => setActiveSection('masuk')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeSection === 'masuk'
                    ? 'border-[#0b4f6c] dark:border-[#facc15] text-[#083d54] dark:text-white font-semibold'
                    : 'border-transparent hover:text-[#083d54] dark:hover:text-slate-200'
                }`}
              >
                Masuk
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('keluar')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeSection === 'keluar'
                    ? 'border-[#ea580c] text-[#ea580c] dark:text-orange-400 font-semibold'
                    : 'border-transparent hover:text-[#083d54] dark:hover:text-slate-200'
                }`}
              >
                Keluar
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('rekap')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeSection === 'rekap' || activeSection === 'spreadsheet'
                    ? 'border-[#126b82] text-[#083d54] dark:text-white font-semibold'
                    : 'border-transparent hover:text-[#083d54] dark:hover:text-slate-200'
                }`}
              >
                Rekap Stok
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('riwayat')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeSection === 'riwayat'
                    ? 'border-[#0b4f6c] text-[#083d54] dark:text-white font-semibold'
                    : 'border-transparent hover:text-[#083d54] dark:hover:text-slate-200'
                }`}
              >
                Riwayat
              </button>
            </>
          )}

          {selectedModule === 'yantek' && (
            <button
              type="button"
              onClick={() => setActiveSection('yantek')}
              className="py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 border-[#ea580c] text-[#083d54] dark:text-white font-semibold"
            >
              Realisasi Yantek
            </button>
          )}

          {selectedModule === 'hvb' && (
            <button
              type="button"
              onClick={() => setActiveSection('hvb')}
              className="py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 border-[#0b4f6c] text-[#083d54] dark:text-white font-semibold"
            >
              Realisasi HAR Volume Based
            </button>
          )}
        </nav>

        {/* Zone 3: Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {selectedModule === 'logistik' && (
            <button
              type="button"
              onClick={() => setIsSyncModalOpen(true)}
              className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-4 py-1.5 text-[11px] sm:text-xs font-semibold text-white bg-[#0b4f6c] hover:bg-[#083d54] rounded-xl transition-colors whitespace-nowrap shrink-0"
            >
              <span className="hidden sm:inline">Sinkronisasi Sheet</span>
              <span className="sm:hidden">Sync Sheet</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsLoginPageOpen(true)}
            className="min-h-[38px] sm:min-h-[40px] px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-[#083d54] dark:text-slate-200 bg-cyan-50 hover:bg-cyan-100 dark:bg-slate-800 border border-cyan-200/80 dark:border-slate-700 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
            title="Kembali ke Halaman Depan & Login"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Halaman Depan</span>
            <span className="sm:hidden">Beranda</span>
          </button>
        </div>
      </header>

      {/* =====================================================================
          MAIN WORKSPACE CONTAINER
          pb-44 on mobile so content clears the Raised Bottom Nav Dock & Netlify badge
      ====================================================================== */}
      <main className="flex-1 w-full min-w-0 max-w-[1440px] mx-auto px-3 sm:px-6 pt-3.5 sm:pt-4 pb-44 md:pb-8 space-y-5 overflow-x-clip">
        {/* Contextual Header & KPI Cards (Separated per selectedModule) */}
        <section className="space-y-3.5">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-slate-900 dark:text-white font-display">
                  {selectedModule === 'logistik'
                    ? 'Monitoring & Rekap Stok Material'
                    : selectedModule === 'yantek'
                    ? 'Realisasi Harian Yantek'
                    : 'Realisasi HAR Volume Based'}
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

            {/* Desktop Controls scoped to selectedModule */}
            <div className="hidden md:flex flex-wrap items-center gap-2">
              <PWAInstallButton />
              {selectedModule === 'logistik' && (
                <div className="flex items-center gap-1 p-1 bg-slate-200/80 dark:bg-slate-900 border border-slate-300/70 dark:border-slate-800 rounded-xl">
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
                    <span>Masuk</span>
                  </button>
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
                    <span>Keluar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection('rekap')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      activeSection === 'rekap' || activeSection === 'spreadsheet'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 text-sky-600" />
                    <span>Rekap Stok</span>
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
                    <span>Riwayat</span>
                  </button>
                </div>
              )}

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

          {selectedModule === 'logistik' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
              <div className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                  Total Material
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
                  Stok Siap
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-1">
                  <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {stats
                      ? stats.siapPakaiCount.toLocaleString('id-ID')
                      : rows.filter((r) => r.status === 'STOK SIAP').length}
                  </span>
                  <span className="text-[11px] text-slate-500 truncate">Tersedia</span>
                </div>
              </div>

              <div className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                  Terpakai
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-1">
                  <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                    {stats
                      ? stats.stokTerpakaiCount.toLocaleString('id-ID')
                      : rows.filter((r) => r.status === 'TERPAKAI').length}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                    {stats?.outboundUsedCount || 0} keluar
                  </span>
                </div>
              </div>

              <div className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
                  Daftar Siap Kirim
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-1">
                  <span className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
                    {inboundReadyList.length + outboundReadyList.length}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                    {inboundReadyList.length} masuk · {outboundReadyList.length} keluar
                  </span>
                </div>
              </div>
            </div>
          )}
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
            SECTION 1: SCAN QR MATERIAL KELUAR (OUTBOUND)
            Mendukung QR Tunggal (1 SN) & QR Bundle (1-20 SN).
            Otomatis menampilkan Popup Deretan SN yang Terscan & masuk ke
            Kolom List Siap Import Spreadsheet.
        ==================================================================== */}
        {selectedModule === 'logistik' && activeSection === 'keluar' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Sub Menu Scan & Manual Material Keluar (5 cols) */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-start justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3.5">
                <div>
                  <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Pengeluaran Stok Gudang
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-display">
                    Material Keluar
                  </h2>
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

              {/* Sub Menu Switcher: Scan & Manual */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl">
                <button
                  type="button"
                  onClick={() => setOutboundSubMenu('scan')}
                  className={`min-h-[40px] px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    outboundSubMenu === 'scan'
                      ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <QrCode className="w-4 h-4 shrink-0" />
                  <span>Scan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setOutboundSubMenu('manual')}
                  className={`min-h-[40px] px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    outboundSubMenu === 'manual'
                      ? 'bg-white dark:bg-slate-900 text-amber-700 dark:text-amber-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>Manual</span>
                </button>
              </div>

              {/* Kolom Input Nama Material */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Material
                  </label>
                  <input
                    type="text"
                    value={outboundNamaMaterial}
                    onChange={(e) => setOutboundNamaMaterial(e.target.value)}
                    placeholder="Contoh: kWh Meter 1P / MCB / Kabel SR..."
                    className="w-full min-h-[42px] px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {outboundSubMenu === 'scan' ? (
                /* SUB MENU: SCAN QR MATERIAL KELUAR */
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="w-full min-h-[48px] px-4 py-3 text-sm font-bold text-white bg-[#ea580c] hover:bg-[#c2410c] active:scale-[0.99] rounded-xl transition-all flex items-center justify-center gap-2.5 shadow-xs"
                >
                  <Camera className="w-5 h-5" />
                  <span>
                    {outboundReadyList.length > 0
                      ? `+ Scan Material (${outboundReadyList.length})`
                      : 'Scan QR Material Keluar'}
                  </span>
                </button>
              ) : (
                /* SUB MENU: MANUAL (INPUT MATERIAL KELUAR) */
                <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                      Input Material Manual
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 font-semibold">
                      MANUAL
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Kode Material (Opsional)
                      </label>
                      <input
                        type="text"
                        value={outboundNonQrCode}
                        onChange={(e) => setOutboundNonQrCode(e.target.value)}
                        placeholder="Kosongkan untuk kode otomatis..."
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Jumlah (Unit)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={outboundNonQrQty}
                        onChange={(e) =>
                          setOutboundNonQrQty(Math.max(1, Number(e.target.value) || 1))
                        }
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddNonQrOutbound}
                    className="w-full min-h-[42px] px-3.5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Material</span>
                  </button>
                </div>
              )}

              {/* Officer & Bon Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Petugas
                  </label>
                  <input
                    type="text"
                    value={petugas}
                    onChange={(e) => setPetugas(e.target.value)}
                    placeholder="Masukkan nama petugas..."
                    className="w-full min-h-[42px] px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    No. Bon / PK
                  </label>
                  <input
                    type="text"
                    value={noDokumen}
                    onChange={(e) => setNoDokumen(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: DAFTAR MATERIAL KELUAR */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-5">
              <div className="space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-mono text-[10px] font-bold">
                        MATERIAL KELUAR
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {outboundReadyList.length} Material
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white font-display mt-1">
                      Daftar Material Keluar
                    </h3>
                  </div>

                  {outboundReadyList.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsCameraOpen(true)}
                        className="min-h-[42px] px-3.5 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-xl transition-colors flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        <Camera className="w-4 h-4 shrink-0" />
                        <span>+ Scan Material</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOutboundReadyList([]);
                          setQrPopupState((prev) => ({ ...prev, items: [] }));
                        }}
                        className="min-h-[42px] px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors"
                      >
                        Kosongkan
                      </button>
                      <button
                        type="button"
                        disabled={isProcessingOutbound}
                        onClick={handleImportOutboundReadyList}
                        className="flex-1 sm:flex-initial min-h-[44px] sm:min-w-[140px] px-4 py-2 text-xs sm:text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs"
                      >
                        {isProcessingOutbound ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                          <span>Kirim Material ({outboundReadyList.length})</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {outboundReadyList.length === 0 ? (
                  <div className="py-8 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2.5">
                    <QrCode className="w-9 h-9 text-slate-400 mx-auto stroke-1" />
                    <div className="space-y-1 max-w-md mx-auto">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Belum Ada Material Keluar
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Scan QR Code atau tambah material manual terlebih dahulu.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Kolom Input Nama Petugas Setelah Scan / Input Manual Material Keluar */}
                    <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80">
                      <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 mb-1.5">
                        Nama Petugas
                      </label>
                      <input
                        type="text"
                        value={petugas}
                        onChange={(e) => setPetugas(e.target.value)}
                        placeholder="Masukkan nama petugas..."
                        className="w-full min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-medium bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {outboundReadyList.map((item, idx) => (
                        <div
                          key={item.snMaterial}
                          className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-800/70 flex items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 text-[11px] font-mono">
                              <span className="font-bold text-amber-800 dark:text-amber-300">
                                #{idx + 1}
                              </span>
                            </div>
                            <div className="font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-white break-all tabular-nums">
                              {item.snMaterial}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                              {item.noMaterial} · {item.spesifikasi}
                            </div>
                            <div className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                              Nama Petugas: <span className="font-bold">{petugas || '-'}</span>
                            </div>
                            <div className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-400">
                              TERPAKAI
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setOutboundReadyList((prev) =>
                                prev.filter((r) => r.snMaterial !== item.snMaterial)
                              );
                              setQrPopupState((prev) => ({
                                ...prev,
                                items: prev.items.filter((i) => i.snMaterial !== item.snMaterial),
                              }));
                            }}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-red-600 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shrink-0"
                            aria-label="Hapus SN"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[380px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                          <tr className="border-b border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            <th className="py-2.5 px-3">No</th>
                            <th className="py-2.5 px-3">SN Material</th>
                            <th className="py-2.5 px-3">Material &amp; Spesifikasi</th>
                            <th className="py-2.5 px-3">Nama Petugas</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 text-right">Hapus</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                          {outboundReadyList.map((item, idx) => (
                            <tr
                              key={item.snMaterial}
                              className="bg-amber-50/20 dark:bg-amber-950/10 hover:bg-amber-50/50"
                            >
                              <td className="py-2 px-3 font-mono tabular-nums font-bold text-slate-600">
                                #{idx + 1}
                              </td>
                              <td className="py-2 px-3 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                                {item.snMaterial}
                              </td>
                              <td className="py-2 px-3">
                                <span className="font-mono font-semibold">{item.noMaterial}</span> ·{' '}
                                <span className="text-slate-500">{item.spesifikasi}</span>
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                                {petugas || '-'}
                              </td>
                              <td className="py-2 px-3 font-mono text-[11px] font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap">
                                TERPAKAI
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOutboundReadyList((prev) =>
                                      prev.filter((r) => r.snMaterial !== item.snMaterial)
                                    );
                                    setQrPopupState((prev) => ({
                                      ...prev,
                                      items: prev.items.filter(
                                        (i) => i.snMaterial !== item.snMaterial
                                      ),
                                    }));
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsCameraOpen(true)}
                        className="min-h-[44px] px-4 py-2.5 text-xs sm:text-sm font-bold text-sky-800 dark:text-sky-200 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800 rounded-xl flex items-center justify-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        <Camera className="w-4 h-4 shrink-0" />
                        <span>+ Scan Material</span>
                      </button>

                      <button
                        type="button"
                        disabled={isProcessingOutbound}
                        onClick={handleImportOutboundReadyList}
                        className="w-full sm:w-auto min-h-[46px] sm:min-w-[160px] px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors"
                      >
                        {isProcessingOutbound ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                          <span>Kirim Material ({outboundReadyList.length})</span>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            SECTION 2: MATERIAL MASUK (INBOUND) — SUB MENU SCAN & MANUAL
            Mendukung QR Tunggal (1 SN), QR Bundle (1-20 SN), dan Input Manual Tanpa QR.
        ==================================================================== */}
        {selectedModule === 'logistik' && activeSection === 'masuk' && (
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: Sub Menu Scan & Manual Material Masuk (5 cols) */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-3.5">
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Penerimaan Stok Gudang
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-display">
                  Material Masuk
                </h2>
              </div>

              {/* Sub Menu Switcher: Scan & Manual */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl">
                <button
                  type="button"
                  onClick={() => setInboundSubMenu('scan')}
                  className={`min-h-[40px] px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    inboundSubMenu === 'scan'
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <QrCode className="w-4 h-4 shrink-0" />
                  <span>Scan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInboundSubMenu('manual')}
                  className={`min-h-[40px] px-3 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    inboundSubMenu === 'manual'
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>Manual</span>
                </button>
              </div>

              {/* Material Specification Template Selection & Kolom Input Nama Material */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Material
                  </label>
                  <input
                    type="text"
                    value={inboundNamaMaterial}
                    onChange={(e) => setInboundNamaMaterial(e.target.value)}
                    placeholder="Contoh: kWh Meter 1P / MCB / Kabel SR..."
                    className="w-full min-h-[42px] px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="inbound-mat-select"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Katalog Material
                  </label>
                  <select
                    id="inbound-mat-select"
                    value={selectedInboundMat}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedInboundMat(val);
                      const found = catalog.find((c) => c.noMaterial === val);
                      if (found) {
                        setInboundBatchNo(found.defaultBatch);
                        if (!inboundNamaMaterial.trim()) {
                          setInboundNamaMaterial(found.spesifikasi);
                        }
                      }
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
                      No. Batch
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
                      Status
                    </label>
                    <input
                      type="text"
                      value="STOK SIAP"
                      disabled
                      className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl"
                    />
                  </div>
                </div>
              </div>

              {inboundSubMenu === 'scan' ? (
                /* SUB MENU: SCAN QR MATERIAL MASUK */
                <button
                  type="button"
                  onClick={() => setIsCameraOpen(true)}
                  className="w-full min-h-[48px] px-4 py-3 text-sm font-bold text-white bg-[#0b4f6c] hover:bg-[#083d54] active:scale-[0.99] rounded-xl transition-all flex items-center justify-center gap-2.5 shadow-xs"
                >
                  <Camera className="w-5 h-5 text-[#facc15]" />
                  <span>
                    {inboundReadyList.length > 0
                      ? `+ Scan Material (${inboundReadyList.length})`
                      : 'Scan QR Material Masuk'}
                  </span>
                </button>
              ) : (
                /* SUB MENU: MANUAL (INPUT MATERIAL MASUK) */
                <div className="p-3.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/70 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                      Input Material Manual
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 font-semibold">
                      MANUAL
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Kode Material (Opsional)
                      </label>
                      <input
                        type="text"
                        value={inboundNonQrCode}
                        onChange={(e) => setInboundNonQrCode(e.target.value)}
                        placeholder="Kosongkan untuk kode otomatis..."
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Jumlah (Unit)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={inboundNonQrQty}
                        onChange={(e) =>
                          setInboundNonQrQty(Math.max(1, Number(e.target.value) || 1))
                        }
                        className="w-full min-h-[40px] px-3 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddNonQrInbound}
                    className="w-full min-h-[42px] px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Tambah Material</span>
                  </button>
                </div>
              )}

              {/* Kolom Nama Petugas pada Sub Menu Material Masuk (Scan & Manual) */}
              <div className="pt-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Petugas
                </label>
                <input
                  type="text"
                  value={petugas}
                  onChange={(e) => setPetugas(e.target.value)}
                  placeholder="Masukkan nama petugas..."
                  className="w-full min-h-[42px] px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                />
              </div>
            </div>

            {/* Right Column: DAFTAR MATERIAL MASUK */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-5">
              <div className="space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono text-[10px] font-bold">
                        MATERIAL MASUK
                      </span>
                      <span className="text-xs text-slate-500 font-mono">
                        {inboundReadyList.length} Material
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white font-display mt-1">
                      Daftar Material Masuk
                    </h3>
                  </div>

                  {inboundReadyList.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsCameraOpen(true)}
                        className="min-h-[42px] px-3.5 py-2 text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-xl transition-colors flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        <Camera className="w-4 h-4 shrink-0" />
                        <span>+ Scan Material</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setInboundReadyList([]);
                          setQrPopupState((prev) => ({ ...prev, items: [] }));
                        }}
                        className="min-h-[42px] px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-colors"
                      >
                        Kosongkan
                      </button>
                      <button
                        type="button"
                        onClick={handleImportInboundReadyList}
                        disabled={isProcessingInbound}
                        className="flex-1 sm:flex-initial min-h-[44px] sm:min-w-[140px] px-4 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-xs"
                      >
                        {isProcessingInbound ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                          <span>Kirim Material ({inboundReadyList.length})</span>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {inboundReadyList.length === 0 ? (
                  <div className="py-8 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2.5">
                    <QrCode className="w-9 h-9 text-slate-400 mx-auto stroke-1" />
                    <div className="space-y-1 max-w-md mx-auto">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Belum Ada Material Masuk
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Scan QR Code atau tambah material manual terlebih dahulu.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Kolom Input Nama Petugas Setelah Scan / Input Manual Material Masuk */}
                    <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80">
                      <label className="block text-xs font-bold text-emerald-900 dark:text-emerald-300 mb-1.5">
                        Nama Petugas
                      </label>
                      <input
                        type="text"
                        value={petugas}
                        onChange={(e) => setPetugas(e.target.value)}
                        placeholder="Masukkan nama petugas..."
                        className="w-full min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-medium bg-white dark:bg-slate-950 border border-emerald-300 dark:border-emerald-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {inboundReadyList.map((item, idx) => (
                        <div
                          key={item.snMaterial}
                          className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/25 border border-emerald-200 dark:border-emerald-800/70 flex items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 text-[11px] font-mono">
                              <span className="font-bold text-emerald-800 dark:text-emerald-300">
                                #{idx + 1}
                              </span>
                            </div>
                            <div className="font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-white break-all tabular-nums">
                              {item.snMaterial}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                              {item.noMaterial} · Batch {item.noBatch} · {item.spesifikasi}
                            </div>
                            <div className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                              Nama Petugas: <span className="font-bold">{petugas || '-'}</span>
                            </div>
                            <div className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400">
                              STOK SIAP
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setInboundReadyList((prev) =>
                                prev.filter((r) => r.snMaterial !== item.snMaterial)
                              );
                              setQrPopupState((prev) => ({
                                ...prev,
                                items: prev.items.filter((i) => i.snMaterial !== item.snMaterial),
                              }));
                            }}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-400 hover:text-red-600 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shrink-0"
                            aria-label="Hapus SN"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-[380px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                          <tr className="border-b border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            <th className="py-2.5 px-3">No</th>
                            <th className="py-2.5 px-3">SN Material</th>
                            <th className="py-2.5 px-3">Spesifikasi &amp; Batch</th>
                            <th className="py-2.5 px-3">Nama Petugas</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 text-right">Hapus</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                          {inboundReadyList.map((item, idx) => (
                            <tr
                              key={item.snMaterial}
                              className="bg-emerald-50/20 dark:bg-emerald-950/10 hover:bg-emerald-50/50"
                            >
                              <td className="py-2 px-3 font-mono tabular-nums font-bold text-slate-600">
                                #{idx + 1}
                              </td>
                              <td className="py-2 px-3 font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                                {item.snMaterial}
                              </td>
                              <td className="py-2 px-3">
                                <span className="font-mono font-semibold">{item.noMaterial}</span> ·
                                Batch {item.noBatch} ·{' '}
                                <span className="text-slate-500">{item.spesifikasi}</span>
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                                {petugas || '-'}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                STOK SIAP
                              </td>
                              <td className="py-2 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setInboundReadyList((prev) =>
                                      prev.filter((r) => r.snMaterial !== item.snMaterial)
                                    );
                                    setQrPopupState((prev) => ({
                                      ...prev,
                                      items: prev.items.filter(
                                        (i) => i.snMaterial !== item.snMaterial
                                      ),
                                    }));
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => setIsCameraOpen(true)}
                        className="min-h-[44px] px-4 py-2.5 text-xs sm:text-sm font-bold text-sky-800 dark:text-sky-200 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800 rounded-xl flex items-center justify-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        <Camera className="w-4 h-4 shrink-0" />
                        <span>+ Scan Material</span>
                      </button>

                      <button
                        type="button"
                        disabled={isProcessingInbound}
                        onClick={handleImportInboundReadyList}
                        className="w-full sm:w-auto min-h-[46px] sm:min-w-[160px] px-5 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors"
                      >
                        {isProcessingInbound ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                          <span>Kirim Material ({inboundReadyList.length})</span>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ===================================================================
            REKAPITULASI STOK MATERIAL (HANYA PADA MENU REKAP STOK)
        ==================================================================== */}
        {selectedModule === 'logistik' &&
          stats &&
          (activeSection === 'rekap' || activeSection === 'spreadsheet') && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-600 shrink-0" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white font-display">
                  Rekapitulasi Stok Material
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {stats.byMaterialNo.length > 0 ? (
                  <button
                    type="button"
                    onClick={handleClearRecapData}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800/60 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Bersihkan Data
                  </button>
                ) : (
                  <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                    0 Unit Tercatat
                  </span>
                )}
              </div>
            </div>

            {stats.byMaterialNo.length > 0 ? (
              <>
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
                            STOK SIAP: {group.siapPakai}
                          </span>
                          <span className="text-amber-700 dark:text-amber-400 font-semibold">
                            TERPAKAI: {group.stokTerpakai}
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
                        <th className="py-2 px-3">No. Material</th>
                        <th className="py-2 px-3">Spesifikasi</th>
                        <th className="py-2 px-3">Kategori</th>
                        <th className="py-2 px-3 text-right">Total Unit</th>
                        <th className="py-2 px-3 text-right">Stok Siap</th>
                        <th className="py-2 px-3 text-right">Terpakai</th>
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
              </>
            ) : (
              <>
                {/* Mobile Clean State */}
                <div className="md:hidden py-5 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Data Rekapitulasi Stok Kosong (0 Unit)
                  </p>
                </div>

                {/* Desktop Table with Cleaned Data Columns */}
                <div className="hidden md:block overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        <th className="py-2 px-3">No. Material</th>
                        <th className="py-2 px-3">Spesifikasi</th>
                        <th className="py-2 px-3">Kategori</th>
                        <th className="py-2 px-3 text-right">Total Unit</th>
                        <th className="py-2 px-3 text-right">Stok Siap</th>
                        <th className="py-2 px-3 text-right">Terpakai</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td
                          colSpan={6}
                          className="py-6 px-4 text-center text-xs text-slate-400 dark:text-slate-500"
                        >
                          Belum ada data rekapitulasi stok material (0 unit).
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )}

        {/* Bottom Sheet & List Material section removed per user request */}
        {false && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            {/* Google Spreadsheet Sheet Tab Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveSpreadsheetTab('MATERIAL_MASUK')}
                  className={`min-h-[42px] px-4 py-2 text-xs font-bold rounded-xl border transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                    activeSpreadsheetTab === 'MATERIAL_MASUK'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Sheet: MATERIAL_MASUK</span>
                  <span className="font-mono text-[11px] opacity-90 tabular-nums">
                    ({rows.length})
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSpreadsheetTab('MATERIAL_KELUAR')}
                  className={`min-h-[42px] px-4 py-2 text-xs font-bold rounded-xl border transition-all flex items-center gap-2 whitespace-nowrap shrink-0 ${
                    activeSpreadsheetTab === 'MATERIAL_KELUAR'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Sheet: MATERIAL_KELUAR (gid=164626621)</span>
                  <span className="font-mono text-[11px] opacity-90 tabular-nums">
                    ({eksekusiMimsRows.length} Keluar)
                  </span>
                </button>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {activeSpreadsheetTab === 'MATERIAL_MASUK'
                  ? 'Data Material Masuk & Status (STOK SIAP / TERPAKAI)'
                  : 'Data Material Keluar — Sheet MATERIAL_KELUAR (gid=164626621)'}
              </div>
            </div>

            {activeSpreadsheetTab === 'MATERIAL_KELUAR' ? (
              /* ===============================================================
                 SHEET 2: "MATERIAL_KELUAR" (gid=164626621)
              ================================================================ */
              <div className="space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                      <Clock className="w-4 h-4 shrink-0" />
                      <span className="font-mono font-bold">
                        Sheet: &quot;MATERIAL_KELUAR&quot; (gid=164626621)
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {eksekusiMimsRows.length} baris tercatat
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-display">
                      Data Material Keluar &amp; Timestamp Eksekusi
                    </h2>
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
                            <span>Format Tersalin</span>
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
                      download="LOGISTIK_SINJAI_MATERIAL_KELUAR.csv"
                      className="min-h-[42px] px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Download className="w-4 h-4" />
                      <span>Unduh CSV MATERIAL_KELUAR</span>
                    </a>
                  </div>
                </div>

                {eksekusiMimsRows.length === 0 ? (
                  <div className="py-10 px-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
                    <Clock className="w-9 h-9 text-amber-500 mx-auto stroke-1" />
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Belum Ada Baris Material Keluar
                    </p>
                  </div>
                ) : (
                  <>
                    {/* MOBILE CARD VIEW FOR SHEET MATERIAL_KELUAR */}
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
                                MATERIAL_KELUAR Baris #{m.mimsRowNumber}
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
                            <div className="grid grid-cols-3 gap-2 pt-1.5 border-t border-amber-200/60 dark:border-amber-800/50 text-[11px] font-mono">
                              <div>
                                <span className="text-slate-500 block">Status:</span>
                                <span className="font-bold text-amber-700 dark:text-amber-400">
                                  {m.status}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block">Nama Petugas:</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {m.petugas || '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500 block">Bon &amp; Ref:</span>
                                <span className="text-slate-800 dark:text-slate-200">
                                  {m.noDokumen} (MATERIAL_MASUK!#{m.sourceMaterialRowNumber})
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>

                    {/* DESKTOP FULL TABLE FOR SHEET MATERIAL_KELUAR */}
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
                                  MATERIAL_MASUK!Baris #{m.sourceMaterialRowNumber}
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
                 SHEET 1: "MATERIAL_MASUK" (KOLOM A - O)
              ================================================================ */
              <>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                        Sheet: &quot;MATERIAL_MASUK&quot;
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {filteredRows.length.toLocaleString('id-ID')} /{' '}
                        {rows.length.toLocaleString('id-ID')} baris
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5 font-display">
                      Data Spreadsheet MATERIAL_MASUK
                    </h2>
                  </div>

                  {/* Filter & Search Controls */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    {/* Horizontal Scrollable Filter Tabs on Mobile */}
                    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto">
                      {(
                        [
                          { id: 'ALL', label: 'Semua' },
                          { id: 'STOK SIAP', label: 'STOK SIAP' },
                          { id: 'TERPAKAI', label: 'TERPAKAI' },
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
                      <div className="relative flex-1 min-w-0 sm:min-w-[220px]">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Cari SN QR, Batch..."
                          className="w-full min-h-[42px] pl-9 pr-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>

                      <a
                        href="/api/export/csv"
                        download="LOGISTIK_SINJAI_MATERIAL_MASUK.csv"
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
                        const isTerpakai = row.status === 'TERPAKAI';
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
                              <div className="flex items-center gap-1.5">
                                {(row.lastScanType === 'MASUK' || row.lastScanType === 'KELUAR') && (
                                  <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-bold uppercase">
                                    BARU DIIMPORT
                                  </span>
                                )}
                                <span
                                  className={`font-bold ${
                                    isTerpakai
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-emerald-700 dark:text-emerald-400'
                                  }`}
                                >
                                  {row.status}
                                </span>
                              </div>
                            </div>

                            {/* Middle SN & Spec */}
                            <div className="space-y-1">
                              <div className="font-mono font-bold text-xs sm:text-sm text-slate-900 dark:text-white break-all tabular-nums">
                                {row.snMaterial}
                              </div>
                              <div className="text-xs text-slate-600 dark:text-slate-300 pt-0.5">
                                <span className="font-mono font-semibold">{row.noMaterial}</span> ·
                                Batch <span className="font-mono">{row.noBatch}</span> ·{' '}
                                <span className="font-mono text-[11px]">{row.spesifikasi}</span>
                              </div>
                              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                                Nama Petugas:{' '}
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {row.petugas || '-'}
                                </span>
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
                                <span>Lihat QR Code</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveSection('keluar');
                                  handleScanOutboundSN(row.snMaterial);
                                }}
                                className={`min-h-[42px] px-3 py-2 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 ${
                                  isTerpakai
                                    ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-300'
                                    : 'bg-slate-900 dark:bg-sky-600 text-white'
                                }`}
                              >
                                <QrCode className="w-3.5 h-3.5" />
                                <span>{isTerpakai ? 'TERPAKAI' : 'Scan QR Keluar'}</span>
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
                            <th className="py-2.5 px-2.5">B · SN MATERIAL (QR Code)</th>
                            <th className="py-2.5 px-2.5">C · NO MAT</th>
                            <th className="py-2.5 px-2.5">D · SPESIFIKASI</th>
                            <th className="py-2.5 px-2.5">E · STATUS TRANSAKSI</th>
                            <th className="py-2.5 px-2.5">G · BATCH</th>
                            <th className="py-2.5 px-2.5">H · NAMA PETUGAS</th>
                            <th className="py-2.5 px-2.5">M/N · UNIT GUDANG</th>
                            <th className="py-2.5 px-2.5">KETERANGAN / STATUS</th>
                            <th className="py-2.5 px-2.5 text-right">Aksi Scan QR</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                          {paginatedRows.map((row) => {
                            const isTerpakai = row.status === 'TERPAKAI';
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
                                    {(row.lastScanType === 'MASUK' ||
                                      row.lastScanType === 'KELUAR') && (
                                      <span className="px-1.5 py-0.5 rounded bg-sky-600 text-white text-[9px] font-bold uppercase">
                                        BARU DIIMPORT
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setPreviewBarcodeRow(row)}
                                      className="p-1 text-slate-400 hover:text-sky-600 rounded"
                                      title="Lihat visual QR Code"
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
                                <td className="py-2 px-2.5 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                  {row.petugas || '-'}
                                </td>
                                <td className="py-2 px-2.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                  {row.unit} · {row.storLocName}
                                </td>
                                <td className="py-2 px-2.5 font-mono font-bold whitespace-nowrap">
                                  {isTerpakai ? (
                                    <span className="text-amber-700 dark:text-amber-400">
                                      TERPAKAI
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700 dark:text-emerald-400">
                                      STOK SIAP
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
                                      isTerpakai
                                        ? 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                                        : 'bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 text-white'
                                    }`}
                                  >
                                    {isTerpakai ? 'TERPAKAI' : 'Scan QR Keluar'}
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
            SECTION 3B: MENU REALISASI YANTEK
        ==================================================================== */}
        {selectedModule === 'yantek' && (
          <RealisasiYantekView
            segments={yantekSegments}
            pekerjaanCatalog={yantekPekerjaanCatalog}
            reports={yantekReports}
            accessToken={accessToken}
            needsAuth={needsAuth}
            onUpdateDatabaseFromSheet={(newSegments, newPekerjaan) => {
              setYantekSegments(newSegments);
              setYantekPekerjaanCatalog(newPekerjaan);
            }}
            onReportCreated={(_newReport, allReports) => {
              setYantekReports(allReports);
            }}
            onDeleteReport={async (reportId) => {
              setYantekReports((prev) => prev.filter((r) => r.id !== reportId));
              try {
                const res = await fetch(`/api/yantek/reports/${encodeURIComponent(reportId)}`, {
                  method: 'DELETE',
                });
                const rawText = await res.text();
                const trimmed = rawText.trim();
                if (trimmed && !trimmed.startsWith('<')) {
                  const data = JSON.parse(trimmed);
                  if (Array.isArray(data.reports)) {
                    setYantekReports(data.reports);
                  }
                }
              } catch {
                // Ignore if offline
              }
            }}
            onTriggerSound={triggerSound}
          />
        )}

        {/* ===================================================================
            SECTION 3C: MENU REALISASI HAR VOLUME BASED
        ==================================================================== */}
        {selectedModule === 'hvb' && (
          <RealisasiHvbView
            segments={yantekSegments}
            pekerjaanCatalog={yantekPekerjaanCatalog}
            reports={hvbReports}
            evidenRecords={hvbEvidenList}
            accessToken={accessToken}
            needsAuth={needsAuth}
            onUpdateDatabaseFromSheet={(newSegments, newPekerjaan) => {
              setYantekSegments(newSegments);
              setYantekPekerjaanCatalog(newPekerjaan);
            }}
            onReportCreated={(_newReport, allReports) => {
              setHvbReports(allReports);
            }}
            onEvidenCreated={(_newEviden, allEviden) => {
              setHvbEvidenList(allEviden);
            }}
            onDeleteEviden={async (evidenId) => {
              setHvbEvidenList((prev) => prev.filter((item) => item.id !== evidenId));
              try {
                const res = await fetch(`/api/hvb/eviden/${encodeURIComponent(evidenId)}`, {
                  method: 'DELETE',
                });
                const rawText = await res.text();
                const trimmed = rawText.trim();
                if (trimmed && !trimmed.startsWith('<')) {
                  const data = JSON.parse(trimmed);
                  if (Array.isArray(data.evidenList)) {
                    setHvbEvidenList(data.evidenList);
                  }
                }
              } catch {
                // Ignore if static/offline
              }
            }}
            onDeleteReport={async (reportId) => {
              setHvbReports((prev) => prev.filter((r) => r.id !== reportId));
              try {
                const res = await fetch(`/api/hvb/reports/${encodeURIComponent(reportId)}`, {
                  method: 'DELETE',
                });
                const rawText = await res.text();
                const trimmed = rawText.trim();
                if (trimmed && !trimmed.startsWith('<')) {
                  const data = JSON.parse(trimmed);
                  if (Array.isArray(data.reports)) {
                    setHvbReports(data.reports);
                  }
                }
              } catch {
                // Ignore if offline
              }
            }}
            onTriggerSound={triggerSound}
          />
        )}

        {/* ===================================================================
            SECTION 4: RIWAYAT TRANSAKSI & LOG PERINGATAN SCAN QR (MENU LOGISTIK ONLY)
        ==================================================================== */}
        {selectedModule === 'logistik' && activeSection === 'riwayat' && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3.5">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-display">
                Riwayat Scan QR Code &amp; Log Notifikasi
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Mencatat aktivitas Material Masuk (STOK SIAP), Material Keluar (TERPAKAI), serta
                peringatan duplikat QR Code.
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
                          MATERIAL MASUK (STOK SIAP)
                        </span>
                      )}
                      {log.type === 'KELUAR' && (
                        <span className="text-amber-700 dark:text-amber-400">
                          MATERIAL KELUAR (TERPAKAI)
                        </span>
                      )}
                      {log.type === 'ERROR_DUPLIKAT' && (
                        <span className="text-red-600 dark:text-red-400">
                          ALERT DUPLIKAT SCAN QR
                        </span>
                      )}
                      {log.type === 'ERROR_JUMLAH' && (
                        <span className="text-red-600 dark:text-red-400">
                          ERROR VALIDASI
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
                    <th className="py-2.5 px-3">SN MATERIAL (QR Code)</th>
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
                            ERROR VALIDASI
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
          Diposisikan di atas zona logo/badge Netlify (+68px) agar tombol tidak tertutup
      ====================================================================== */}
      <div className="md:hidden fixed left-3 right-3 bottom-[calc(env(safe-area-inset-bottom,0px)+68px)] z-40 pointer-events-none">
        {selectedModule === 'logistik' ? (
          <nav
            aria-label="Navigasi Utama Mobile Logistik"
            className="pointer-events-auto mx-auto max-w-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700/90 rounded-2xl shadow-xl shadow-slate-950/15 grid grid-cols-4 items-center gap-1 p-1"
          >
            {/* Posisi 1 (Pertama / Kiri): Masuk */}
            <button
              type="button"
              onClick={() => setActiveSection('masuk')}
              className={`min-h-[44px] py-1 flex flex-col items-center justify-center rounded-xl transition-all ${
                activeSection === 'masuk'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <ArrowDownLeft className="w-[18px] h-[18px]" />
                {inboundReadyList.length > 0 && (
                  <span className="absolute -top-1.5 -right-3 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {inboundReadyList.length}
                  </span>
                )}
              </div>
              <span className="text-[10px] leading-tight tracking-tight mt-0.5 whitespace-nowrap">
                Masuk
              </span>
            </button>

            {/* Posisi 2: Keluar */}
            <button
              type="button"
              onClick={() => setActiveSection('keluar')}
              className={`min-h-[44px] py-1 flex flex-col items-center justify-center rounded-xl transition-all ${
                activeSection === 'keluar'
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <ArrowUpRight className="w-[18px] h-[18px]" />
                {outboundReadyList.length > 0 && (
                  <span className="absolute -top-1.5 -right-3 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                    {outboundReadyList.length}
                  </span>
                )}
              </div>
              <span className="text-[10px] leading-tight tracking-tight mt-0.5 whitespace-nowrap">
                Keluar
              </span>
            </button>

            {/* Posisi 3: Rekap Stok */}
            <button
              type="button"
              onClick={() => setActiveSection('rekap')}
              className={`min-h-[44px] py-1 flex flex-col items-center justify-center rounded-xl transition-all ${
                activeSection === 'rekap' || activeSection === 'spreadsheet'
                  ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-bold shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Layers className="w-[18px] h-[18px]" />
              <span className="text-[10px] leading-tight tracking-tight mt-0.5 whitespace-nowrap">
                Rekap Stok
              </span>
            </button>

            {/* Posisi 4: Riwayat */}
            <button
              type="button"
              onClick={() => setActiveSection('riwayat')}
              className={`min-h-[44px] py-1 flex flex-col items-center justify-center rounded-xl transition-all ${
                activeSection === 'riwayat'
                  ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-bold shadow-2xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <History className="w-[18px] h-[18px]" />
              <span className="text-[10px] leading-tight tracking-tight mt-0.5 whitespace-nowrap">
                Riwayat
              </span>
            </button>
          </nav>
        ) : (
          <nav
            aria-label="Navigasi Utama Mobile Realisasi"
            className="pointer-events-auto mx-auto max-w-md bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-700/90 rounded-2xl shadow-xl shadow-slate-950/15 grid grid-cols-2 items-center gap-1 p-1"
          >
            <button
              type="button"
              onClick={() =>
                setActiveSection(selectedModule === 'yantek' ? 'yantek' : 'hvb')
              }
              className={`min-h-[44px] py-1 flex flex-col items-center justify-center rounded-xl font-bold shadow-2xs ${
                selectedModule === 'yantek'
                  ? 'bg-orange-50 dark:bg-orange-950/60 text-[#ea580c] dark:text-orange-300'
                  : 'bg-cyan-50 dark:bg-cyan-950/60 text-[#0b4f6c] dark:text-cyan-300'
              }`}
            >
              {selectedModule === 'yantek' ? (
                <Wrench className="w-[18px] h-[18px]" />
              ) : (
                <ClipboardCheck className="w-[18px] h-[18px]" />
              )}
              <span className="text-[10px] leading-tight tracking-tight mt-0.5 whitespace-nowrap">
                {selectedModule === 'yantek' ? 'Realisasi Yantek' : 'Realisasi HVB'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsLoginPageOpen(true)}
              className="min-h-[44px] py-1 flex flex-col items-center justify-center rounded-xl text-[#083d54] dark:text-slate-300 hover:bg-cyan-50/70 dark:hover:text-white transition-all"
            >
              <LogOut className="w-[18px] h-[18px]" />
              <span className="text-[10px] leading-tight tracking-tight mt-0.5 whitespace-nowrap">
                Halaman Depan
              </span>
            </button>
          </nav>
        )}
      </div>

      {/* =====================================================================
          QR CODE PREVIEW FLOATING BOTTOM SHEET / MODAL
      ====================================================================== */}
      {previewBarcodeRow && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 pb-[calc(env(safe-area-inset-bottom,0px)+68px)] sm:p-4"
          onClick={() => setPreviewBarcodeRow(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl sm:rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xl max-h-[82vh] sm:max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sm:hidden pt-1 pb-1">
              <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
            </div>

            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[11px] font-mono text-slate-500">
                  MATERIAL_MASUK Baris #{previewBarcodeRow.rowNumber}
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Label QR Code Serial Number (SN)
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
              <BarcodeGraphic value={previewBarcodeRow.snMaterial} height={148} />
              <div className="mt-3 text-xs text-slate-600 dark:text-slate-400 text-center space-y-0.5">
                <div>
                  No. Material:{' '}
                  <strong className="font-mono">{previewBarcodeRow.noMaterial}</strong> · Batch:{' '}
                  <strong className="font-mono">{previewBarcodeRow.noBatch}</strong>
                </div>
                <div className="font-mono text-[11px]">{previewBarcodeRow.spesifikasi}</div>
                <div>
                  Status:{' '}
                  <strong
                    className={`font-mono ${
                      previewBarcodeRow.status === 'TERPAKAI'
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
                Scan QR Code Ini untuk Material Keluar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          LOADING OVERLAY SAAT PENGIRIMAN DATA LOGISTIK
      ====================================================================== */}
      {(isProcessingInbound || isProcessingOutbound) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#083d54]/60 backdrop-blur-xs">
          <div className="w-20 h-20 rounded-2xl bg-white dark:bg-slate-900 border border-cyan-200 dark:border-cyan-800 shadow-2xl flex items-center justify-center">
            <RefreshCw className="w-10 h-10 text-[#0b4f6c] dark:text-[#facc15] animate-spin" />
          </div>
        </div>
      )}

      {/* =====================================================================
          MODALS: CAMERA SCANNER, POPUP DERETAN SN, ALERT, SPREADSHEET SYNC
      ====================================================================== */}
      <CameraScannerModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onDetected={(rawQrPayload) => {
          if (activeSection === 'masuk') {
            handleScanInboundSN(rawQrPayload);
          } else {
            handleScanOutboundSN(rawQrPayload);
          }
        }}
        modeLabel={activeSection === 'masuk' ? 'Material Masuk' : 'Material Keluar'}
        currentListCount={
          activeSection === 'masuk' ? inboundReadyList.length : outboundReadyList.length
        }
      />

      <QrScannedListPopup
        isOpen={qrPopupState.isOpen}
        mode={qrPopupState.mode}
        qrType={qrPopupState.qrType}
        latestScannedItems={qrPopupState.items}
        totalReadyInColumn={
          qrPopupState.mode === 'MASUK'
            ? inboundReadyList.length
            : outboundReadyList.length
        }
        isImporting={
          qrPopupState.mode === 'MASUK' ? isProcessingInbound : isProcessingOutbound
        }
        petugas={petugas}
        onChangePetugas={setPetugas}
        onClose={() => setQrPopupState((prev) => ({ ...prev, isOpen: false }))}
        onSwitchMode={handleSwitchPopupMode}
        onScanMoreCamera={() => {
          setQrPopupState((prev) => ({ ...prev, isOpen: false }));
          setIsCameraOpen(true);
        }}
        onRemoveItem={(snToRemove) => {
          if (qrPopupState.mode === 'MASUK') {
            setInboundReadyList((prev) =>
              prev.filter((r) => r.snMaterial !== snToRemove)
            );
          } else {
            setOutboundReadyList((prev) =>
              prev.filter((r) => r.snMaterial !== snToRemove)
            );
          }
          setQrPopupState((prev) => ({
            ...prev,
            items: prev.items.filter((i) => i.snMaterial !== snToRemove),
          }));
        }}
        onImportNow={async (targetMode) => {
          if (targetMode === 'MASUK') {
            await handleImportInboundReadyList();
          } else {
            await handleImportOutboundReadyList();
          }
        }}
      />

      <ImportFeedbackModal
        feedback={importFeedback}
        onClose={() => setImportFeedback(null)}
        onViewInSpreadsheetTable={(targetTab) => {
          setSearchQuery('');
          setStatusFilter('ALL');
          setMaterialFilter('ALL');
          setCurrentPage(1);
          setActiveSection('spreadsheet');
          setActiveSpreadsheetTab(targetTab || 'MATERIAL_MASUK');
        }}
        onScanAgain={() => {
          setIsCameraOpen(true);
        }}
        onOpenGoogleSyncModal={() => {
          setIsSyncModalOpen(true);
        }}
        onRetryGoogleSheetSync={async () => {
          if (!importFeedback) return;
          if (importFeedback.mode === 'MASUK') {
            await syncInboundToGoogleSheetsDirect(importFeedback.importedRows);
          } else {
            await syncOutboundToGoogleSheetsDirect(
              importFeedback.importedRows,
              importFeedback.mimsRows || []
            );
          }
        }}
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
        authDomainError={authDomainError}
        connectedSheet={connectedSheet}
        selectedSheetTab={selectedSheetTab}
        onSelectSheetTab={(tab) => setSelectedSheetTab(tab)}
        onGoogleLogin={handleGoogleLogin}
        onDirectGisLogin={handleDirectGisLogin}
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
            message: `Tab aktif: "${tabTitle}". Setiap scan QR Material Masuk berstatus STOK SIAP dan Material Keluar mengubah status menjadi TERPAKAI.`,
          });
        }}
        onPullFromGoogleSheet={handlePullFromGoogleSheet}
        onRequestOverwriteGoogleSheet={requestOverwriteGoogleSheet}
        onRequestSyncMimsSheet={requestSyncMimsSheet}
        onRequestCreateNewGoogleSheet={requestCreateNewGoogleSheet}
        onSyncUrl={async (url) => {
          try {
            const res = await fetch('/api/sync/sheet', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ googleSheetUrl: url }),
            });
            const rawText = await res.text();
            const trimmed = rawText.trim();
            if (trimmed && !trimmed.startsWith('<')) {
              const data = JSON.parse(trimmed);
              if (data.rows) setRows(data.rows);
              if (data.stats) setStats(data.stats);
              if (data.logs) setLogs(data.logs);
              if (data.sheetConfig) setSheetConfig(data.sheetConfig);
            }
          } catch {
            // Ignore
          }
        }}
        onResetData={async () => {
          try {
            const res = await fetch('/api/reset', { method: 'POST' });
            const rawText = await res.text();
            const trimmed = rawText.trim();
            if (trimmed && !trimmed.startsWith('<')) {
              const data = JSON.parse(trimmed);
              if (data.rows) setRows(data.rows);
              if (Array.isArray(data.eksekusiMimsRows)) setEksekusiMimsRows(data.eksekusiMimsRows);
              if (data.stats) setStats(data.stats);
              if (data.logs) setLogs(data.logs);
            } else {
              setRows([]);
              setEksekusiMimsRows([]);
            }
          } catch {
            setRows([]);
            setEksekusiMimsRows([]);
          }
          setInboundReadyList([]);
          setOutboundReadyList([]);
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
              download="LOGISTIK_SINJAI_MATERIAL_MASUK.csv"
              className="hover:text-slate-900 dark:hover:text-white underline"
            >
              Unduh Spreadsheet MATERIAL_MASUK
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
