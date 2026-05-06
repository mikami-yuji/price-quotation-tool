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
  if (v === '売' || v === '通常' || v === 'うる' || v === '（売）' || v === '売価' || v === '売単価') return 'uru';
  if (v === '準' || v === '準Ｄ' || v === '準D' || v === '（準）' || v === '準単価') return 'junD';
  if (v === 'Ｄ' || v === 'D' || v === 'Ｄ単価' || v === 'D単価' || v === '（Ｄ）' || v === 'D単' || v === 'バラ') return 'd';
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
  
  diagnostics.push(`シート数: ${workbook.SheetNames.length}`);

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (rows.length === 0) continue;

    // 1. カタログ№を含む行をブロック開始点とする
    const blockStartRows = rows.map((row, i) => {
      if (!Array.isArray(row)) return null;
      return row.some(c => {
        const v = String(c || '').trim();
        return v.includes('カタログ') || v.includes('ｶﾀﾛｸﾞ');
      }) ? i : null;
    }).filter((idx): idx is number => idx !== null);

    if (blockStartRows.length === 0) {
      diagnostics.push(`${sheetName}: カタログ№見つからず`);
      continue;
    }

    let sheetRecordCount = 0;

    for (let b = 0; b < blockStartRows.length; b++) {
      const startRow = blockStartRows[b];
      const endRow = blockStartRows[b + 1] || rows.length;
      
      const colInfos: ColumnInfo[] = [];
      const colorLabels: { col: number, color: number }[] = [];
      
      // 2. ブロックの上部（ヘッダー部分）から「色ラベル」と「売/準/D列」を網羅的に特定
      const headerSearchEnd = Math.min(startRow + 15, endRow);
      for (let r = startRow; r < headerSearchEnd; r++) {
        const row = rows[r] as unknown[];
        if (!Array.isArray(row)) continue;
        
        row.forEach((cell, c) => {
          const v = String(cell || '').trim().replace(/[０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
          
          // 色ラベルの特定 (例: "1色", "１色", もしくは単に数字の "1")
          const m = v.match(/^([1-8])色?$/);
          if (m) {
            colorLabels.push({ col: c, color: parseInt(m[1]) });
          }

          // 価格列の特定
          const type = getSPRowType(v);
          if (type) {
            // 最も近い左側の色ラベル、または同じ列の色ラベルを探す
            let bestColor = 1;
            let minDist = 999;
            colorLabels.forEach(cl => {
              // 同じ列、または左側にあるラベルを優先
              const dist = c - cl.col;
              if (dist >= -1 && dist < minDist) {
                bestColor = cl.color;
                minDist = dist;
              }
            });
            
            // 重複登録を避ける
            if (!colInfos.some(info => info.col === c)) {
              colInfos.push({ col: c, type, color: bestColor });
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

        // データの抽出（価格列より左側）
        const minPriceCol = Math.min(...colInfos.map(i => i.col));
        for (let c = 0; c < minPriceCol; c++) {
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

        // 価格の抽出
        const currentPrices: { [color: number]: { uru: number; junD: number; d: number } } = {};
        let rowHasPrice = false;

        colInfos.forEach(info => {
          const raw = String(row[info.col] || '').trim();
          if (getSPRowType(raw)) return; // ラベル行はスキップ

          const p = parseFloat(raw.replace(/[^0-9.]/g, ''));
          if (!isNaN(p) && p > 0.1) {
            if (!currentPrices[info.color]) currentPrices[info.color] = { uru: 0, junD: 0, d: 0 };
            currentPrices[info.color][info.type] = p;
            rowHasPrice = true;
          }
        });

        if (rowHasPrice) {
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
              materialHint: sheetName + (r > 0 ? ` (L${r + 1})` : '')
            });
            sheetRecordCount++;
          }
        }
      }
    }
    diagnostics.push(`${sheetName}: ${sheetRecordCount}件`);
  }

  diagnostics.push(`解析完了 合計: ${spMaster.length}件`);
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
