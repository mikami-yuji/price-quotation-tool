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
      const headerRow = rows.find(r => r.includes('受注№') || r.includes('種別'));
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
        for (let i = sellIdx - 1; i >= Math.max(0, sellIdx - 8); i--) {
          const s = String(row[i]);
          if (s.includes('ｍ') || s.includes('枚') || s.includes('m')) {
            shape = (s.includes('ｍ') || s.includes('m')) ? 'R' : '単袋';
            minQuantity = parseFloat(s.replace(/[^0-9]/g, '')) || 0;
            break;
          }
        }
        const colorPrices: { [key: number]: SPMasterPrice } = {};
        let foundColors = 0;
        for (let c = sellIdx + 1; c < Math.min(row.length, sellIdx + 20); c++) {
          const uru = parseFloat(String(row[c]).replace(/[^\d.]/g, ''));
          if (!isNaN(uru) && uru > 1) {
            foundColors++;
            const junD = parseFloat(String(rows[r + 1] ? rows[r + 1][c] : '').replace(/[^\d.]/g, '')) || uru;
            const d = parseFloat(String(rows[r + 2] ? rows[r + 2][c] : '').replace(/[^\d.]/g, '')) || uru;
            colorPrices[foundColors] = { uru, junD, d };
            if (foundColors >= 4) break;
            c += 3;
          }
        }
        if (Object.keys(colorPrices).length > 0 && currentCatalogNos.length > 0) {
          results.push({ catalogNos: [...currentCatalogNos], weight: currentWeight, shape, minQuantity, colorPrices, materialHint });
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
  const idx = { code: getIdx(['商品CD', '商品コード', 'ABS']), minQty: getIdx(['個数', '最小数量', '数量', '枚数']), uru: getIdx(['売単価', 'うる', '通常', '標準']), junD: getIdx(['準Ｄ', '準D']), d: getIdx(['Ｄ単価', 'D単価', 'バラ', 'D']) };
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
    results.push({ productCode: code, absCode: code.replace(/\s+/g, ''), minQuantity: minQty, campaign: { uru, junD, d }, normal: { uru, junD, d } });
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
    for (let i = 1; i <= 4; i++) {
      const price = parseFloat(String(row[i + 1]));
      if (!isNaN(price)) colorPrices[i] = price;
    }
    matrix.push({ materialName, weight, colorPrices });
  }
  return matrix;
};

const mapRowArrayToOrderRecord = (row: any[], header: any[]): OrderRecord => {
  const getIdx = (keywords: string[]) => header.findIndex(c => keywords.some(k => String(c).includes(k)));
  const idxMap = { orderNumber: getIdx(['受注№', '受注番号']), category: getIdx(['種別']), productCode: getIdx(['商品コード', '商品CD']), productName: getIdx(['商品名']), quantity: getIdx(['受注数']), currentPrice: getIdx(['単価']), salesGroup: getIdx(['営G']), weight: getIdx(['重量', '㎏']), shape: getIdx(['形状']) };
  const val = (idx: number) => (idx !== -1 ? row[idx] : '');
  return {
    category: String(val(idxMap.category) || '既製品').trim(), orderNumber: String(val(idxMap.orderNumber)), productCode: String(val(idxMap.productCode)), absCode: String(val(idxMap.productCode)).replace(/\s+/g, ''), productName: String(val(idxMap.productName)), quantity: Number(val(idxMap.quantity)) || 0, currentPrice: Number(val(idxMap.currentPrice)) || 0, salesGroup: Number(val(idxMap.salesGroup)) || 0, weight: Number(val(idxMap.weight)) || 0, shape: String(val(idxMap.shape)), materialName: '', title: '', printingCost: 0, printingSalesGroup: 0, frontColorCount: 0, backColorCount: 0, totalColorCount: 0, janCode: '', directDeliveryCode: '', directDeliveryName: '', lastOrderDate: '', printCode: '', designName: ''
  };
};
