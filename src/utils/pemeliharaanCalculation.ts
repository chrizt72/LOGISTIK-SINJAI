import type { YantekWorkItemInput } from '../types/warehouse.ts';

export interface RealisasiPemeliharaanSummary {
  volumePerampalan: number;
  volumePenebangan: number;
  totalVolumePohon: number;
  realisasiPemeliharaanKms: number;
}

export function isPerampalanPohonWork(detailPekerjaan: string): boolean {
  const normalized = String(detailPekerjaan || '').trim().toLowerCase();
  return normalized.includes('perampalan');
}

export function isPenebanganPohonWork(detailPekerjaan: string): boolean {
  const normalized = String(detailPekerjaan || '').trim().toLowerCase();
  return (
    normalized.includes('penebangan') ||
    normalized.includes('tebang pohon') ||
    /\btebang\b/i.test(normalized)
  );
}

export function getRealisasiPemeliharaanDetails(
  pekerjaanList: Pick<YantekWorkItemInput, 'detailPekerjaan' | 'volume'>[] = []
): RealisasiPemeliharaanSummary {
  let volumePerampalan = 0;
  let volumePenebangan = 0;

  for (const item of pekerjaanList) {
    const vol = Number(item?.volume) || 0;
    if (!Number.isFinite(vol) || vol <= 0) continue;

    const detail = String(item?.detailPekerjaan || '');
    if (isPerampalanPohonWork(detail)) {
      volumePerampalan += vol;
    } else if (isPenebanganPohonWork(detail)) {
      volumePenebangan += vol;
    }
  }

  const totalVolumePohon = Number((volumePerampalan + volumePenebangan).toFixed(4));
  const realisasiPemeliharaanKms = Number((totalVolumePohon * 0.1).toFixed(4));

  return {
    volumePerampalan: Number(volumePerampalan.toFixed(4)),
    volumePenebangan: Number(volumePenebangan.toFixed(4)),
    totalVolumePohon,
    realisasiPemeliharaanKms,
  };
}

export function formatPemeliharaanKms(value: number): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '0';
  return String(Number(num.toFixed(4)));
}
