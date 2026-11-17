export interface ParsedQrResult {
  snList: string[];
  qrType: 'TUNGGAL' | 'BUNDLE';
  rawPayload: string;
}

/**
 * Memisahkan hasil scan QR Code menjadi deretan Nomor Serial Number (SN).
 * Mendukung 2 jenis QR Code:
 * 1. QR Code Material Tunggal (berisi 1 SN, contoh: PLN0219000022402639005330251)
 * 2. QR Code Bundle (berisi 1 s/d 20+ SN yang dipisahkan oleh baris baru, koma,
 *    titik koma, spasi, pipe, JSON array, atau deretan kode PLN...)
 */
export function parseQrPayloadToSNList(rawText: string): ParsedQrResult {
  const cleanedRaw = String(rawText || '').trim();
  if (!cleanedRaw) {
    return { snList: [], qrType: 'TUNGGAL', rawPayload: '' };
  }

  // 1. Cek apakah terdapat pola SN PLN (contoh: PLN0219000022402639005330251)
  // Jika ada satu atau lebih token PLN..., ekstrak seluruhnya secara berurutan
  const plnMatches = cleanedRaw.toUpperCase().match(/PLN[A-Z0-9]{8,35}/g);
  if (plnMatches && plnMatches.length > 0) {
    const uniquePln = Array.from(new Set(plnMatches.map((s) => s.trim())));
    const hasMultipleSeparators = /[\r\n,;|]/.test(cleanedRaw) || uniquePln.length > 1;
    return {
      snList: uniquePln,
      qrType: hasMultipleSeparators && uniquePln.length > 1 ? 'BUNDLE' : 'TUNGGAL',
      rawPayload: cleanedRaw,
    };
  }

  // 2. Coba parse jika QR berformat JSON Array atau Object
  if (
    (cleanedRaw.startsWith('[') && cleanedRaw.endsWith(']')) ||
    (cleanedRaw.startsWith('{') && cleanedRaw.endsWith('}'))
  ) {
    try {
      const parsed = JSON.parse(cleanedRaw);
      const rawArr = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.sn)
        ? parsed.sn
        : Array.isArray(parsed?.items)
        ? parsed.items
        : [parsed];
      const extracted: string[] = rawArr
        .map((item: unknown): string => {
          if (typeof item === 'string' || typeof item === 'number') {
            return String(item).trim().toUpperCase();
          }
          if (item && typeof item === 'object') {
            const obj = item as Record<string, unknown>;
            return String(obj.snMaterial || obj.sn || obj.serialNumber || '')
              .trim()
              .toUpperCase();
          }
          return '';
        })
        .filter((s: string) => s.length >= 5);

      const uniqueJson: string[] = Array.from(new Set<string>(extracted));
      if (uniqueJson.length > 0) {
        return {
          snList: uniqueJson,
          qrType: uniqueJson.length > 1 ? 'BUNDLE' : 'TUNGGAL',
          rawPayload: cleanedRaw,
        };
      }
    } catch {
      // Lanjut ke pemisahan delimiter biasa
    }
  }

  // 3. Pisahkan berdasarkan baris baru, koma, titik koma, pipe, atau spasi ganda
  const tokens = cleanedRaw
    .split(/[\r\n,;|]+/)
    .map((line) =>
      line
        .trim()
        // Hilangkan penomoran di depan seperti "1. ", "01) ", "SN:", "SN="
        .replace(/^(?:\d+[\.\)\-\s]+|SN\s*[:=\-]\s*)/i, '')
        .trim()
        .toUpperCase()
    )
    .flatMap((line) => {
      // Jika dalam 1 baris terdapat beberapa kode panjang yang dipisahkan spasi
      const parts = line.split(/\s+/).filter(Boolean);
      if (parts.length > 1 && parts.every((p) => /^[A-Z0-9\-_]{6,}$/.test(p))) {
        return parts;
      }
      return [line];
    })
    .filter((token) => token.length >= 4);

  const uniqueTokens = Array.from(new Set(tokens));

  return {
    snList: uniqueTokens,
    qrType: uniqueTokens.length > 1 ? 'BUNDLE' : 'TUNGGAL',
    rawPayload: cleanedRaw,
  };
}
