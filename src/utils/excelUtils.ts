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
  const v = String(val || '');
  if (v.includes('売')) return 'uru';
  if (v.includes('準')) return 'junD';
  if (v.includes('Ｄ') || v.includes('D')) return 'd';
  return null;
};

export const parseSPMasterFile = (arrayBuffer: ArrayBuffer): SPMasterRow[] => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const spMaster: SPMasterRow[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (rows.length === 0) continue;

    let sheetWeight = 0;
    const sheetWeightMatch = sheetName.match(/(\d+(\.\d+)?)\s*[kK㎏]/);
    if (sheetWeightMatch) sheetWeight = parseFloat(sheetWeightMatch[1]);

    const headerRows: number[] = [];
    for (let r = 0; r < Math.min(rows.length, 1000); r++) {
      const row = rows[r];
      if (Array.isArray(row) && row.some(c => {
        const t = String(c).trim();
        return t === '売' || t === '売単価' || t === '通常' || t === 'うる';
      })) {
        headerRows.push(r);
      }
    }

    if (headerRows.length === 0) continue;

    const stateByCol: { [sellIdx: number]: { 
      lastCatalogNos: string[], 
      lastWeight: number, 
      lastMinQuantity: number, 
      lastUnit: 'm' | 'pcs',
      lastShape: 'R' | '単袋' | null,
      lastRowType: 'uru' | 'junD' | 'd' | null
    } } = {};

    let globalLastShape: 'R' | '単袋' | null = null;
    if (sheetName.includes('単袋') || sheetName.includes('（単）') || /単袋/.test(sheetName)) {
      globalLastShape = '単袋';
    } else if (sheetName.includes('ロール') || sheetName.includes('（R）') || /ロール|Ｒ|R/.test(sheetName)) {
      globalLastShape = 'R';
    }

    // シート全体の共通カタログ番号をスキャン (冒頭20行)
    const sheetGlobalCatalogNos: string[] = [];
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      row.forEach(cell => {
        const val = String(cell || '').trim();
        if (!val) return;
        // 3〜4桁の数字を抽出 (カタログ番号)
        const matches = val.match(/\d{3,4}/g);
        if (matches) {
          matches.forEach(m => {
            if (!sheetGlobalCatalogNos.includes(m)) sheetGlobalCatalogNos.push(m);
          });
        }
      });
    }

    for (const headerRowIdx of headerRows) {
      const headerRow = rows[headerRowIdx] as unknown[];
      const priceHeadersInRow: { col: number }[] = [];
      headerRow.forEach((cell, c) => {
        const t = String(cell).trim();
        if (t === '売' || t === '売単価' || t === '通常' || t === 'うる') {
          priceHeadersInRow.push({ col: c });
        }
      });

      for (const header of priceHeadersInRow) {
        const sellIdx = header.col;
        
        if (!stateByCol[sellIdx]) {
          stateByCol[sellIdx] = {
            lastCatalogNos: [...sheetGlobalCatalogNos],
            lastWeight: sheetWeight,
            lastMinQuantity: 0,
            lastUnit: 'm',
            lastShape: globalLastShape,
            lastRowType: null
          };
        }
        const state = stateByCol[sellIdx];
        const relativeOffsets: { [key: number]: number } = {};
        const nextHeader = priceHeadersInRow.find(h => h.col > sellIdx);
        const limit = nextHeader ? nextHeader.col : 1000;

        for (let i = 1; i <= 8; i++) {
          const zenI = String(i).replace(/[0-9]/g, m => String.fromCharCode(m.charCodeAt(0) + 0xFEE0));
          let found = false;
          for (let r = Math.max(0, headerRowIdx - 5); r <= headerRowIdx + 1; r++) {
            const row = rows[r] as unknown[];
            if (!Array.isArray(row)) continue;
            for (let c = sellIdx + 1; c < Math.min(row.length, limit); c++) {
              const val = String(row[c] || '').trim().replace(/[0-9]/g, m => String.fromCharCode(m.charCodeAt(0) + 0xFEE0));
              if (val.includes(`${zenI}色`) || (i <= 4 && val === zenI)) {
                relativeOffsets[i] = c - sellIdx;
                found = true;
                break;
              }
            }
            if (found) break;
          }
          if (!found) {
            if (i === 1) relativeOffsets[i] = 2;
            else {
              const prevOff = relativeOffsets[i - 1] || (i - 1) * 5;
              let gap = 5;
              if (i === 2 && (sheetName.includes('SF') || sheetName.includes('ＳＦ'))) gap = 4;
              relativeOffsets[i] = prevOff + gap;
            }
          }
        }

        for (let r = headerRowIdx + 1; r < rows.length; r++) {
          const row = rows[r] as unknown[];
          if (!Array.isArray(row)) continue;
          if (headerRows.includes(r)) break;

          const rawVal = String(row[sellIdx] || '').trim();
          let rowType = getSPRowType(rawVal);
          
          if (!rowType) {
            if (state.lastRowType === 'uru') rowType = 'junD';
            else if (state.lastRowType === 'junD') rowType = 'd';
            else if (state.lastRowType === 'd' || !state.lastRowType) rowType = 'uru';
          }
          
          const scanStart = Math.max(0, sellIdx - 15);
          const scanEnd = sellIdx;
          
          let currentRowCatalogNos: string[] = [];
          let currentRowWeight = 0;
          let currentRowShape: 'R' | '単袋' | null = null;
          let minQuantity = 0;
          let currentUnit: 'm' | 'pcs' = 'm';

          for (let c = scanStart; c < scanEnd; c++) {
            const val = String(row[c] || '').trim().replace(/[０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0)).replace(/[ｋＫ㎏]/g, 'k');
            if (!val) continue;

            val.split(/[\n\s,、]+/).map(x => x.trim().replace(/[△▲]/g, '')).filter(x => /^\d{3,4}$/.test(x)).forEach(x => currentRowCatalogNos.push(x));
            
            const wMatch = val.match(/^\s*(\d+(?:\.\d+)?)\s*(?:k|K|㎏)?\s*$/i);
            if (wMatch) {
              const w = parseFloat(wMatch[1]);
              if (w >= 1.5 && w <= 35) currentRowWeight = w;
            }
            const qMatch = val.match(/(?:約|以上)?\s*(\d+)\s*(ｍ|m|枚)?(～|~)?$/);
            if (qMatch && !val.includes('k')) {
              const q = parseInt(qMatch[1]);
              if (q >= 10) {
                minQuantity = q;
                const unitStr = qMatch[2] || '';
                currentUnit = (unitStr === '枚' ? 'pcs' : 'm');
                if (unitStr === '枚') currentRowShape = '単袋';
                else if (unitStr === 'ｍ' || unitStr === 'm') currentRowShape = 'R';
              }
            }
            if (val.includes('単袋')) currentRowShape = '単袋';
            else if (val.includes('R') || val.includes('ロール')) currentRowShape = 'R';
          }

          if (rowType === 'uru') {
            if (currentRowCatalogNos.length === 0) currentRowCatalogNos = [...state.lastCatalogNos];
            else state.lastCatalogNos = [...currentRowCatalogNos];
            if (currentRowWeight === 0) currentRowWeight = state.lastWeight;
            else state.lastWeight = currentRowWeight;
            if (currentRowShape === null) currentRowShape = state.lastShape;
            else state.lastShape = currentRowShape;
            if (minQuantity === 0) minQuantity = state.lastMinQuantity;
            else { state.lastMinQuantity = minQuantity; state.lastUnit = currentUnit; }

            const spRow: SPMasterRow = {
              catalogNos: [...currentRowCatalogNos],
              weight: currentRowWeight,
              shape: currentRowShape || 'R',
              minQuantity: minQuantity,
              unit: state.lastUnit,
              colorPrices: {},
              materialHint: sheetName
            };
            let hasPrice = false;
            for (let i = 1; i <= 8; i++) {
              const off = relativeOffsets[i];
              if (!off) continue;
              const p = parseFloat(String(row[sellIdx + off] || '').replace(/[^0-9.]/g, ''));
              if (!isNaN(p) && p > 0) {
                if (!spRow.colorPrices[i]) spRow.colorPrices[i] = { uru: 0, junD: 0, d: 0 };
                spRow.colorPrices[i].uru = p;
                hasPrice = true;
              }
            }
            if (hasPrice) {
              spMaster.push(spRow);
              state.lastRowType = 'uru';
            } else {
              state.lastRowType = null;
            }
          } else if (rowType && spMaster.length > 0) {
            const lastEntry = spMaster[spMaster.length - 1];
            const matchCata = (currentRowCatalogNos.length > 0 ? currentRowCatalogNos : state.lastCatalogNos).join(',');
            if (lastEntry.catalogNos.join(',') === matchCata) {
              let hasPrice = false;
              for (let i = 1; i <= 8; i++) {
                const off = relativeOffsets[i];
                if (!off) continue;
                const p = parseFloat(String(row[sellIdx + off] || '').replace(/[^0-9.]/g, ''));
                if (!isNaN(p) && p > 0) {
                  if (!lastEntry.colorPrices[i]) lastEntry.colorPrices[i] = { uru: 0, junD: 0, d: 0 };
                  lastEntry.colorPrices[i][rowType] = p;
                  hasPrice = true;
                }
              }
              if (hasPrice) state.lastRowType = rowType;
            }
          }
        }
      }
    }
  }
  return spMaster;
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
    printingSalesGroup: getIdx(['印刷営G']),
    janCode: getIdx(['JAN']),
    directDeliveryCode: getIdx(['直送先コード', '直送先CD']),
    directDeliveryName: getIdx(['直送先']),
    lastOrderDate: getIdx(['最終受注日']),
    designName: getIdx(['デザイン名']),
    title: getIdx(['タイトル'])
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
    designName: String(val(idxMap.designName)),
    title: String(val(idxMap.title))
  };
};
