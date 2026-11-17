export type MaterialStatus = 'STOK SIAP' | 'TERPAKAI';

export interface MaterialRow {
  rowNumber: number; // 1-based spreadsheet row number (header is row 1, data starts at row 2)
  tanggalHistory: string; // Col A
  snMaterial: string; // Col B
  noMaterial: string; // Col C
  spesifikasi: string; // Col D
  statusTransaksi: string; // Col E
  kategori: string; // Col F
  noBatch: string; // Col G
  valuationType: string; // Col H
  plant: string; // Col I
  storLoc: string; // Col J
  companyCode: string; // Col K
  unitInduk: string; // Col L
  unit: string; // Col M
  storLocName: string; // Col N
  status: MaterialStatus; // Col O ("STOK SIAP" | "TERPAKAI")
  lastScannedAt?: string;
  lastScanType?: 'MASUK' | 'KELUAR' | 'INITIAL';
  petugas?: string;
  noDokumen?: string;
}

export interface EksekusiMimsRow {
  mimsRowNumber: number; // 1-based spreadsheet row number in Sheet "MATERIAL_KELUAR" gid=164626621 (starts at 2)
  timestampEksekusi: string; // Col A: TIMESTAMP EKSEKUSI (YYYY-MM-DD HH:mm:ss)
  snMaterial: string; // Col B: SN MATERIAL
  noMaterial: string; // Col C: NO MATERIAL
  spesifikasi: string; // Col D: SPESIFIKASI
  statusTransaksi: string; // Col E: STATUS TRANSAKSI ("GI KELUAR STOK ULP")
  kategori: string; // Col F: KATERGORI
  noBatch: string; // Col G: NO BATCH
  valuationType: string; // Col H: VALUATION TYPE
  plant: string; // Col I: PLANT
  storLoc: string; // Col J: STOR LOC
  companyCode: string; // Col K: COMPANY CODE
  unitInduk: string; // Col L: UNIT INDUK
  unit: string; // Col M: UNIT
  storLocName: string; // Col N: STOR LOC NAME
  status: MaterialStatus; // Col O: STATUS ("TERPAKAI")
  noDokumen: string; // Col P: NO DOKUMEN / BON
  petugas: string; // Col Q: PETUGAS EKSEKUSI
  sourceMaterialRowNumber: number; // Col R: REF BARIS SHEET MATERIAL_MASUK
}

export interface MaterialCatalogItem {
  noMaterial: string;
  spesifikasi: string;
  kategori: string;
  defaultBatch: string;
  valuationType: string;
  plant: string;
  storLoc: string;
  companyCode: string;
  unitInduk: string;
  unit: string;
  storLocName: string;
}

export interface ScanLogEntry {
  id: string;
  timestamp: string;
  type: 'MASUK' | 'KELUAR' | 'ERROR_DUPLIKAT' | 'ERROR_JUMLAH' | 'ERROR_TIDAK_DITEMUKAN';
  snMaterial: string;
  noMaterial?: string;
  spesifikasi?: string;
  statusColO?: string;
  message: string;
  petugas: string;
  noDokumen?: string;
  rowNumber?: number;
  mimsRowNumber?: number;
}

export interface WarehouseStats {
  totalRows: number;
  siapPakaiCount: number;
  stokTerpakaiCount: number;
  inboundAddedCount: number;
  outboundUsedCount: number;
  eksekusiMimsCount: number;
  duplicateAlertCount: number;
  mismatchAlertCount: number;
  byMaterialNo: {
    noMaterial: string;
    spesifikasi: string;
    kategori: string;
    total: number;
    siapPakai: number;
    stokTerpakai: number;
  }[];
}
