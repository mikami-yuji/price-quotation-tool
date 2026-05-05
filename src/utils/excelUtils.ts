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

export const parseSPMasterFile = (arrayBuffer: ArrayBuffer): SPMasterRow[] => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const results: SPMasterRow[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (rows.length === 0) continue;

    const materialHint = name.replace(/^\d+[kK]?[_\s]*/, '').trim();
    const sheetWeight = parseFloat(name.match(/^\d+/)?.[0] || '0');

    // 1. シート全体のカタログ番号（3-4桁の数値）を収集（バックアップ・全体用）
    const globalCatalogNos: string[] = [];
    rows.slice(0, 25).forEach(row => {
      if (Array.isArray(row)) {
        row.forEach(cell => {
          const s = String(cell).trim();
          if (/^\d{3,4}$/.test(s)) {
            globalCatalogNos.push(s);
          } else if (s.includes('\n')) {
             s.split(/[\n\s]+/).map(x => x.trim()).filter(x => /^\d{3,4}$/.test(x)).forEach(x => globalCatalogNos.push(x));
          }
        });
      }
    });

    // 2. 「売」ヘッダーの位置をすべて特定
    const priceHeaders: { row: number; col: number; type: 'uru' | 'junD' | 'd' }[] = [];
    for (let r = 0; r < Math.min(rows.length, 60); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      row.forEach((cell, c) => {
        const t = String(cell).trim();
        if (t === '売') priceHeaders.push({ row: r, col: c, type: 'uru' });
        else if (t === '準D' || t === '準Ｄ') priceHeaders.push({ row: r, col: c, type: 'junD' });
        else if (t === 'D' || t === 'Ｄ' || t === '単価') priceHeaders.push({ row: r, col: c, type: 'd' });
      });
    }

    // 3. 各「売」列（テーブル）に対して処理
    const uruHeaders = priceHeaders.filter(h => h.type === 'uru');
    for (const uru of uruHeaders) {
      const sellIdx = uru.col;
      let lastCatalogNos: string[] = [];
      let lastWeight = sheetWeight;
      let lastShape: 'R' | '単袋' = 'R';

      // データ行の解析
      for (let r = uru.row + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!Array.isArray(row) || row[sellIdx] === '') {
          // 行が空、または「売」列が空の場合は、そのテーブルが途切れたか空行
          if (Array.isArray(row) && row.some(c => String(c).includes('※') || String(c).includes('★'))) break; // 注釈行で終了
          continue;
        }

        let currentRowCatalogNos: string[] = [];
        let currentRowWeight = 0;
        let currentRowShape: 'R' | '単袋' | null = null;
        let minQuantity = 0;

        // 「売」列の左側（最大15列）から情報を収集
        const searchRange = Math.max(0, sellIdx - 15);
        for (let c = searchRange; c < sellIdx; c++) {
          const val = String(row[c] || '').trim();
          if (!val) continue;

          // カタログ番号（3-4桁の数値、または△付）
          if (/^[0-9△▲]{3,4}$/.test(val)) {
            currentRowCatalogNos.push(val.replace(/[△▲]/g, ''));
          } else if (val.includes('\n')) {
             val.split(/[\n\s]+/).map(x => x.trim().replace(/[△▲]/g, '')).filter(x => /^\d{3,4}$/.test(x)).forEach(x => currentRowCatalogNos.push(x));
          }

          // 重量
          const wMatch = val.match(/^(\d+(\.\d+)?)\s*([kK][gG]?|㎏)?$/);
          if (wMatch) {
            const w = parseFloat(wMatch[1]);
            if (w > 0 && w < 100) currentRowWeight = w;
          }

          // 数量
          const qMatch = val.match(/^(\d+)\s*(ｍ|m|枚)?(～|~)?$/);
          if (qMatch && !val.includes('K')) { // K(kg)と混同しないよう注意
            const q = parseInt(qMatch[1]);
            if (q >= 10) minQuantity = q;
          }

          // 形状
          if (val.includes('単袋')) currentRowShape = '単袋';
          else if (val.includes('R') || val.includes('ロール')) currentRowShape = 'R';
        }

        // 情報の補完
        if (currentRowCatalogNos.length === 0) {
          currentRowCatalogNos = lastCatalogNos.length > 0 ? lastCatalogNos : [...globalCatalogNos];
        }
        if (currentRowWeight === 0) currentRowWeight = lastWeight;
        if (currentRowShape === null) currentRowShape = lastShape;

        // 状態の更新
        if (currentRowCatalogNos.length > 0) lastCatalogNos = [...currentRowCatalogNos];
        if (currentRowWeight > 0) lastWeight = currentRowWeight;
        if (currentRowShape !== null) lastShape = currentRowShape;

        if (currentRowCatalogNos.length > 0 && minQuantity > 0) {
          const colorPrices: { [key: number]: SPMasterPrice } = {};
          
          // 準D, Dの列を特定
          const junDHeader = priceHeaders.find(h => h.type === 'junD' && h.row === uru.row && h.col > sellIdx && h.col < sellIdx + 12);
          const dHeader = priceHeaders.find(h => h.type === 'd' && h.row === uru.row && h.col > sellIdx && h.col < sellIdx + 20);
          
          const junDOffset = junDHeader ? junDHeader.col - sellIdx : 0;
          const dOffset = dHeader ? dHeader.col - sellIdx : 0;

          for (let c = 1; c <= 7; c++) {
            const priceVal = row[sellIdx + c];
            const uruPrice = parseFloat(String(priceVal));
            if (!isNaN(uruPrice) && uruPrice > 0) {
              const junDPrice = (junDOffset > 0) ? parseFloat(String(row[sellIdx + junDOffset + c])) || uruPrice : uruPrice;
              const dPrice = (dOffset > 0) ? parseFloat(String(row[sellIdx + dOffset + c])) || uruPrice : uruPrice;
              colorPrices[c] = { uru: uruPrice, junD: junDPrice, d: dPrice };
            }
          }

          if (Object.keys(colorPrices).length > 0) {
            results.push({
              catalogNos: currentRowCatalogNos,
              weight: currentRowWeight,
              shape: currentRowShape || 'R',
              minQuantity,
              colorPrices,
              materialHint
            });
          }
        }
      }
    }
  }
  return results;
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
