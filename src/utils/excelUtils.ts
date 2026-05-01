import * as XLSX from 'xlsx';
import { OrderRecord, CustomPriceMatrixRow, ReadymadeMasterRow } from '../types';

/**
 * Excelのファイルオブジェクト（ArrayBuffer）を読み込み、受注データ、別注単価表、既製品マスターの配列を返します。
 * @param arrayBuffer ブラウザで読み込んだExcelファイルのArrayBuffer
 * @returns 抽出されたデータ
 */
export const parseExcelFile = (arrayBuffer: ArrayBuffer): { 
  orders: OrderRecord[], 
  priceMatrix: CustomPriceMatrixRow[],
  readymadeMaster: ReadymadeMasterRow[]
} => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames;

  let orders: OrderRecord[] = [];
  let priceMatrix: CustomPriceMatrixRow[] = [];
  let readymadeMaster: ReadymadeMasterRow[] = [];

  // 1. 受注データの読み込み (配列方式でズレを防止)
  const orderSheet = workbook.Sheets['受注データ'] || workbook.Sheets['見積書'] || workbook.Sheets[sheetNames[0]];
  if (orderSheet) {
    const rows = XLSX.utils.sheet_to_json<any[]>(orderSheet, { header: 1, defval: '' });
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      if (rows[i].some(c => String(c).includes('商品コード') || String(c).includes('受注') || String(c).includes('ABSコード'))) {
        headerIdx = i;
        break;
      }
    }
    const dataStartIdx = headerIdx === -1 ? 0 : headerIdx + 1;
    for (let i = dataStartIdx; i < rows.length; i++) {
      const record = mapRowArrayToOrderRecord(rows[i], rows[headerIdx] || []);
      if (record) orders.push(record);
    }
  }

  // 2. 別注単価表の読み込み
  if (sheetNames.includes('別注単価表')) {
    const sheet = workbook.Sheets['別注単価表'];
    const rawMatrix = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    priceMatrix = rawMatrix.map((row: any) => mapRowToPriceMatrix(row)).filter(row => row !== null) as CustomPriceMatrixRow[];
  }

  // 3. 既製品マスターの読み込み (全シートスキャン + 配列方式)
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
    
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      if (rows[i].some(c => String(c || '').includes('ABSコード'))) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx !== -1) {
      const headers = rows[headerIdx];
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const master = mapRowArrayToReadymadeMaster(rows[i], headers);
        if (master) readymadeMaster.push(master);
      }
      if (readymadeMaster.length > 0) break;
    }
  }

  return { orders, priceMatrix, readymadeMaster };
};

/**
 * SP用マスターデータのパース（数量スライド対応）
 */
export const parseSPMasterFile = (arrayBuffer: ArrayBuffer): SPMasterRow[] => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const results: SPMasterRow[] = [];

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] || '');
        if (cell.includes('ｶﾀﾛｸﾞ№')) {
          // テーブルの起点を発見
          const headerRow = rows[r + 1];
          if (!headerRow) continue;

          const catalogRaw = String(headerRow[c] || '');
          const catalogNos = catalogRaw.split(/[\r\n\s]+/).map(s => s.trim()).filter(Boolean);
          if (catalogNos.length === 0) continue;

          const weightIdx = c + 5;
          const qtyIdx = c + 8;
          const weight = parseFloat(String(headerRow[weightIdx] || '0'));

          // この起点(r, c)から下に続くセクションをすべてスキャン
          // 通常、3行1セット（売・準・D）で、セクション間に空行があるか次の数量がある
          let currentR = r + 1;
          while (currentR < rows.length) {
            const qtyCell = String(rows[currentR][qtyIdx] || '');
            if (!qtyCell || (!qtyCell.includes('ｍ') && !qtyCell.includes('枚'))) {
              // 数量がなくなったら終了（または次のテーブルヘッダーへ）
              if (currentR > r + 5 && rows[currentR].some(cell => String(cell).includes('ｶﾀﾛｸﾞ№'))) break;
              if (currentR > r + 30) break; // 無限ループ防止
              currentR++;
              continue;
            }

            // 数量と形状を解析
            const shape: 'R' | '単袋' = qtyCell.includes('ｍ') ? 'R' : '単袋';
            const minQuantity = parseFloat(qtyCell.replace(/[^0-9]/g, '')) || 0;

            const colorPrices: { [key: number]: SPMasterPrice } = {};
            [1, 2, 3, 4].forEach(colorNum => {
              const colIdx = c + 15 + (colorNum - 1) * 4;
              if (colIdx >= rows[currentR].length) return;
              
              const uru = parseFloat(String(rows[currentR][colIdx] || '0'));
              const junD = parseFloat(String(rows[currentR + 1] ? rows[currentR + 1][colIdx] : '0'));
              const d = parseFloat(String(rows[currentR + 2] ? rows[currentR + 2][colIdx] : '0'));
              
              if (uru > 0) {
                colorPrices[colorNum] = { uru, junD, d };
              }
            });

            if (Object.keys(colorPrices).length > 0) {
              results.push({ catalogNos, weight, shape, minQuantity, colorPrices });
            }
            currentR += 3; // 次の数量セクションへ
          }
        }
      }
    }
  }
  return results;
};

/**
 * 配列から受注レコードへ
 */
const mapRowArrayToOrderRecord = (row: any[], headers: any[]): OrderRecord | null => {
  if (!row || row.length < 5) return null;
  
  const getIdx = (names: string[]) => headers.findIndex(h => names.some(n => String(h || '').replace(/[\s\t\r\n\xA0]/g, '').includes(n)));
  
  const idxMap = {
    category: getIdx(['種別']),
    orderNumber: getIdx(['受注№', '受注番号']),
    productCode: getIdx(['商品コード', '商品CD']),
    productName: getIdx(['商品名']),
    quantity: getIdx(['受注数', '数量']),
    currentPrice: getIdx(['現行単価', '単価']),
    salesGroup: getIdx(['営G']),
    weight: getIdx(['重量']),
    shape: getIdx(['形状'])
  };

  const val = (idx: number) => (idx !== -1 ? row[idx] : '');

  return {
    category: String(val(idxMap.category) || '既製品').trim(),
    orderNumber: String(val(idxMap.orderNumber)),
    productCode: String(val(idxMap.productCode)),
    absCode: String(val(idxMap.productCode)).replace(/\s+/g, ''),
    productName: String(val(idxMap.productName)),
    quantity: Number(val(idxMap.quantity)) || 0,
    currentPrice: Number(val(idxMap.currentPrice)) || 0,
    salesGroup: Number(val(idxMap.salesGroup)) || 0,
    weight: Number(val(idxMap.weight)) || 0,
    shape: String(val(idxMap.shape)),
    materialName: '',
    title: '',
    printingCost: 0,
    printingSalesGroup: 0,
    frontColorCount: 0,
    backColorCount: 0,
    totalColorCount: 0,
    janCode: '',
    directDeliveryCode: '',
    directDeliveryName: '',
    lastOrderDate: '',
    designName: ''
  };
};

/**
 * 配列から既製マスターへ
 */
const mapRowArrayToReadymadeMaster = (row: any[], headers: any[]): ReadymadeMasterRow | null => {
  if (!row || row.length < 5) return null;
  
  const getIdx = (names: string[]) => headers.findIndex(h => names.some(n => String(h || '').replace(/[\s\t\r\n\xA0]/g, '').includes(n)));
  
  const parseNum = (v: any) => {
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v || '').replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const idxMap = {
    absCode: getIdx(['ABSコード', 'ABSCD']),
    productCode: getIdx(['ＮＯ．', 'NO.', '商品コード']),
    weight: getIdx(['Ｋｇ', '重量', 'Kg']),
    shape: getIdx(['形状']),
    uru: getIdx(['改定後売', '通常売', '売単価']),
    junD: getIdx(['改定後準Ｄ', '改定後準D', '準D単価']),
    d: getIdx(['改定後Ｄ', '改定後D', 'D単価'])
  };

  const absCode = String(row[idxMap.absCode] || '').replace(/\s+/g, '');
  if (!absCode || absCode === 'ABSコード') return null;

  return {
    absCode,
    productCode: String(row[idxMap.productCode] || ''),
    weight: parseNum(row[idxMap.weight]),
    shape: String(row[idxMap.shape] || ''),
    minQuantity: 0,
    campaign: { uru: 0, junD: 0, d: 0 },
    normal: {
      uru: parseNum(row[idxMap.uru]),
      junD: parseNum(row[idxMap.junD]),
      d: parseNum(row[idxMap.d])
    }
  };
};

/**
 * 行データを単価表マトリックスオブジェクトにマッピングする
 */
const mapRowToPriceMatrix = (row: Record<string, any>): CustomPriceMatrixRow | null => {
  const materialName = row['材質名称'] as string;
  const weight = row['重量'];
  
  if (!materialName) return null;

  const colorPrices: { [key: number]: number } = {};
  
  for (let i = 1; i <= 7; i++) {
    const val = row[String(i)];
    if (val) {
      if (typeof val === 'number') {
        colorPrices[i] = val;
      } else if (typeof val === 'string') {
        const parsedNode = parseFloat(val.split(',')[0].trim());
        if (!isNaN(parsedNode)) {
          colorPrices[i] = parsedNode;
        }
      }
    }
  }

  return {
    materialName,
    weight,
    colorPrices
  };

  // 重量と形状
  const weight = parseNum(cleanRow['Ｋｇ'] || cleanRow['Kg'] || cleanRow['重量'] || (rawValues.length > 6 ? rawValues[6] : 0));
  const shape = String(cleanRow['形状'] || cleanRow['形'] || (rawValues.length > 7 ? rawValues[7] : '')).trim();

  return {
    productCode,
    absCode,
    minQuantity: 0,
    weight,
    shape,
    campaign: {
      uru: parseNum(cleanRow['現行ｷｬﾝ売'] || cleanRow['現行キャン売'] || 0),
      junD: parseNum(cleanRow['現行ｷｬﾝ準Ｄ'] || cleanRow['現行キャン準D'] || 0),
      d: parseNum(cleanRow['現行ｷｬﾝＤ'] || cleanRow['現行キャンD'] || 0),
    },
    normal: {
      uru: parseNum(cleanRow['改定後売'] || cleanRow['通常売'] || (rawValues.length > 8 ? rawValues[8] : 0)),
      junD: parseNum(cleanRow['改定後準Ｄ'] || cleanRow['改定後準D'] || (rawValues.length > 9 ? rawValues[9] : 0)),
      d: parseNum(cleanRow['改定後Ｄ'] || cleanRow['改定後D'] || (rawValues.length > 10 ? rawValues[10] : 0)),
    }
  };
};
