import * as XLSX from 'xlsx';
import { OrderRecord, CustomPriceMatrixRow, ReadymadeMasterRow, SPMasterRow, SPMasterPrice } from '../types';

export const parseExcelFile = (arrayBuffer: ArrayBuffer): { 
  orders: OrderRecord[], 
  priceMatrix: CustomPriceMatrixRow[],
  readymadeMaster: ReadymadeMasterRow[]
} => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const orders: OrderRecord[] = [];
  const priceMatrix: CustomPriceMatrixRow[] = [];
  const readymadeMaster: ReadymadeMasterRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
    if (sheetName.includes('既製品') || sheetName.includes('価格表') || sheetName.includes('マスター') || sheetName.toUpperCase().includes('READYMADE')) {
      readymadeMaster.push(...parseReadymadeMaster(rows));
    } else if (sheetName.includes('別注') || sheetName.includes('単価表')) {
      priceMatrix.push(...parsePriceMatrix(rows));
    } else if (rows.length > 0) {
      const headerRow = rows.find(r => Array.isArray(r) && (r.includes('受注№') || r.includes('種別')));
      if (headerRow) {
        const headerIdx = rows.indexOf(headerRow);
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const order = mapRowArrayToOrderRecord(rows[i], headerRow);
          if (order.orderNumber) orders.push(order);
        }
      }
    }
  }
  return { orders, priceMatrix, readymadeMaster };
};

export const parseSPMasterFile = (arrayBuffer: ArrayBuffer): SPMasterRow[] => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const results: SPMasterRow[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
    const materialHint = name.replace(/^\d+_/, '').trim();
    let currentCatalogNos: string[] = [];
    let currentWeight = 0;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      const firstCol = String(row[0] || '').trim();
      if (firstCol && /^\d+/.test(firstCol) && !firstCol.includes('【') && !firstCol.includes('セレクト')) {
        currentCatalogNos = firstCol.split(/[\r\n\s・/]+/).map(s => s.trim()).filter(Boolean);
      }
      const sellIndices: number[] = [];
      row.forEach((cell, idx) => { if (String(cell).trim() === '売') sellIndices.push(idx); });
      for (const sellIdx of sellIndices) {
        let weight = 0;
        for (let i = sellIdx - 1; i >= Math.max(0, sellIdx - 10); i--) {
          const val = parseFloat(String(row[i]).replace(/[^\d.]/g, ''));
          if (!isNaN(val) && val > 0 && val < 100) { weight = val; break; }
        }
        if (weight > 0) currentWeight = weight;
        let minQuantity = 0;
        let shape: 'R' | '単袋' = 'R';
        for (let i = sellIdx - 1; i >= 0; i--) {
          const t = String(row[i] || '').trim();
          if (t.includes('単袋')) shape = '単袋';
          else if (t.includes('R')) shape = 'R';
          const q = parseInt(t.replace(/[^\d]/g, ''));
          if (!isNaN(q) && q >= 100) { minQuantity = q; break; }
        }
        if (currentCatalogNos.length > 0 && minQuantity > 0) {
          const colorPrices: { [key: number]: SPMasterPrice } = {};
          // 色数は7色目まで取得するように拡大
          for (let c = 1; c <= 7; c++) {
            const price = parseFloat(String(row[sellIdx + c]));
            if (!isNaN(price) && price > 0) {
              colorPrices[c] = { uru: price, junD: price, d: price };
            }
          }
          results.push({
            catalogNos: [...currentCatalogNos],
            weight: currentWeight,
            shape,
            minQuantity,
            colorPrices,
            materialHint
          });
        }
      }
    }
  }
  return results;
};

const parseReadymadeMaster = (rows: any[]): ReadymadeMasterRow[] => {
  const results: ReadymadeMasterRow[] = [];
  const header = rows[0] || [];
  const getIdx = (keywords: string[]) => header.findIndex((c: any) => keywords.some(k => String(c).includes(k)));
  const idx = { code: getIdx(['SP@', 'PP@m', 'ABS']), minQty: getIdx(['個数', '最小数量', '数量', '枚数']), uru: getIdx(['売単価', 'うる', '通常', '標準']), junD: getIdx(['準Ｄ', '準D']), d: getIdx(['Ｄ単価', 'D単価', 'バラ', 'D']) };
  if (idx.code === -1) return [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = String(row[idx.code] || '').trim();
    if (!code) continue;
    const minQty = parseInt(String(row[idx.minQty] || '0')) || 0;
    const uru = parseFloat(String(row[idx.uru] || '0')) || 0;
    const junD = parseFloat(String(row[idx.junD] || '0')) || uru;
    const d = parseFloat(String(row[idx.d] || '0')) || uru;
    if (uru === 0) continue;
    results.push({ productCode: code, absCode: code, minQuantity: minQty, normal: { uru, junD, d }, campaign: { uru, junD, d } });
  }
  return results;
};

const parsePriceMatrix = (rows: any[]): CustomPriceMatrixRow[] => {
  const matrix: CustomPriceMatrixRow[] = [];
  for (const row of rows) {
    if (row.length < 5) continue;
    const materialName = String(row[0] || '').trim();
    const weight = parseFloat(String(row[1]));
    if (!materialName || isNaN(weight)) continue;
    const colorPrices: { [key: number]: number } = {};
    for (let i = 1; i <= 7; i++) {
      const price = parseFloat(String(row[i + 1]));
      if (!isNaN(price)) colorPrices[i] = price;
    }
    matrix.push({ materialName, weight, colorPrices });
  }
  return matrix;
};

const mapRowArrayToOrderRecord = (row: any[], header: any[]): OrderRecord => {
  const getIdx = (keywords: string[]) => header.findIndex((c: any) => keywords.some(k => String(c).includes(k)));
  const idxMap = {
    orderNumber: getIdx(['受注№', '受注番号']),
    category: getIdx(['種別']),
    productCode: getIdx(['商品コード', '商品CD']),
    productName: getIdx(['商品名', '品名', '規格名', '摘要']),
    quantity: getIdx(['受注数', '数量', '個数']),
    currentPrice: getIdx(['単価']),
    salesGroup: getIdx(['営G']),
    weight: getIdx(['重量', '㎏', 'kg']),
    shape: getIdx(['形状']),
    materialName: getIdx(['材質', '材質名称']),
    printCode: getIdx(['印刷コード', '印CD', '印コード']),
    frontColorCount: getIdx(['表色数']),
    backColorCount: getIdx(['裏色数']),
    totalColorCount: getIdx(['色数', '総色数']),
    printingCost: getIdx(['印刷代']),
    printingSalesGroup: getIdx(['印刷営G']),
    janCode: getIdx(['JAN']),
    directDeliveryCode: getIdx(['直送先コード', '直送先CD']),
    directDeliveryName: getIdx(['直送先']),
    lastOrderDate: getIdx(['最終受注日']),
    designName: getIdx(['デザイン名']),
    title: getIdx(['タイトル'])
  };

  const val = (idx: number) => (idx !== -1 ? row[idx] : '');
  const num = (idx: number) => {
    const v = val(idx);
    return v === '' ? 0 : Number(String(v).replace(/[^\d.]/g, '')) || 0;
  };

  const pCode = String(val(idxMap.productCode));

  return {
    category: String(val(idxMap.category) || '既製品').trim(),
    orderNumber: String(val(idxMap.orderNumber)),
    productCode: pCode,
    absCode: pCode.replace(/\s+/g, ''),
    productName: String(val(idxMap.productName)),
    materialName: String(val(idxMap.materialName)),
    printCode: String(val(idxMap.printCode)),
    quantity: num(idxMap.quantity),
    currentPrice: num(idxMap.currentPrice),
    salesGroup: num(idxMap.salesGroup),
    weight: num(idxMap.weight),
    shape: String(val(idxMap.shape)),
    frontColorCount: num(idxMap.frontColorCount),
    backColorCount: num(idxMap.backColorCount),
    totalColorCount: num(idxMap.totalColorCount),
    printingCost: num(idxMap.printingCost),
    printingSalesGroup: num(idxMap.printingSalesGroup),
    janCode: String(val(idxMap.janCode)),
    directDeliveryCode: String(val(idxMap.directDeliveryCode)),
    directDeliveryName: String(val(idxMap.directDeliveryName)),
    lastOrderDate: String(val(idxMap.lastOrderDate)),
    designName: String(val(idxMap.designName)),
    title: String(val(idxMap.title))
  };
};
