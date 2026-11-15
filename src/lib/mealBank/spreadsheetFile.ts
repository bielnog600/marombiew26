/**
 * Leitura/gravação do arquivo da planilha no navegador (SheetJS, carregado
 * só quando usado). Regras de conteúdo ficam em ./spreadsheet.
 */
import type { SheetInput } from './spreadsheet';

const loadXlsx = () => import('xlsx');

/** Texto de CSV: UTF-8 e, se vier com caracteres inválidos, Windows-1252 (Excel em PT). */
export const decodeCsvBytes = (bytes: ArrayBuffer): string => {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('\uFFFD')) return utf8.replace(/^\uFEFF/, '');
  try { return new TextDecoder('windows-1252').decode(bytes); } catch { return utf8; }
};

export const csvSeparator = (textValue: string): string => {
  const first = textValue.split(/\r?\n/, 1)[0] ?? '';
  const counts = [';', ',', '\t'].map((s) => [s, first.split(s).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
};

export const readBankFile = async (file: File): Promise<SheetInput[]> => {
  const XLSX = await loadXlsx();
  const buffer = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  const wb = isCsv
    ? (() => {
        const textValue = decodeCsvBytes(buffer);
        return XLSX.read(textValue, { type: 'string', FS: csvSeparator(textValue), raw: true });
      })()
    : XLSX.read(buffer, { type: 'array' });
  return wb.SheetNames.map((name) => ({
    // CSV vira uma aba só: tratada como "Refeições".
    name: isCsv ? 'Refeições' : name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '' }),
  }));
};

const COL_WIDTHS: Record<string, number[]> = {
  'Refeições': [8, 16, 40, 8, 24, 70, 7, 12, 10, 12, 60],
  Ingredientes: [8, 16, 40, 32, 9, 7, 12, 10, 12],
  'Alimentos usados': [36, 10, 14, 11, 13],
};

export const downloadBankWorkbook = async (sheets: SheetInput[], fileName: string): Promise<void> => {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows as unknown[][]);
    const widths = COL_WIDTHS[s.name];
    if (widths) ws['!cols'] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  XLSX.writeFile(wb, fileName, { compression: true });
};
