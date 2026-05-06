import * as XLSX from 'xlsx';
import { OrderRecord, CustomPriceMatrixRow, ReadymadeMasterRow, SPMasterRow } from '../types';

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
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (sheetName.includes('既製品') || sheetName.includes('価格表') || sheetName.includes('マスター') || sheetName.toUpperCase().includes('READYMADE')) {
      readymadeMaster.push(...parseReadymadeMaster(rows));
    } else if (sheetName.includes('別注') || sheetName.includes('単価表')) {
      priceMatrix.push(...parsePriceMatrix(rows));
    } else if (rows.length > 0) {
      const headerRow = rows.find(r => Array.isArray(r) && (r.includes('受注№') || r.includes('種別'))) as unknown[] | undefined;
      if (headerRow) {
        const headerIdx = rows.indexOf(headerRow);
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const order = mapRowArrayToOrderRecord(rows[i] as unknown[], headerRow);
          if (order.orderNumber) orders.push(order);
        }
      }
    }
  }
  return { orders, priceMatrix, readymadeMaster };
};

const getSPRowType = (val: string): 'uru' | 'junD' | 'd' | null => {
  const v = String(val || '').trim();
  if (v.includes('売') || v.includes('通常') || v.includes('うる')) return 'uru';
  if (v.includes('準')) return 'junD';
  if (v.includes('Ｄ') || v.includes('D') || v.includes('バラ')) return 'd';
  return null;
};

export type SPParseResult = {
  data: SPMasterRow[];
  diagnostics: string[];
};

export const parseSPMasterFile = (arrayBuffer: ArrayBuffer): SPParseResult => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const spMaster: SPMasterRow[] = [];
  const diagnostics: string[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (rows.length === 0) continue;

    let sheetRecordCount = 0;
    const colorLabelMap: { [col: number]: number } = {};
    
    // シート全体のカラーラベル位置を特定 (より緩やかに)
    for (let r = 0; r < Math.min(rows.length, 200); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      row.forEach((cell, c) => {
        const v = String(cell || '').trim().replace(/[０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
        // "1色", "１色", "1色印刷", "2色ロール" 等にマッチ
        const m = v.match(/([1-8])色/);
        if (m) colorLabelMap[c] = parseInt(m[1]);
        else if (/^[1-8]$/.test(v)) colorLabelMap[c] = parseInt(v); // 単なる数字
      });
    }

    let lastCatalogNos: string[] = [];
    let lastWeight = 0;
    let lastShape: 'R' | '単袋' | null = null;
    let lastMinQty = 0;
    let lastUnit: 'm' | 'pcs' = 'm';

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] as unknown[];
      if (!Array.isArray(row)) continue;

      const currentCatalogNos: string[] = [];
      let currentWeight = 0;
      let currentShape: 'R' | '単袋' | null = null;
      let currentMinQty = 0;
      let currentUnit: 'm' | 'pcs' = 'm';

      for (let c = 0; c < Math.min(row.length, 25); c++) {
        const val = String(row[c] || '').trim().replace(/[０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0)).replace(/[ｋＫ㎏]/g, 'k');
        if (!val) continue;

        // カタログNo
        val.split(/[\n\s,、]+/).forEach(x => {
          const clean = x.replace(/[△▲]/g, '').trim();
          if (/^\d{3,4}$/.test(clean)) currentCatalogNos.push(clean);
        });
        // 重量
        const wMatch = val.match(/^(\d+(?:\.\d+)?)\s*k?$/i);
        if (wMatch) currentWeight = parseFloat(wMatch[1]);
        // 形状
        if (val.includes('単袋')) currentShape = '単袋';
        else if (val.includes('R') || val.includes('ロール')) currentShape = 'R';
        // 最小数量
        const qMatch = val.match(/(?:約|以上)?\s*(\d+)\s*(ｍ|m|枚)?(～|~)?$/);
        if (qMatch && !val.includes('k')) {
          currentMinQty = parseInt(qMatch[1]);
          currentUnit = (qMatch[2] === '枚' ? 'pcs' : 'm');
          if (qMatch[2] === '枚') currentShape = '単袋';
        }
      }

      if (currentCatalogNos.length > 0) lastCatalogNos = [...currentCatalogNos];
      if (currentWeight > 0) lastWeight = currentWeight;
      if (currentShape) lastShape = currentShape;
      if (currentMinQty > 0) { lastMinQty = currentMinQty; lastUnit = currentUnit; }

      const currentPrices: { [color: number]: { uru: number; junD: number; d: number } } = {};
      let rowHasPrice = false;

      row.forEach((cell, c) => {
        const raw = String(cell || '').trim();
        const typeLabel = getSPRowType(raw);
        if (typeLabel) return; 

        const p = parseFloat(raw.replace(/[^0-9.]/g, ''));
        if (!isNaN(p) && p > 0.1) {
          // 色の特定
          let color = 1;
          let minDist = 999;
          Object.keys(colorLabelMap).forEach(colStr => {
            const col = parseInt(colStr);
            const dist = c - col;
            if (dist >= -1 && dist < minDist) {
              color = colorLabelMap[col];
              minDist = dist;
            }
          });

          // タイプの特定
          let detectedType: 'uru' | 'junD' | 'd' | null = null;
          for (let dr = 1; dr <= 8; dr++) {
            if (r - dr < 0) break;
            const headerCell = String(rows[r - dr][c] || '').trim();
            detectedType = getSPRowType(headerCell);
            if (detectedType) break;
          }

          if (detectedType) {
            if (!currentPrices[color]) currentPrices[color] = { uru: 0, junD: 0, d: 0 };
            currentPrices[color][detectedType] = p;
            rowHasPrice = true;
          }
        }
      });

      if (rowHasPrice && lastCatalogNos.length > 0) {
        spMaster.push({
          catalogNos: [...lastCatalogNos],
          weight: lastWeight,
          shape: lastShape || 'R',
          minQuantity: lastMinQty,
          unit: lastUnit,
          colorPrices: currentPrices,
          materialHint: sheetName + ` (L${r + 1})`
        });
        sheetRecordCount++;
      }
    }
    diagnostics.push(`${sheetName}: ${sheetRecordCount}件`);
  }

  diagnostics.push(`完了 合計: ${spMaster.length}件`);
  return { data: spMaster, diagnostics };
};

const parseReadymadeMaster = (rows: unknown[]): ReadymadeMasterRow[] => {
  const results: ReadymadeMasterRow[] = [];
  const header = (Array.isArray(rows[0]) ? rows[0] : []) as unknown[];
  const getIdx = (keywords: string[]) => header.findIndex((c: unknown) => keywords.some(k => String(c).includes(k)));
  const idx = { 
    code: getIdx(['SP@', 'PP@m', 'ABS']), 
    minQty: getIdx(['個数', '最小数量', '数量', '枚数']), 
    uru: getIdx(['売単価', 'うる', '通常', '標準', '売']), 
    junD: getIdx(['準Ｄ', '準D']), 
    d: getIdx(['Ｄ単価', 'D単価', 'バラ', 'D']) 
  };
  if (idx.code === -1) return [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
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

const parsePriceMatrix = (rows: unknown[]): CustomPriceMatrixRow[] => {
  const matrix: CustomPriceMatrixRow[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
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

const mapRowArrayToOrderRecord = (row: unknown[], header: unknown[]): OrderRecord => {
  const getIdx = (keywords: string[]) => header.findIndex((c: unknown) => keywords.some(k => String(c).includes(k)));
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
    directDeliveryName: getIdx(['直送先', '直送先名称']),
    lastOrderDate: getIdx(['最終受注日', '最終日'])
  };

  const val = (idx: number) => (idx !== -1 && Array.isArray(row) ? row[idx] : '');
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
    spMasterMatched: false
  };
};
