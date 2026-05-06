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
  const v = String(val || '').normalize('NFKC').trim().toLowerCase();
  if (!v) return null;
  if (v.includes('売') || v.includes('通常') || v.includes('うる') || v.includes('sale')) return 'uru';
  if (v.includes('準') || v.includes('jun')) return 'junD';
  if (v.includes('d') || v.includes('ｄ') || v.includes('バラ') || v.includes('小口')) return 'd';
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

    let catalogCols: number[] = [];
    let weightCols: number[] = [];
    let lotCols: number[] = [];
    let colorLabelMap: { [col: number]: number } = {};

    for (let r = 0; r < Math.min(rows.length, 40); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      row.forEach((cell, c) => {
        const s = String(cell || '').normalize('NFKC').trim();
        const v = s.replace(/\s+/g, '').toLowerCase();
        if (v.includes('カタログ') || v.includes('no') || v.includes('№') || v.includes('品番') || v.includes('コード')) {
          if (!catalogCols.includes(c)) catalogCols.push(c);
        }
        if (v.includes('kg') || v.includes('重量')) {
          if (!weightCols.includes(c)) weightCols.push(c);
        }
        if (v.includes('数量') || v.includes('ロット') || v.includes('枚数') || v.includes('本数')) {
          if (!lotCols.includes(c)) lotCols.push(c);
        }
        const m = v.match(/([1-8])色/);
        if (m) colorLabelMap[c] = parseInt(m[1]);
        else if (/^[1-8]$/.test(v) && r > 5) { 
           colorLabelMap[c] = parseInt(v);
        }
      });
    }

    let sheetRecordCount = 0;
    const addedUniqueKeys = new Set<string>();
    const colState: { 
      [col: number]: { 
        catalogNos: string[], 
        weight: number, 
        minQty: number, 
        lotType: 'above' | 'below', 
        unit: 'm' | 'pcs',
        shape: 'R' | '単袋',
        lastPriceRow: number
      } 
    } = {};

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const updateState = (col: number, rawVal: string, type: 'cat' | 'weight' | 'lot') => {
        if (!rawVal) return;
        const normVal = String(rawVal).normalize('NFKC');
        
        for (let targetC = 0; targetC < 100; targetC++) {
          if (Math.abs(targetC - col) > 35) continue;
          if (!colState[targetC]) colState[targetC] = { catalogNos: [], weight: 0, minQty: 0, lotType: 'below', unit: 'm', shape: 'R', lastPriceRow: -1 };
          
          if (type === 'cat') {
            const cats: string[] = [];
            normVal.split(/[\n\s,、/]+/).forEach(x => {
              const clean = x.replace(/[△▲・No.]/g, '').trim();
              if (clean.length >= 2 && /[A-Z0-9]/i.test(clean)) cats.push(clean.replace(/-/g, ''));
            });
            if (cats.length > 0) {
              const isNewBlock = colState[targetC].lastPriceRow !== -1 && r > colState[targetC].lastPriceRow + 2;
              if (isNewBlock) {
                colState[targetC].catalogNos = [...cats];
                colState[targetC].lastPriceRow = -1;
              } else {
                cats.forEach(cat => {
                  if (!colState[targetC].catalogNos.includes(cat)) colState[targetC].catalogNos.push(cat);
                });
              }
            }
          } else if (type === 'weight') {
            const wMatch = normVal.replace(/\s+/g, '').match(/(\d+(\.\d+)?)/);
            if (wMatch) colState[targetC].weight = parseFloat(wMatch[1]);
          } else if (type === 'lot') {
            const cleanLot = normVal.replace(/\s+/g, '');
            const minQtyMatch = cleanLot.match(/(\d+)/);
            if (minQtyMatch) {
              colState[targetC].minQty = parseInt(minQtyMatch[1]);
              colState[targetC].lotType = cleanLot.includes('以上') || cleanLot.includes('~') || cleanLot.includes('～') ? 'above' : 'below';
              if (cleanLot.includes('枚')) {
                colState[targetC].unit = 'pcs';
                colState[targetC].shape = '単袋';
              } else if (cleanLot.includes('m') || cleanLot.includes('ｍ')) {
                colState[targetC].unit = 'm';
                colState[targetC].shape = 'R';
              }
            }
          }
        }
      };

      catalogCols.forEach(c => updateState(c, String(row[c] || ''), 'cat'));
      weightCols.forEach(c => updateState(c, String(row[c] || ''), 'weight'));
      lotCols.forEach(c => updateState(c, String(row[c] || ''), 'lot'));

      row.forEach((cell, c) => {
        const valStr = String(cell || '').trim();
        const cleanVal = valStr.replace(/[売準DＤ￥\\$,\s]/g, '');
        if (!cleanVal || !/^[0-9.]+$/.test(cleanVal)) return;

        const p = parseFloat(cleanVal);
        if (isNaN(p) || p <= 0.01 || p >= 50000) return;

        let color = 0;
        let minDist = 999;
        Object.keys(colorLabelMap).forEach(colStr => {
          const col = parseInt(colStr);
          const dist = c - col;
          if (dist >= 0 && dist <= 12 && dist < minDist) {
            color = colorLabelMap[col];
            minDist = dist;
          }
        });

        const state = colState[c];
        if (color > 0 && state && state.catalogNos.length > 0) {
          state.lastPriceRow = r;
          let detectedType: 'uru' | 'junD' | 'd' | null = null;
          // 探索範囲を拡大 (左側15列、上側8行)
          for (let dr = 0; dr <= 8; dr++) {
            const checkR = r - dr;
            if (checkR < 0) break;
            const t = getSPRowType(String(rows[checkR]?.[c] || ''));
            if (t) { detectedType = t; break; }
            for (let dc = 1; dc <= 15; dc++) {
              if (c - dc < 0) break;
              const tt = getSPRowType(String(rows[checkR]?.[c - dc] || ''));
              if (tt) { detectedType = tt; break; }
            }
            if (detectedType) break;
          }

          if (detectedType) {
            state.catalogNos.forEach(catNo => {
              const uniqueKey = `${catNo}_${state.weight}_${state.minQty}_${state.lotType}_${state.unit}`;
              let existing = spMaster.find(ex => 
                ex.materialHint === sheetName &&
                ex.catalogNos[0] === catNo && 
                ex.weight === state.weight && 
                ex.minQuantity === state.minQty && 
                ex.lotType === state.lotType && 
                ex.unit === state.unit
              );

              if (!existing) {
                existing = {
                  catalogNos: [catNo], weight: state.weight, shape: state.shape,
                  minQuantity: state.minQty, lotType: state.lotType, unit: state.unit,
                  materialHint: sheetName, colorPrices: {}
                };
                spMaster.push(existing);
                if (!addedUniqueKeys.has(uniqueKey)) {
                  sheetRecordCount++;
                  addedUniqueKeys.add(uniqueKey);
                }
              }
              if (!existing.colorPrices[color]) existing.colorPrices[color] = { uru: 0, junD: 0, d: 0 };
              existing.colorPrices[color][detectedType] = p;
            });
          }
        }
      });
    }
    diagnostics.push(`${sheetName}: ${sheetRecordCount}件`);
  }
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
    lastOrderDate: getIdx(['最終受注日', '最終日']),
    title: getIdx(['タイトル'])
  };

  const val = (idx: number) => (idx !== -1 && Array.isArray(row) ? row[idx] : '');
  const num = (idx: number) => {
    const v = val(idx);
    if (v === '' || v === null || v === undefined) return 0;
    const s = String(v).trim();
    if (s.includes('+')) {
      const parts = s.split('+').map(p => parseFloat(p.replace(/[^\d.]/g, '')) || 0);
      return parts.reduce((a, b) => a + b, 0);
    }
    return Number(s.replace(/[^\d.]/g, '')) || 0;
  };

  const pCode = String(val(idxMap.productCode));
  const category = String(val(idxMap.category) || '既製品').trim();
  const isSP = (category.includes('SP') || category.includes('ＳＰ')) && !category.includes('シルク');
  
  const titleVal = String(val(idxMap.title));
  let pName = String(val(idxMap.productName));
  if (isSP && titleVal) {
    pName = titleVal;
  }

  return {
    category,
    orderNumber: String(val(idxMap.orderNumber)),
    productCode: pCode,
    absCode: pCode.replace(/\s+/g, ''),
    productName: pName,
    title: titleVal,
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
    printingCost: num(idxMap.printingSalesGroup), // 修正: printingSalesGroup ではなく printingCost をセット
    printingSalesGroup: num(idxMap.printingSalesGroup),
    janCode: String(val(idxMap.janCode)),
    directDeliveryCode: String(val(idxMap.directDeliveryCode)),
    directDeliveryName: String(val(idxMap.directDeliveryName)),
    lastOrderDate: String(val(idxMap.lastOrderDate)),
    spMasterMatched: false
  };
};
