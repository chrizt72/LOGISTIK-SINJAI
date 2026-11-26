import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Camera,
  ImagePlus,
  Search,
  X,
  Plus,
  FolderOpen,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  UploadCloud,
  RefreshCw,
  Calendar,
  FileImage,
} from 'lucide-react';
import {
  HvbEvidenRecord,
  HvbRealisasiReport,
} from '../types/warehouse';
import {
  SpreadsheetMetadata,
  ensureHvbEvidenDateFolder,
  uploadHvbEvidenPhotoToDrive,
  syncHvbReportsToAllTeknikSheets,
  getAccessToken,
  googleSignIn,
  hasValidCachedAccessToken,
  normalizeEvidenDateKey,
  extractSpreadsheetId,
  isLogistikSpreadsheetTitle,
} from '../services/googleWorkspace';

interface PendingEvidenPhoto {
  id: string;
  fileName: string;
  blob: Blob;
  previewUrl: string;
  sizeBytes: number;
}

interface PendingEvidenDetailEntry {
  id: string;
  detailPekerjaan: string;
  isDropdownOpen: boolean;
  photos: PendingEvidenPhoto[];
  keterangan: string;
}

interface HvbEvidenSectionProps {
  pekerjaanCatalog: string[];
  reports: HvbRealisasiReport[];
  evidenRecords: HvbEvidenRecord[];
  accessToken: string | null;
  connectedTeknikSheet: SpreadsheetMetadata | null;
  teknikSheetUrlInput: string;
  prefilledTanggal?: string;
  prefilledPekerjaanList?: string[];
  onConsumePrefill?: () => void;
  onTeknikSheetSynced: (meta: SpreadsheetMetadata) => void;
  onEvidenCreated: (newEviden: HvbEvidenRecord, allEviden: HvbEvidenRecord[]) => void;
  onDeleteEviden?: (evidenId: string) => Promise<void>;
  onTriggerSound?: (kind: 'scan' | 'error' | 'commit') => void;
}

function createBlankDetailEntry(detailPekerjaan: string = ''): PendingEvidenDetailEntry {
  return {
    id: `EVD-ENTRY-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    detailPekerjaan,
    isDropdownOpen: false,
    photos: [],
    keterangan: '',
  };
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function compressImageFile(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (compressed) => {
            URL.revokeObjectURL(objectUrl);
            if (compressed && compressed.size > 0 && compressed.size < file.size) {
              resolve(compressed);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.82
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

export const HvbEvidenSection: React.FC<HvbEvidenSectionProps> = ({
  pekerjaanCatalog,
  reports,
  evidenRecords,
  accessToken,
  connectedTeknikSheet,
  teknikSheetUrlInput,
  prefilledTanggal,
  prefilledPekerjaanList,
  onConsumePrefill,
  onTeknikSheetSynced,
  onEvidenCreated,
  onDeleteEviden,
  onTriggerSound,
}) => {
  const [tanggalRealisasi, setTanggalRealisasi] = useState<string>(() =>
    prefilledTanggal || new Date().toISOString().slice(0, 10)
  );
  const [detailEntries, setDetailEntries] = useState<PendingEvidenDetailEntry[]>(() => {
    if (prefilledPekerjaanList && prefilledPekerjaanList.length > 0) {
      return prefilledPekerjaanList.map((det) => createBlankDetailEntry(det));
    }
    return [createBlankDetailEntry()];
  });

  useEffect(() => {
    if (!prefilledTanggal && (!prefilledPekerjaanList || prefilledPekerjaanList.length === 0)) {
      return;
    }
    if (prefilledTanggal) {
      setTanggalRealisasi(prefilledTanggal);
    }
    if (prefilledPekerjaanList && prefilledPekerjaanList.length > 0) {
      setDetailEntries(prefilledPekerjaanList.map((det) => createBlankDetailEntry(det)));
    }
    if (onConsumePrefill) {
      onConsumePrefill();
    }
  }, [prefilledTanggal, prefilledPekerjaanList, onConsumePrefill]);

  const [preparingEntryId, setPreparingEntryId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgressText, setUploadProgressText] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [sheetSyncWarning, setSheetSyncWarning] = useState<string | null>(null);
  const [isSyncingSheetOnly, setIsSyncingSheetOnly] = useState<boolean>(false);
  const [completedBatchModal, setCompletedBatchModal] = useState<{
    tanggalRealisasi: string;
    driveFolderUrl: string;
    records: HvbEvidenRecord[];
  } | null>(null);

  const cameraInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const galleryInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const detailInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const detailEntriesRef = useRef<PendingEvidenDetailEntry[]>([]);

  useEffect(() => {
    detailEntriesRef.current = detailEntries;
  }, [detailEntries]);

  useEffect(() => {
    return () => {
      detailEntriesRef.current.forEach((entry) => {
        entry.photos.forEach((p) => {
          try {
            URL.revokeObjectURL(p.previewUrl);
          } catch {
            // Ignore revoke error
          }
        });
      });
    };
  }, []);

  const normalizedSelectedDate = useMemo(
    () => normalizeEvidenDateKey(tanggalRealisasi),
    [tanggalRealisasi]
  );

  const existingFolderForSelectedDate = useMemo(() => {
    const match = evidenRecords.find(
      (rec) =>
        normalizeEvidenDateKey(rec.tanggalRealisasi) === normalizedSelectedDate &&
        Boolean(rec.driveFolderUrl)
    );
    return match
      ? {
          folderId: match.driveFolderId,
          folderUrl: match.driveFolderUrl,
          folderName: normalizeEvidenDateKey(match.tanggalRealisasi),
        }
      : null;
  }, [evidenRecords, normalizedSelectedDate]);

  const totalPendingPhotos = useMemo(
    () => detailEntries.reduce((sum, entry) => sum + entry.photos.length, 0),
    [detailEntries]
  );

  const groupedEvidenByDate = useMemo(() => {
    const groups = new Map<
      string,
      {
        dateKey: string;
        folderUrl: string;
        folderName: string;
        items: HvbEvidenRecord[];
      }
    >();

    for (const rec of evidenRecords) {
      const dateKey = normalizeEvidenDateKey(rec.tanggalRealisasi);
      const existing = groups.get(dateKey);
      if (existing) {
        if (!existing.folderUrl && rec.driveFolderUrl) {
          existing.folderUrl = rec.driveFolderUrl;
        }
        existing.items.push(rec);
      } else {
        groups.set(dateKey, {
          dateKey,
          folderUrl: rec.driveFolderUrl || '',
          folderName: dateKey,
          items: [rec],
        });
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [evidenRecords]);

  const handleAddDetailEntry = () => {
    const nextEntry = createBlankDetailEntry();
    setDetailEntries((prev) => [...prev, nextEntry]);
    setFormError(null);
    if (onTriggerSound) onTriggerSound('scan');
    setTimeout(() => {
      detailInputRefs.current[nextEntry.id]?.focus();
    }, 80);
  };

  const handleRemoveDetailEntry = (entryId: string) => {
    setDetailEntries((prev) => {
      if (prev.length <= 1) return prev;
      const target = prev.find((e) => e.id === entryId);
      if (target) {
        target.photos.forEach((p) => {
          try {
            URL.revokeObjectURL(p.previewUrl);
          } catch {
            // Ignore revoke error
          }
        });
      }
      return prev.filter((e) => e.id !== entryId);
    });
  };

  const updateEntryField = <K extends keyof PendingEvidenDetailEntry>(
    entryId: string,
    field: K,
    value: PendingEvidenDetailEntry[K]
  ) => {
    setDetailEntries((prev) =>
      prev.map((entry) => (entry.id === entryId ? { ...entry, [field]: value } : entry))
    );
  };

  const handleFilesSelectedForEntry = async (
    entryId: string,
    fileList: FileList | null
  ) => {
    if (!fileList || fileList.length === 0) return;
    setFormError(null);
    setPreparingEntryId(entryId);
    try {
      const files = Array.from(fileList);
      const prepared: PendingEvidenPhoto[] = [];
      for (let idx = 0; idx < files.length; idx++) {
        const f = files[idx];
        const compressedBlob = await compressImageFile(f);
        const previewUrl = URL.createObjectURL(compressedBlob);
        const baseName = f.name
          ? f.name.replace(/\.[^.]+$/, '')
          : `eviden-${Date.now()}-${idx + 1}`;
        const ext = compressedBlob.type === 'image/png' ? 'png' : 'jpg';
        prepared.push({
          id: `PHOTO-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          fileName: `${baseName}.${ext}`,
          blob: compressedBlob,
          previewUrl,
          sizeBytes: compressedBlob.size,
        });
      }
      setDetailEntries((prev) =>
        prev.map((entry) =>
          entry.id === entryId
            ? { ...entry, photos: [...entry.photos, ...prepared] }
            : entry
        )
      );
      if (onTriggerSound) onTriggerSound('scan');
    } catch {
      setFormError('Gagal memproses foto yang dipilih. Silakan coba pilih ulang.');
    } finally {
      setPreparingEntryId(null);
    }
  };

  const handleRemovePhotoFromEntry = (entryId: string, photoId: string) => {
    setDetailEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        const target = entry.photos.find((p) => p.id === photoId);
        if (target) {
          try {
            URL.revokeObjectURL(target.previewUrl);
          } catch {
            // Ignore revoke error
          }
        }
        return {
          ...entry,
          photos: entry.photos.filter((p) => p.id !== photoId),
        };
      })
    );
  };

  const syncEvidenToHvbSheet = async (
    updatedEvidenList: HvbEvidenRecord[],
    overrideToken?: string | null
  ): Promise<boolean> => {
    const activeToken = overrideToken || (await getAccessToken()) || accessToken;
    if (!activeToken) {
      setSheetSyncWarning(
        'Foto tersimpan di Google Drive, namun sesi Sheet perlu disegarkan. Tekan "Sinkronkan ke Spreadsheet" di bawah.'
      );
      return false;
    }

    const preferredId =
      connectedTeknikSheet && !isLogistikSpreadsheetTitle(connectedTeknikSheet.title)
        ? connectedTeknikSheet.spreadsheetId
        : extractSpreadsheetId(teknikSheetUrlInput);

    try {
      const { primaryMeta } = await syncHvbReportsToAllTeknikSheets(
        activeToken,
        reports,
        preferredId || undefined,
        updatedEvidenList
      );
      onTeknikSheetSynced(primaryMeta);
      setSheetSyncWarning(null);
      return true;
    } catch {
      setSheetSyncWarning(
        'Foto tersimpan di Google Drive, namun sinkronisasi Sheet HVB gagal sementara. Tekan "Sinkronkan ke Spreadsheet" untuk mencoba lagi.'
      );
      return false;
    }
  };

  const handleUploadEvidenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading) return;
    setFormError(null);
    setSheetSyncWarning(null);

    if (detailEntries.length === 0) {
      setFormError('Tekan tombol "+ Tambah Detail Pekerjaan" untuk mengisi minimal 1 detail pekerjaan.');
      return;
    }

    for (let i = 0; i < detailEntries.length; i++) {
      const entry = detailEntries[i];
      if (!entry.detailPekerjaan.trim()) {
        setFormError(
          `Detail Pekerjaan #${i + 1} belum diisi. Silakan pilih atau ketik detail pekerjaan.`
        );
        detailInputRefs.current[entry.id]?.focus();
        return;
      }
      if (entry.photos.length === 0) {
        setFormError(
          `Detail Pekerjaan #${i + 1} ("${entry.detailPekerjaan.trim()}") belum memiliki foto eviden. Silakan upload minimal 1 foto.`
        );
        return;
      }
    }

    // Acquire valid Google token inside the user click gesture
    let tokenToUse: string | null = null;
    if (hasValidCachedAccessToken()) {
      tokenToUse = (await getAccessToken()) || accessToken;
    }
    if (!tokenToUse) {
      try {
        const authRes = await googleSignIn();
        tokenToUse = authRes?.accessToken || null;
      } catch (err: any) {
        setFormError(
          err?.message ||
            'Login Google Drive diperlukan untuk membuat folder dan mengupload foto eviden.'
        );
        return;
      }
    }

    if (!tokenToUse) {
      setFormError('Sesi Google Drive belum aktif. Silakan masuk terlebih dahulu.');
      return;
    }

    setIsUploading(true);
    try {
      setUploadProgressText(`Menyiapkan 1 folder Drive (${normalizedSelectedDate})...`);
      const folderInfo = await ensureHvbEvidenDateFolder(tokenToUse, normalizedSelectedDate);

      const newRecords: HvbEvidenRecord[] = [];
      let uploadedCount = 0;

      for (let eIdx = 0; eIdx < detailEntries.length; eIdx++) {
        const entry = detailEntries[eIdx];
        const cleanDetail = entry.detailPekerjaan.trim();
        const cleanKeterangan = entry.keterangan.trim();
        const safeDetailPrefix = cleanDetail
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 32);

        const uploadedFiles = [];
        for (let pIdx = 0; pIdx < entry.photos.length; pIdx++) {
          const photo = entry.photos[pIdx];
          uploadedCount++;
          setUploadProgressText(
            `Mengupload foto ${uploadedCount}/${totalPendingPhotos} (${cleanDetail})...`
          );
          const timestampTag = new Date()
            .toISOString()
            .slice(11, 19)
            .replace(/:/g, '');
          const finalFileName = `${normalizedSelectedDate}_${safeDetailPrefix || 'HVB'}_${timestampTag}_${eIdx + 1}_${pIdx + 1}.jpg`;
          const uploaded = await uploadHvbEvidenPhotoToDrive(
            tokenToUse,
            folderInfo.folderId,
            photo.blob,
            finalFileName,
            cleanKeterangan
          );
          uploadedFiles.push(uploaded);
        }

        const nowDisplay = new Date().toISOString().slice(0, 19).replace('T', ' ');
        newRecords.push({
          id: `HVB-EVD-${Date.now()}-${eIdx}-${Math.random().toString(36).slice(2, 6)}`,
          tanggalRealisasi: normalizedSelectedDate,
          detailPekerjaan: cleanDetail,
          keterangan: cleanKeterangan,
          driveFolderId: folderInfo.folderId,
          driveFolderUrl: folderInfo.folderUrl,
          files: uploadedFiles,
          uploadedAt: nowDisplay,
        });
      }

      setUploadProgressText('Menyimpan riwayat & menyinkronkan Sheet HVB...');

      let savedRecords: HvbEvidenRecord[] = newRecords;
      let updatedList: HvbEvidenRecord[] = [...newRecords, ...evidenRecords];

      try {
        const res = await fetch('/api/hvb/eviden', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ records: newRecords }),
        });
        const rawText = await res.text();
        const trimmed = rawText.trim();
        if (trimmed && !trimmed.startsWith('<')) {
          const data = JSON.parse(trimmed);
          if (!res.ok || data?.success === false) {
            throw new Error(data?.message || 'Gagal menyimpan data eviden.');
          }
          if (Array.isArray(data?.savedRecords)) {
            savedRecords = data.savedRecords;
          }
          if (Array.isArray(data?.evidenList)) {
            updatedList = data.evidenList;
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

      onEvidenCreated(savedRecords[0], updatedList);
      await syncEvidenToHvbSheet(updatedList, tokenToUse);

      if (onTriggerSound) onTriggerSound('commit');

      detailEntries.forEach((entry) => {
        entry.photos.forEach((p) => {
          try {
            URL.revokeObjectURL(p.previewUrl);
          } catch {
            // Ignore revoke error
          }
        });
      });
      setDetailEntries([createBlankDetailEntry()]);
      setCompletedBatchModal({
        tanggalRealisasi: normalizedSelectedDate,
        driveFolderUrl: folderInfo.folderUrl,
        records: savedRecords,
      });
    } catch (err: any) {
      if (onTriggerSound) onTriggerSound('error');
      setFormError(err?.message || 'Gagal mengupload foto eviden pekerjaan ke Google Drive.');
    } finally {
      setIsUploading(false);
      setUploadProgressText('');
    }
  };

  const handleManualSyncSheet = async (recordsToSync: HvbEvidenRecord[] = evidenRecords) => {
    if (isSyncingSheetOnly) return;
    setIsSyncingSheetOnly(true);
    try {
      let tokenToUse: string | null = null;
      if (!hasValidCachedAccessToken()) {
        const authRes = await googleSignIn();
        tokenToUse = authRes?.accessToken || null;
      } else {
        tokenToUse = (await getAccessToken()) || accessToken;
      }
      if (tokenToUse) {
        await syncEvidenToHvbSheet(recordsToSync, tokenToUse);
      }
    } catch {
      // Handled gracefully
    } finally {
      setIsSyncingSheetOnly(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-display">
              Eviden Pekerjaan HVB
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pilih Tanggal Realisasi lalu tekan tombol <strong>+ Tambah Detail Pekerjaan</strong>. Setiap detail pekerjaan memiliki upload foto eviden &amp; keterangan sendiri dan tersimpan dalam 1 folder Drive sesuai tanggal.
            </p>
          </div>
          {existingFolderForSelectedDate && (
            <a
              href={existingFolderForSelectedDate.folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 shrink-0"
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span>Folder {existingFolderForSelectedDate.folderName}</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          )}
        </div>

        {formError && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 flex items-start gap-2.5 text-xs text-rose-900 dark:text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="font-medium">{formError}</span>
          </div>
        )}

        <form onSubmit={handleUploadEvidenSubmit} className="space-y-4">
          {/* LANGKAH 1: PILIH TANGGAL REALISASI + TOMBOL + INPUT DETAIL PEKERJAAN */}
          <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-[#0b4f6c] text-[#facc15] font-mono text-xs font-bold flex items-center justify-center">
                1
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Tanggal Realisasi
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Pilih Tanggal Realisasi <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    required
                    value={tanggalRealisasi}
                    onChange={(e) => setTanggalRealisasi(e.target.value)}
                    className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 text-xs sm:text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="sm:col-span-7">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={handleAddDetailEntry}
                  className="w-full min-h-[46px] px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-[#0b4f6c] hover:bg-[#083d54] disabled:opacity-60 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs"
                >
                  <Plus className="w-4 h-4 shrink-0 text-[#facc15]" />
                  <span>Tambah Detail Pekerjaan ({detailEntries.length})</span>
                </button>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/70 text-[11px] text-sky-900 dark:text-sky-200 flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>
                Folder tujuan Google Drive:{' '}
                <strong className="font-mono">
                  EVIDEN PEKERJAAN HVB / {normalizedSelectedDate}
                </strong>
                {existingFolderForSelectedDate
                  ? ' (folder sudah ada — seluruh detail pekerjaan di tanggal ini masuk ke folder yang sama & Sheet HVB tetap menampilkan 1 link folder).'
                  : ' (folder akan dibuat otomatis & hanya 1 link folder ditampilkan pada Sheet HVB untuk tanggal ini).'}
              </span>
            </div>
          </div>

          {/* DAFTAR DETAIL PEKERJAAN (MASING-MASING DENGAN FOTO EVIDEN > 1 & KETERANGAN OPSIONAL) */}
          <div className="space-y-3">
            {detailEntries.map((entry, entryIndex) => {
              const q = entry.detailPekerjaan.trim().toUpperCase();
              const filteredPekerjaan = q
                ? pekerjaanCatalog.filter((item) => item.toUpperCase().includes(q))
                : pekerjaanCatalog;

              return (
                <div
                  key={entry.id}
                  className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3.5"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700/80">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white font-mono text-xs font-bold flex items-center justify-center">
                        {entryIndex + 1}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Detail Pekerjaan #{entryIndex + 1}
                      </h4>
                      {entry.photos.length > 0 && (
                        <span className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          ({entry.photos.length} foto)
                        </span>
                      )}
                    </div>
                    {detailEntries.length > 1 && (
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => handleRemoveDetailEntry(entry.id)}
                        className="px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>

                  {/* A. PILIH / KETIK DETAIL PEKERJAAN */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Detail Pekerjaan <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        ref={(el) => {
                          detailInputRefs.current[entry.id] = el;
                        }}
                        type="text"
                        value={entry.detailPekerjaan}
                        onFocus={() => updateEntryField(entry.id, 'isDropdownOpen', true)}
                        onChange={(e) => {
                          setDetailEntries((prev) =>
                            prev.map((item) =>
                              item.id === entry.id
                                ? {
                                    ...item,
                                    detailPekerjaan: e.target.value,
                                    isDropdownOpen: true,
                                  }
                                : item
                            )
                          );
                        }}
                        placeholder="Pilih atau ketik detail pekerjaan..."
                        className="w-full min-h-[46px] pl-10 pr-9 py-2.5 text-xs sm:text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      {entry.detailPekerjaan && (
                        <button
                          type="button"
                          onClick={() => {
                            setDetailEntries((prev) =>
                              prev.map((item) =>
                                item.id === entry.id
                                  ? {
                                      ...item,
                                      detailPekerjaan: '',
                                      isDropdownOpen: true,
                                    }
                                  : item
                              )
                            );
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                          title="Hapus pilihan"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {entry.isDropdownOpen && filteredPekerjaan.length > 0 && (
                      <div className="mt-1.5 max-h-52 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl divide-y divide-slate-100 dark:divide-slate-800 z-20">
                        <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          <span>Daftar Detail Pekerjaan HVB</span>
                          <button
                            type="button"
                            onClick={() => updateEntryField(entry.id, 'isDropdownOpen', false)}
                            className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
                          >
                            Tutup
                          </button>
                        </div>
                        {filteredPekerjaan.map((pek, idx) => (
                          <button
                            key={`${entry.id}-${idx}-${pek}`}
                            type="button"
                            onClick={() => {
                              setDetailEntries((prev) =>
                                prev.map((item) =>
                                  item.id === entry.id
                                    ? {
                                        ...item,
                                        detailPekerjaan: pek,
                                        isDropdownOpen: false,
                                      }
                                    : item
                                )
                              );
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-xs sm:text-sm text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                          >
                            {pek}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* B. UPLOAD FOTO EVIDEN KHUSUS DETAIL PEKERJAAN INI (BISA > 1 FOTO) */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Upload Foto Eviden ({entry.detailPekerjaan.trim() || `Pekerjaan #${entryIndex + 1}`}) <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Bisa tambah lebih dari 1 foto
                      </span>
                    </div>

                    <input
                      ref={(el) => {
                        cameraInputRefs.current[entry.id] = el;
                      }}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        handleFilesSelectedForEntry(entry.id, e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <input
                      ref={(el) => {
                        galleryInputRefs.current[entry.id] = el;
                      }}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        handleFilesSelectedForEntry(entry.id, e.target.files);
                        e.target.value = '';
                      }}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        disabled={preparingEntryId === entry.id || isUploading}
                        onClick={() => cameraInputRefs.current[entry.id]?.click()}
                        className="min-h-[46px] px-4 py-2 text-xs font-bold text-white bg-[#0b4f6c] hover:bg-[#083d54] disabled:opacity-60 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs"
                      >
                        <Camera className="w-4 h-4 shrink-0" />
                        <span>Ambil Foto Kamera</span>
                      </button>

                      <button
                        type="button"
                        disabled={preparingEntryId === entry.id || isUploading}
                        onClick={() => galleryInputRefs.current[entry.id]?.click()}
                        className="min-h-[46px] px-4 py-2 text-xs font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 disabled:opacity-60 rounded-xl flex items-center justify-center gap-2 transition-colors"
                      >
                        <ImagePlus className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Pilih Foto dari Galeri (Multi)</span>
                      </button>
                    </div>

                    {preparingEntryId === entry.id && (
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                        <span>Mengompres foto eviden...</span>
                      </div>
                    )}

                    {entry.photos.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-1">
                        {entry.photos.map((photo, pIdx) => (
                          <div
                            key={photo.id}
                            className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950"
                          >
                            <img
                              src={photo.previewUrl}
                              alt={`Eviden ${entryIndex + 1}-${pIdx + 1}`}
                              className="w-full h-24 object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemovePhotoFromEntry(entry.id, photo.id)}
                              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-slate-950/75 hover:bg-rose-600 text-white flex items-center justify-center transition-colors"
                              title="Hapus foto"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <div className="px-2 py-1 flex items-center justify-between gap-1 text-[10px] font-mono text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800">
                              <span className="truncate">Foto {pIdx + 1}</span>
                              <span className="shrink-0 tabular-nums">
                                {formatFileSize(photo.sizeBytes)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* C. KETERANGAN (TIDAK WAJIB DIISI) */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Keterangan
                      </label>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Tidak wajib diisi
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      value={entry.keterangan}
                      onChange={(e) => updateEntryField(entry.id, 'keterangan', e.target.value)}
                      placeholder="Tambahkan catatan untuk detail pekerjaan ini bila perlu (opsional)..."
                      className="w-full px-3.5 py-2 text-xs sm:text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <button
              type="button"
              disabled={isUploading}
              onClick={handleAddDetailEntry}
              className="w-full sm:w-auto min-h-[46px] px-4 py-2.5 text-xs sm:text-sm font-bold text-[#0b4f6c] dark:text-[#facc15] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>+ Tambah Detail Pekerjaan Lainnya</span>
            </button>

            <button
              type="submit"
              disabled={isUploading || preparingEntryId !== null}
              className="w-full sm:w-auto sm:min-w-[240px] min-h-[50px] px-6 py-3 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  <span>{uploadProgressText || 'Mengupload Eviden...'}</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4 shrink-0" />
                  <span>
                    Upload {totalPendingPhotos > 0 ? `${totalPendingPhotos} Foto & ` : ''}Simpan Eviden
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* RIWAYAT FOLDER & EVIDEN PER TANGGAL */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white font-display">
              Riwayat Eviden per Tanggal Realisasi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Jika dalam 1 tanggal terdapat lebih dari 1 detail pekerjaan, seluruh foto tersimpan dalam 1 folder yang sama dan Sheet HVB hanya menampilkan 1 link folder per tanggal.
            </p>
          </div>
          <button
            type="button"
            disabled={isSyncingSheetOnly || evidenRecords.length === 0}
            onClick={() => handleManualSyncSheet(evidenRecords)}
            className="min-h-[40px] px-3.5 py-2 text-xs font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 border border-slate-300 dark:border-slate-700 rounded-xl flex items-center justify-center gap-1.5 shrink-0 transition-colors"
          >
            {isSyncingSheetOnly ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>Sinkronkan Sheet HVB</span>
          </button>
        </div>

        {groupedEvidenByDate.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
            <FileImage className="w-8 h-8 mx-auto text-slate-400" />
            <p>Belum ada eviden pekerjaan HVB yang diupload.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupedEvidenByDate.map((group) => (
              <div
                key={group.dateKey}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 overflow-hidden"
              >
                <div className="px-4 py-3 bg-slate-100/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#0b4f6c] dark:text-[#facc15] shrink-0" />
                    <span className="font-mono text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      {group.dateKey}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      ({group.items.length} detail pekerjaan)
                    </span>
                  </div>
                  {group.folderUrl && (
                    <a
                      href={group.folderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0b4f6c] hover:bg-[#083d54] text-white text-[11px] font-bold transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                      <span>Buka Folder Drive</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  )}
                </div>

                <div className="divide-y divide-slate-200/70 dark:divide-slate-700/70">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2.5 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white break-words">
                          {item.detailPekerjaan}
                        </div>
                        {item.keterangan && (
                          <div className="text-slate-600 dark:text-slate-300">
                            Keterangan: {item.keterangan}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
                            {item.files.length} foto tersimpan
                          </span>
                          {item.files.map((file, idx) => (
                            <a
                              key={file.fileId || idx}
                              href={file.webViewLink || item.driveFolderUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-sky-700 dark:text-sky-300 hover:underline"
                            >
                              <span>Foto {idx + 1}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ))}
                        </div>
                      </div>

                      {onDeleteEviden && (
                        <button
                          type="button"
                          onClick={() => onDeleteEviden(item.id)}
                          className="self-start p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                          title="Hapus catatan eviden dari daftar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* POPUP KONFIRMASI UPLOAD EVIDEN BERHASIL */}
      {completedBatchModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/75 backdrop-blur-xs p-3 sm:p-4 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:pb-4"
          onClick={() => setCompletedBatchModal(null)}
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
                  Eviden Berhasil Diupload
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCompletedBatchModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 dark:text-slate-400">Tanggal Realisasi:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {completedBatchModal.tanggalRealisasi}
                </span>
              </div>
              <div className="space-y-2">
                {completedBatchModal.records.map((rec, idx) => (
                  <div
                    key={rec.id}
                    className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {idx + 1}. {rec.detailPekerjaan}
                      </span>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 shrink-0 tabular-nums">
                        {rec.files.length} foto
                      </span>
                    </div>
                    {rec.keterangan && (
                      <div className="text-[11px] text-slate-600 dark:text-slate-300">
                        Keterangan: {rec.keterangan}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <a
              href={completedBatchModal.driveFolderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[46px] px-4 py-2.5 text-xs sm:text-sm font-bold text-white bg-[#0b4f6c] hover:bg-[#083d54] rounded-xl flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span>Buka Folder Drive ({completedBatchModal.tanggalRealisasi})</span>
              <ExternalLink className="w-4 h-4 shrink-0" />
            </a>

            {sheetSyncWarning && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 space-y-2.5 text-xs">
                <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{sheetSyncWarning}</span>
                </div>
                <button
                  type="button"
                  disabled={isSyncingSheetOnly}
                  onClick={() => handleManualSyncSheet(evidenRecords)}
                  className="w-full min-h-[42px] px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 rounded-xl flex items-center justify-center gap-2 transition-colors"
                >
                  {isSyncingSheetOnly ? (
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

            <div className="pt-1 text-right">
              <button
                type="button"
                onClick={() => setCompletedBatchModal(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
