import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  MaterialRow,
  EksekusiMimsRow,
  MaterialCatalogItem,
  ScanLogEntry,
  MaterialStatus,
  YantekRealisasiReport,
  HvbRealisasiReport,
  YantekDatabaseSegment,
  YantekWorkItemInput,
} from './src/types/warehouse.ts';
import {
  parseTeknikSinjaiCsv,
  DEFAULT_TEKNIK_SINJAI_DATA,
} from './src/data/teknikSinjaiDatabase.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const CSV_SOURCE_PATH = path.resolve(__dirname, 'public/assets/aistudio/LOGISTIK_SINJAI_df21ff73');
const TEKNIK_SINJAI_CSV_PATH = path.resolve(
  __dirname,
  'public/assets/aistudio/TEKNIK_SINJAI_cec1caee'
);
const DATA_DIR = path.resolve(__dirname, 'data');
const STATE_FILE_PATH = path.resolve(DATA_DIR, 'warehouse_state.json');
const EXPORT_CSV_PATH = path.resolve(DATA_DIR, 'MATERIAL_MASUK.csv');
const EXPORT_MIMS_CSV_PATH = path.resolve(DATA_DIR, 'MATERIAL_KELUAR.csv');
const EXPORT_YANTEK_CSV_PATH = path.resolve(DATA_DIR, 'YANTEK.csv');
const EXPORT_HVB_CSV_PATH = path.resolve(DATA_DIR, 'HVB.csv');

function loadTeknikSinjaiDatabase(): {
  segments: YantekDatabaseSegment[];
  pekerjaanCatalog: string[];
} {
  try {
    if (fs.existsSync(TEKNIK_SINJAI_CSV_PATH)) {
      const raw = fs.readFileSync(TEKNIK_SINJAI_CSV_PATH, 'utf8');
      const parsed = parseTeknikSinjaiCsv(raw);
      if (parsed.segments.length > 0) {
        return {
          segments: parsed.segments,
          pekerjaanCatalog: parsed.pekerjaanCatalog,
        };
      }
    }
  } catch (err) {
    console.warn('Fallback to DEFAULT_TEKNIK_SINJAI_DATA:', err);
  }
  return {
    segments: DEFAULT_TEKNIK_SINJAI_DATA.segments,
    pekerjaanCatalog: DEFAULT_TEKNIK_SINJAI_DATA.pekerjaanCatalog,
  };
}

const TEKNIK_DB = loadTeknikSinjaiDatabase();

interface WarehouseState {
  rows: MaterialRow[];
  eksekusiMimsRows: EksekusiMimsRow[];
  yantekReports?: YantekRealisasiReport[];
  hvbReports?: HvbRealisasiReport[];
  logs: ScanLogEntry[];
  counters: {
    inboundAddedCount: number;
    outboundUsedCount: number;
    duplicateAlertCount: number;
    mismatchAlertCount: number;
  };
  sheetConfig: {
    spreadsheetName: string;
    sheetName: string;
    mimsSheetName: string;
    mimsGid?: string;
    gid: string;
    googleSheetUrl: string;
    lastSyncedAt: string;
  };
  isCleanedV2?: boolean;
  oauthSession?: {
    accessToken: string;
    expiresAt: number;
    user: {
      uid: string;
      email: string | null;
      displayName: string | null;
      photoURL: string | null;
    } | null;
  } | null;
}

const MATERIAL_CATALOG: MaterialCatalogItem[] = [
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

function normalizeStatus(raw: unknown): MaterialStatus {
  const cleaned = String(raw || '').trim().toUpperCase();
  if (cleaned === 'TERPAKAI' || cleaned === 'STOK TERPAKAI') {
    return 'TERPAKAI';
  }
  return 'STOK SIAP';
}

function formatNowTimestamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

function detectMaterialFromSN(sn: string): MaterialCatalogItem {
  const cleaned = String(sn || '').trim().toUpperCase();
  for (const item of MATERIAL_CATALOG) {
    const suffix = item.noMaterial.slice(-3);
    if (cleaned.startsWith(`PLN02190000${suffix}`) || cleaned.includes(item.noMaterial)) {
      return item;
    }
  }
  return MATERIAL_CATALOG[0];
}

function parseInitialCsv(): MaterialRow[] {
  if (!fs.existsSync(CSV_SOURCE_PATH)) {
    return [];
  }
  const raw = fs.readFileSync(CSV_SOURCE_PATH, 'utf8');
  const lines = raw.trim().split(/\r?\n/);
  const rows: MaterialRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    const status = normalizeStatus(parts[14]);

    rows.push({
      rowNumber: i + 1,
      tanggalHistory: (parts[0] || '').trim(),
      snMaterial: (parts[1] || '').trim(),
      noMaterial: (parts[2] || '').trim(),
      spesifikasi: (parts[3] || '').trim(),
      statusTransaksi: (parts[4] || 'STOK SIAP ULP').trim(),
      kategori: (parts[5] || 'kWh Meter').trim(),
      noBatch: (parts[6] || '').trim(),
      valuationType: (parts[7] || 'NORMAL').trim(),
      plant: (parts[8] || '7417').trim(),
      storLoc: (parts[9] || '2500').trim(),
      companyCode: (parts[10] || '74').trim(),
      unitInduk: (parts[11] || 'UIW SULSELRABAR').trim(),
      unit: (parts[12] || 'ULP SINJAI').trim(),
      storLocName: (parts[13] || 'Gd ULP Sinjai').trim(),
      status,
      lastScanType: 'INITIAL',
    });
  }
  return rows;
}

function buildCsvContent(rows: MaterialRow[]): string {
  const header =
    'TANGGAL MASUK,SN / KODE MATERIAL,NO MATERIAL,NAMA MATERIAL / SPESIFIKASI,METODE INPUT,KATEGORI,NO BATCH,PETUGAS INPUT,PLANT,STOR LOC,COMPANY CODE,UNIT INDUK,UNIT,GUDANG,STATUS KETERANGAN';
  const lines = [header];
  for (const r of rows) {
    lines.push(
      [
        r.tanggalHistory,
        r.snMaterial,
        r.noMaterial,
        r.spesifikasi,
        r.statusTransaksi,
        r.kategori,
        r.noBatch,
        r.valuationType,
        r.plant,
        r.storLoc,
        r.companyCode,
        r.unitInduk,
        r.unit,
        r.storLocName,
        r.status,
      ].join(',')
    );
  }
  return lines.join('\r\n') + '\r\n';
}

function buildMimsCsvContent(mimsRows: EksekusiMimsRow[]): string {
  const header =
    'TIMESTAMP KELUAR,SN / KODE MATERIAL,NO MATERIAL,NAMA MATERIAL / SPESIFIKASI,METODE KELUAR,KATEGORI,NO BATCH,JENIS PENILAIAN,PLANT,STOR LOC,COMPANY CODE,UNIT INDUK,UNIT,GUDANG,STATUS KETERANGAN,NO BON / PK PENGELUARAN,NAMA PETUGAS SCAN,REF BARIS MATERIAL_MASUK';
  const lines = [header];
  for (const r of mimsRows) {
    lines.push(
      [
        r.timestampEksekusi,
        r.snMaterial,
        r.noMaterial,
        r.spesifikasi,
        r.statusTransaksi,
        r.kategori,
        r.noBatch,
        r.valuationType,
        r.plant,
        r.storLoc,
        r.companyCode,
        r.unitInduk,
        r.unit,
        r.storLocName,
        r.status,
        r.noDokumen,
        r.petugas,
        `MATERIAL_MASUK!Baris #${r.sourceMaterialRowNumber}`,
      ].join(',')
    );
  }
  return lines.join('\r\n') + '\r\n';
}

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildYantekCsvContent(reports: YantekRealisasiReport[]): string {
  const header =
    'WAKTU LAPORAN,TANGGAL REALISASI,TIM PELAKSANA (UNIT),NAMA PETUGAS,PENYULANG,KEYPOINT,SEGMENT PEKERJAAN,PANJANG KMS,DETAIL PEKERJAAN,VOLUME PEKERJAAN,TITIK KOORDINAT AWAL,TITIK KOORDINAT AKHIR,JUMLAH REALISASI WO,JUMLAH REALISASI P0,STATUS LAPORAN';
  const lines = [header];
  for (const r of reports) {
    const items =
      r.pekerjaanList.length > 0
        ? r.pekerjaanList
        : [{ id: '1', detailPekerjaan: '-', volume: 0 }];

    for (const item of items) {
      lines.push(
        [
          escapeCsvCell(r.timestampLaporan),
          escapeCsvCell(r.tanggalLaporan),
          escapeCsvCell(r.unitPelaksana),
          escapeCsvCell(r.petugasPelapor || '-'),
          escapeCsvCell(r.penyulang),
          escapeCsvCell(r.keypoint),
          escapeCsvCell(r.segment),
          escapeCsvCell(r.panjangKms || '-'),
          escapeCsvCell(item.detailPekerjaan),
          escapeCsvCell(item.volume),
          escapeCsvCell(r.koordinatAwal),
          escapeCsvCell(r.koordinatAkhir),
          escapeCsvCell(r.realisasiWo),
          escapeCsvCell(r.realisasiP0),
          'SELESAI',
        ].join(',')
      );
    }
  }
  return lines.join('\r\n') + '\r\n';
}

function buildHvbCsvContent(reports: HvbRealisasiReport[]): string {
  const header =
    'WAKTU LAPORAN,TANGGAL REALISASI,TIM PELAKSANA (HVB),PENYULANG,KEYPOINT,SEGMENT PEKERJAAN,PANJANG KMS,DETAIL PEKERJAAN,VOLUME PEKERJAAN,TITIK KOORDINAT AWAL,TITIK KOORDINAT AKHIR,STATUS LAPORAN';
  const lines = [header];
  for (const r of reports) {
    const items =
      r.pekerjaanList.length > 0
        ? r.pekerjaanList
        : [{ id: '1', detailPekerjaan: '-', volume: 0 }];

    for (const item of items) {
      lines.push(
        [
          escapeCsvCell(r.timestampLaporan),
          escapeCsvCell(r.tanggalLaporan),
          escapeCsvCell(r.unitPelaksana),
          escapeCsvCell(r.penyulang),
          escapeCsvCell(r.keypoint),
          escapeCsvCell(r.segment),
          escapeCsvCell(r.panjangKms || '-'),
          escapeCsvCell(item.detailPekerjaan),
          escapeCsvCell(item.volume),
          escapeCsvCell(r.koordinatAwal),
          escapeCsvCell(r.koordinatAkhir),
          'SELESAI',
        ].join(',')
      );
    }
  }
  return lines.join('\r\n') + '\r\n';
}

function saveState(state: WarehouseState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!Array.isArray(state.eksekusiMimsRows)) {
    state.eksekusiMimsRows = [];
  }
  if (!Array.isArray(state.yantekReports)) {
    state.yantekReports = [];
  }
  if (!Array.isArray(state.hvbReports)) {
    state.hvbReports = [];
  }
  state.rows.forEach((r: MaterialRow, idx: number) => {
    r.rowNumber = idx + 2;
    r.status = normalizeStatus(r.status);
  });
  state.eksekusiMimsRows.forEach((m: EksekusiMimsRow, idx: number) => {
    m.mimsRowNumber = idx + 2;
    m.status = 'TERPAKAI';
  });
  state.sheetConfig.lastSyncedAt = formatNowTimestamp();
  if (!state.sheetConfig.sheetName || state.sheetConfig.sheetName === 'MATERIAL') {
    state.sheetConfig.sheetName = 'MATERIAL_MASUK';
  }
  if (!state.sheetConfig.mimsSheetName || state.sheetConfig.mimsSheetName === 'EKSEKUSI_MIMS') {
    state.sheetConfig.mimsSheetName = 'MATERIAL_KELUAR';
  }
  state.sheetConfig.mimsGid = '164626621';
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
  const csvContent = buildCsvContent(state.rows);
  fs.writeFileSync(EXPORT_CSV_PATH, csvContent, 'utf8');
  const mimsCsvContent = buildMimsCsvContent(state.eksekusiMimsRows);
  fs.writeFileSync(EXPORT_MIMS_CSV_PATH, mimsCsvContent, 'utf8');
  const yantekCsvContent = buildYantekCsvContent(state.yantekReports);
  fs.writeFileSync(EXPORT_YANTEK_CSV_PATH, yantekCsvContent, 'utf8');
  const hvbCsvContent = buildHvbCsvContent(state.hvbReports);
  fs.writeFileSync(EXPORT_HVB_CSV_PATH, hvbCsvContent, 'utf8');
}

function createCleanWarehouseState(): WarehouseState {
  return {
    rows: [],
    eksekusiMimsRows: [],
    yantekReports: [],
    hvbReports: [],
    logs: [
      {
        id: `clean-log-${Date.now()}`,
        timestamp: formatNowTimestamp(),
        type: 'MASUK',
        snMaterial: 'CLEAN-STATE',
        message:
          'Data Rekapitulasi Stok per Nomor Material (Gd ULP Sinjai) telah dibersihkan (0 unit). Siap menerima Scan QR Material baru.',
        petugas: 'Sistem Gudang',
        noDokumen: 'CLEAN-INIT',
      },
    ],
    counters: {
      inboundAddedCount: 0,
      outboundUsedCount: 0,
      duplicateAlertCount: 0,
      mismatchAlertCount: 0,
    },
    sheetConfig: {
      spreadsheetName: 'LOGISTIK_SINJAI',
      sheetName: 'MATERIAL_MASUK',
      mimsSheetName: 'MATERIAL_KELUAR',
      mimsGid: '164626621',
      gid: '0',
      googleSheetUrl: '',
      lastSyncedAt: formatNowTimestamp(),
    },
    isCleanedV2: true,
  };
}

function loadState(): WarehouseState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(STATE_FILE_PATH)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8')) as WarehouseState;
      if (parsed && parsed.isCleanedV2 === true && Array.isArray(parsed.rows)) {
        if (!Array.isArray(parsed.eksekusiMimsRows)) {
          parsed.eksekusiMimsRows = [];
        }
        if (!Array.isArray(parsed.hvbReports)) {
          parsed.hvbReports = [];
        }
        parsed.rows = parsed.rows.map((r, idx) => ({
          ...r,
          rowNumber: idx + 2,
          status: normalizeStatus(r.status),
        }));
        parsed.eksekusiMimsRows = parsed.eksekusiMimsRows.map((m, idx) => ({
          ...m,
          mimsRowNumber: idx + 2,
          status: 'TERPAKAI',
        }));
        if (!parsed.sheetConfig.sheetName || parsed.sheetConfig.sheetName === 'MATERIAL') {
          parsed.sheetConfig.sheetName = 'MATERIAL_MASUK';
        }
        if (!parsed.sheetConfig.mimsSheetName || parsed.sheetConfig.mimsSheetName === 'EKSEKUSI_MIMS') {
          parsed.sheetConfig.mimsSheetName = 'MATERIAL_KELUAR';
        }
        parsed.sheetConfig.mimsGid = '164626621';
        return parsed;
      }
    } catch (e) {
      console.error('Failed to read warehouse_state.json, initializing clean state:', e);
    }
  }
  const cleanState = createCleanWarehouseState();
  saveState(cleanState);
  return cleanState;
}

function computeStats(state: WarehouseState) {
  let siapPakaiCount = 0;
  let stokTerpakaiCount = 0;
  const groupMap = new Map<
    string,
    {
      noMaterial: string;
      spesifikasi: string;
      kategori: string;
      total: number;
      siapPakai: number;
      stokTerpakai: number;
    }
  >();

  for (const item of MATERIAL_CATALOG) {
    groupMap.set(item.noMaterial, {
      noMaterial: item.noMaterial,
      spesifikasi: item.spesifikasi,
      kategori: item.kategori,
      total: 0,
      siapPakai: 0,
      stokTerpakai: 0,
    });
  }

  for (const r of state.rows) {
    const isTerpakai = r.status === 'TERPAKAI';
    if (isTerpakai) {
      stokTerpakaiCount++;
    } else {
      siapPakaiCount++;
    }

    if (!groupMap.has(r.noMaterial)) {
      groupMap.set(r.noMaterial, {
        noMaterial: r.noMaterial || 'LAINNYA',
        spesifikasi: r.spesifikasi || '-',
        kategori: r.kategori || 'kWh Meter',
        total: 0,
        siapPakai: 0,
        stokTerpakai: 0,
      });
    }
    const g = groupMap.get(r.noMaterial)!;
    g.total++;
    if (isTerpakai) {
      g.stokTerpakai++;
    } else {
      g.siapPakai++;
    }
  }

  return {
    totalRows: state.rows.length,
    siapPakaiCount,
    stokTerpakaiCount,
    inboundAddedCount: state.counters.inboundAddedCount || 0,
    outboundUsedCount: state.counters.outboundUsedCount || 0,
    eksekusiMimsCount: Array.isArray(state.eksekusiMimsRows) ? state.eksekusiMimsRows.length : 0,
    duplicateAlertCount: state.counters.duplicateAlertCount || 0,
    mismatchAlertCount: state.counters.mismatchAlertCount || 0,
    byMaterialNo: Array.from(groupMap.values()).filter((g) => g.total > 0),
  };
}

let warehouseState = loadState();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/materials', (_req, res) => {
    res.json({
      rows: warehouseState.rows,
      eksekusiMimsRows: warehouseState.eksekusiMimsRows || [],
      yantekReports: warehouseState.yantekReports || [],
      hvbReports: warehouseState.hvbReports || [],
      yantekSegments: TEKNIK_DB.segments,
      yantekPekerjaanCatalog: TEKNIK_DB.pekerjaanCatalog,
      logs: warehouseState.logs.slice(0, 150),
      stats: computeStats(warehouseState),
      catalog: MATERIAL_CATALOG,
      sheetConfig: warehouseState.sheetConfig,
    });
  });

  app.get('/api/auth/session', (_req, res) => {
    const sess = warehouseState.oauthSession;
    if (!sess || !sess.accessToken || Date.now() >= sess.expiresAt) {
      return res.json({ active: false, session: null });
    }
    return res.json({ active: true, session: sess });
  });

  app.post('/api/auth/session', (req, res) => {
    const { accessToken, expiresAt, user } = req.body || {};
    if (!accessToken || typeof accessToken !== 'string') {
      return res.status(400).json({ success: false });
    }
    warehouseState.oauthSession = {
      accessToken: accessToken.trim(),
      expiresAt:
        typeof expiresAt === 'number' && expiresAt > Date.now()
          ? expiresAt
          : Date.now() + 50 * 60 * 1000,
      user: user
        ? {
            uid: String(user.uid || 'google-oauth-user'),
            email: user.email ? String(user.email) : 'Terhubung via Google OAuth',
            displayName: user.displayName ? String(user.displayName) : 'Petugas Google Workspace',
            photoURL: user.photoURL ? String(user.photoURL) : null,
          }
        : null,
    };
    saveState(warehouseState);
    return res.json({ success: true, session: warehouseState.oauthSession });
  });

  app.delete('/api/auth/session', (_req, res) => {
    warehouseState.oauthSession = null;
    saveState(warehouseState);
    return res.json({ success: true });
  });

  app.get('/api/yantek/data', (_req, res) => {
    res.json({
      segments: TEKNIK_DB.segments,
      pekerjaanCatalog: TEKNIK_DB.pekerjaanCatalog,
      reports: warehouseState.yantekReports || [],
    });
  });

  app.post('/api/yantek/reports', (req, res) => {
    const {
      tanggalLaporan,
      unitPelaksana,
      petugasPelapor = '',
      penyulang,
      keypoint,
      segment,
      panjangKms = '',
      pekerjaanList = [],
      koordinatAwal = '',
      koordinatAkhir = '',
      realisasiWo = 0,
      realisasiP0 = 0,
    } = req.body || {};

    if (!unitPelaksana || !segment) {
      return res.status(400).json({
        success: false,
        message: 'Unit Pelaksana dan Segment wajib dipilih.',
      });
    }
    if (!String(petugasPelapor).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Nama Petugas Pelaksana sesuai tim wajib diisi.',
      });
    }
    if (!Array.isArray(pekerjaanList) || pekerjaanList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimal 1 Detail Pekerjaan dan Volume wajib diisi.',
      });
    }
    if (!String(koordinatAwal).trim() || !String(koordinatAkhir).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Titik Koordinat Awal dan Titik Koordinat Akhir wajib diisi.',
      });
    }

    if (!Array.isArray(warehouseState.yantekReports)) {
      warehouseState.yantekReports = [];
    }

    const seenYantekNames = new Set<string>();
    const sanitizedPekerjaan: YantekWorkItemInput[] = [];
    for (let idx = 0; idx < pekerjaanList.length; idx++) {
      const p = pekerjaanList[idx];
      const detail = String(p?.detailPekerjaan || '').trim();
      const key = detail.toUpperCase();
      if (!key || seenYantekNames.has(key)) continue;
      seenYantekNames.add(key);
      sanitizedPekerjaan.push({
        id: String(p?.id || `PKJ-${Date.now()}-${idx}`),
        detailPekerjaan: detail,
        volume: Number(p?.volume) || 1,
      });
    }

    const cleanTanggal =
      String(tanggalLaporan || '').trim() || new Date().toISOString().slice(0, 10);
    const cleanUnit = String(unitPelaksana).trim();
    const cleanPetugas = String(petugasPelapor).trim();
    const cleanSegment = String(segment).trim();
    const cleanAwal = String(koordinatAwal).trim();
    const cleanAkhir = String(koordinatAkhir).trim();
    const pekerjaanSig = sanitizedPekerjaan
      .map((p) => `${p.detailPekerjaan.toUpperCase()}:${p.volume}`)
      .join('|');

    const duplicateExisting = warehouseState.yantekReports.find(
      (r) =>
        r.tanggalLaporan === cleanTanggal &&
        r.unitPelaksana === cleanUnit &&
        (r.petugasPelapor || '') === cleanPetugas &&
        r.segment === cleanSegment &&
        r.koordinatAwal === cleanAwal &&
        r.koordinatAkhir === cleanAkhir &&
        r.pekerjaanList
          .map((p) => `${p.detailPekerjaan.toUpperCase()}:${p.volume}`)
          .join('|') === pekerjaanSig
    );

    if (duplicateExisting) {
      return res.json({
        success: true,
        report: duplicateExisting,
        reports: warehouseState.yantekReports,
        message: `Laporan Realisasi Yantek (${duplicateExisting.unitPelaksana} · Segmen ${duplicateExisting.segment}) berhasil disimpan.`,
      });
    }

    const newReport: YantekRealisasiReport = {
      id: `YNTK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      reportRowNumber: warehouseState.yantekReports.length + 2,
      timestampLaporan: formatNowTimestamp(),
      tanggalLaporan: cleanTanggal,
      unitPelaksana: cleanUnit,
      petugasPelapor: cleanPetugas,
      penyulang: String(penyulang || '-').trim(),
      keypoint: String(keypoint || '-').trim(),
      segment: cleanSegment,
      panjangKms: String(panjangKms || '').trim(),
      pekerjaanList: sanitizedPekerjaan,
      koordinatAwal: cleanAwal,
      koordinatAkhir: cleanAkhir,
      realisasiWo: Number(realisasiWo) || 0,
      realisasiP0: Number(realisasiP0) || 0,
    };

    warehouseState.yantekReports.unshift(newReport);
    saveState(warehouseState);

    return res.json({
      success: true,
      report: newReport,
      reports: warehouseState.yantekReports,
      message: `Laporan Realisasi Yantek (${newReport.unitPelaksana} · Segmen ${newReport.segment}) berhasil disimpan.`,
    });
  });

  app.delete('/api/yantek/reports/:id', (req, res) => {
    const { id } = req.params;
    if (!Array.isArray(warehouseState.yantekReports)) {
      warehouseState.yantekReports = [];
    }
    warehouseState.yantekReports = warehouseState.yantekReports.filter((r) => r.id !== id);
    saveState(warehouseState);
    res.json({
      success: true,
      reports: warehouseState.yantekReports,
    });
  });

  app.get('/api/export/yantek-csv', (_req, res) => {
    const csvData = buildYantekCsvContent(warehouseState.yantekReports || []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="TEKNIK_SINJAI_YANTEK_gid896667653.csv"'
    );
    res.send(csvData);
  });

  app.get('/api/hvb/data', (_req, res) => {
    res.json({
      segments: TEKNIK_DB.segments,
      pekerjaanCatalog: TEKNIK_DB.pekerjaanCatalog,
      reports: warehouseState.hvbReports || [],
    });
  });

  app.post('/api/hvb/reports', (req, res) => {
    const {
      tanggalLaporan,
      unitPelaksana,
      penyulang,
      keypoint,
      segment,
      panjangKms = '',
      pekerjaanList = [],
      koordinatAwal = '',
      koordinatAkhir = '',
    } = req.body || {};

    if (!unitPelaksana || !segment) {
      return res.status(400).json({
        success: false,
        message: 'Tim Pelaksana HVB dan Segment wajib dipilih.',
      });
    }
    if (!Array.isArray(pekerjaanList) || pekerjaanList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimal 1 Detail Pekerjaan dan Volume wajib diisi.',
      });
    }
    if (!String(koordinatAwal).trim() || !String(koordinatAkhir).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Titik Koordinat Awal dan Titik Koordinat Akhir wajib diisi.',
      });
    }

    if (!Array.isArray(warehouseState.hvbReports)) {
      warehouseState.hvbReports = [];
    }

    const seenHvbNames = new Set<string>();
    const sanitizedPekerjaan: YantekWorkItemInput[] = [];
    for (let idx = 0; idx < pekerjaanList.length; idx++) {
      const p = pekerjaanList[idx];
      const detail = String(p?.detailPekerjaan || '').trim();
      const key = detail.toUpperCase();
      if (!key || seenHvbNames.has(key)) continue;
      seenHvbNames.add(key);
      sanitizedPekerjaan.push({
        id: String(p?.id || `HVB-PKJ-${Date.now()}-${idx}`),
        detailPekerjaan: detail,
        volume: Number(p?.volume) || 1,
      });
    }

    const cleanTanggal =
      String(tanggalLaporan || '').trim() || new Date().toISOString().slice(0, 10);
    const cleanUnit = String(unitPelaksana).trim();
    const cleanSegment = String(segment).trim();
    const cleanAwal = String(koordinatAwal).trim();
    const cleanAkhir = String(koordinatAkhir).trim();
    const pekerjaanSig = sanitizedPekerjaan
      .map((p) => `${p.detailPekerjaan.toUpperCase()}:${p.volume}`)
      .join('|');

    const duplicateExisting = warehouseState.hvbReports.find(
      (r) =>
        r.tanggalLaporan === cleanTanggal &&
        r.unitPelaksana === cleanUnit &&
        r.segment === cleanSegment &&
        r.koordinatAwal === cleanAwal &&
        r.koordinatAkhir === cleanAkhir &&
        r.pekerjaanList
          .map((p) => `${p.detailPekerjaan.toUpperCase()}:${p.volume}`)
          .join('|') === pekerjaanSig
    );

    if (duplicateExisting) {
      return res.json({
        success: true,
        report: duplicateExisting,
        reports: warehouseState.hvbReports,
        message: `Laporan Realisasi HVB (${duplicateExisting.unitPelaksana} · Segmen ${duplicateExisting.segment}) berhasil disimpan.`,
      });
    }

    const newReport: HvbRealisasiReport = {
      id: `HVB-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      reportRowNumber: warehouseState.hvbReports.length + 2,
      timestampLaporan: formatNowTimestamp(),
      tanggalLaporan: cleanTanggal,
      unitPelaksana: cleanUnit,
      penyulang: String(penyulang || '-').trim(),
      keypoint: String(keypoint || '-').trim(),
      segment: cleanSegment,
      panjangKms: String(panjangKms || '').trim(),
      pekerjaanList: sanitizedPekerjaan,
      koordinatAwal: cleanAwal,
      koordinatAkhir: cleanAkhir,
    };

    warehouseState.hvbReports.unshift(newReport);
    saveState(warehouseState);

    return res.json({
      success: true,
      report: newReport,
      reports: warehouseState.hvbReports,
      message: `Laporan Realisasi HVB (${newReport.unitPelaksana} · Segmen ${newReport.segment}) berhasil disimpan.`,
    });
  });

  app.delete('/api/hvb/reports/:id', (req, res) => {
    const { id } = req.params;
    if (!Array.isArray(warehouseState.hvbReports)) {
      warehouseState.hvbReports = [];
    }
    warehouseState.hvbReports = warehouseState.hvbReports.filter((r) => r.id !== id);
    saveState(warehouseState);
    res.json({
      success: true,
      reports: warehouseState.hvbReports,
    });
  });

  app.get('/api/export/hvb-csv', (_req, res) => {
    const csvData = buildHvbCsvContent(warehouseState.hvbReports || []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="TEKNIK_SINJAI_HVB_gid1954293988.csv"'
    );
    res.send(csvData);
  });

  app.post('/api/scan/verify', (req, res) => {
    const { snMaterial, mode, sessionScannedSNs = [], petugas = 'Petugas Gudang' } = req.body || {};
    const cleanedSN = String(snMaterial || '').trim().toUpperCase();

    if (!cleanedSN) {
      return res.status(400).json({
        valid: false,
        errorType: 'EMPTY_SN',
        title: 'QR Code Kosong',
        message: 'Nomor Serial Number (SN) hasil scan QR tidak boleh kosong.',
      });
    }

    const inSession =
      Array.isArray(sessionScannedSNs) &&
      sessionScannedSNs.some((s: string) => String(s).trim().toUpperCase() === cleanedSN);
    if (inSession) {
      warehouseState.counters.duplicateAlertCount++;
      const logEntry: ScanLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: formatNowTimestamp(),
        type: 'ERROR_DUPLIKAT',
        snMaterial: cleanedSN,
        message: `PERINGATAN DUPLIKAT SESI: QR Code SN ${cleanedSN} sudah di-scan dalam antrean sesi ${mode} saat ini.`,
        petugas,
      };
      warehouseState.logs.unshift(logEntry);
      saveState(warehouseState);

      return res.status(409).json({
        valid: false,
        errorType: 'DUPLICATE_IN_SESSION',
        title: 'QR Code Sudah Di-scan di Sesi Ini!',
        message: `Serial Number (SN) ${cleanedSN} sudah berada di dalam daftar antrean scan saat ini. Tidak boleh melakukan scan berulang pada QR Code yang sama.`,
        snMaterial: cleanedSN,
        stats: computeStats(warehouseState),
        logs: warehouseState.logs.slice(0, 150),
      });
    }

    const existingRow = warehouseState.rows.find(
      (r: MaterialRow) => r.snMaterial.toUpperCase() === cleanedSN
    );

    if (mode === 'MASUK') {
      if (existingRow) {
        warehouseState.counters.duplicateAlertCount++;
        const logEntry: ScanLogEntry = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: formatNowTimestamp(),
          type: 'ERROR_DUPLIKAT',
          snMaterial: cleanedSN,
          noMaterial: existingRow.noMaterial,
          spesifikasi: existingRow.spesifikasi,
          statusColO: existingRow.status,
          rowNumber: existingRow.rowNumber,
          message: `PERINGATAN QR SUDAH TERDAFTAR: SN ${cleanedSN} sudah pernah di-scan masuk pada Sheet "MATERIAL_MASUK" (Baris #${existingRow.rowNumber}, Status: ${existingRow.status}).`,
          petugas,
        };
        warehouseState.logs.unshift(logEntry);
        saveState(warehouseState);

        return res.status(409).json({
          valid: false,
          errorType: 'DUPLICATE_IN_DATABASE',
          title: 'Peringatan: QR Code Sudah Pernah Di-scan!',
          message: `SN Material ${cleanedSN} sudah terdaftar pada Sheet "MATERIAL_MASUK" di Baris #${existingRow.rowNumber} dengan keterangan "${existingRow.status}". Material masuk tidak boleh menduplikasi SN yang sudah ada.`,
          existingRow,
          snMaterial: cleanedSN,
          stats: computeStats(warehouseState),
          logs: warehouseState.logs.slice(0, 150),
        });
      }

      const detectedCatalog = detectMaterialFromSN(cleanedSN);
      return res.json({
        valid: true,
        snMaterial: cleanedSN,
        detectedCatalog,
        message: `SN ${cleanedSN} valid dan siap ditambahkan melanjutkan baris pada Sheet "MATERIAL_MASUK" dengan status STOK SIAP.`,
      });
    } else {
      if (!existingRow) {
        const logEntry: ScanLogEntry = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: formatNowTimestamp(),
          type: 'ERROR_TIDAK_DITEMUKAN',
          snMaterial: cleanedSN,
          message: `ERROR SCAN KELUAR: SN ${cleanedSN} tidak ditemukan pada Sheet "MATERIAL_MASUK".`,
          petugas,
        };
        warehouseState.logs.unshift(logEntry);
        saveState(warehouseState);

        return res.status(404).json({
          valid: false,
          errorType: 'NOT_FOUND_IN_STOCK',
          title: 'SN Material Tidak Ditemukan di MATERIAL_MASUK!',
          message: `QR Code SN ${cleanedSN} tidak terdaftar pada Sheet "MATERIAL_MASUK". Pastikan material sudah pernah di-scan masuk sebelum dikeluarkan.`,
          snMaterial: cleanedSN,
          stats: computeStats(warehouseState),
          logs: warehouseState.logs.slice(0, 150),
        });
      }

      if (existingRow.status === 'TERPAKAI') {
        warehouseState.counters.duplicateAlertCount++;
        const logEntry: ScanLogEntry = {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: formatNowTimestamp(),
          type: 'ERROR_DUPLIKAT',
          snMaterial: cleanedSN,
          noMaterial: existingRow.noMaterial,
          spesifikasi: existingRow.spesifikasi,
          statusColO: existingRow.status,
          rowNumber: existingRow.rowNumber,
          message: `PERINGATAN QR SUDAH TERPAKAI: SN ${cleanedSN} (Baris #${existingRow.rowNumber} pada Sheet "MATERIAL_MASUK") sudah tercatat keluar dengan status TERPAKAI.`,
          petugas,
        };
        warehouseState.logs.unshift(logEntry);
        saveState(warehouseState);

        return res.status(409).json({
          valid: false,
          errorType: 'ALREADY_USED_OUTBOUND',
          title: 'Peringatan: QR Code Sudah Tercatat Keluar (TERPAKAI)!',
          message: `SN Material ${cleanedSN} (Baris #${existingRow.rowNumber} pada Sheet "MATERIAL_MASUK") sudah berstatus "TERPAKAI"${existingRow.lastScannedAt ? ` sejak ${existingRow.lastScannedAt}` : ''}. Material ini tidak dapat dikeluarkan dua kali!`,
          existingRow,
          snMaterial: cleanedSN,
          stats: computeStats(warehouseState),
          logs: warehouseState.logs.slice(0, 150),
        });
      }

      return res.json({
        valid: true,
        snMaterial: cleanedSN,
        existingRow,
        message: `SN ${cleanedSN} ditemukan pada Sheet "MATERIAL_MASUK" (Baris #${existingRow.rowNumber}, Status: STOK SIAP) dan proses pengeluaran dilanjutkan.`,
      });
    }
  });

  app.post('/api/scan/inbound', (req, res) => {
    const {
      items = [],
      petugas = 'Petugas Logistik Sinjai',
      noDokumen = '',
      allowExistingUpdate = true,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        errorType: 'EMPTY_ITEMS',
        title: 'Daftar Scan Masuk Kosong',
        message: 'Silakan scan minimal 1 QR Code Serial Number (SN) material masuk terlebih dahulu.',
      });
    }

    const nowStr = formatNowTimestamp();
    const duplicates: { snMaterial: string; rowNumber?: number; status?: string; reason: string }[] = [];
    const seenInBatch = new Set<string>();
    const validItemsToProcess: typeof items = [];

    for (const item of items) {
      const sn = String(item.snMaterial || '').trim().toUpperCase();
      if (!sn) continue;
      if (seenInBatch.has(sn)) {
        continue;
      }
      seenInBatch.add(sn);

      const existing = warehouseState.rows.find(
        (r: MaterialRow) => r.snMaterial.toUpperCase() === sn
      );
      if (existing && !allowExistingUpdate) {
        duplicates.push({
          snMaterial: sn,
          rowNumber: existing.rowNumber,
          status: existing.status,
          reason: `Sudah terdaftar di Sheet "MATERIAL_MASUK" Baris #${existing.rowNumber} (Status: ${existing.status})`,
        });
        continue;
      }
      validItemsToProcess.push(item);
    }

    if (duplicates.length > 0 && validItemsToProcess.length === 0) {
      warehouseState.counters.duplicateAlertCount += duplicates.length;
      warehouseState.logs.unshift({
        id: `log-${Date.now()}`,
        timestamp: nowStr,
        type: 'ERROR_DUPLIKAT',
        snMaterial: duplicates.map((d) => d.snMaterial).join(', '),
        message: `GAGAL TAMBAH MATERIAL MASUK: Ditemukan ${duplicates.length} QR Code SN yang sudah pernah di-scan sebelumnya (${duplicates.map((d) => d.snMaterial).join(', ')}).`,
        petugas,
        noDokumen,
      });
      saveState(warehouseState);

      return res.status(409).json({
        success: false,
        errorType: 'DUPLICATE_BARCODE',
        title: 'Peringatan Error: QR Code Sudah Pernah Di-scan!',
        message: `Terdapat ${duplicates.length} Serial Number (SN) yang sudah terdaftar di Sheet "MATERIAL_MASUK".`,
        duplicates,
        stats: computeStats(warehouseState),
        logs: warehouseState.logs.slice(0, 150),
      });
    }

    const addedRows: MaterialRow[] = [];
    for (const item of validItemsToProcess) {
      const sn = String(item.snMaterial || '').trim().toUpperCase();
      const catalogMatch =
        MATERIAL_CATALOG.find((c) => c.noMaterial === item.noMaterial) ||
        detectMaterialFromSN(sn);

      const existingRow = warehouseState.rows.find(
        (r: MaterialRow) => r.snMaterial.toUpperCase() === sn
      );

      if (existingRow && allowExistingUpdate) {
        // Jika SN sudah ada pada data awal namun diimport ulang sebagai Material Masuk,
        // perbarui statusnya menjadi STOK SIAP dan tandai sebagai MASUK agar tampil di urutan teratas
        existingRow.tanggalHistory = nowStr;
        existingRow.status = 'STOK SIAP';
        existingRow.statusTransaksi = 'STOK SIAP ULP';
        existingRow.lastScannedAt = nowStr;
        existingRow.lastScanType = 'MASUK';
        existingRow.petugas = petugas;
        existingRow.noDokumen = noDokumen;
        if (item.noBatch) existingRow.noBatch = item.noBatch;
        addedRows.push(existingRow);

        warehouseState.logs.unshift({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: nowStr,
          type: 'MASUK',
          snMaterial: sn,
          noMaterial: existingRow.noMaterial,
          spesifikasi: existingRow.spesifikasi,
          statusColO: 'STOK SIAP',
          rowNumber: existingRow.rowNumber,
          message: `MATERIAL MASUK (IMPORT SPREADSHEET): Baris #${existingRow.rowNumber} pada Sheet "MATERIAL_MASUK" — SN ${sn} (${existingRow.noMaterial}) -> Status: STOK SIAP.`,
          petugas,
          noDokumen,
        });
      } else {
        const newRow: MaterialRow = {
          rowNumber: warehouseState.rows.length + 2,
          tanggalHistory: nowStr,
          snMaterial: sn,
          noMaterial: item.noMaterial || catalogMatch.noMaterial,
          spesifikasi: item.spesifikasi || catalogMatch.spesifikasi,
          statusTransaksi: 'STOK SIAP ULP',
          kategori: item.kategori || catalogMatch.kategori,
          noBatch: item.noBatch || catalogMatch.defaultBatch,
          valuationType: catalogMatch.valuationType,
          plant: catalogMatch.plant,
          storLoc: catalogMatch.storLoc,
          companyCode: catalogMatch.companyCode,
          unitInduk: catalogMatch.unitInduk,
          unit: catalogMatch.unit,
          storLocName: catalogMatch.storLocName,
          status: 'STOK SIAP',
          lastScannedAt: nowStr,
          lastScanType: 'MASUK',
          petugas,
          noDokumen,
        };

        warehouseState.rows.push(newRow);
        addedRows.push(newRow);

        warehouseState.logs.unshift({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: nowStr,
          type: 'MASUK',
          snMaterial: sn,
          noMaterial: newRow.noMaterial,
          spesifikasi: newRow.spesifikasi,
          statusColO: 'STOK SIAP',
          rowNumber: newRow.rowNumber,
          message: `MATERIAL MASUK: Baris baru #${newRow.rowNumber} ditambahkan melanjutkan Sheet "MATERIAL_MASUK" — SN ${sn} (${newRow.noMaterial}) -> Status: STOK SIAP.`,
          petugas,
          noDokumen,
        });
      }
    }

    warehouseState.counters.inboundAddedCount += addedRows.length;
    saveState(warehouseState);

    return res.json({
      success: true,
      addedCount: addedRows.length,
      addedRows,
      rows: warehouseState.rows,
      stats: computeStats(warehouseState),
      logs: warehouseState.logs.slice(0, 150),
      message: `Berhasil mengimport ${addedRows.length} SN ke Sheet "MATERIAL_MASUK" dengan keterangan status "STOK SIAP".`,
    });
  });

  app.post('/api/scan/outbound', (req, res) => {
    const {
      snList = [],
      items = [],
      expectedCount,
      expectedNoMaterial = 'ALL',
      petugas = 'Petugas Logistik Sinjai',
      noDokumen = '',
      autoRegisterMissing = true,
    } = req.body || {};

    const nowStr = formatNowTimestamp();
    const itemMetaMap = new Map<
      string,
      { noMaterial?: string; spesifikasi?: string; kategori?: string; noBatch?: string }
    >();
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it && it.snMaterial) {
          itemMetaMap.set(String(it.snMaterial).trim().toUpperCase(), {
            noMaterial: it.noMaterial,
            spesifikasi: it.spesifikasi,
            kategori: it.kategori,
            noBatch: it.noBatch,
          });
        }
      }
    }

    const cleanedList: string[] = Array.isArray(snList)
      ? snList.map((s: unknown) => String(s || '').trim().toUpperCase()).filter(Boolean)
      : [];

    const targetQty = Number(expectedCount);

    if (
      expectedCount !== undefined &&
      expectedCount !== null &&
      !Number.isNaN(targetQty) &&
      targetQty > 0 &&
      cleanedList.length !== targetQty
    ) {
      warehouseState.counters.mismatchAlertCount++;
      const diff = cleanedList.length - targetQty;
      const diffText =
        diff < 0
          ? `Kurang ${Math.abs(diff)} unit dari jumlah yang diminta`
          : `Kelebihan ${diff} unit dari jumlah yang diminta`;

      const logEntry: ScanLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowStr,
        type: 'ERROR_JUMLAH',
        snMaterial: cleanedList.join(', ') || '-',
        message: `PERINGATAN ERROR KETIDAKCOCOKAN JUMLAH KELUAR: Target pengeluaran ${targetQty} unit, namun jumlah QR di-scan ${cleanedList.length} unit (${diffText}). Transaksi ditolak!`,
        petugas,
        noDokumen,
      };
      warehouseState.logs.unshift(logEntry);
      saveState(warehouseState);

      return res.status(400).json({
        success: false,
        errorType: 'QUANTITY_MISMATCH',
        title: 'Peringatan Error: Ketidakcocokan Jumlah Material Keluar!',
        message: `Jumlah material yang di-scan (${cleanedList.length} unit) TIDAK COCOK dengan Target Jumlah Pengeluaran (${targetQty} unit) — ${diffText}.`,
        details: {
          expectedCount: targetQty,
          scannedCount: cleanedList.length,
          difference: diff,
        },
        stats: computeStats(warehouseState),
        logs: warehouseState.logs.slice(0, 150),
      });
    }

    if (cleanedList.length === 0) {
      return res.status(400).json({
        success: false,
        errorType: 'EMPTY_SCAN',
        title: 'Belum Ada Material Di-scan / Diinput',
        message: 'Silakan scan QR Code atau input material yang akan dikeluarkan terlebih dahulu.',
      });
    }

    const seen = new Set<string>();
    const errors: {
      snMaterial: string;
      rowNumber?: number;
      errorType: string;
      reason: string;
    }[] = [];
    const targetRows: MaterialRow[] = [];

    for (const sn of cleanedList) {
      if (seen.has(sn)) {
        continue;
      }
      seen.add(sn);

      const customMeta = itemMetaMap.get(sn);
      let row = warehouseState.rows.find(
        (r: MaterialRow) => r.snMaterial.toUpperCase() === sn
      );

      if (!row) {
        if (autoRegisterMissing) {
          // Otomatis tambahkan ke MATERIAL_MASUK agar dapat langsung diproses keluar (TERPAKAI)
          const catalogMatch = detectMaterialFromSN(sn);
          row = {
            rowNumber: warehouseState.rows.length + 2,
            tanggalHistory: nowStr,
            snMaterial: sn,
            noMaterial: customMeta?.noMaterial || catalogMatch.noMaterial,
            spesifikasi: customMeta?.spesifikasi || catalogMatch.spesifikasi,
            statusTransaksi: 'STOK SIAP ULP',
            kategori: customMeta?.kategori || catalogMatch.kategori,
            noBatch: customMeta?.noBatch || catalogMatch.defaultBatch,
            valuationType: catalogMatch.valuationType,
            plant: catalogMatch.plant,
            storLoc: catalogMatch.storLoc,
            companyCode: catalogMatch.companyCode,
            unitInduk: catalogMatch.unitInduk,
            unit: catalogMatch.unit,
            storLocName: catalogMatch.storLocName,
            status: 'STOK SIAP',
            lastScannedAt: nowStr,
            lastScanType: 'KELUAR',
            petugas,
            noDokumen,
          };
          warehouseState.rows.push(row);
        } else {
          errors.push({
            snMaterial: sn,
            errorType: 'NOT_FOUND',
            reason: `SN ${sn} tidak ditemukan di Sheet "MATERIAL_MASUK".`,
          });
          continue;
        }
      } else if (customMeta?.spesifikasi) {
        row.spesifikasi = customMeta.spesifikasi;
        if (customMeta.noMaterial) row.noMaterial = customMeta.noMaterial;
      }

      if (row.status === 'TERPAKAI') {
        errors.push({
          snMaterial: sn,
          rowNumber: row.rowNumber,
          errorType: 'ALREADY_USED',
          reason: `SN ${sn} (Baris #${row.rowNumber} pada Sheet "MATERIAL_MASUK") sudah tercatat keluar dengan status TERPAKAI.`,
        });
        continue;
      }

      if (expectedNoMaterial && expectedNoMaterial !== 'ALL' && row.noMaterial !== expectedNoMaterial) {
        errors.push({
          snMaterial: sn,
          rowNumber: row.rowNumber,
          errorType: 'MATERIAL_TYPE_MISMATCH',
          reason: `SN ${sn} adalah No Material ${row.noMaterial}, tidak cocok dengan filter permintaan No Material ${expectedNoMaterial}.`,
        });
        continue;
      }

      targetRows.push(row);
    }

    if (errors.length > 0 && targetRows.length === 0) {
      const hasDuplicate = errors.some(
        (e) => e.errorType === 'DUPLICATE_IN_BATCH' || e.errorType === 'ALREADY_USED'
      );
      if (hasDuplicate) {
        warehouseState.counters.duplicateAlertCount += errors.length;
      } else {
        warehouseState.counters.mismatchAlertCount += errors.length;
      }

      warehouseState.logs.unshift({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowStr,
        type: hasDuplicate ? 'ERROR_DUPLIKAT' : 'ERROR_JUMLAH',
        snMaterial: errors.map((e) => e.snMaterial).join(', '),
        message: `GAGAL PENGELUARAN MATERIAL: ${errors.map((e) => e.reason).join(' | ')}`,
        petugas,
        noDokumen,
      });
      saveState(warehouseState);

      return res.status(409).json({
        success: false,
        errorType: hasDuplicate ? 'DUPLICATE_OR_ALREADY_USED' : 'VALIDATION_ERROR',
        title: hasDuplicate
          ? 'Peringatan Error: QR Code Sudah Pernah Di-scan / TERPAKAI!'
          : 'Peringatan Error Validasi Material Keluar!',
        message: errors.map((e) => e.reason).join(' '),
        errors,
        stats: computeStats(warehouseState),
        logs: warehouseState.logs.slice(0, 150),
      });
    }

    const updatedRows: MaterialRow[] = [];
    const addedMimsRows: EksekusiMimsRow[] = [];
    if (!Array.isArray(warehouseState.eksekusiMimsRows)) {
      warehouseState.eksekusiMimsRows = [];
    }

    for (const row of targetRows) {
      row.status = 'TERPAKAI';
      row.tanggalHistory = nowStr;
      row.lastScannedAt = nowStr;
      row.lastScanType = 'KELUAR';
      row.petugas = petugas;
      row.noDokumen = noDokumen;
      updatedRows.push(row);

      const newMimsRow: EksekusiMimsRow = {
        mimsRowNumber: warehouseState.eksekusiMimsRows.length + 2,
        timestampEksekusi: nowStr,
        snMaterial: row.snMaterial,
        noMaterial: row.noMaterial,
        spesifikasi: row.spesifikasi,
        statusTransaksi: 'GI KELUAR STOK ULP',
        kategori: row.kategori || 'kWh Meter',
        noBatch: row.noBatch || '',
        valuationType: row.valuationType || 'NORMAL',
        plant: row.plant || '7417',
        storLoc: row.storLoc || '2500',
        companyCode: row.companyCode || '74',
        unitInduk: row.unitInduk || 'UIW SULSELRABAR',
        unit: row.unit || 'ULP SINJAI',
        storLocName: row.storLocName || 'Gd ULP Sinjai',
        status: 'TERPAKAI',
        noDokumen: noDokumen || 'BON-SINJAI',
        petugas: petugas || 'Petugas Logistik Sinjai',
        sourceMaterialRowNumber: row.rowNumber,
      };
      warehouseState.eksekusiMimsRows.push(newMimsRow);
      addedMimsRows.push(newMimsRow);

      warehouseState.logs.unshift({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: nowStr,
        type: 'KELUAR',
        snMaterial: row.snMaterial,
        noMaterial: row.noMaterial,
        spesifikasi: row.spesifikasi,
        statusColO: 'TERPAKAI',
        rowNumber: row.rowNumber,
        mimsRowNumber: newMimsRow.mimsRowNumber,
        message: `MATERIAL KELUAR: Baris #${row.rowNumber} (SN: ${row.snMaterial}) pada Sheet "MATERIAL_MASUK" diubah menjadi "TERPAKAI" dan masuk ke Sheet "MATERIAL_KELUAR" (gid=164626621).`,
        petugas,
        noDokumen,
      });
    }

    warehouseState.counters.outboundUsedCount += updatedRows.length;
    saveState(warehouseState);

    return res.json({
      success: true,
      updatedCount: updatedRows.length,
      updatedRows,
      addedMimsRows,
      rows: warehouseState.rows,
      eksekusiMimsRows: warehouseState.eksekusiMimsRows,
      stats: computeStats(warehouseState),
      logs: warehouseState.logs.slice(0, 150),
      message: `Berhasil mengimport pengeluaran ${updatedRows.length} unit material. Status pada Sheet "MATERIAL_MASUK" berubah dari "STOK SIAP" menjadi "TERPAKAI" dan tercatat di Sheet "MATERIAL_KELUAR" (gid=164626621).`,
    });
  });

  app.post('/api/log-mismatch', (req, res) => {
    const {
      expectedCount,
      scannedCount,
      petugas = 'Petugas Logistik Sinjai',
      noDokumen = '',
      reason = '',
    } = req.body || {};
    warehouseState.counters.mismatchAlertCount++;
    const nowStr = formatNowTimestamp();
    warehouseState.logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowStr,
      type: 'ERROR_JUMLAH',
      snMaterial: '-',
      message:
        reason ||
        `PERINGATAN ERROR KETIDAKCOCOKAN JUMLAH: Target pengeluaran ${expectedCount} unit tidak sesuai dengan jumlah scan aktual ${scannedCount} unit.`,
      petugas,
      noDokumen,
    });
    saveState(warehouseState);
    res.json({
      stats: computeStats(warehouseState),
      logs: warehouseState.logs.slice(0, 150),
    });
  });

  app.get('/api/export/csv', (_req, res) => {
    const csvData = buildCsvContent(warehouseState.rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="LOGISTIK_SINJAI_MATERIAL_MASUK.csv"'
    );
    res.send(csvData);
  });

  app.get('/api/export/eksekusi-mims-csv', (_req, res) => {
    const csvData = buildMimsCsvContent(warehouseState.eksekusiMimsRows || []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="LOGISTIK_SINJAI_MATERIAL_KELUAR.csv"'
    );
    res.send(csvData);
  });

  app.post('/api/sync/sheet', async (req, res) => {
    const { googleSheetUrl = '' } = req.body || {};
    warehouseState.sheetConfig.googleSheetUrl = String(googleSheetUrl).trim();

    if (googleSheetUrl && String(googleSheetUrl).includes('docs.google.com/spreadsheets')) {
      try {
        const match = String(googleSheetUrl).match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match && match[1]) {
          const sheetId = match[1];
          const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
          const resp = await fetch(exportUrl);
          if (resp.ok) {
            const text = await resp.text();
            const lines = text.trim().split(/\r?\n/);
            if (lines.length > 1 && lines[0].includes('SN MATERIAL')) {
              const importedRows: MaterialRow[] = [];
              for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                const parts = line.split(',');
                const status = normalizeStatus(parts[14]);
                importedRows.push({
                  rowNumber: i + 1,
                  tanggalHistory: (parts[0] || '').trim(),
                  snMaterial: (parts[1] || '').trim(),
                  noMaterial: (parts[2] || '').trim(),
                  spesifikasi: (parts[3] || '').trim(),
                  statusTransaksi: (parts[4] || 'STOK SIAP ULP').trim(),
                  kategori: (parts[5] || 'kWh Meter').trim(),
                  noBatch: (parts[6] || '').trim(),
                  valuationType: (parts[7] || 'NORMAL').trim(),
                  plant: (parts[8] || '7417').trim(),
                  storLoc: (parts[9] || '2500').trim(),
                  companyCode: (parts[10] || '74').trim(),
                  unitInduk: (parts[11] || 'UIW SULSELRABAR').trim(),
                  unit: (parts[12] || 'ULP SINJAI').trim(),
                  storLocName: (parts[13] || 'Gd ULP Sinjai').trim(),
                  status,
                  lastScanType: 'INITIAL',
                });
              }
              warehouseState.rows = importedRows;
              warehouseState.logs.unshift({
                id: `log-${Date.now()}`,
                timestamp: formatNowTimestamp(),
                type: 'MASUK',
                snMaterial: 'GOOGLE-SHEET-SYNC',
                message: `Berhasil sinkronisasi langsung dari Link Google Spreadsheet (Sheet "MATERIAL_MASUK"): ${importedRows.length} baris dimuat.`,
                petugas: 'Sistem Gudang',
              });
              saveState(warehouseState);
              return res.json({
                success: true,
                rows: warehouseState.rows,
                stats: computeStats(warehouseState),
                logs: warehouseState.logs.slice(0, 150),
                sheetConfig: warehouseState.sheetConfig,
                message: `Berhasil menyinkronkan ${importedRows.length} baris dari Google Spreadsheet (Sheet "MATERIAL_MASUK").`,
              });
            }
          }
        }
      } catch {
        // Fallback if private
      }
    }

    saveState(warehouseState);
    res.json({
      success: true,
      rows: warehouseState.rows,
      stats: computeStats(warehouseState),
      logs: warehouseState.logs.slice(0, 150),
      sheetConfig: warehouseState.sheetConfig,
      message: 'Konfigurasi link Spreadsheet "MATERIAL_MASUK" berhasil disimpan dan disinkronkan.',
    });
  });

  app.post('/api/sync/import-rows', (req, res) => {
    const {
      rows: importedRows = [],
      spreadsheetName = 'LOGISTIK_SINJAI',
      sheetName = 'MATERIAL_MASUK',
      googleSheetUrl = '',
      userEmail = '',
    } = req.body || {};

    if (!Array.isArray(importedRows) || importedRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tidak ada baris valid yang ditemukan pada Sheet yang dipilih.',
      });
    }

    warehouseState.rows = importedRows.map((r: MaterialRow, idx: number) => ({
      ...r,
      rowNumber: idx + 2,
      status: normalizeStatus(r.status),
    }));
    warehouseState.sheetConfig = {
      spreadsheetName: String(spreadsheetName || 'LOGISTIK_SINJAI'),
      sheetName: String(sheetName || 'MATERIAL_MASUK'),
      mimsSheetName: 'MATERIAL_KELUAR',
      mimsGid: '164626621',
      gid: '0',
      googleSheetUrl: String(googleSheetUrl || warehouseState.sheetConfig.googleSheetUrl),
      lastSyncedAt: formatNowTimestamp(),
    };

    warehouseState.logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: formatNowTimestamp(),
      type: 'MASUK',
      snMaterial: 'GOOGLE-SHEETS-API',
      message: `GOOGLE SHEETS DISINKRONKAN: ${warehouseState.rows.length} baris berhasil dimuat dari "${spreadsheetName}" (Tab: ${sheetName})${userEmail ? ` oleh ${userEmail}` : ''}.`,
      petugas: userEmail || 'Google Workspace',
    });

    saveState(warehouseState);
    return res.json({
      success: true,
      rows: warehouseState.rows,
      stats: computeStats(warehouseState),
      logs: warehouseState.logs.slice(0, 150),
      sheetConfig: warehouseState.sheetConfig,
      message: `Berhasil memuat ${warehouseState.rows.length} baris dari Google Spreadsheet "${spreadsheetName}" (Sheet: ${sheetName}).`,
    });
  });

  app.post('/api/reset', (_req, res) => {
    const prevSheetConfig = warehouseState?.sheetConfig;
    warehouseState = createCleanWarehouseState();
    if (prevSheetConfig?.googleSheetUrl) {
      warehouseState.sheetConfig.googleSheetUrl = prevSheetConfig.googleSheetUrl;
      warehouseState.sheetConfig.spreadsheetName = prevSheetConfig.spreadsheetName;
    }
    saveState(warehouseState);
    res.json({
      success: true,
      rows: warehouseState.rows,
      eksekusiMimsRows: warehouseState.eksekusiMimsRows,
      stats: computeStats(warehouseState),
      logs: warehouseState.logs.slice(0, 150),
      sheetConfig: warehouseState.sheetConfig,
      message: 'Data Rekapitulasi Stok per Nomor Material (Gd ULP Sinjai) berhasil dibersihkan (0 baris).',
    });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({
      success: false,
      message: `Endpoint API tidak ditemukan: ${req.method} ${req.originalUrl}`,
    });
  });

  const distPath = path.resolve(__dirname, 'dist');
  const isProd =
    process.env.NODE_ENV === 'production' ||
    process.env.npm_lifecycle_event === 'start';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      plugins: [
        {
          name: 'disable-hmr-websocket-error',
          transform(code, id) {
            if (id.includes('vite/dist/client/client.mjs')) {
              return {
                code: code.replace(
                  'let isOpened = socket.readyState === socket.OPEN;',
                  'let isOpened = true;'
                ),
                map: null,
              };
            }
            return null;
          },
        },
      ],
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SINJAI BENDERANG Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
