/**
 * Generación de reportes Excel con ExcelJS.
 * Las celdas de totales usan FÓRMULAS reales (SUM, IF, SUMIF) con su resultado precalculado,
 * así el reporte se puede auditar en Excel y los valores cuadran con la API.
 */
import ExcelJS from 'exceljs';
import { env } from '../../config/env.js';
import { query } from '../../database/pool.js';
import { monthRange } from '../../utils/dates.js';
import { fromCents, toCents } from '../../utils/money.js';
import * as analyticsService from '../analytics/analytics.service.js';
import * as budgetsService from '../budgets/budgets.service.js';
import {
  MONEY_FMT,
  PCT_FMT,
  STATUS_LABEL,
  addTitle,
  labelValue,
  levelFill,
  safeFilename,
  safeText,
  styleHeaderRow,
  styleTotalRow,
  trafficLight,
} from './excelStyles.js';

function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SmartBudget API';
  wb.created = new Date();
  return wb;
}

function statusFormula(pctCell) {
  return `IF(${pctCell}>=1,"${STATUS_LABEL.EXCEEDED}",IF(${pctCell}>=0.8,"${STATUS_LABEL.WARNING}","${STATUS_LABEL.OK}"))`;
}

// ---------------------------------------------------------------------------
// Reporte de un presupuesto
// ---------------------------------------------------------------------------
export async function budgetReport(userId, budgetId, { groupBy, asOf }) {
  const a = await budgetsService.analyzeWithTransactions(userId, budgetId, { groupBy, asOf });
  const wb = newWorkbook();

  // Orden de las hojas en el libro
  const res = wb.addWorksheet('Resumen');
  const des = wb.addWorksheet('Desglose');
  const mov = wb.addWorksheet('Movimientos');
  const al = wb.addWorksheet('Alertas');

  // ---- Hoja Movimientos ----
  mov.columns = [
    { header: 'Fecha', key: 'date', width: 14 },
    { header: 'Descripción', key: 'description', width: 45 },
    { header: 'Monto', key: 'amount', width: 18, style: { numFmt: MONEY_FMT } },
  ];
  styleHeaderRow(mov.getRow(1));
  for (const t of a.transactions) {
    mov.addRow({ date: t.date, description: safeText(t.description), amount: fromCents(t.amountCents) });
  }
  const lastMovRow = a.transactions.length + 1;
  const sumRange = `Movimientos!C2:C${Math.max(lastMovRow, 2)}`;
  const movTotal = mov.addRow({
    description: 'TOTAL',
    amount: { formula: `SUM(C2:C${Math.max(lastMovRow, 2)})`, result: a.summary.spent },
  });
  styleTotalRow(movTotal);
  mov.autoFilter = { from: 'A1', to: `C${Math.max(lastMovRow, 1)}` };
  mov.views = [{ state: 'frozen', ySplit: 1 }];

  // ---- Hoja Resumen ----
  res.columns = [{ width: 34 }, { width: 26 }];
  addTitle(res, `Reporte de presupuesto · ${a.budget.categoryName}`, `Generado el ${new Date().toISOString().slice(0, 10)} por SmartBudget API`);

  labelValue(res, 4, 'Categoría', a.budget.categoryName);
  labelValue(res, 5, 'Periodo', `${a.period.start} a ${a.period.end}`);
  labelValue(res, 6, 'Fecha de análisis', a.period.asOf);
  labelValue(res, 7, 'Días transcurridos', `${a.period.elapsedDays} de ${a.period.totalDays}`);

  labelValue(res, 9, 'Límite', a.summary.limit, MONEY_FMT);
  labelValue(res, 10, 'Gastado', { formula: `SUM(${sumRange})`, result: a.summary.spent }, MONEY_FMT);
  labelValue(res, 11, 'Disponible', { formula: 'B9-B10', result: a.summary.remaining }, MONEY_FMT);
  labelValue(res, 12, '% consumido', { formula: 'IF(B9=0,0,B10/B9)', result: a.summary.percentageUsed / 100 }, PCT_FMT);
  labelValue(res, 13, 'Estado', { formula: statusFormula('B12'), result: STATUS_LABEL[a.summary.status] });
  trafficLight(res, 'B12');

  labelValue(res, 15, 'Promedio diario de gasto', a.pace.dailyAverage, MONEY_FMT);
  labelValue(res, 16, 'Proyección al final del periodo', a.pace.projectedSpend, MONEY_FMT);
  labelValue(res, 17, '% proyectado', a.pace.projectedPercentage / 100, PCT_FMT);
  labelValue(res, 18, 'Gasto máximo recomendado por día', a.pace.recommendedDailySpend ?? 'N/A', MONEY_FMT);
  labelValue(res, 19, 'Fecha estimada de agotamiento', a.pace.estimatedExhaustionDate ?? 'No se agota en el periodo');
  trafficLight(res, 'B17');

  res.getCell('A21').value = 'Mensajes y avisos';
  res.getCell('A21').font = { bold: true, size: 13 };
  a.messages.forEach((m, i) => {
    const row = res.getRow(22 + i);
    row.getCell(1).value = m.level;
    row.getCell(1).fill = levelFill(m.level);
    row.getCell(2).value = m.message;
    res.mergeCells(`B${22 + i}:F${22 + i}`);
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    row.height = 32;
  });

  res.getCell(`A${23 + a.messages.length}`).value =
    'Nota: la proyección es orientativa y se basa en el ritmo de gasto del periodo actual.';
  res.getCell(`A${23 + a.messages.length}`).font = { italic: true, color: { argb: 'FF666666' } };

  // ---- Hoja Desglose ----
  des.columns = [
    { header: 'Periodo', key: 'label', width: 34 },
    { header: 'Desde', key: 'from', width: 13 },
    { header: 'Hasta', key: 'to', width: 13 },
    { header: 'Gastado', key: 'spent', width: 18, style: { numFmt: MONEY_FMT } },
    { header: '% del límite', key: 'pct', width: 14, style: { numFmt: PCT_FMT } },
    { header: 'Movimientos', key: 'count', width: 13 },
  ];
  styleHeaderRow(des.getRow(1));
  for (const b of a.breakdown.items) {
    des.addRow({ label: b.label, from: b.from, to: b.to, spent: b.spent, pct: b.percentageOfLimit / 100, count: b.transactionCount });
  }
  const lastDes = a.breakdown.items.length + 1;
  styleTotalRow(
    des.addRow({
      label: 'TOTAL',
      spent: { formula: `SUM(D2:D${lastDes})`, result: a.summary.spent },
      pct: { formula: `SUM(E2:E${lastDes})`, result: a.summary.percentageUsed / 100 },
      count: { formula: `SUM(F2:F${lastDes})`, result: a.summary.transactionCount },
    }),
  );

  // ---- Hoja Alertas ----
  al.columns = [
    { header: 'Fecha', key: 'date', width: 22 },
    { header: 'Tipo', key: 'type', width: 20 },
    { header: 'Mensaje', key: 'message', width: 80 },
    { header: 'Leída', key: 'read', width: 8 },
  ];
  styleHeaderRow(al.getRow(1));
  for (const alert of a.alerts) {
    al.addRow({
      date: new Date(alert.createdAt).toISOString().replace('T', ' ').slice(0, 19),
      type: alert.type,
      message: alert.message,
      read: alert.read ? 'Sí' : 'No',
    });
  }
  if (a.alerts.length === 0) al.addRow({ message: 'Sin alertas generadas para este presupuesto.' });

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `${safeFilename('presupuesto', a.budget.categoryName, a.period.start) || 'presupuesto'}.xlsx`;
  return { buffer, filename };
}

// ---------------------------------------------------------------------------
// Reporte mensual general
// ---------------------------------------------------------------------------
export async function monthlyReport(userId, { month }) {
  const { start, end } = monthRange(month);
  const [summary, dist, budgets, { rows: txRows }, { rows: alertRows }] = await Promise.all([
    analyticsService.monthly(userId, { month }),
    analyticsService.categories(userId, { from: start, to: end, type: 'EXPENSE' }),
    budgetsService.listOverlapping(userId, start, end),
    query(
      `SELECT t.date, t.type, c.name AS category, t.description, t.amount::text
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1 AND t.date BETWEEN $2 AND $3
       ORDER BY t.date, t.created_at`,
      [userId, start, end],
    ),
    query(
      `SELECT type, message, read_at, created_at FROM alerts
       WHERE user_id = $1 AND (created_at AT TIME ZONE $4)::date BETWEEN $2 AND $3
       ORDER BY created_at`,
      [userId, start, end, env.APP_TIMEZONE],
    ),
  ]);

  const wb = newWorkbook();

  const res = wb.addWorksheet('Resumen');
  const cat = wb.addWorksheet('Por categoría');
  const bud = wb.addWorksheet('Presupuestos');
  const mov = wb.addWorksheet('Movimientos');
  const al = wb.addWorksheet('Alertas');

  // ---- Movimientos ----
  mov.columns = [
    { header: 'Fecha', key: 'date', width: 13 },
    { header: 'Tipo', key: 'type', width: 10 },
    { header: 'Categoría', key: 'category', width: 22 },
    { header: 'Descripción', key: 'description', width: 42 },
    { header: 'Monto', key: 'amount', width: 18, style: { numFmt: MONEY_FMT } },
  ];
  styleHeaderRow(mov.getRow(1));
  for (const t of txRows) {
    mov.addRow({
      date: t.date,
      type: t.type,
      category: safeText(t.category),
      description: safeText(t.description),
      amount: fromCents(toCents(t.amount)),
    });
  }
  const last = Math.max(txRows.length + 1, 2);
  mov.autoFilter = { from: 'A1', to: `E${Math.max(txRows.length + 1, 1)}` };
  mov.views = [{ state: 'frozen', ySplit: 1 }];

  // ---- Resumen ----
  res.columns = [{ width: 30 }, { width: 22 }];
  addTitle(res, `Reporte financiero · ${month}`, `Periodo ${start} a ${end}`);
  labelValue(res, 4, 'Ingresos', { formula: `SUMIF(Movimientos!B2:B${last},"INCOME",Movimientos!E2:E${last})`, result: summary.income }, MONEY_FMT);
  labelValue(res, 5, 'Gastos', { formula: `SUMIF(Movimientos!B2:B${last},"EXPENSE",Movimientos!E2:E${last})`, result: summary.expense }, MONEY_FMT);
  labelValue(res, 6, 'Balance', { formula: 'B4-B5', result: summary.balance }, MONEY_FMT);
  labelValue(
    res,
    7,
    'Tasa de ahorro',
    { formula: 'IF(B4=0,"N/A",B6/B4)', result: summary.savingsRate === null ? 'N/A' : summary.savingsRate / 100 },
    PCT_FMT,
  );
  labelValue(res, 8, 'Gasto promedio diario', summary.dailyAverageExpense, MONEY_FMT);
  labelValue(res, 9, 'Número de movimientos', summary.transactionCount);

  // ---- Por categoría ----
  cat.columns = [
    { header: 'Categoría', key: 'name', width: 24 },
    { header: 'Total', key: 'total', width: 18, style: { numFmt: MONEY_FMT } },
    { header: '% del gasto', key: 'pct', width: 14, style: { numFmt: PCT_FMT } },
    { header: 'Movimientos', key: 'count', width: 13 },
  ];
  styleHeaderRow(cat.getRow(1));
  for (const c of dist.categories) {
    cat.addRow({ name: c.categoryName, total: c.total, pct: c.percentage / 100, count: c.transactionCount });
  }
  styleTotalRow(
    cat.addRow({
      name: 'TOTAL',
      total: { formula: `SUM(B2:B${dist.categories.length + 1})`, result: dist.total },
    }),
  );

  // ---- Presupuestos ----
  bud.columns = [
    { header: 'Categoría', key: 'name', width: 22 },
    { header: 'Periodo', key: 'period', width: 25 },
    { header: 'Límite', key: 'limit', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'Gastado', key: 'spent', width: 16, style: { numFmt: MONEY_FMT } },
    { header: 'Disponible', key: 'remaining', width: 16, style: { numFmt: MONEY_FMT } },
    { header: '% consumido', key: 'pct', width: 14, style: { numFmt: PCT_FMT } },
    { header: 'Estado', key: 'status', width: 14 },
  ];
  styleHeaderRow(bud.getRow(1));
  budgets.forEach((b, i) => {
    const r = i + 2;
    bud.addRow({
      name: b.categoryName,
      period: `${b.periodStart} a ${b.periodEnd}`,
      limit: b.amountLimit,
      spent: b.spent,
      remaining: { formula: `C${r}-D${r}`, result: b.remaining },
      pct: { formula: `IF(C${r}=0,0,D${r}/C${r})`, result: b.percentageUsed / 100 },
      status: { formula: statusFormula(`F${r}`), result: STATUS_LABEL[b.status] },
    });
  });
  if (budgets.length > 0) trafficLight(bud, `F2:F${budgets.length + 1}`);
  else bud.addRow({ name: 'Sin presupuestos en este mes' });

  // ---- Alertas del mes ----
  al.columns = [
    { header: 'Fecha', key: 'date', width: 22 },
    { header: 'Tipo', key: 'type', width: 20 },
    { header: 'Mensaje', key: 'message', width: 90 },
    { header: 'Leída', key: 'read', width: 8 },
  ];
  styleHeaderRow(al.getRow(1));
  for (const a of alertRows) {
    al.addRow({
      date: new Date(a.created_at).toISOString().replace('T', ' ').slice(0, 19),
      type: a.type,
      message: safeText(a.message),
      read: a.read_at ? 'Sí' : 'No',
    });
  }
  if (alertRows.length === 0) al.addRow({ message: 'Sin alertas en este mes.' });

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer, filename: `reporte-${month}.xlsx` };
}
