import { jsPDF } from 'jspdf';
import { YantekRealisasiReport, HvbRealisasiReport } from '../types/warehouse';
import {
  formatPemeliharaanKms,
  getRealisasiPemeliharaanDetails,
} from './pemeliharaanCalculation';

export function buildYantekPdfDocument(report: YantekRealisasiReport): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  // Header Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(14, y, pageWidth - 28, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('PT PLN (PERSERO) UIW SULSELRABAR - ULP SINJAI', 20, y + 8);

  doc.setFontSize(10);
  doc.setTextColor(56, 189, 248); // sky-400
  doc.text('LAPORAN REALISASI HARIAN PEKERJAAN YANTEK', 20, y + 15.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `No. Laporan: #YNTK-${report.reportRowNumber} | ${report.timestampLaporan}`,
    pageWidth - 20,
    y + 15.5,
    { align: 'right' }
  );

  y += 28;

  // Section 1: Informasi Pelaksana & Segmen Jaringan
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, y, pageWidth - 28, 43, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('1. DATA TIM PELAKSANA & SEGMEN JARINGAN (DATA_BASE)', 18, y + 7);

  doc.setFontSize(9);
  const leftXLabel = 18;
  const leftXVal = 58;
  const rightXLabel = 112;
  const rightXVal = 150;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Tim Pelaksana (Unit)', leftXLabel, y + 14);
  doc.text('Nama Petugas', leftXLabel, y + 20.5);
  doc.text('Tanggal Realisasi', leftXLabel, y + 27);
  doc.text('Penyulang (Kolom A)', leftXLabel, y + 33.5);
  doc.text('Keypoint (Kolom B)', leftXLabel, y + 40);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`: ${report.unitPelaksana}`, leftXVal, y + 14);
  doc.text(`: ${report.petugasPelapor || '-'}`, leftXVal, y + 20.5);
  doc.text(`: ${report.tanggalLaporan}`, leftXVal, y + 27);
  doc.text(`: ${report.penyulang}`, leftXVal, y + 33.5);
  doc.text(`: ${report.keypoint}`, leftXVal, y + 40);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Segmen Pekerjaan (C)', rightXLabel, y + 14);
  doc.text('Panjang Segmen (D)', rightXLabel, y + 20.5);
  doc.text('Realisasi WO / P0', rightXLabel, y + 27);
  doc.text('Temuan Butuh Padam', rightXLabel, y + 33.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`: ${report.segment}`, rightXVal, y + 14);
  doc.text(`: ${report.panjangKms ? `${report.panjangKms} KMS` : '-'}`, rightXVal, y + 20.5);
  doc.text(`: ${report.realisasiWo} WO / ${report.realisasiP0} P0`, rightXVal, y + 27);
  doc.text(`: ${report.temuanButuhPadam ?? 0}`, rightXVal, y + 33.5);

  y += 50;

  // Section 2: Tabel Detail Pekerjaan & Volume
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `2. DAFTAR DETAIL PEKERJAAN & VOLUME (${report.pekerjaanList.length} Item Pekerjaan)`,
    14,
    y
  );

  y += 4;

  // Table Header
  doc.setFillColor(30, 41, 59);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text('NO', 18, y + 5.5);
  doc.text('DETAIL PEKERJAAN (KOLOM E DATA_BASE)', 30, y + 5.5);
  doc.text('VOLUME PEKERJAAN', pageWidth - 18, y + 5.5, { align: 'right' });

  y += 8;

  doc.setTextColor(15, 23, 42);
  let totalVolume = 0;

  report.pekerjaanList.forEach((item, idx) => {
    totalVolume += Number(item.volume) || 0;
    const wrappedText = doc.splitTextToSize(item.detailPekerjaan, pageWidth - 82);
    const rowHeight = Math.max(8, wrappedText.length * 5 + 3);

    if (y + rowHeight > 255) {
      doc.addPage();
      y = 20;
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, pageWidth - 28, rowHeight, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, y, pageWidth - 28, rowHeight, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(String(idx + 1), 18, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.text(wrappedText, 30, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.text(String(item.volume), pageWidth - 18, y + 5.5, { align: 'right' });

    y += rowHeight;
  });

  // Total Row
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.setDrawColor(167, 243, 208);
  doc.rect(14, y, pageWidth - 28, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(6, 95, 70);
  doc.text('TOTAL VOLUME PEKERJAAN', 30, y + 5.5);
  doc.text(String(totalVolume), pageWidth - 18, y + 5.5, { align: 'right' });

  y += 15;

  if (y + 50 > 275) {
    doc.addPage();
    y = 20;
  }

  // Section 3: Titik Koordinat & Realisasi WO / P0 / Realisasi Pemeliharaan
  const yantekPemeliharaanKms =
    report.realisasiPemeliharaanKms ??
    getRealisasiPemeliharaanDetails(report.pekerjaanList).realisasiPemeliharaanKms;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3. TITIK KOORDINAT LOKASI & REKAP REALISASI HARIAN', 14, y);

  y += 4;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, y, pageWidth - 28, 41, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Titik Koordinat Awal', 18, y + 7);
  doc.text('Titik Koordinat Akhir', 18, y + 14);
  doc.text('Jumlah Realisasi WO / P0', 18, y + 21);
  doc.text('Temuan Butuh Padam', 18, y + 28);
  doc.text('Realisasi Pemeliharaan', 18, y + 35);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`: ${report.koordinatAwal}`, 62, y + 7);
  doc.text(`: ${report.koordinatAkhir}`, 62, y + 14);
  doc.text(
    `: Realisasi WO = ${report.realisasiWo}  |  Realisasi P0 = ${report.realisasiP0}`,
    62,
    y + 21
  );
  doc.text(`: ${report.temuanButuhPadam ?? 0}`, 62, y + 28);
  doc.setTextColor(6, 95, 70);
  doc.text(`: ${formatPemeliharaanKms(yantekPemeliharaanKms)} KMS`, 62, y + 35);

  y += 51;

  // Footer Signature
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Sinjai, ${report.tanggalLaporan}`, pageWidth - 20, y, { align: 'right' });
  doc.text('Tim Pelaksana Yantek,', pageWidth - 20, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(report.unitPelaksana, pageWidth - 20, y + 22, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Dicetak otomatis dari Aplikasi SINJAI BENDERANG - Menu Realisasi Yantek (Spreadsheet TEKNIK_SINJAI - Sheet YANTEK gid=896667653)',
    14,
    285
  );

  return doc;
}

export function getYantekPdfFilename(report: YantekRealisasiReport): string {
  const safeUnit = report.unitPelaksana.replace(/[^A-Z0-9]+/gi, '_');
  const safeSeg = report.segment.replace(/[^A-Z0-9]+/gi, '_');
  return `LAPORAN_YANTEK_${safeUnit}_${safeSeg}_${report.tanggalLaporan}.pdf`;
}

export function downloadYantekReportPdf(report: YantekRealisasiReport): void {
  const doc = buildYantekPdfDocument(report);
  const filename = getYantekPdfFilename(report);
  doc.save(filename);
}

export function buildYantekWhatsAppText(report: YantekRealisasiReport): string {
  const pekerjaanLines = report.pekerjaanList
    .map((p, idx) => `   ${idx + 1}. ${p.detailPekerjaan} — *Volume: ${p.volume}*`)
    .join('\n');
  const realisasiPemeliharaanKms =
    report.realisasiPemeliharaanKms ??
    getRealisasiPemeliharaanDetails(report.pekerjaanList).realisasiPemeliharaanKms;

  return [
    `*LAPORAN REALISASI HARIAN PEKERJAAN YANTEK*`,
    `*PLN ULP SINJAI — ${report.unitPelaksana}*`,
    `----------------------------------------`,
    `• *Tanggal / Waktu:* ${report.tanggalLaporan} (${report.timestampLaporan})`,
    `• *Tim Pelaksana:* ${report.unitPelaksana}`,
    `• *Nama Petugas:* ${report.petugasPelapor || '-'}`,
    `• *Penyulang (Kolom A):* ${report.penyulang}`,
    `• *Keypoint (Kolom B):* ${report.keypoint}`,
    `• *Segmen Pekerjaan (Kolom C):* ${report.segment}${
      report.panjangKms ? ` (${report.panjangKms} KMS)` : ''
    }`,
    `----------------------------------------`,
    `*Detail Pekerjaan & Volume:*`,
    pekerjaanLines,
    `----------------------------------------`,
    `• *Realisasi Pemeliharaan:* ${formatPemeliharaanKms(realisasiPemeliharaanKms)} KMS`,
    `• *Titik Koordinat Awal:* ${report.koordinatAwal}`,
    `• *Titik Koordinat Akhir:* ${report.koordinatAkhir}`,
    `• *Jumlah Realisasi WO:* ${report.realisasiWo}`,
    `• *Jumlah Realisasi P0:* ${report.realisasiP0}`,
    `• *Temuan Butuh Padam:* ${report.temuanButuhPadam ?? 0}`,
    `• *Status Spreadsheet:* Tersimpan ke Sheet YANTEK (gid=896667653)`,
  ].join('\n');
}

export async function shareYantekReportViaWhatsApp(
  report: YantekRealisasiReport
): Promise<{ method: 'WEB_SHARE_FILE' | 'WHATSAPP_LINK' }> {
  const doc = buildYantekPdfDocument(report);
  const filename = getYantekPdfFilename(report);
  const pdfBlob = doc.output('blob');
  const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });
  const waText = buildYantekWhatsAppText(report);

  // Try native mobile Web Share API with the PDF file attached first
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      if (navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          title: `Laporan Realisasi Yantek - ${report.unitPelaksana}`,
          text: waText,
          files: [pdfFile],
        });
        return { method: 'WEB_SHARE_FILE' };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { method: 'WEB_SHARE_FILE' };
      }
      // Fall through to download PDF + WhatsApp URL
    }
  }

  // Fallback: Download the PDF file immediately AND open WhatsApp with the formatted report text
  doc.save(filename);

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;
  const anchor = document.createElement('a');
  anchor.href = waUrl;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  return { method: 'WHATSAPP_LINK' };
}

// ============================================================================
// REALISASI HAR VOLUME BASED (HVB) PDF & WHATSAPP EXPORT
// ============================================================================

export function buildHvbPdfDocument(report: HvbRealisasiReport): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(14, y, pageWidth - 28, 22, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('PT PLN (PERSERO) UIW SULSELRABAR - ULP SINJAI', 20, y + 8);

  doc.setFontSize(10);
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text('LAPORAN REALISASI HARIAN PEKERJAAN HAR VOLUME BASED (HVB)', 20, y + 15.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `No. Laporan: #HVB-${report.reportRowNumber} | ${report.timestampLaporan}`,
    pageWidth - 20,
    y + 15.5,
    { align: 'right' }
  );

  y += 28;

  // Section 1: Informasi Pelaksana & Segmen Jaringan
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, y, pageWidth - 28, 34, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('1. DATA TIM PELAKSANA HVB & SEGMEN JARINGAN (DATA_BASE)', 18, y + 7);

  doc.setFontSize(9);
  const leftXLabel = 18;
  const leftXVal = 58;
  const rightXLabel = 112;
  const rightXVal = 150;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Tim Pelaksana (HVB)', leftXLabel, y + 14);
  doc.text('Tanggal Realisasi', leftXLabel, y + 21);
  doc.text('Penyulang (Kolom A)', leftXLabel, y + 28);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`: ${report.unitPelaksana}`, leftXVal, y + 14);
  doc.text(`: ${report.tanggalLaporan}`, leftXVal, y + 21);
  doc.text(`: ${report.penyulang}`, leftXVal, y + 28);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Keypoint (Kolom B)', rightXLabel, y + 14);
  doc.text('Segmen Pekerjaan (C)', rightXLabel, y + 21);
  doc.text('Panjang Segmen (D)', rightXLabel, y + 28);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`: ${report.keypoint}`, rightXVal, y + 14);
  doc.text(`: ${report.segment}`, rightXVal, y + 21);
  doc.text(`: ${report.panjangKms ? `${report.panjangKms} KMS` : '-'}`, rightXVal, y + 28);

  y += 41;

  // Section 2: Tabel Detail Pekerjaan & Volume
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `2. DAFTAR DETAIL PEKERJAAN & VOLUME (${report.pekerjaanList.length} Item Pekerjaan)`,
    14,
    y
  );

  y += 4;

  doc.setFillColor(30, 41, 59);
  doc.rect(14, y, pageWidth - 28, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8.5);
  doc.text('NO', 18, y + 5.5);
  doc.text('DETAIL PEKERJAAN (KOLOM E DATA_BASE)', 30, y + 5.5);
  doc.text('VOLUME PEKERJAAN', pageWidth - 18, y + 5.5, { align: 'right' });

  y += 8;

  doc.setTextColor(15, 23, 42);
  let totalVolume = 0;

  report.pekerjaanList.forEach((item, idx) => {
    totalVolume += Number(item.volume) || 0;
    const wrappedText = doc.splitTextToSize(item.detailPekerjaan, pageWidth - 82);
    const rowHeight = Math.max(8, wrappedText.length * 5 + 3);

    if (y + rowHeight > 255) {
      doc.addPage();
      y = 20;
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, y, pageWidth - 28, rowHeight, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, y, pageWidth - 28, rowHeight, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.text(String(idx + 1), 18, y + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.text(wrappedText, 30, y + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.text(String(item.volume), pageWidth - 18, y + 5.5, { align: 'right' });

    y += rowHeight;
  });

  // Total Row
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.rect(14, y, pageWidth - 28, 8, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(6, 95, 70);
  doc.text('TOTAL VOLUME PEKERJAAN', 30, y + 5.5);
  doc.text(String(totalVolume), pageWidth - 18, y + 5.5, { align: 'right' });

  y += 15;

  if (y + 50 > 275) {
    doc.addPage();
    y = 20;
  }

  // Section 3: Titik Koordinat Lokasi & Realisasi Pemeliharaan
  const hvbPemeliharaanKms =
    report.realisasiPemeliharaanKms ??
    getRealisasiPemeliharaanDetails(report.pekerjaanList).realisasiPemeliharaanKms;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('3. TITIK KOORDINAT LOKASI & REALISASI PEMELIHARAAN HVB', 14, y);

  y += 4;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, y, pageWidth - 28, 27, 'FD');

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Titik Koordinat Awal', 18, y + 7);
  doc.text('Titik Koordinat Akhir', 18, y + 14);
  doc.text('Realisasi Pemeliharaan', 18, y + 21);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`: ${report.koordinatAwal}`, 62, y + 7);
  doc.text(`: ${report.koordinatAkhir}`, 62, y + 14);
  doc.setTextColor(6, 95, 70);
  doc.text(`: ${formatPemeliharaanKms(hvbPemeliharaanKms)} KMS`, 62, y + 21);

  y += 37;

  // Footer Signature
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Sinjai, ${report.tanggalLaporan}`, pageWidth - 20, y, { align: 'right' });
  doc.text('Tim Pelaksana HAR Volume Based,', pageWidth - 20, y + 5, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(report.unitPelaksana, pageWidth - 20, y + 22, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    'Dicetak otomatis dari Aplikasi SINJAI BENDERANG - Menu Realisasi HVB (Spreadsheet TEKNIK_SINJAI - Sheet HVB gid=1954293988)',
    14,
    285
  );

  return doc;
}

export function getHvbPdfFilename(report: HvbRealisasiReport): string {
  const safeUnit = report.unitPelaksana.replace(/[^A-Z0-9]+/gi, '_');
  const safeSeg = report.segment.replace(/[^A-Z0-9]+/gi, '_');
  return `LAPORAN_HVB_${safeUnit}_${safeSeg}_${report.tanggalLaporan}.pdf`;
}

export function downloadHvbReportPdf(report: HvbRealisasiReport): void {
  const doc = buildHvbPdfDocument(report);
  const filename = getHvbPdfFilename(report);
  doc.save(filename);
}

export function buildHvbWhatsAppText(report: HvbRealisasiReport): string {
  const pekerjaanLines = report.pekerjaanList
    .map((p, idx) => `   ${idx + 1}. ${p.detailPekerjaan} — *Volume: ${p.volume}*`)
    .join('\n');
  const realisasiPemeliharaanKms =
    report.realisasiPemeliharaanKms ??
    getRealisasiPemeliharaanDetails(report.pekerjaanList).realisasiPemeliharaanKms;

  return [
    `*LAPORAN REALISASI HARIAN HAR VOLUME BASED (HVB)*`,
    `*PLN ULP SINJAI — ${report.unitPelaksana}*`,
    `----------------------------------------`,
    `• *Tanggal / Waktu:* ${report.tanggalLaporan} (${report.timestampLaporan})`,
    `• *Tim Pelaksana:* ${report.unitPelaksana}`,
    `• *Penyulang (Kolom A):* ${report.penyulang}`,
    `• *Keypoint (Kolom B):* ${report.keypoint}`,
    `• *Segmen Pekerjaan (Kolom C):* ${report.segment}${
      report.panjangKms ? ` (${report.panjangKms} KMS)` : ''
    }`,
    `----------------------------------------`,
    `*Detail Pekerjaan & Volume:*`,
    pekerjaanLines,
    `----------------------------------------`,
    `• *Realisasi Pemeliharaan:* ${formatPemeliharaanKms(realisasiPemeliharaanKms)} KMS`,
    `• *Titik Koordinat Awal:* ${report.koordinatAwal}`,
    `• *Titik Koordinat Akhir:* ${report.koordinatAkhir}`,
    `• *Status Spreadsheet:* Tersimpan ke Sheet HVB (gid=1954293988)`,
  ].join('\n');
}

export async function shareHvbReportViaWhatsApp(
  report: HvbRealisasiReport
): Promise<{ method: 'WEB_SHARE_FILE' | 'WHATSAPP_LINK' }> {
  const doc = buildHvbPdfDocument(report);
  const filename = getHvbPdfFilename(report);
  const pdfBlob = doc.output('blob');
  const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });
  const waText = buildHvbWhatsAppText(report);

  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      if (navigator.canShare({ files: [pdfFile] })) {
        await navigator.share({
          title: `Laporan Realisasi HVB - ${report.unitPelaksana}`,
          text: waText,
          files: [pdfFile],
        });
        return { method: 'WEB_SHARE_FILE' };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return { method: 'WEB_SHARE_FILE' };
      }
    }
  }

  doc.save(filename);

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(waText)}`;
  const anchor = document.createElement('a');
  anchor.href = waUrl;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  return { method: 'WHATSAPP_LINK' };
}

