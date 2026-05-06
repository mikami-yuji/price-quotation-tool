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
  if (v.length > 8) return null; 
  if (v.includes('売') || v.includes('通常') || v.includes('うる')) return 'uru';
  if (v.includes('準') || v.includes('JUN')) return 'junD';
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

    // --- 診断情報の収集 ---
    let catalogLabelRow = -1;
    for (let r = 0; r < Math.min(rows.length, 150); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      // キーワード検索（広範に）
      const hasHeader = row.some(c => {
        const s = String(c || '').trim();
        return s.includes('カタログ') || s.includes('No') || s.includes('ｶﾀﾛｸﾞ') || s.includes('№') || s.includes('品番') || s.includes('商品') || s.includes('コード');
      });
      if (hasHeader) {
        catalogLabelRow = r;
        break;
      }
      // バックアップ：カタログ番号らしきものが複数ある行をヘッダー付近とみなす
      const catCount = row.filter(c => {
        const s = String(c || '').trim().replace(/-/g, '');
        return /^\d{3,10}$/.test(s);
      }).length;
      if (catCount >= 2) {
        catalogLabelRow = Math.max(0, r - 1); // その1行上が見出しの可能性が高い
        break;
      }
    }
    if (diagnostics.length < 5) {
      const start = Math.max(0, (catalogLabelRow === -1 ? 0 : catalogLabelRow - 2));
      const sample = rows.slice(start, start + 12)
        .map((r, i) => `R${start + i + 1}: ` + (Array.isArray(r) ? r.slice(0, 30).map(x => String(x || '').slice(0, 8)).join('|') : 'NoArray'))
        .join('\n');
      diagnostics.push(`[${sheetName}]\n見出し行: ${catalogLabelRow + 1}\nサンプル:\n${sample}`);
    }

    // --- シート全体の見出しマッピング ---
    const colorLabelMap: { [col: number]: number } = {};
    for (let r = 0; r < Math.min(rows.length, 500); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      row.forEach((cell, c) => {
        const v = String(cell || '').trim().replace(/[０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
        const m = v.match(/([1-8])色/);
        if (m) colorLabelMap[c] = parseInt(m[1]);
        else if (/^[1-8]$/.test(v)) colorLabelMap[c] = parseInt(v); 
      });
    }

    // --- 行スキャン ---
    let sheetRecordCount = 0;
    // 列ごとの状態保持（カタログNo、重量、形状）
    const colState: { [col: number]: { catalogNos: string[], weight: number, shape: 'R' | '単袋', minQty: number, lotType: 'above' | 'below', unit: 'm' | 'pcs', materialHint: string, isHeaderCol?: boolean } } = {};
    
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] as unknown[];
      if (!Array.isArray(row)) continue;

      // 1. この行に出現する「見出し情報」をまず収集
      const rowHeaderInfo: { catalogNos: string[], weight: number, shape: 'R' | '単袋', minQty: number, lotType: 'above' | 'below', unit: 'm' | 'pcs', materialHint: string, col: number }[] = [];

      for (let c = 0; c < row.length; c++) {
        const raw = String(row[c] || '').trim();
        const isHeaderLabel = (s: string) => /ロット|数量|最小|以上|以下|GP|利益|原価|理想|コスト|サイズ|形状|材質|品名|商品|コード|No|重量|kg|色|枚|m|~|～/.test(s);
        const type = getSPRowType(raw);
        if (type) { continue; }

        const val = raw.replace(/[０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0)).replace(/[ｋＫ㎏]/g, 'k');
        if (!val) continue;

        // カタログNo
        const cats: string[] = [];
        val.split(/[\n\s,、/]+/).forEach(x => {
          const clean = x.replace(/[△▲・No.]/g, '').trim();
          if (/^[\d-]{3,10}$/.test(clean) && clean.length >= 3) {
            cats.push(clean.replace(/-/g, ''));
          }
        });

        // 重量
        const wMatch = val.match(/^(\d+(\.\d+)?)k/i);
        const w = wMatch ? parseFloat(wMatch[1]) : 0;

        // 材質ヒント
        const m = val.match(/【(.+?)】/);
        const mat = m ? m[0] : '';

        if (isHeaderLabel(raw) || cats.length > 0 || w > 0 || mat) {
          rowHeaderInfo.push({
            catalogNos: cats,
            weight: w,
            shape: val.includes('単袋') ? '単袋' : 'R',
            minQty: (val.match(/(\d+)/) ? parseInt(val.match(/(\d+)/)![1]) : 0),
            lotType: val.includes('以上') || val.includes('~') || val.includes('～') ? 'above' : 'below',
            unit: val.includes('枚') ? 'pcs' : 'm',
            materialHint: mat,
            col: c
          });
          
          // データ行（r > catalogLabelRow）では、単なる材質ヒントだけでは「見出し列」として扱わない
          // これにより、価格列が誤ってスキップされるのを防ぐ
          const isActuallyHeader = isHeaderLabel(raw) || cats.length > 0 || w > 0;
          if (isActuallyHeader) {
            if (!colState[c]) colState[c] = { catalogNos: [], weight: 0, shape: 'R', minQty: 0, lotType: 'below', unit: 'm', materialHint: '' };
            colState[c].isHeaderCol = true;
          }
        }
      }

      rowHeaderInfo.forEach(info => {
        for (let targetC = info.col; targetC < Math.min(row.length, info.col + 30); targetC++) {
          if (!colState[targetC]) colState[targetC] = { catalogNos: [], weight: 0, shape: 'R', minQty: 0, lotType: 'below', unit: 'm', materialHint: '' };
          if (info.catalogNos.length > 0) colState[targetC].catalogNos = info.catalogNos;
          if (info.weight > 0) colState[targetC].weight = info.weight;
          if (info.shape) colState[targetC].shape = info.shape;
          if (info.minQty > 0) { 
            colState[targetC].minQty = info.minQty; 
            colState[targetC].lotType = info.lotType;
            colState[targetC].unit = info.unit; 
          }
          if (info.materialHint) colState[targetC].materialHint = info.materialHint;
        }
      });

      // 3. 価格データの抽出（重量、数量区分ごとにユニークなキーを作成）
      const tempSPRows: { [key: string]: SPMasterRow } = {};

      row.forEach((cell, c) => {
        const p = parseFloat(String(cell || '').replace(/[,¥]/g, ''));
        if (!isNaN(p) && p > 0.1 && p < 10000) {
          if (colState[c]?.isHeaderCol) return; 

          let color = 0;
          let minDist = 999;
          Object.keys(colorLabelMap).forEach(colStr => {
            const col = parseInt(colStr);
            const dist = c - col;
            // 横に広いレイアウトに対応するため、探索範囲を 8列に拡大
            if (dist >= 0 && dist <= 8 && dist < minDist) {
              color = colorLabelMap[col];
              minDist = dist;
            }
          });

          if (color > 0 && colState[c]?.catalogNos.length > 0) {
            const state = colState[c];
            const catKey = state.catalogNos.join(',');
            // 同一カタログ・重量・数量区分のユニークキー
            const uniqueKey = `${catKey}_${state.weight}_${state.minQty}_${state.lotType}_${state.unit}_${color}`;
            
            // タイプを特定（最も近いものを探す）
            let detectedType: 'uru' | 'junD' | 'd' | null = null;
            let minLabelDist = 999;
            for (let dr = 0; dr <= 15; dr++) {
              if (r - dr < 0) break;
              const t = getSPRowType(String(rows[r - dr][c] || '').trim());
              if (t) { detectedType = t; minLabelDist = dr; break; }
            }
            // 横方向の探索範囲を 10列に拡大（01_SPZIP などの広い表に対応）
            for (let dc = 1; dc <= 10; dc++) {
              if (c - dc < 0) break;
              const t = getSPRowType(String(row[c - dc] || '').trim());
              if (t && dc < minLabelDist) { detectedType = t; minLabelDist = dc; break; }
            }

            if (detectedType) {
              if (!tempSPRows[uniqueKey]) {
                tempSPRows[uniqueKey] = {
                  catalogNos: state.catalogNos,
                  weight: state.weight,
                  shape: state.shape,
                  minQuantity: state.minQty,
                  lotType: state.lotType,
                  unit: state.unit,
                  materialHint: state.materialHint || sheetName,
                  colorPrices: {}
                };
              }
              if (!tempSPRows[uniqueKey].colorPrices[color]) {
                tempSPRows[uniqueKey].colorPrices[color] = { uru: 0, junD: 0, d: 0 };
              }
              tempSPRows[uniqueKey].colorPrices[color][detectedType] = p;
            }
          }
        }
      });

      Object.values(tempSPRows).forEach(newRow => {
        const existingIdx = spMaster.findIndex(ex => 
          ex.catalogNos.join(',') === newRow.catalogNos.join(',') &&
          ex.weight === newRow.weight &&
          ex.minQuantity === newRow.minQuantity &&
          ex.lotType === newRow.lotType &&
          ex.unit === newRow.unit
        );
        if (existingIdx >= 0) {
          const color = Object.keys(newRow.colorPrices)[0];
          if (color) {
            spMaster[existingIdx].colorPrices[Number(color)] = {
              ...spMaster[existingIdx].colorPrices[Number(color)],
              ...newRow.colorPrices[Number(color)]
            };
          }
        } else {
          spMaster.push(newRow);
          sheetRecordCount++;
        }
      });
    }
    diagnostics.push(`${sheetName}: ${sheetRecordCount}件 (${Object.keys(colState).length}列解析)`);
  }

  diagnostics.push(`完了 合計: ${spMaster.length}件`);
  if (spMaster.length > 0) {
    const sample = spMaster[0];
    diagnostics.push(`サンプル: [${sample.catalogNos.join(',')}] / ${sample.materialHint} / Lot:${sample.minQuantity}${sample.lotType === 'above' ? '↑' : '↓'} / 色数:${Object.keys(sample.colorPrices).length}`);
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
    return v === '' ? 0 : Number(String(v).replace(/[^\d.]/g, '')) || 0;
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
    printingCost: num(idxMap.printingCost),
    printingSalesGroup: num(idxMap.printingSalesGroup),
    janCode: String(val(idxMap.janCode)),
    directDeliveryCode: String(val(idxMap.directDeliveryCode)),
    directDeliveryName: String(val(idxMap.directDeliveryName)),
    lastOrderDate: String(val(idxMap.lastOrderDate)),
    spMasterMatched: false
  };
};
