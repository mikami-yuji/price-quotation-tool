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
  if (v === '売' || v === '通常' || v === 'うる' || v === '（売）' || v === '売価') return 'uru';
  if (v === '準' || v === '準Ｄ' || v === '準D' || v === '（準）') return 'junD';
  if (v === 'Ｄ' || v === 'D' || v === 'Ｄ単価' || v === 'D単価' || v === '（Ｄ）') return 'd';
  return null;
};

export type SPParseResult = {
  data: SPMasterRow[];
  diagnostics: string[];
};

type ColumnInfo = {
  col: number;
  type: 'uru' | 'junD' | 'd';
  color: number;
};

export const parseSPMasterFile = (arrayBuffer: ArrayBuffer): SPParseResult => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const spMaster: SPMasterRow[] = [];
  const diagnostics: string[] = [];
  
  diagnostics.push(`シート名: ${workbook.SheetNames.join(', ')}`);

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (rows.length === 0) continue;

    const blockStartRows = rows.map((row, i) => {
      if (!Array.isArray(row)) return null;
      return row.some(c => {
        const v = String(c || '').trim();
        return v === 'ｶﾀﾛｸﾞ№' || v === 'カタログ№' || v === 'ｶﾀﾛｸﾞNo' || v === 'カタログNo';
      }) ? i : null;
    }).filter((idx): idx is number => idx !== null);

    if (blockStartRows.length === 0) {
      // カタログ№がないシートでも、特定条件でパースを試みる（例: 全体重量指定など）
      diagnostics.push(`${sheetName}: カタログ№なし`);
      continue;
    }

    let sheetRecordCount = 0;

    for (let b = 0; b < blockStartRows.length; b++) {
      const startRow = blockStartRows[b];
      const endRow = blockStartRows[b + 1] || rows.length;
      
      const colInfos: ColumnInfo[] = [];
      const searchEndRow = Math.min(startRow + 10, endRow);
      
      for (let r = startRow; r < searchEndRow; r++) {
        const row = rows[r] as unknown[];
        if (!Array.isArray(row)) continue;
        
        row.forEach((cell, c) => {
          const type = getSPRowType(String(cell));
          if (type) {
            let color = 1;
            for (let dr = -3; dr <= 3; dr++) {
              const r2 = r + dr;
              if (r2 < startRow || r2 >= endRow) continue;
              const row2 = rows[r2] as unknown[];
              if (!Array.isArray(row2)) continue;
              for (let dc = -4; dc <= 4; dc++) {
                const c2 = c + dc;
                if (c2 < 0 || c2 >= row2.length) continue;
                const v = String(row2[c2] || '').trim().replace(/[０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
                const match = v.match(/([1-8])色/);
                if (match) {
                  color = parseInt(match[1]);
                  break;
                } else if (/^[1-8]$/.test(v)) {
                   color = parseInt(v);
                   break;
                }
              }
              if (color > 1) break;
            }
            // 同一色・同一タイプの列は、最初に見つかったもの（左側）を優先
            if (!colInfos.some(info => info.color === color && info.type === type)) {
              colInfos.push({ col: c, type, color });
            }
          }
        });
      }

      if (colInfos.length === 0) continue;

      let lastCatalogNos: string[] = [];
      let lastWeight = 0;
      let lastShape: 'R' | '単袋' | null = null;
      let lastMinQty = 0;
      let lastUnit: 'm' | 'pcs' = 'm';

      for (let r = startRow + 1; r < endRow; r++) {
        const row = rows[r] as unknown[];
        if (!Array.isArray(row)) continue;

        const currentCatalogNos: string[] = [];
        let currentWeight = 0;
        let currentShape: 'R' | '単袋' | null = null;
        let currentMinQty = 0;
        let currentUnit: 'm' | 'pcs' = 'm';

        const minSellCol = Math.min(...colInfos.map(i => i.col));
        for (let c = 0; c < minSellCol; c++) {
          const val = String(row[c] || '').trim().replace(/[０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0)).replace(/[ｋＫ㎏]/g, 'k');
          if (!val) continue;

          val.split(/[\n\s,、]+/).forEach(x => {
            const m = x.replace(/[△▲]/g, '').trim();
            if (/^\d{3,4}$/.test(m)) currentCatalogNos.push(m);
          });
          const wMatch = val.match(/^(\d+(?:\.\d+)?)\s*k?$/i);
          if (wMatch) currentWeight = parseFloat(wMatch[1]);
          if (val.includes('単袋')) currentShape = '単袋';
          else if (val.includes('R') || val.includes('ロール')) currentShape = 'R';
          const qMatch = val.match(/(?:約|以上)?\s*(\d+)\s*(ｍ|m|枚)?(～|~)?$/);
          if (qMatch && !val.includes('k')) {
            currentMinQty = parseInt(qMatch[1]);
            currentUnit = (qMatch[2] === '枚' ? 'pcs' : 'm');
            if (qMatch[2] === '枚') currentShape = '単袋';
          }
        }

        const currentPrices: { [color: number]: { uru: number; junD: number; d: number } } = {};
        let hasPrice = false;

        colInfos.forEach(info => {
          const val = String(row[info.col] || '').trim();
          if (getSPRowType(val)) return;

          const p = parseFloat(val.replace(/[^0-9.]/g, ''));
          // 極端に小さい値（例: 印刷代や係数と思われるもの）を価格として採用しないための閾値
          // ただし単袋などで数円〜十数円のケースがあるため慎重に設定
          if (!isNaN(p) && p > 0.1) {
            if (!currentPrices[info.color]) currentPrices[info.color] = { uru: 0, junD: 0, d: 0 };
            currentPrices[info.color][info.type] = p;
            hasPrice = true;
          }
        });

        if (hasPrice) {
          if (currentCatalogNos.length > 0) lastCatalogNos = [...currentCatalogNos];
          if (currentWeight > 0) lastWeight = currentWeight;
          if (currentShape) lastShape = currentShape;
          if (currentMinQty > 0) { lastMinQty = currentMinQty; lastUnit = currentUnit; }

          if (lastCatalogNos.length > 0) {
            spMaster.push({
              catalogNos: [...lastCatalogNos],
              weight: lastWeight,
              shape: lastShape || 'R',
              minQuantity: lastMinQty,
              unit: lastUnit,
              colorPrices: currentPrices,
              materialHint: sheetName
            });
            sheetRecordCount++;
          }
        }
      }
    }
    diagnostics.push(`${sheetName}: ${sheetRecordCount}件`);
  }

  diagnostics.push(`合計: ${spMaster.length}件`);
  return { data: spMaster, diagnostics };
};

const parseReadymadeMaster = (rows: unknown[]): ReadymadeMasterRow[] => {
  const results: ReadymadeMasterRow[] = [];
  const header = (Array.isArray(rows[0]) ? rows[0] : []) as unknown[];
  const getIdx = (keywords: string[]) => header.findIndex((c: unknown) => keywords.some(k => String(c).includes(k)));
  const idx = { code: getIdx(['SP@', 'PP@m', 'ABS']), minQty: getIdx(['個数', '最小数量', '数量', '枚数']), uru: getIdx(['売単価', 'うる', '通常', '標準']), junD: getIdx(['準Ｄ', '準D']), d: getIdx(['Ｄ単価', 'D単価', 'バラ', 'D']) };
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
    janCode: getIdx(['JAN']),
    directDeliveryName: getIdx(['直送先'])
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
    spMasterMatched: false
  };
};
