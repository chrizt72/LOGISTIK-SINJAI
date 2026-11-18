import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Zap,
  Building2,
  MapPin,
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  QrCode,
  Search,
  PlusCircle,
  History,
  Trash2,
  Eye,
  X,
  RefreshCw,
  FileSpreadsheet,
  ExternalLink,
  ChevronDown,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import {
  TrafoData,
  TrafoManagementRecord,
  TrafoRecordType,
  YantekDatabaseSegment,
} from '../types/warehouse';
import { SignaturePad } from './SignaturePad';
import { CameraScannerModal } from './CameraScannerModal';
import {
  MANAJEMEN_TRAFO_SHEET_GID,
  SISIP_TRAFO_SHEET_GID,
  TRAFO_SPREADSHEET_STORAGE_KEY,
  extractSpreadsheetId,
  getAccessToken,
  getSpreadsheetMetadata,
  googleSignIn,
  hasValidCachedAccessToken,
  syncTrafoRecordsToAllTeknikSheets,
} from '../services/googleWorkspace';
import {
  MASTER_GARDU_SINJAI_LIST,
  MasterGarduEntry,
  findMasterGarduById,
} from '../data/masterGarduDatabase';

interface TrafoManagementSectionProps {
  mode: 'mutasi' | 'sisip' | 'riwayat';
  onChangeMode: (nextMode: 'mutasi' | 'sisip' | 'riwayat') => void;
  sourceMenu: 'YANTEK' | 'HVB';
  segments: YantekDatabaseSegment[];
  unitOptions: readonly string[];
  defaultUnit: string;
  accessToken: string | null;
  onTriggerSound?: (kind: 'scan' | 'error' | 'commit') => void;
}

const TRAFO_LOCAL_STORAGE_KEY = 'simlog_sinjai_trafo_records_v1';
const TEKNIK_SHEET_STORAGE_KEY = 'simlog_sinjai_teknik_sheet_v1';

const COMMON_TRAFO_BRANDS = [
  'Bambang Djaja (B&D)',
  'Trafindo (TRF)',
  'Sintra',
  'Voltra',
  'Schneider Electric',
  'Centrado',
  'Morita',
  'Starlite',
  'Asata',
];

const STANDARD_KVA_OPTIONS = [25, 50, 100, 160, 200, 250, 315, 400, 630];

const MUTASI_REASONS = [
  'Up-rating kapasitas (Beban Tinggi)',
  'Trafo Eksisting Rusak / Terbakar',
  'Gangguan / Kebocoran Minyak Trafo',
  'Penyeimbangan Beban & Relokasi',
  'Perbaikan Tegangan Ujung',
];

const SISIP_REASONS = [
  'Perbaikan drop tegangan ujung jaringan',
  'Mengatasi overload trafo eksisting',
  'Penyambungan pelanggan baru masif',
  'Perbaikan kualitas tegangan pelayanan',
];

function createEmptyTrafoData(isBaru = false): TrafoData {
  return {
    merk: '',
    daya: 0,
    kapasitasKva: 0,
    type: isBaru ? 'Portal' : '',
    jenisMinyak: 'Mineral Oil (Dialan B)',
    nomorSeri: '',
    tahunBuat: isBaru ? String(new Date().getFullYear()) : '',
    impedansi: '4.0%',
    teganganPrimer: '20.000 V',
    teganganSekunder: '400 V / 231 V',
    arusPrimer: 0,
    arusSekunder: 0,
    volumeMinyak: '',
    beratTotal: 0,
    fasa: '3 Fasa',
    konstruksi: isBaru ? 'Portal' : '',
    teganganNominal: '20 kV / 400 - 231 V',
    arusNominalA: 0,
    beratKg: 0,
  };
}

function calculateDerivedSpecs(kva: number, prev: TrafoData): TrafoData {
  if (!kva || kva <= 0 || Number.isNaN(kva)) {
    return {
      ...prev,
      daya: 0,
      kapasitasKva: 0,
      arusPrimer: 0,
      arusSekunder: 0,
      arusNominalA: 0,
      volumeMinyak: '',
      beratTotal: 0,
      beratKg: 0,
    };
  }
  const isSinglePhase = (prev.fasa || '').includes('1');
  const calcArusPrimer = isSinglePhase
    ? Math.round((kva / 20) * 100) / 100
    : Math.round((kva / (1.732 * 20)) * 100) / 100;
  const calcArusSekunder = isSinglePhase
    ? Math.round((kva / 0.231) * 10) / 10
    : Math.round((kva / (1.732 * 0.4)) * 10) / 10;
  const calcVol = `${Math.round(kva * 2.1)} L`;
  const calcBerat = Math.round(kva * 6.9);

  return {
    ...prev,
    daya: kva,
    kapasitasKva: kva,
    arusPrimer: calcArusPrimer,
    arusSekunder: calcArusSekunder,
    arusNominalA: calcArusSekunder,
    volumeMinyak: calcVol,
    beratTotal: calcBerat,
    beratKg: calcBerat,
  };
}

function generateBaNumber(type: TrafoRecordType): string {
  const prefix = type === 'SISIP' ? 'BA-TS' : 'BA-MT';
  const year = new Date().getFullYear();
  const suffix = String(Date.now()).slice(-4);
  return `${prefix}/PLN-SINJAI/${year}/${suffix}`;
}

function formatWitaNow(): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return `${dateStr} ${timeStr} WITA`;
}

async function processPhotoWithWatermark(
  file: File,
  meta: {
    label: string;
    garduId: string;
    namaGardu: string;
    lat: string;
    lng: string;
    pengawas: string;
  }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file foto'));
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve(rawDataUrl);
      img.onload = () => {
        try {
          const maxDim = 960;
          let targetW = img.width;
          let targetH = img.height;
          if (targetW > maxDim || targetH > maxDim) {
            if (targetW >= targetH) {
              targetH = Math.round((targetH * maxDim) / targetW);
              targetW = maxDim;
            } else {
              targetW = Math.round((targetW * maxDim) / targetH);
              targetH = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, targetW, targetH);

          // Bottom dark translucent watermark strip
          const barH = Math.max(58, Math.round(targetH * 0.13));
          ctx.fillStyle = 'rgba(8, 25, 38, 0.78)';
          ctx.fillRect(0, targetH - barH, targetW, barH);

          const padX = 14;
          const fontBase = Math.max(11, Math.round(targetW * 0.017));
          ctx.fillStyle = '#facc15';
          ctx.font = `bold ${fontBase}px sans-serif`;
          ctx.fillText(
            `${meta.label} · ${meta.garduId || 'GARDU'} (${meta.namaGardu || 'ULP SINJAI'})`,
            padX,
            targetH - barH + fontBase + 8
          );

          ctx.fillStyle = '#e2e8f0';
          ctx.font = `${Math.max(10, fontBase - 1)}px monospace`;
          ctx.fillText(
            `GPS: ${meta.lat || '-'}, ${meta.lng || '-'} · ${formatWitaNow()} · ${
              meta.pengawas || 'Pengawas Lapangan'
            }`,
            padX,
            targetH - 12
          );

          resolve(canvas.toDataURL('image/jpeg', 0.78));
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function loadLocalTrafoRecords(): TrafoManagementRecord[] {
  try {
    const raw = localStorage.getItem(TRAFO_LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalTrafoRecords(records: TrafoManagementRecord[]) {
  try {
    localStorage.setItem(TRAFO_LOCAL_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignore quota errors if photos are large
  }
}

export const TrafoManagementSection: React.FC<TrafoManagementSectionProps> = ({
  mode,
  onChangeMode,
  sourceMenu,
  segments,
  unitOptions,
  defaultUnit,
  accessToken,
  onTriggerSound,
}) => {
  const [records, setRecords] = useState<TrafoManagementRecord[]>(() =>
    loadLocalTrafoRecords()
  );
  const [unitPelaksana, setUnitPelaksana] = useState<string>(defaultUnit);
  const [tanggal, setTanggal] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  // Common GPS & Pengawas state
  const [koordinatLat, setKoordinatLat] = useState<string>('-5.1264');
  const [koordinatLng, setKoordinatLng] = useState<string>('120.1518');
  const [isGettingGps, setIsGettingGps] = useState<boolean>(false);
  const [gpsStatusMsg, setGpsStatusMsg] = useState<string | null>(null);

  // Empty defaults for Pengawas so officers can type directly without clearing prefill text
  const [namaPengawas, setNamaPengawas] = useState<string>('');
  const [nipPengawas, setNipPengawas] = useState<string>('');
  const [sigPengawasUrl, setSigPengawasUrl] = useState<string>('');

  // ---------------- FORM MUTASI STATE ----------------
  const [mutasiBaNumber, setMutasiBaNumber] = useState<string>(() =>
    generateBaNumber('MUTASI')
  );
  const [mutasiQuery, setMutasiQuery] = useState<string>('');
  const [showMutasiDropdown, setShowMutasiDropdown] = useState<boolean>(false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState<boolean>(false);
  const [mutasiGarduId, setMutasiGarduId] = useState<string>('');
  const [mutasiNamaGardu, setMutasiNamaGardu] = useState<string>('');
  const [mutasiPenyulang, setMutasiPenyulang] = useState<string>('');
  const [mutasiLokasi, setMutasiLokasi] = useState<string>('');
  const [mutasiAlasan, setMutasiAlasan] = useState<string>(MUTASI_REASONS[0]);
  const [trafoLama, setTrafoLama] = useState<TrafoData>(() =>
    createEmptyTrafoData(false)
  );
  const [trafoBaru, setTrafoBaru] = useState<TrafoData>(() =>
    createEmptyTrafoData(true)
  );

  // ---------------- FORM SISIP STATE ----------------
  const [sisipBaNumber, setSisipBaNumber] = useState<string>(() =>
    generateBaNumber('SISIP')
  );
  const [idGarduSisip, setIdGarduSisip] = useState<string>('');
  const [namaGarduSisip, setNamaGarduSisip] = useState<string>('');
  const [penyulangSisip, setPenyulangSisip] = useState<string>('');
  const [lokasiSisip, setLokasiSisip] = useState<string>('');
  const [showSisipRefPicker, setShowSisipRefPicker] = useState<boolean>(false);
  const [sisipRefFilter, setSisipRefFilter] = useState<string>('');
  const [alasanSisip, setAlasanSisip] = useState<string>(
    'Perbaikan drop tegangan dan pembagian beban over-capacity'
  );
  const [trafoSisip, setTrafoSisip] = useState<TrafoData>(() =>
    createEmptyTrafoData(true)
  );

  // ---------------- 4 FOTO WAJIB ----------------
  const [foto1, setFoto1] = useState<string | null>(null); // Mutasi: Nametag Lama | Sisip: Nametag Sisip
  const [foto2, setFoto2] = useState<string | null>(null); // Mutasi: Nametag Baru | Sisip: Dudukan / Tiang
  const [foto3, setFoto3] = useState<string | null>(null); // Sebelum Pekerjaan
  const [foto4, setFoto4] = useState<string | null>(null); // Sesudah Pekerjaan
  const [processingPhotoSlot, setProcessingPhotoSlot] = useState<number | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // ---------------- SUBMISSION & UI FEEDBACK ----------------
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const [missingPhotoModal, setMissingPhotoModal] = useState<string[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccessRecord, setSubmitSuccessRecord] =
    useState<TrafoManagementRecord | null>(null);
  const [sheetSyncMessage, setSheetSyncMessage] = useState<string | null>(null);

  // ---------------- RIWAYAT FILTER & MODAL ----------------
  const [historyFilter, setHistoryFilter] = useState<'ALL' | 'MUTASI' | 'SISIP'>('ALL');
  const [historySearch, setHistorySearch] = useState<string>('');
  const [selectedDetailRecord, setSelectedDetailRecord] =
    useState<TrafoManagementRecord | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);

  // ---------------- CONNECTED TRAFO SPREADSHEET LINKER ----------------
  const [connectedTrafoSpreadsheetId, setConnectedTrafoSpreadsheetId] = useState<
    string | undefined
  >(() => {
    try {
      const rawTrafo = localStorage.getItem(TRAFO_SPREADSHEET_STORAGE_KEY);
      if (rawTrafo) {
        const parsed = JSON.parse(rawTrafo);
        if (parsed?.spreadsheetId) return String(parsed.spreadsheetId);
      }
      const rawTeknik = localStorage.getItem(TEKNIK_SHEET_STORAGE_KEY);
      if (rawTeknik) {
        const parsed = JSON.parse(rawTeknik);
        if (parsed?.spreadsheetId) return String(parsed.spreadsheetId);
      }
    } catch {
      // Ignore storage errors
    }
    return undefined;
  });
  const [showSheetLinker, setShowSheetLinker] = useState<boolean>(false);
  const [sheetUrlInput, setSheetUrlInput] = useState<string>('');
  const [isConnectingSheet, setIsConnectingSheet] = useState<boolean>(false);

  const photoSectionRef = useRef<HTMLDivElement | null>(null);

  const persistConnectedTrafoSheet = (spreadsheetId: string, title?: string) => {
    setConnectedTrafoSpreadsheetId(spreadsheetId);
    try {
      localStorage.setItem(
        TRAFO_SPREADSHEET_STORAGE_KEY,
        JSON.stringify({ spreadsheetId, title: title || 'MASTER GARDU / TRAFO' })
      );
    } catch {
      // Ignore storage quota error
    }
  };

  // Load records from backend on mount
  useEffect(() => {
    let active = true;
    const loadFromServer = async () => {
      try {
        const res = await fetch('/api/trafo/records');
        const text = await res.text();
        if (!res.ok || !text || text.trim().startsWith('<')) return;
        const data = JSON.parse(text);
        if (active && Array.isArray(data?.records)) {
          setRecords(data.records);
          saveLocalTrafoRecords(data.records);
        }
      } catch {
        // Keep localStorage fallback
      }
    };
    loadFromServer();
    return () => {
      active = false;
    };
  }, []);

  const filteredMutasiGardu = useMemo(() => {
    const q = mutasiQuery.trim().toLowerCase();
    if (!q) return MASTER_GARDU_SINJAI_LIST.slice(0, 40);
    return MASTER_GARDU_SINJAI_LIST.filter(
      (g) =>
        g.id.toLowerCase().includes(q) ||
        g.penyulang.toLowerCase().includes(q) ||
        g.segment.toLowerCase().includes(q) ||
        g.zonaProteksi.toLowerCase().includes(q) ||
        g.namaGardu.toLowerCase().includes(q) ||
        String(g.dayaKva).includes(q)
    ).slice(0, 40);
  }, [mutasiQuery]);

  const filteredMutasiSegments = useMemo(() => {
    const q = mutasiQuery.trim().toLowerCase();
    if (!q) return segments.slice(0, 12);
    return segments
      .filter(
        (s) =>
          s.segment.toLowerCase().includes(q) ||
          s.keypoint.toLowerCase().includes(q) ||
          s.penyulang.toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [segments, mutasiQuery]);

  const filteredSisipGardu = useMemo(() => {
    const q = sisipRefFilter.trim().toLowerCase();
    if (!q) return MASTER_GARDU_SINJAI_LIST.slice(0, 25);
    return MASTER_GARDU_SINJAI_LIST.filter(
      (g) =>
        g.id.toLowerCase().includes(q) ||
        g.penyulang.toLowerCase().includes(q) ||
        g.segment.toLowerCase().includes(q) ||
        g.namaGardu.toLowerCase().includes(q)
    ).slice(0, 25);
  }, [sisipRefFilter]);

  const filteredSisipSegments = useMemo(() => {
    const q = sisipRefFilter.trim().toLowerCase();
    if (!q) return segments.slice(0, 12);
    return segments
      .filter(
        (s) =>
          s.segment.toLowerCase().includes(q) ||
          s.keypoint.toLowerCase().includes(q) ||
          s.penyulang.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [segments, sisipRefFilter]);

  const filteredHistoryRecords = useMemo(() => {
    return records.filter((rec) => {
      if (historyFilter !== 'ALL' && rec.jenisPekerjaan !== historyFilter) {
        return false;
      }
      if (historySearch.trim()) {
        const q = historySearch.trim().toLowerCase();
        return (
          rec.garduId.toLowerCase().includes(q) ||
          rec.namaGardu.toLowerCase().includes(q) ||
          rec.nomorLaporan.toLowerCase().includes(q) ||
          rec.penyulang.toLowerCase().includes(q) ||
          rec.unitPelaksana.toLowerCase().includes(q) ||
          rec.namaPengawas.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [records, historyFilter, historySearch]);

  const handleGetGps = () => {
    if (!navigator.geolocation) {
      setGpsStatusMsg('Geolocation tidak didukung browser ini.');
      return;
    }
    setIsGettingGps(true);
    setGpsStatusMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setKoordinatLat(pos.coords.latitude.toFixed(6));
        setKoordinatLng(pos.coords.longitude.toFixed(6));
        setGpsStatusMsg(
          `✓ GPS Terdeteksi (±${Math.round(pos.coords.accuracy)} m)`
        );
        setIsGettingGps(false);
        if (onTriggerSound) onTriggerSound('scan');
      },
      () => {
        setGpsStatusMsg('Gagal mengambil GPS otomatis, silakan isi manual.');
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSelectMutasiGardu = (gardu: MasterGarduEntry) => {
    setMutasiGarduId(gardu.id);
    setMutasiNamaGardu(gardu.namaGardu);
    setMutasiPenyulang(gardu.penyulang);
    const areaDetail = [
      gardu.segment || gardu.zonaProteksi,
      gardu.peruntukan ? `${gardu.peruntukan}` : '',
      gardu.daerah || '',
    ]
      .filter(Boolean)
      .join(' · ');
    setMutasiLokasi(
      areaDetail ? `${areaDetail} (Penyulang ${gardu.penyulang})` : `Penyulang ${gardu.penyulang}`
    );
    setMutasiQuery(
      `${gardu.id} — ${gardu.penyulang} (${gardu.dayaKva} kVA · ${gardu.segment || gardu.zonaProteksi})`
    );
    if (gardu.lat && gardu.lng) {
      setKoordinatLat(gardu.lat);
      setKoordinatLng(gardu.lng);
      setGpsStatusMsg(
        `✓ Koordinat Master Gardu ${gardu.id} dimuat (${gardu.lat}, ${gardu.lng})`
      );
    }
    const baseLama = createEmptyTrafoData(false);
    const updatedLama = calculateDerivedSpecs(gardu.dayaKva, {
      ...baseLama,
      type: gardu.konstruksi || 'Cantol / Portal',
      konstruksi: gardu.konstruksi || '',
      fasa: gardu.fasa,
      teganganSekunder: gardu.fasa === '1 Fasa' ? '231 V' : '400 V / 231 V',
    });
    setTrafoLama(updatedLama);
    setShowMutasiDropdown(false);
    setFormWarning(null);
    if (onTriggerSound) onTriggerSound('scan');
  };

  const handleSelectMutasiSegment = (seg: YantekDatabaseSegment) => {
    const cleanId =
      seg.keypoint && seg.keypoint !== '-' ? seg.keypoint : seg.segment;
    setMutasiGarduId(cleanId);
    setMutasiNamaGardu(seg.segment);
    setMutasiPenyulang(seg.penyulang);
    setMutasiLokasi(
      `${seg.segment} (${seg.penyulang}${seg.panjangKms ? ` · ${seg.panjangKms} kms` : ''})`
    );
    setMutasiQuery(`${cleanId} — ${seg.segment}`);
    setShowMutasiDropdown(false);
    setFormWarning(null);
    if (onTriggerSound) onTriggerSound('scan');
  };

  const handleQrBarcodeDetected = (rawPayload: string) => {
    setIsQrScannerOpen(false);
    const cleaned = rawPayload.trim();
    if (!cleaned) return;
    setMutasiQuery(cleaned);

    const matchedGardu = findMasterGarduById(cleaned);
    if (matchedGardu) {
      handleSelectMutasiGardu(matchedGardu);
      return;
    }

    const matchedSegment = segments.find(
      (s) =>
        s.segment.toLowerCase().includes(cleaned.toLowerCase()) ||
        s.keypoint.toLowerCase().includes(cleaned.toLowerCase())
    );
    if (matchedSegment) {
      handleSelectMutasiSegment(matchedSegment);
    } else {
      setMutasiGarduId(cleaned.toUpperCase());
      if (!mutasiNamaGardu) {
        setMutasiNamaGardu(`Gardu / Trafo ${cleaned.toUpperCase()}`);
      }
      if (onTriggerSound) onTriggerSound('scan');
    }
  };

  const handleSelectSisipReferenceGardu = (gardu: MasterGarduEntry) => {
    setIdGarduSisip(`${gardu.id}-SISIP`);
    setNamaGarduSisip(`Trafo Sisip ${gardu.id} (${gardu.segment || gardu.penyulang})`);
    setPenyulangSisip(gardu.penyulang);
    setLokasiSisip(
      `Dekat Gardu ${gardu.id} · ${gardu.segment || gardu.zonaProteksi} (Penyulang ${gardu.penyulang})`
    );
    if (gardu.lat && gardu.lng) {
      setKoordinatLat(gardu.lat);
      setKoordinatLng(gardu.lng);
      setGpsStatusMsg(`✓ Koordinat referensi ${gardu.id} dimuat (${gardu.lat}, ${gardu.lng})`);
    }
    setShowSisipRefPicker(false);
    setFormWarning(null);
    if (onTriggerSound) onTriggerSound('scan');
  };

  const handleSelectSisipReferenceSegment = (seg: YantekDatabaseSegment) => {
    const baseCode =
      seg.keypoint && seg.keypoint !== '-' ? seg.keypoint : seg.segment.slice(0, 8);
    setIdGarduSisip(`${baseCode}-SISIP`);
    setNamaGarduSisip(`Gardu Sisip ${seg.segment}`);
    setPenyulangSisip(seg.penyulang);
    setLokasiSisip(`Dekat ${seg.segment} (${seg.penyulang})`);
    setShowSisipRefPicker(false);
    setFormWarning(null);
    if (onTriggerSound) onTriggerSound('scan');
  };

  const handleLinkTrafoSpreadsheet = async () => {
    const parsedId = extractSpreadsheetId(sheetUrlInput);
    if (!parsedId) {
      setFormWarning('URL / ID Google Spreadsheet tidak valid. Tempel link Google Sheets yang lengkap.');
      return;
    }
    let token: string | null = accessToken;
    if (!hasValidCachedAccessToken()) {
      try {
        const authRes = await googleSignIn();
        if (authRes?.accessToken) token = authRes.accessToken;
      } catch {
        // Save locally even without OAuth metadata verification
      }
    } else {
      token = (await getAccessToken()) || accessToken;
    }
    setIsConnectingSheet(true);
    try {
      if (token) {
        const meta = await getSpreadsheetMetadata(token, parsedId, true);
        persistConnectedTrafoSheet(meta.spreadsheetId, meta.title);
        setSheetSyncMessage(
          `Spreadsheet "${meta.title}" berhasil ditautkan untuk Manajemen & Sisip Trafo.`
        );
      } else {
        persistConnectedTrafoSheet(parsedId);
      }
      setShowSheetLinker(false);
      setSheetUrlInput('');
      setFormWarning(null);
      if (onTriggerSound) onTriggerSound('commit');
    } catch (err: any) {
      setFormWarning(
        err?.message || 'Gagal memverifikasi Spreadsheet. Pastikan akun Google memiliki akses.'
      );
    } finally {
      setIsConnectingSheet(false);
    }
  };

  const handlePhotoSelect = async (
    slot: 1 | 2 | 3 | 4,
    label: string,
    file?: File
  ) => {
    if (!file) return;
    setProcessingPhotoSlot(slot);
    try {
      const processed = await processPhotoWithWatermark(file, {
        label,
        garduId: mode === 'sisip' ? idGarduSisip : mutasiGarduId,
        namaGardu: mode === 'sisip' ? namaGarduSisip : mutasiNamaGardu,
        lat: koordinatLat,
        lng: koordinatLng,
        pengawas: namaPengawas,
      });
      if (slot === 1) setFoto1(processed);
      if (slot === 2) setFoto2(processed);
      if (slot === 3) setFoto3(processed);
      if (slot === 4) setFoto4(processed);
      if (onTriggerSound) onTriggerSound('scan');
    } finally {
      setProcessingPhotoSlot(null);
    }
  };

  const handleResetCurrentForm = (targetType: TrafoRecordType) => {
    setFoto1(null);
    setFoto2(null);
    setFoto3(null);
    setFoto4(null);
    setNamaPengawas('');
    setNipPengawas('');
    setSigPengawasUrl('');
    setFormWarning(null);
    if (targetType === 'MUTASI') {
      setMutasiBaNumber(generateBaNumber('MUTASI'));
      setMutasiQuery('');
      setMutasiGarduId('');
      setMutasiNamaGardu('');
      setMutasiPenyulang('');
      setMutasiLokasi('');
      setTrafoLama(createEmptyTrafoData(false));
      setTrafoBaru(createEmptyTrafoData(true));
    } else {
      setSisipBaNumber(generateBaNumber('SISIP'));
      setIdGarduSisip('');
      setNamaGarduSisip('');
      setPenyulangSisip('');
      setLokasiSisip('');
      setTrafoSisip(createEmptyTrafoData(true));
    }
  };

  const handleSubmitTrafo = async (
    e: React.FormEvent,
    submitType: TrafoRecordType
  ) => {
    e.preventDefault();
    setFormWarning(null);
    setSheetSyncMessage(null);

    if (submitType === 'MUTASI') {
      const finalGarduName =
        mutasiNamaGardu.trim() || mutasiQuery.trim() || mutasiGarduId.trim();
      if (!finalGarduName) {
        setFormWarning('Pilih Nama Trafo / Gardu atau isi ID Gardu terlebih dahulu.');
        return;
      }
      if (!trafoBaru.merk.trim() || !trafoBaru.daya) {
        setFormWarning('Merk dan Daya (kVA) Trafo Baru (Pengganti) wajib diisi.');
        return;
      }
    } else {
      if (!idGarduSisip.trim() || !namaGarduSisip.trim() || !penyulangSisip.trim()) {
        setFormWarning(
          'ID Gardu/No. Tiang Sisip, Nama Gardu Sisip, dan Nama Penyulang wajib diisi.'
        );
        return;
      }
      if (!trafoSisip.merk.trim() || !trafoSisip.daya) {
        setFormWarning('Merk dan Daya (kVA) Trafo Sisip wajib diisi.');
        return;
      }
    }

    // Check 4 mandatory photos
    const photoLabels =
      submitType === 'MUTASI'
        ? [
            'Nametag Trafo Lama',
            'Nametag Trafo Baru',
            'Sebelum Pekerjaan',
            'Sesudah Pekerjaan',
          ]
        : [
            'Nametag Trafo Sisip',
            'Dudukan / Tiang Sisip',
            'Sebelum Pasang (Awal)',
            'Sesudah (Bertegangan)',
          ];
    const missingPhotos: string[] = [];
    if (!foto1) missingPhotos.push(photoLabels[0]);
    if (!foto2) missingPhotos.push(photoLabels[1]);
    if (!foto3) missingPhotos.push(photoLabels[2]);
    if (!foto4) missingPhotos.push(photoLabels[3]);

    if (missingPhotos.length > 0) {
      setMissingPhotoModal(missingPhotos);
      return;
    }

    if (!sigPengawasUrl) {
      setFormWarning('Tanda tangan Pengawas Pekerjaan wajib dibuat.');
      return;
    }

    if (!namaPengawas.trim()) {
      setFormWarning('Nama Lengkap Pengawas Pekerjaan wajib diisi.');
      return;
    }

    // Synchronous OAuth token check before async calls so popup isn't blocked on mobile
    let freshClickToken: string | null = accessToken;
    if (!hasValidCachedAccessToken()) {
      try {
        const authRes = await googleSignIn();
        if (authRes?.accessToken) {
          freshClickToken = authRes.accessToken;
        }
      } catch {
        // Proceed with local + backend persistence even if Google Sign-In dismissed
      }
    } else {
      freshClickToken = (await getAccessToken()) || accessToken;
    }

    const nowWita = formatWitaNow();
    const record: TrafoManagementRecord =
      submitType === 'MUTASI'
        ? {
            id: `TRF-MT-${Date.now()}`,
            nomorLaporan: mutasiBaNumber.trim() || generateBaNumber('MUTASI'),
            tanggal,
            timestampLaporan: nowWita,
            jenisPekerjaan: 'MUTASI',
            sumberMenu: sourceMenu,
            unitPelaksana,
            garduId:
              mutasiGarduId.trim() || mutasiQuery.trim().toUpperCase() || 'GARDU',
            namaGardu: mutasiNamaGardu.trim() || mutasiQuery.trim(),
            penyulang: mutasiPenyulang.trim() || 'Penyulang Distribusi',
            lokasi: mutasiLokasi.trim() || mutasiNamaGardu.trim() || '-',
            koordinat: {
              lat: parseFloat(koordinatLat) || -5.1264,
              lng: parseFloat(koordinatLng) || 120.1518,
            },
            alasanPenggantian: mutasiAlasan,
            trafoLama: { ...trafoLama },
            trafoBaru: { ...trafoBaru },
            namaPengawas: namaPengawas.trim(),
            nipPengawas: nipPengawas.trim() || '-',
            tandaTanganPengawasUrl: sigPengawasUrl,
            fotoNameplateLamaUrl: foto1 || undefined,
            fotoNameplateBaruUrl: foto2 || undefined,
            fotoSebelumUrl: foto3 || undefined,
            fotoSesudahUrl: foto4 || undefined,
            statusApproval: 'PENDING',
            createdAt: nowWita,
          }
        : {
            id: `TRF-SISIP-${Date.now()}`,
            nomorLaporan: sisipBaNumber.trim() || generateBaNumber('SISIP'),
            tanggal,
            timestampLaporan: nowWita,
            jenisPekerjaan: 'SISIP',
            sumberMenu: sourceMenu,
            unitPelaksana,
            garduId: idGarduSisip.trim().toUpperCase(),
            namaGardu: namaGarduSisip.trim(),
            penyulang: penyulangSisip.trim(),
            lokasi: lokasiSisip.trim() || `Lokasi Tiang ${idGarduSisip.trim()}`,
            koordinat: {
              lat: parseFloat(koordinatLat) || -5.1264,
              lng: parseFloat(koordinatLng) || 120.1518,
            },
            alasanPenggantian: alasanSisip.trim() || 'Pemasangan trafo sisip baru',
            trafoLama: createEmptyTrafoData(false),
            trafoBaru: { ...trafoSisip },
            namaPengawas: namaPengawas.trim(),
            nipPengawas: nipPengawas.trim() || '-',
            tandaTanganPengawasUrl: sigPengawasUrl,
            fotoNameplateLamaUrl: foto1 || undefined,
            fotoNameplateBaruUrl: foto2 || undefined,
            fotoSebelumUrl: foto3 || undefined,
            fotoSesudahUrl: foto4 || undefined,
            statusApproval: 'PENDING',
            createdAt: nowWita,
          };

    setIsSubmitting(true);
    try {
      let updatedRecords = [record, ...records];
      try {
        const res = await fetch('/api/trafo/records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
        });
        const text = await res.text();
        if (text && !text.trim().startsWith('<')) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed?.records)) {
            updatedRecords = parsed.records;
          }
        }
      } catch {
        // Offline / static preview fallback
      }

      setRecords(updatedRecords);
      saveLocalTrafoRecords(updatedRecords);

      if (freshClickToken) {
        try {
          const syncRes = await syncTrafoRecordsToAllTeknikSheets(
            freshClickToken,
            updatedRecords,
            connectedTrafoSpreadsheetId
          );
          if (syncRes.primaryMeta?.spreadsheetId) {
            persistConnectedTrafoSheet(
              syncRes.primaryMeta.spreadsheetId,
              syncRes.primaryMeta.title
            );
          }
          setSheetSyncMessage(
            `Berhasil tersinkron ke ${syncRes.syncedCount} Spreadsheet "${
              syncRes.primaryMeta?.title || 'MASTER GARDU'
            }" (Sheet "${
              submitType === 'SISIP' ? ' SISIP TRAFO' : 'MANAJEMEN TRAFO'
            }").`
          );
        } catch (syncErr: any) {
          setSheetSyncMessage(
            `Data tersimpan di aplikasi, namun sinkronisasi Google Sheet tertunda: ${
              syncErr?.message || 'cek koneksi'
            }`
          );
        }
      } else {
        setSheetSyncMessage(
          'Data tersimpan di aplikasi. Hubungkan akun Google Workspace untuk sinkron ke Sheet.'
        );
      }

      if (onTriggerSound) onTriggerSound('commit');
      setSubmitSuccessRecord(record);
      handleResetCurrentForm(submitType);
    } catch (err: any) {
      if (onTriggerSound) onTriggerSound('error');
      setFormWarning(err?.message || 'Gagal mengirim data trafo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecord = async (recordId: string) => {
    let nextRecords = records.filter((r) => r.id !== recordId);
    try {
      const res = await fetch(`/api/trafo/records/${encodeURIComponent(recordId)}`, {
        method: 'DELETE',
      });
      const text = await res.text();
      if (res.ok && text && !text.trim().startsWith('<')) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.records)) {
          nextRecords = parsed.records;
        }
      }
    } catch {
      // Fallback
    }
    setRecords(nextRecords);
    saveLocalTrafoRecords(nextRecords);
    if (selectedDetailRecord?.id === recordId) {
      setSelectedDetailRecord(null);
    }
  };

  const handleSyncAllToGoogleSheet = async () => {
    let token: string | null = accessToken;
    if (!hasValidCachedAccessToken()) {
      try {
        const authRes = await googleSignIn();
        if (authRes?.accessToken) {
          token = authRes.accessToken;
        }
      } catch {
        return;
      }
    } else {
      token = (await getAccessToken()) || accessToken;
    }
    if (!token) return;
    setIsSyncingAll(true);
    try {
      const res = await syncTrafoRecordsToAllTeknikSheets(
        token,
        records,
        connectedTrafoSpreadsheetId
      );
      if (res.primaryMeta?.spreadsheetId) {
        persistConnectedTrafoSheet(
          res.primaryMeta.spreadsheetId,
          res.primaryMeta.title
        );
      }
      setSheetSyncMessage(
        `Sinkronisasi selesai (${res.syncedCount} file Spreadsheet "${
          res.primaryMeta?.title || 'MASTER GARDU'
        }" diperbarui).`
      );
      if (onTriggerSound) onTriggerSound('commit');
    } catch (err: any) {
      setFormWarning(err?.message || 'Gagal menyinkronkan ke Google Sheet.');
      if (onTriggerSound) onTriggerSound('error');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handlePrintBeritaAcara = (rec: TrafoManagementRecord) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const isSisip = rec.jenisPekerjaan === 'SISIP';
    let y = 14;

    doc.setFillColor(8, 61, 84);
    doc.rect(14, y, pageWidth - 28, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('PT PLN (PERSERO) UP3 BULUKUMBA · ULP SINJAI', 18, y + 7.5);
    doc.setTextColor(250, 204, 21);
    doc.setFontSize(9.5);
    doc.text(
      `BERITA ACARA ${isSisip ? 'PEMASANGAN TRAFO SISIP' : 'MANAJEMEN & MUTASI TRAFO'}`,
      18,
      y + 14.5
    );
    doc.setTextColor(226, 232, 240);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${rec.nomorLaporan}`, pageWidth - 18, y + 14.5, { align: 'right' });

    y += 26;
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8.5);
    const metaRows: [string, string, string, string][] = [
      ['ID Gardu / Tiang', rec.garduId, 'Unit Pelaksana', rec.unitPelaksana],
      ['Nama Gardu', rec.namaGardu, 'Tanggal', rec.tanggal],
      ['Penyulang', rec.penyulang, 'Sumber Menu', `Realisasi ${rec.sumberMenu}`],
      ['Lokasi', rec.lokasi || '-', 'GPS Lat/Lng', `${rec.koordinat.lat}, ${rec.koordinat.lng}`],
    ];
    metaRows.forEach(([l1, v1, l2, v2]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(`${l1}:`, 14, y);
      doc.text(`${l2}:`, 108, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(v1).slice(0, 38), 44, y);
      doc.text(String(v2).slice(0, 38), 136, y);
      y += 5.5;
    });
    doc.setFont('helvetica', 'bold');
    doc.text('Alasan:', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(rec.alasanPenggantian || '-', pageWidth - 46), 44, y);
    y += 9;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('SPESIFIKASI TEKNIS (13 PARAMETER)', 14, y);
    y += 4;

    doc.setFillColor(11, 79, 108);
    doc.rect(14, y, pageWidth - 28, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text('PARAMETER', 17, y + 4.8);
    if (!isSisip) {
      doc.text('TRAFO LAMA', 86, y + 4.8);
      doc.text('TRAFO BARU (PENGGANTI)', 142, y + 4.8);
    } else {
      doc.text('TRAFO SISIP (BARU)', 96, y + 4.8);
    }
    y += 7;

    const specs: [string, string, string][] = [
      ['1. Merk Trafo', rec.trafoLama.merk || '-', rec.trafoBaru.merk || '-'],
      ['2. Daya (kVA)', `${rec.trafoLama.daya || 0} kVA`, `${rec.trafoBaru.daya || 0} kVA`],
      ['3. Type Trafo', rec.trafoLama.type || '-', rec.trafoBaru.type || '-'],
      ['4. Jenis Minyak', rec.trafoLama.jenisMinyak || '-', rec.trafoBaru.jenisMinyak || '-'],
      ['5. No Seri', rec.trafoLama.nomorSeri || '-', rec.trafoBaru.nomorSeri || '-'],
      ['6. Tahun Buat', rec.trafoLama.tahunBuat || '-', rec.trafoBaru.tahunBuat || '-'],
      ['7. Impedansi (%)', rec.trafoLama.impedansi || '-', rec.trafoBaru.impedansi || '-'],
      ['8. Teg. Primer', rec.trafoLama.teganganPrimer || '-', rec.trafoBaru.teganganPrimer || '-'],
      ['9. Teg. Sekunder', rec.trafoLama.teganganSekunder || '-', rec.trafoBaru.teganganSekunder || '-'],
      ['10. Arus Primer (A)', `${rec.trafoLama.arusPrimer || 0} A`, `${rec.trafoBaru.arusPrimer || 0} A`],
      ['11. Arus Sekunder (A)', `${rec.trafoLama.arusSekunder || 0} A`, `${rec.trafoBaru.arusSekunder || 0} A`],
      ['12. Volume Minyak', String(rec.trafoLama.volumeMinyak || '-'), String(rec.trafoBaru.volumeMinyak || '-')],
      ['13. Berat Total (Kg)', `${rec.trafoLama.beratTotal || 0} Kg`, `${rec.trafoBaru.beratTotal || 0} Kg`],
    ];

    doc.setTextColor(15, 23, 42);
    specs.forEach(([label, lama, baru], idx) => {
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y, pageWidth - 28, 6, 'F');
      }
      doc.setFont('helvetica', 'bold');
      doc.text(label, 17, y + 4.2);
      doc.setFont('helvetica', 'normal');
      if (!isSisip) {
        doc.text(String(lama).slice(0, 26), 86, y + 4.2);
        doc.text(String(baru).slice(0, 28), 142, y + 4.2);
      } else {
        doc.text(String(baru).slice(0, 48), 96, y + 4.2);
      }
      y += 6;
    });

    y += 8;
    const sigX = pageWidth - 78;
    doc.setFont('helvetica', 'normal');
    doc.text('Pengawas Pekerjaan Lapangan,', sigX, y);
    if (rec.tandaTanganPengawasUrl) {
      try {
        doc.addImage(rec.tandaTanganPengawasUrl, 'PNG', sigX, y + 2, 52, 18);
      } catch {
        // Ignore invalid signature data url
      }
    }
    doc.setFont('helvetica', 'bold');
    doc.text(rec.namaPengawas || '-', sigX, y + 24);
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP: ${rec.nipPengawas || '-'}`, sigX, y + 29);

    const photos = [
      { title: isSisip ? 'Nametag Sisip' : 'Nametag Lama', url: rec.fotoNameplateLamaUrl },
      { title: isSisip ? 'Tiang / Dudukan' : 'Nametag Baru', url: rec.fotoNameplateBaruUrl },
      { title: 'Sebelum Pekerjaan', url: rec.fotoSebelumUrl },
      { title: 'Sesudah Pekerjaan', url: rec.fotoSesudahUrl },
    ].filter((p) => Boolean(p.url));

    if (photos.length > 0) {
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`DOKUMENTASI FOTO (${rec.nomorLaporan})`, 14, 16);
      photos.forEach((p, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const px = 14 + col * 93;
        const py = 24 + row * 95;
        doc.setFontSize(8.5);
        doc.text(p.title, px, py);
        try {
          doc.addImage(p.url!, 'JPEG', px, py + 3, 86, 72);
        } catch {
          // Skip invalid photo
        }
      });
    }

    const safeFile = `${rec.nomorLaporan.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`;
    doc.save(safeFile);
  };

  const renderPhotoUploadCard = (
    slot: 1 | 2 | 3 | 4,
    title: string,
    buttonLabel: string,
    value: string | null,
    accent: 'cyan' | 'purple'
  ) => {
    const isProcessing = processingPhotoSlot === slot;
    const accentText =
      accent === 'purple'
        ? 'text-purple-700 dark:text-purple-300'
        : 'text-[#0b4f6c] dark:text-cyan-300';
    const accentBorder =
      accent === 'purple'
        ? 'border-purple-200 dark:border-purple-800 hover:border-purple-400'
        : 'border-slate-300 dark:border-slate-700 hover:border-[#2c96ab]';

    return (
      <div className="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
            {title}
          </span>
          {value && (
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
              ✓ Terisi
            </span>
          )}
        </div>

        {value ? (
          <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 aspect-[4/3] group">
            <img
              src={value}
              alt={title}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => setPreviewPhotoUrl(value)}
            />
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPreviewPhotoUrl(value)}
                className="p-1.5 rounded-lg bg-slate-900/80 text-white hover:bg-slate-900"
                title="Perbesar Foto"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (slot === 1) setFoto1(null);
                  if (slot === 2) setFoto2(null);
                  if (slot === 3) setFoto3(null);
                  if (slot === 4) setFoto4(null);
                }}
                className="p-1.5 rounded-lg bg-rose-600/90 text-white hover:bg-rose-700"
                title="Hapus Foto"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <label
            className={`aspect-[4/3] rounded-xl border-2 border-dashed ${accentBorder} bg-white dark:bg-slate-900/70 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors p-2 text-center`}
          >
            {isProcessing ? (
              <>
                <Loader2 className={`w-5 h-5 animate-spin ${accentText}`} />
                <span className="text-[10px] font-semibold text-slate-500">
                  Memproses GPS & Watermark...
                </span>
              </>
            ) : (
              <>
                <Camera className="w-5 h-5 text-slate-400" />
                <span className={`text-[11px] font-bold ${accentText}`}>
                  {buttonLabel}
                </span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                handlePhotoSelect(slot, title, e.target.files?.[0]);
                e.currentTarget.value = '';
              }}
            />
          </label>
        )}
      </div>
    );
  };

  const render13ParamColumn = (
    title: string,
    badgeLabel: string,
    data: TrafoData,
    setData: React.Dispatch<React.SetStateAction<TrafoData>>,
    isBaru: boolean
  ) => (
    <div
      className={`p-3.5 sm:p-4 rounded-2xl border space-y-3 ${
        isBaru
          ? 'bg-cyan-50/40 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-800/70'
          : 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isBaru ? 'bg-[#126b82]' : 'bg-slate-400'
            }`}
          />
          <h4 className="text-xs font-extrabold tracking-wide text-slate-900 dark:text-white uppercase">
            {title}
          </h4>
        </div>
        <span
          className={`text-[10px] font-semibold ${
            isBaru
              ? 'text-[#0b4f6c] dark:text-cyan-300'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {badgeLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            1. Merk Trafo
          </label>
          <input
            type="text"
            list="trafo-brand-datalist"
            value={data.merk}
            onChange={(e) => setData((p) => ({ ...p, merk: e.target.value }))}
            placeholder={isBaru ? 'Masukkan merk trafo baru' : 'Contoh: Trafindo'}
            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            2. Daya (kVA)
          </label>
          <input
            type="number"
            value={data.daya || ''}
            onChange={(e) => {
              const kva = e.target.value === '' ? 0 : parseFloat(e.target.value);
              setData((p) => calculateDerivedSpecs(kva, p));
            }}
            placeholder={isBaru ? 'Masukkan kVA' : 'kVA Lama'}
            className={`w-full min-h-[38px] px-2.5 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-950 border rounded-xl text-slate-900 dark:text-white ${
              isBaru
                ? 'border-cyan-400 dark:border-cyan-700'
                : 'border-slate-300 dark:border-slate-700'
            }`}
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            3. Type Trafo
          </label>
          <input
            type="text"
            value={data.type}
            onChange={(e) =>
              setData((p) => ({
                ...p,
                type: e.target.value,
                konstruksi: e.target.value,
              }))
            }
            placeholder="Pasangan Luar / Portal"
            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            4. Jenis Minyak
          </label>
          <input
            type="text"
            value={data.jenisMinyak}
            onChange={(e) =>
              setData((p) => ({ ...p, jenisMinyak: e.target.value }))
            }
            placeholder="Mineral Oil (Dialan B)"
            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            5. No Seri
          </label>
          <input
            type="text"
            value={data.nomorSeri}
            onChange={(e) =>
              setData((p) => ({ ...p, nomorSeri: e.target.value }))
            }
            placeholder={isBaru ? 'BD-xxxx' : 'TRF-xxxx'}
            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            6. Tahun Buat
          </label>
          <input
            type="text"
            value={data.tahunBuat}
            onChange={(e) =>
              setData((p) => ({ ...p, tahunBuat: e.target.value }))
            }
            placeholder={isBaru ? '2026' : '2018'}
            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            7. Impedansi (%)
          </label>
          <input
            type="text"
            value={data.impedansi}
            onChange={(e) =>
              setData((p) => ({ ...p, impedansi: e.target.value }))
            }
            placeholder="4.0%"
            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            12. Volume Minyak (L)
          </label>
          <input
            type="text"
            value={data.volumeMinyak}
            onChange={(e) =>
              setData((p) => ({ ...p, volumeMinyak: e.target.value }))
            }
            placeholder="210 L"
            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            8. Teg. Operasi Primer
          </label>
          <input
            type="text"
            value={data.teganganPrimer}
            onChange={(e) =>
              setData((p) => ({ ...p, teganganPrimer: e.target.value }))
            }
            placeholder="20.000 V"
            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            9. Teg. Operasi Sekunder
          </label>
          <input
            type="text"
            value={data.teganganSekunder}
            onChange={(e) =>
              setData((p) => ({ ...p, teganganSekunder: e.target.value }))
            }
            placeholder="400 V / 231 V"
            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            10. Arus Primer (A)
          </label>
          <input
            type="number"
            step="0.01"
            value={data.arusPrimer}
            onChange={(e) =>
              setData((p) => ({
                ...p,
                arusPrimer: parseFloat(e.target.value) || 0,
              }))
            }
            className="w-full min-h-[36px] px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            11. Arus Sekunder (A)
          </label>
          <input
            type="number"
            step="0.1"
            value={data.arusSekunder}
            onChange={(e) =>
              setData((p) => ({
                ...p,
                arusSekunder: parseFloat(e.target.value) || 0,
              }))
            }
            className="w-full min-h-[36px] px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase mb-1">
            13. Berat Total (Kg)
          </label>
          <input
            type="number"
            value={data.beratTotal}
            onChange={(e) =>
              setData((p) => ({
                ...p,
                beratTotal: parseFloat(e.target.value) || 0,
              }))
            }
            className="w-full min-h-[36px] px-2 py-1 text-xs font-mono font-bold bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <datalist id="trafo-brand-datalist">
        {COMMON_TRAFO_BRANDS.map((brand) => (
          <option key={brand} value={brand} />
        ))}
      </datalist>

      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#ea580c] dark:text-[#facc15]">
              PT PLN (PERSERO) UP3 BULUKUMBA · UID SULSELRABAR
            </p>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
              Manajemen &amp; Mutasi Trafo Distribusi ULP SINJAI
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Menu terintegrasi Realisasi {sourceMenu} · Sheet{' '}
              <span className="font-mono font-semibold">
                MANAJEMEN TRAFO (gid={MANAJEMEN_TRAFO_SHEET_GID})
              </span>{' '}
              &amp;{' '}
              <span className="font-mono font-semibold">
                SISIP TRAFO (gid={SISIP_TRAFO_SHEET_GID})
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
            <div className="inline-flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  onChangeMode('mutasi');
                  setFormWarning(null);
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                  mode === 'mutasi'
                    ? 'bg-white dark:bg-slate-900 text-[#083d54] dark:text-white shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Form Mutasi
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeMode('sisip');
                  setFormWarning(null);
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  mode === 'sisip'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>SISIP</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeMode('riwayat');
                  setFormWarning(null);
                }}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  mode === 'riwayat'
                    ? 'bg-[#0b4f6c] text-[#facc15] shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Riwayat ({records.length})</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowSheetLinker((v) => !v)}
              className="px-2.5 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1 hover:bg-emerald-100"
              title="Tautkan URL Spreadsheet Master Gardu / Trafo"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Link Sheet Trafo</span>
            </button>
          </div>
        </div>

        {showSheetLinker && (
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={sheetUrlInput}
              onChange={(e) => setSheetUrlInput(e.target.value)}
              placeholder="Tempel URL Google Spreadsheet Master Gardu (yang berisi gid=2045619555 & gid=1390013841)..."
              className="flex-1 px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLinkTrafoSpreadsheet}
                disabled={isConnectingSheet}
                className="px-3.5 py-2 rounded-lg bg-[#083d54] text-white text-xs font-bold disabled:opacity-60"
              >
                {isConnectingSheet ? 'Menautkan...' : 'Simpan Tautan'}
              </button>
              {connectedTrafoSpreadsheetId && (
                <a
                  href={`https://docs.google.com/spreadsheets/d/${connectedTrafoSpreadsheetId}/edit#gid=${MANAJEMEN_TRAFO_SHEET_GID}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
                >
                  <span>Buka Sheet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {formWarning && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="font-semibold">{formWarning}</span>
        </div>
      )}

      {sheetSyncMessage && !submitSuccessRecord && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-2 text-xs text-emerald-800 dark:text-emerald-200">
          <span className="font-semibold">{sheetSyncMessage}</span>
          <button
            type="button"
            onClick={() => setSheetSyncMessage(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==================== MODE 1: FORM MUTASI TRAFO ==================== */}
      {mode === 'mutasi' && (
        <form
          onSubmit={(e) => handleSubmitTrafo(e, 'MUTASI')}
          className="space-y-4"
        >
          {/* Card 1: Pilih Trafo / Gardu + GPS + BA + Alasan */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                <Search className="w-4 h-4 text-[#0b4f6c] dark:text-[#facc15]" />
                <span>PILIH NAMA TRAFO / GARDU ATAU SCAN BARCODE</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-lg bg-cyan-50 dark:bg-cyan-950/50 text-[#0b4f6c] dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 text-[11px] font-bold">
                {MASTER_GARDU_SINJAI_LIST.length} Trafo ULP Sinjai (BS...)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 relative">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={mutasiQuery}
                      onFocus={() => setShowMutasiDropdown(true)}
                      onChange={(e) => {
                        setMutasiQuery(e.target.value);
                        setMutasiNamaGardu(e.target.value);
                        setShowMutasiDropdown(true);
                      }}
                      placeholder={`Pilih nama trafo dari ${MASTER_GARDU_SINJAI_LIST.length} gardu ULP Sinjai (BS...)...`}
                      className="w-full min-h-[44px] pl-10 pr-9 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMutasiDropdown((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-900"
                      title="Tampilkan Daftar Gardu"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsQrScannerOpen(true)}
                    className="min-h-[44px] px-3.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 border border-cyan-300 dark:border-cyan-700 text-[#0b4f6c] dark:text-cyan-300 hover:bg-cyan-100 flex items-center gap-1.5 text-xs font-bold shrink-0"
                    title="Scan Barcode / QR Trafo"
                  >
                    <QrCode className="w-4 h-4" />
                    <span className="hidden sm:inline">Scan</span>
                  </button>
                </div>

                {showMutasiDropdown && (
                  <div className="mt-1.5 max-h-64 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl divide-y divide-slate-100 dark:divide-slate-800">
                    <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300 sticky top-0 z-10">
                      <span>
                        Master Gardu ULP Sinjai ({filteredMutasiGardu.length} hasil BS...)
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowMutasiDropdown(false)}
                        className="text-slate-500 hover:text-slate-900"
                      >
                        Tutup
                      </button>
                    </div>
                    {filteredMutasiGardu.map((gardu) => (
                      <button
                        key={gardu.id}
                        type="button"
                        onClick={() => handleSelectMutasiGardu(gardu)}
                        className="w-full px-3 py-2 text-left hover:bg-cyan-50 dark:hover:bg-cyan-950/40 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-extrabold text-[#0b4f6c] dark:text-cyan-300">
                            {gardu.id}
                          </span>
                          <span className="mx-1.5 text-slate-400">·</span>
                          <span className="font-semibold text-slate-900 dark:text-white truncate">
                            {gardu.penyulang} — {gardu.segment || gardu.zonaProteksi}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 shrink-0">
                          {gardu.dayaKva} kVA · {gardu.fasa === '1 Fasa' ? '1P' : '3P'}
                        </span>
                      </button>
                    ))}
                    {filteredMutasiSegments.length > 0 && (
                      <>
                        <div className="px-3 py-1 bg-slate-100/70 dark:bg-slate-800/70 text-[10px] font-bold text-slate-500 uppercase">
                          Referensi Keypoint / Segment
                        </div>
                        {filteredMutasiSegments.map((seg) => (
                          <button
                            key={`${seg.rowNumber}-${seg.segment}-${seg.keypoint}`}
                            type="button"
                            onClick={() => handleSelectMutasiSegment(seg)}
                            className="w-full px-3 py-2 text-left hover:bg-cyan-50 dark:hover:bg-cyan-950/40 flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-bold text-slate-900 dark:text-white">
                              {seg.segment}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                              {seg.penyulang} · {seg.keypoint}
                            </span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div>
                <select
                  value={unitPelaksana}
                  onChange={(e) => setUnitPelaksana(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ID Gardu / Keypoint
                </label>
                <input
                  type="text"
                  value={mutasiGarduId}
                  onChange={(e) => setMutasiGarduId(e.target.value.toUpperCase())}
                  placeholder="Contoh: G.014 / BS-08"
                  className="w-full min-h-[40px] px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Penyulang
                </label>
                <input
                  type="text"
                  value={mutasiPenyulang}
                  onChange={(e) => setMutasiPenyulang(e.target.value)}
                  placeholder="Nama Penyulang"
                  className="w-full min-h-[40px] px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tanggal Pekerjaan
                </label>
                <input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* GPS Block */}
            <div className="p-3.5 rounded-xl bg-cyan-50/60 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#083d54] dark:text-cyan-300 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-[#126b82]" />
                  <span>Titik Koordinat Lokasi Gardu (GPS)</span>
                </span>
                <button
                  type="button"
                  onClick={handleGetGps}
                  disabled={isGettingGps}
                  className="px-3 py-1.5 rounded-lg bg-[#0b4f6c] hover:bg-[#083d54] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                >
                  <MapPin className={`w-3.5 h-3.5 ${isGettingGps ? 'animate-bounce' : ''}`} />
                  <span>{isGettingGps ? 'Mengambil GPS...' : 'Ambil Titik Koordinat GPS'}</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Latitude (X)
                  </label>
                  <input
                    type="text"
                    value={koordinatLat}
                    onChange={(e) => setKoordinatLat(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Longitude (Y)
                  </label>
                  <input
                    type="text"
                    value={koordinatLng}
                    onChange={(e) => setKoordinatLng(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              {gpsStatusMsg && (
                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {gpsStatusMsg}
                </p>
              )}
            </div>

            {/* Nomor BA & Alasan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nomor Berita Acara
                </label>
                <input
                  type="text"
                  value={mutasiBaNumber}
                  onChange={(e) => setMutasiBaNumber(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Alasan Penggantian Trafo
                </label>
                <select
                  value={mutasiAlasan}
                  onChange={(e) => setMutasiAlasan(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  {MUTASI_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Spesifikasi Trafo Lama vs Baru */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                <SlidersHorizontal className="w-4 h-4 text-[#ea580c]" />
                <span>SPESIFIKASI TRAFO LAMA VS TRAFO BARU (13 PARAMETER)</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Isi kVA untuk hitung otomatis Arus, Volume Minyak &amp; Berat
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {render13ParamColumn(
                'TRAFO LAMA (EKSISTING)',
                mutasiGarduId ? `Gardu ${mutasiGarduId}` : 'Data Eksisting',
                trafoLama,
                setTrafoLama,
                false
              )}
              {render13ParamColumn(
                'TRAFO BARU (PENGGANTI)',
                'Dipasang ke tiang',
                trafoBaru,
                setTrafoBaru,
                true
              )}
            </div>
          </div>

          {/* Card 3: 4 Foto Wajib */}
          <div
            ref={photoSectionRef}
            className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-amber-300 dark:border-amber-800/80 shadow-sm space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                <Camera className="w-4 h-4 text-[#0b4f6c] dark:text-[#facc15]" />
                <span>UNGGAH FOTO BUKTI &amp; NAMETAG MUTASI TRAFO</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-extrabold uppercase">
                4 FOTO WAJIB
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {renderPhotoUploadCard(
                1,
                'Nametag Trafo Lama',
                '+ Nametag Lama',
                foto1,
                'cyan'
              )}
              {renderPhotoUploadCard(
                2,
                'Nametag Trafo Baru',
                '+ Nametag Baru',
                foto2,
                'cyan'
              )}
              {renderPhotoUploadCard(
                3,
                'Sebelum Pekerjaan',
                '+ Kondisi Awal',
                foto3,
                'cyan'
              )}
              {renderPhotoUploadCard(
                4,
                'Sesudah Pekerjaan',
                '+ Kondisi Akhir',
                foto4,
                'cyan'
              )}
            </div>
          </div>

          {/* Card 4: Pengesahan Pengawas */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                PENGESAHAN: PENGAWAS PEKERJAAN
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Dikirim ke Sheet MANAJEMEN TRAFO (gid={MANAJEMEN_TRAFO_SHEET_GID})
              </span>
            </div>

            <SignaturePad
              label="Tanda Tangan: Pengawas Pekerjaan"
              roleDescription="Pengawas Pekerjaan Lapangan ULP SINJAI"
              initialSignature={sigPengawasUrl}
              onSave={setSigPengawasUrl}
              name={namaPengawas}
              nip={nipPengawas}
              onNameChange={setNamaPengawas}
              onNipChange={setNipPengawas}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[50px] py-3.5 px-5 rounded-2xl bg-[#083d54] hover:bg-[#0b4f6c] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition-colors disabled:opacity-60"
          >
            <Send className="w-4 h-4 text-[#facc15]" />
            <span>Selesai Input Mutasi Trafo &amp; Kirim ke Sheet MANAJEMEN TRAFO</span>
          </button>
        </form>
      )}

      {/* ==================== MODE 2: + SISIP TRAFO BARU ==================== */}
      {mode === 'sisip' && (
        <form
          onSubmit={(e) => handleSubmitTrafo(e, 'SISIP')}
          className="space-y-4"
        >
          {/* Purple Header Banner matching screenshot */}
          <div className="bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-purple-700 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-purple-500/30 border border-purple-400/40 text-purple-100 text-[10px] font-extrabold uppercase tracking-wider">
                <PlusCircle className="w-3.5 h-3.5 text-amber-300" />
                <span>FORM SISIP TRAFO BARU</span>
              </div>
              <h3 className="text-base sm:text-lg font-extrabold tracking-tight">
                Pemasangan Unit Trafo Sisip Distribusi ULP SINJAI
              </h3>
              <p className="text-xs text-purple-100/90 max-w-2xl">
                Input pemasangan trafo sisipan baru ke jaringan (tanpa pembongkaran trafo lama). Dilengkapi 13 parameter teknis, 4 foto dokumentasi GPS, tanda tangan pengawas, dan sinkron otomatis ke Sheet SISIP TRAFO (gid={SISIP_TRAFO_SHEET_GID}).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onChangeMode('riwayat')}
                className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold"
              >
                Lihat Riwayat
              </button>
              {connectedTrafoSpreadsheetId && (
                <a
                  href={`https://docs.google.com/spreadsheets/d/${connectedTrafoSpreadsheetId}/edit#gid=${SISIP_TRAFO_SHEET_GID}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Sheet Sisip (gid={SISIP_TRAFO_SHEET_GID})</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          {/* Section 1: Lokasi & Identitas Gardu / Tiang Sisip */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                <Building2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>1. LOKASI &amp; IDENTITAS GARDU / TIANG SISIPAN</span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={unitPelaksana}
                  onChange={(e) => setUnitPelaksana(e.target.value)}
                  className="px-2.5 py-1 text-[11px] font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="px-2.5 py-1 text-[11px] font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ID Gardu / No. Tiang Sisip *
                </label>
                <input
                  type="text"
                  required
                  value={idGarduSisip}
                  onChange={(e) => setIdGarduSisip(e.target.value.toUpperCase())}
                  placeholder="Contoh: SI-08, G-TS01, atau T.144A"
                  className="w-full min-h-[42px] px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Gardu Sisip *
                </label>
                <input
                  type="text"
                  required
                  value={namaGarduSisip}
                  onChange={(e) => setNamaGarduSisip(e.target.value)}
                  placeholder="Contoh: Gardu Sisip Bontoala, Trafo Sisip KP. Baru"
                  className="w-full min-h-[42px] px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Penyulang Distribusi *
                </label>
                <input
                  type="text"
                  required
                  value={penyulangSisip}
                  onChange={(e) => setPenyulangSisip(e.target.value)}
                  placeholder="Contoh: Penyulang Kalumpang, Penyulang Kota"
                  className="w-full min-h-[42px] px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lokasi / Alamat Pemasangan
                </label>
                <input
                  type="text"
                  value={lokasiSisip}
                  onChange={(e) => setLokasiSisip(e.target.value)}
                  placeholder="Contoh: Jl. Poros Bontoala KM 3, Depan Masjid"
                  className="w-full min-h-[42px] px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowSisipRefPicker((v) => !v)}
                className="text-[11px] font-bold text-purple-700 dark:text-purple-300 hover:underline"
              >
                {showSisipRefPicker
                  ? 'Sembunyikan Pilihan Gardu / Segment Terdekat'
                  : '+ Ambil Data dari Gardu Induk / Induk Terdekat'}
              </button>

              {showSisipRefPicker && (
                <div className="mt-2 p-3 rounded-xl bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 space-y-2">
                  <input
                    type="text"
                    value={sisipRefFilter}
                    onChange={(e) => setSisipRefFilter(e.target.value)}
                    placeholder={`Filter dari ${MASTER_GARDU_SINJAI_LIST.length} gardu BS... / penyulang / segment...`}
                    className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white"
                  />
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredSisipGardu.map((gardu) => (
                      <button
                        key={gardu.id}
                        type="button"
                        onClick={() => handleSelectSisipReferenceGardu(gardu)}
                        className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-left text-xs flex items-center justify-between gap-2 border border-purple-200/70 dark:border-purple-800/60"
                      >
                        <div className="min-w-0 truncate">
                          <span className="font-mono font-extrabold text-purple-700 dark:text-purple-300">
                            {gardu.id}
                          </span>
                          <span className="mx-1.5 text-slate-400">·</span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {gardu.segment || gardu.zonaProteksi}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                          {gardu.penyulang} · {gardu.dayaKva} kVA
                        </span>
                      </button>
                    ))}
                    {filteredSisipSegments.map((seg) => (
                      <button
                        key={`${seg.rowNumber}-${seg.segment}`}
                        type="button"
                        onClick={() => handleSelectSisipReferenceSegment(seg)}
                        className="w-full px-2.5 py-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-left text-xs flex items-center justify-between border border-slate-200 dark:border-slate-700"
                      >
                        <span className="font-bold text-slate-900 dark:text-white">
                          {seg.segment}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">
                          {seg.penyulang}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* GPS Block */}
            <div className="p-3.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-purple-600" />
                  <span>Titik Koordinat Lokasi Gardu Sisip (GPS)</span>
                </span>
                <button
                  type="button"
                  onClick={handleGetGps}
                  disabled={isGettingGps}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                >
                  <MapPin className={`w-3.5 h-3.5 ${isGettingGps ? 'animate-bounce' : ''}`} />
                  <span>{isGettingGps ? 'Mengambil GPS...' : 'Ambil Titik Koordinat GPS'}</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Latitude (X)
                  </label>
                  <input
                    type="text"
                    value={koordinatLat}
                    onChange={(e) => setKoordinatLat(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                    Longitude (Y)
                  </label>
                  <input
                    type="text"
                    value={koordinatLng}
                    onChange={(e) => setKoordinatLng(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              {gpsStatusMsg && (
                <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {gpsStatusMsg}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Alasan Penambahan Trafo Sisip *
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {SISIP_REASONS.map((alasan) => (
                  <button
                    key={alasan}
                    type="button"
                    onClick={() => setAlasanSisip(alasan)}
                    className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold border transition-colors ${
                      alasanSisip === alasan
                        ? 'bg-purple-700 text-white border-purple-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {alasan}
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                required
                value={alasanSisip}
                onChange={(e) => setAlasanSisip(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Section 2: 13 Parameter Teknis Trafo Sisip */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-purple-600" />
                  <span>2. SPESIFIKASI DATA TEKNIS TRAFO SISIP (13 PARAMETER)</span>
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Nomor Berita Acara:{' '}
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                    {sisipBaNumber}
                  </span>
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 text-[10px] font-extrabold uppercase">
                Unit Baru Sisipan
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                1. Merk Trafo Sisip *
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {COMMON_TRAFO_BRANDS.map((brand) => (
                  <button
                    key={brand}
                    type="button"
                    onClick={() => setTrafoSisip((p) => ({ ...p, merk: brand }))}
                    className={`text-[11px] px-2.5 py-1 rounded-lg font-bold border transition-colors ${
                      trafoSisip.merk === brand
                        ? 'bg-purple-700 text-white border-purple-800'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {brand}
                  </button>
                ))}
              </div>
              <input
                type="text"
                required
                value={trafoSisip.merk}
                onChange={(e) =>
                  setTrafoSisip((p) => ({ ...p, merk: e.target.value }))
                }
                placeholder="Masukkan merk trafo sisip..."
                className="w-full min-h-[42px] px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                2. Daya Trafo Sisip (kVA) *
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {STANDARD_KVA_OPTIONS.map((kva) => (
                  <button
                    key={kva}
                    type="button"
                    onClick={() =>
                      setTrafoSisip((p) => calculateDerivedSpecs(kva, p))
                    }
                    className={`text-xs px-3 py-1.5 rounded-xl font-extrabold border transition-colors ${
                      Number(trafoSisip.daya) === kva
                        ? 'bg-purple-700 text-white border-purple-800 shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {kva} kVA
                  </button>
                ))}
              </div>
              <input
                type="number"
                required
                value={trafoSisip.daya || ''}
                onChange={(e) => {
                  const kva =
                    e.target.value === '' ? 0 : parseFloat(e.target.value);
                  setTrafoSisip((p) => calculateDerivedSpecs(kva, p));
                }}
                placeholder="Masukkan kVA (misal: 100)"
                className="w-full min-h-[42px] px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  3. Type Trafo *
                </label>
                <input
                  type="text"
                  required
                  value={trafoSisip.type}
                  onChange={(e) =>
                    setTrafoSisip((p) => ({
                      ...p,
                      type: e.target.value,
                      konstruksi: e.target.value,
                    }))
                  }
                  placeholder="Pasangan Luar (Outdoor) / Portal"
                  className="w-full min-h-[40px] px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  4. Jenis Minyak *
                </label>
                <input
                  type="text"
                  value={trafoSisip.jenisMinyak}
                  onChange={(e) =>
                    setTrafoSisip((p) => ({ ...p, jenisMinyak: e.target.value }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  5. No Seri Trafo *
                </label>
                <input
                  type="text"
                  required
                  value={trafoSisip.nomorSeri}
                  onChange={(e) =>
                    setTrafoSisip((p) => ({ ...p, nomorSeri: e.target.value }))
                  }
                  placeholder="Contoh: BD-2026-9021"
                  className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  6. Tahun Buat *
                </label>
                <input
                  type="text"
                  required
                  value={trafoSisip.tahunBuat}
                  onChange={(e) =>
                    setTrafoSisip((p) => ({ ...p, tahunBuat: e.target.value }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  7. Impedansi (%) *
                </label>
                <input
                  type="text"
                  value={trafoSisip.impedansi}
                  onChange={(e) =>
                    setTrafoSisip((p) => ({ ...p, impedansi: e.target.value }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  12. Volume Minyak (L) *
                </label>
                <input
                  type="text"
                  value={trafoSisip.volumeMinyak}
                  onChange={(e) =>
                    setTrafoSisip((p) => ({ ...p, volumeMinyak: e.target.value }))
                  }
                  placeholder="Contoh: 210 L"
                  className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  8. Tegangan Operasi Primer *
                </label>
                <input
                  type="text"
                  value={trafoSisip.teganganPrimer}
                  onChange={(e) =>
                    setTrafoSisip((p) => ({
                      ...p,
                      teganganPrimer: e.target.value,
                    }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  9. Tegangan Operasi Sekunder *
                </label>
                <input
                  type="text"
                  value={trafoSisip.teganganSekunder}
                  onChange={(e) =>
                    setTrafoSisip((p) => ({
                      ...p,
                      teganganSekunder: e.target.value,
                    }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  10. Arus Operasi Primer (A)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={trafoSisip.arusPrimer}
                  onChange={(e) =>
                    setTrafoSisip((p) => ({
                      ...p,
                      arusPrimer: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  11. Arus Operasi Sekunder (A)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={trafoSisip.arusSekunder}
                  onChange={(e) =>
                    setTrafoSisip((p) => ({
                      ...p,
                      arusSekunder: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  13. Berat Total (Kg)
                </label>
                <input
                  type="number"
                  value={trafoSisip.beratTotal}
                  onChange={(e) =>
                    setTrafoSisip((p) => ({
                      ...p,
                      beratTotal: parseFloat(e.target.value) || 0,
                    }))
                  }
                  className="w-full min-h-[40px] px-3 py-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Section 3: 4 Foto Dokumentasi Pemasangan Trafo Sisip */}
          <div
            ref={photoSectionRef}
            className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                <Camera className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>3. UNGGAH 4 FOTO DOKUMENTASI PEMASANGAN TRAFO SISIP</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-extrabold uppercase">
                4 FOTO WAJIB
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {renderPhotoUploadCard(
                1,
                'Nametag Trafo Sisip',
                '+ Nametag Sisip',
                foto1,
                'purple'
              )}
              {renderPhotoUploadCard(
                2,
                'Dudukan / Tiang Sisip',
                '+ Tiang / Dudukan',
                foto2,
                'purple'
              )}
              {renderPhotoUploadCard(
                3,
                'Sebelum Pasang (Awal)',
                '+ Kondisi Awal',
                foto3,
                'purple'
              )}
              {renderPhotoUploadCard(
                4,
                'Sesudah (Bertegangan)',
                '+ Bertegangan',
                foto4,
                'purple'
              )}
            </div>
          </div>

          {/* Section 4: Pengesahan Pengawas Lapangan */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                4. PENGESAHAN: PENGAWAS PEKERJAAN LAPANGAN
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Otomatis masuk ke Sheet &quot;SISIP TRAFO&quot; (gid=1390013841)
              </span>
            </div>

            <SignaturePad
              label="Tanda Tangan Pengawas Pekerjaan Lapangan"
              roleDescription="Pengawas Pekerjaan Pemasangan Trafo Sisip ULP SINJAI"
              initialSignature={sigPengawasUrl}
              onSave={setSigPengawasUrl}
              name={namaPengawas}
              nip={nipPengawas}
              onNameChange={setNamaPengawas}
              onNipChange={setNipPengawas}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[50px] py-3.5 px-5 rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-700 hover:from-purple-800 hover:to-indigo-800 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-60"
          >
            <Send className="w-4 h-4 text-amber-300" />
            <span>Selesai Input Trafo Sisip &amp; Kirim ke Sheet SISIP TRAFO</span>
          </button>
        </form>
      )}

      {/* ==================== MODE 3: RIWAYAT TRAFO ==================== */}
      {mode === 'riwayat' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['ALL', 'MUTASI', 'SISIP'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setHistoryFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    historyFilter === tab
                      ? 'bg-[#083d54] text-white border-[#083d54]'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {tab === 'ALL'
                    ? `Semua (${records.length})`
                    : tab === 'MUTASI'
                    ? `Mutasi (${
                        records.filter((r) => r.jenisPekerjaan === 'MUTASI').length
                      })`
                    : `Sisip (${
                        records.filter((r) => r.jenisPekerjaan === 'SISIP').length
                      })`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Cari Gardu / BA / Pengawas..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={handleSyncAllToGoogleSheet}
                disabled={isSyncingAll || records.length === 0}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`}
                />
                <span>Sinkron Sheet</span>
              </button>
            </div>
          </div>

          {filteredHistoryRecords.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              Belum ada riwayat Mutasi atau Sisip Trafo tersimpan.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredHistoryRecords.map((rec) => (
                <div
                  key={rec.id}
                  className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                          rec.jenisPekerjaan === 'SISIP'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                            : 'bg-cyan-100 text-[#083d54] dark:bg-cyan-950 dark:text-cyan-300'
                        }`}
                      >
                        {rec.jenisPekerjaan}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                        {rec.sumberMenu}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {rec.garduId} — {rec.namaGardu}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300">
                      BA: <span className="font-mono">{rec.nomorLaporan}</span> ·{' '}
                      {rec.trafoBaru.merk} ({rec.trafoBaru.daya} kVA) · Pengawas:{' '}
                      <strong>{rec.namaPengawas}</strong> · {rec.tanggal}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => setSelectedDetailRecord(rec)}
                      className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Detail</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePrintBeritaAcara(rec)}
                      className="px-3 py-1.5 rounded-lg bg-[#0b4f6c] text-white text-xs font-bold hover:bg-[#083d54]"
                    >
                      Cetak PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRecord(rec.id)}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      title="Hapus Riwayat"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QR Scanner Modal for Gardu Picker */}
      <CameraScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        onDetected={handleQrBarcodeDetected}
        modeLabel="Scan Barcode / QR Gardu & Trafo"
      />

      {/* Loading Spinner Overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-sm w-full text-center space-y-3 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <Loader2 className="w-10 h-10 text-[#0b4f6c] dark:text-[#facc15] animate-spin mx-auto" />
            <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Menyimpan Data Trafo...
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sedang menyimpan berkas dan menyinkronkan ke Google Spreadsheet TEKNIK SINJAI.
            </p>
          </div>
        </div>
      )}

      {/* Missing 4 Photos Modal */}
      {missingPhotoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 max-w-md w-full border border-rose-200 dark:border-rose-800 shadow-2xl space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  4 Foto Dokumentasi Wajib Dilengkapi
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Foto berikut belum diunggah:
                </p>
                <ul className="list-disc pl-5 mt-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 space-y-0.5">
                  {missingPhotoModal.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setMissingPhotoModal(null);
                  photoSectionRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  });
                }}
                className="px-4 py-2 rounded-xl bg-[#083d54] text-white text-xs font-bold"
              >
                Lengkapi Foto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {submitSuccessRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 max-w-md w-full border border-emerald-200 dark:border-emerald-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Data Berhasil Dikirim
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {submitSuccessRecord.nomorLaporan} · {submitSuccessRecord.namaGardu}
                </p>
              </div>
            </div>
            {sheetSyncMessage && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">
                {sheetSyncMessage}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const rec = submitSuccessRecord;
                  setSubmitSuccessRecord(null);
                  handlePrintBeritaAcara(rec);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold"
              >
                Cetak PDF Berita Acara
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubmitSuccessRecord(null);
                  onChangeMode('riwayat');
                }}
                className="px-4 py-2 rounded-xl bg-[#0b4f6c] text-white text-xs font-bold"
              >
                Lihat Riwayat
              </button>
              <button
                type="button"
                onClick={() => setSubmitSuccessRecord(null)}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal in Riwayat */}
      {selectedDetailRecord && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 max-w-2xl w-full max-h-[88vh] overflow-y-auto border border-slate-200 dark:border-slate-700 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase text-[#ea580c]">
                  {selectedDetailRecord.jenisPekerjaan} TRAFO · Realisasi{' '}
                  {selectedDetailRecord.sumberMenu}
                </span>
                <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                  {selectedDetailRecord.garduId} — {selectedDetailRecord.namaGardu}
                </h4>
                <p className="text-xs font-mono text-slate-500">
                  {selectedDetailRecord.nomorLaporan} · {selectedDetailRecord.tanggal}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailRecord(null)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
              <div>
                <span className="text-[10px] text-slate-500 block">Unit</span>
                <strong>{selectedDetailRecord.unitPelaksana}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Penyulang</span>
                <strong>{selectedDetailRecord.penyulang}</strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Koordinat</span>
                <strong className="font-mono">
                  {selectedDetailRecord.koordinat.lat},{' '}
                  {selectedDetailRecord.koordinat.lng}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Merk &amp; Daya</span>
                <strong>
                  {selectedDetailRecord.trafoBaru.merk} (
                  {selectedDetailRecord.trafoBaru.daya} kVA)
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">No Seri Baru</span>
                <strong className="font-mono">
                  {selectedDetailRecord.trafoBaru.nomorSeri || '-'}
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Pengawas</span>
                <strong>{selectedDetailRecord.namaPengawas}</strong>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Foto 1', url: selectedDetailRecord.fotoNameplateLamaUrl },
                { label: 'Foto 2', url: selectedDetailRecord.fotoNameplateBaruUrl },
                { label: 'Sebelum', url: selectedDetailRecord.fotoSebelumUrl },
                { label: 'Sesudah', url: selectedDetailRecord.fotoSesudahUrl },
              ].map((item) =>
                item.url ? (
                  <img
                    key={item.label}
                    src={item.url}
                    alt={item.label}
                    onClick={() => setPreviewPhotoUrl(item.url!)}
                    className="w-full h-24 object-cover rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"
                  />
                ) : null
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => handlePrintBeritaAcara(selectedDetailRecord)}
                className="px-4 py-2 rounded-xl bg-[#083d54] text-white text-xs font-bold"
              >
                Cetak PDF Berita Acara
              </button>
              <button
                type="button"
                onClick={() => setSelectedDetailRecord(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs font-bold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Zoom Modal */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div className="relative max-w-3xl w-full">
            <button
              type="button"
              onClick={() => setPreviewPhotoUrl(null)}
              className="absolute -top-10 right-0 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={previewPhotoUrl}
              alt="Preview Foto Trafo"
              className="w-full max-h-[85vh] object-contain rounded-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
