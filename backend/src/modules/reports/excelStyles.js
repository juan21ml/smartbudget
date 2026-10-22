/** Estilos y utilidades compartidas por los reportes Excel. */

export const MONEY_FMT = '"$"#,##0.00';
export const PCT_FMT = '0.00%';

export const COLORS = {
  primary: 'FF1F4E79',
  header: 'FFDCE6F1',
  ok: 'FFC6EFCE',
  okText: 'FF006100',
  warning: 'FFFFEB9C',
  warningText: 'FF9C5700',
  danger: 'FFFFC7CE',
  dangerText: 'FF9C0006',
};

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

export function addTitle(ws, title, subtitle) {
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: COLORS.primary } };
  ws.getCell('A2').value = subtitle;
  ws.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };
}

export function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.primary } };
    cell.fill = fill(COLORS.header);
    cell.border = { bottom: { style: 'thin', color: { argb: COLORS.primary } } };
    cell.alignment = { vertical: 'middle' };
  });
}

export function styleTotalRow(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.border = { top: { style: 'thin' } };
  });
}

export function labelValue(ws, rowNumber, label, value, numFmt) {
  const row = ws.getRow(rowNumber);
  row.getCell(1).value = label;
  row.getCell(1).font = { bold: true };
  row.getCell(2).value = value;
  if (numFmt) row.getCell(2).numFmt = numFmt;
  return row;
}

/** Semáforo sobre una celda de porcentaje (fracción): verde < 80 %, amarillo 80–99 %, rojo ≥ 100 %. */
export function trafficLight(ws, ref) {
  ws.addConditionalFormatting({
    ref,
    rules: [
      { type: 'cellIs', operator: 'greaterThanOrEqual', formulae: ['1'], priority: 1,
        style: { fill: fill(COLORS.danger), font: { color: { argb: COLORS.dangerText }, bold: true } } },
      { type: 'cellIs', operator: 'between', formulae: ['0.8', '0.99999'], priority: 2,
        style: { fill: fill(COLORS.warning), font: { color: { argb: COLORS.warningText }, bold: true } } },
      { type: 'cellIs', operator: 'lessThan', formulae: ['0.8'], priority: 3,
        style: { fill: fill(COLORS.ok), font: { color: { argb: COLORS.okText }, bold: true } } },
    ],
  });
}

export function levelFill(level) {
  if (level === 'DANGER') return fill(COLORS.danger);
  if (level === 'WARNING') return fill(COLORS.warning);
  return fill(COLORS.ok);
}

/** Nombre de archivo seguro para el encabezado Content-Disposition (solo ASCII). */
export function safeFilename(...parts) {
  return parts
    .join('-')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

/**
 * Evita la "inyección de fórmulas" (CSV/Excel injection): si un texto del usuario
 * empieza con = + - @ se antepone un apóstrofo para que Excel lo trate como texto.
 */
export function safeText(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

export const STATUS_LABEL = { OK: 'En control', WARNING: 'Advertencia', EXCEEDED: 'Excedido' };
