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

  // 1. 受注データの読み込み (システムからのエクスポート)
  if (sheetNames.includes('受注データ')) {
    const sheet = workbook.Sheets['受注データ'];
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    orders = rawData.map((row) => mapRowToOrderRecord(row));
  } 
  // 2. 見積書データの読み込み (本ツールで生成したExcelからの再利用)
  else if (sheetNames.includes('見積書')) {
    const sheet = workbook.Sheets['見積書'];
    // 行13(インデックス12)からヘッダーが始まると想定
    const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 12, defval: '' });
    orders = rawData.map((row) => mapQuoteRowToOrderRecord(row));
  }

  // 3. 別注単価表の読み込み
  if (sheetNames.includes('別注単価表')) {
    const sheet = workbook.Sheets['別注単価表'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawMatrix = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    priceMatrix = rawMatrix.map((row: any) => mapRowToPriceMatrix(row)).filter(row => row !== null) as CustomPriceMatrixRow[];
  }

  // 4. 既製品マスターの読み込み (全シートスキャン方式)
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    const fullData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
    
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(fullData.length, 20); i++) {
      const row = fullData[i] || [];
      if (row.some(cell => String(cell || '').includes('ABSコード'))) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex !== -1) {
      const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { range: headerRowIndex, defval: '' });
      const currentSheetMaster = rawData.map(row => mapRowToReadymadeMaster(row)).filter(row => row !== null) as ReadymadeMasterRow[];
      if (currentSheetMaster.length > 0) {
        readymadeMaster = currentSheetMaster;
        break;
      }
    }
  }

  return { orders, priceMatrix, readymadeMaster };
};

/**
 * 行データを受注レコードオブジェクトにマッピングする
 * @param row Excelの1行分のJSONデータ
 * @returns OrderRecordオブジェクト
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRowToOrderRecord = (row: Record<string, any>): OrderRecord => {
  const cleanRow: Record<string, any> = {};
  Object.keys(row).forEach(key => {
    const cleanKey = key.replace(/[\s\t\r\n\xA0]/g, '');
    cleanRow[cleanKey] = row[key];
  });

  let absCode = String(
    cleanRow['ABSコード'] || 
    cleanRow['ABSCD'] || 
    cleanRow['商品コード'] || 
    cleanRow['商品CD'] || 
    ''
  ).replace(/\s+/g, '');

  // フォールバック: 4列目の値を採用（標準的な受注データの形式に合わせる）
  if (!absCode && Object.values(row).length >= 4) {
    absCode = String(Object.values(row)[3]).replace(/\s+/g, '');
  }

  return {
    orderNumber: String(row['受注№'] || ''),
    category: String(row['種別'] || ''),
    weight: row['重量'] || 0,
    productCode: String(row['商品コード'] || ''),
    absCode,
    productName: String(row['商品名'] || ''),
    title: String(row['タイトル'] || ''),
    shape: String(row['形状'] || ''),
    quantity: Number(row['受注数']) || 0,
    currentPrice: Number(row['単価']) || 0,
    printingCost: Number(row['印刷代']) || 0,
    salesGroup: Number(row['営G']) || 0,
    printingSalesGroup: Number(row['印刷営G']) || 0,
    materialName: String(row['材質名称'] || ''),
    printCode: String(row['印刷コード'] || ''),
    frontColorCount: Number(row['表色数']) || 0,
    backColorCount: Number(row['裏色数']) || 0,
    totalColorCount: Number(row['総色数']) || 0,
    janCode: String(row['JANコード'] || ''),
    directDeliveryCode: String(row['直送先コード'] || ''),
    directDeliveryName: String(row['直送先名称'] || ''),
    lastOrderDate: row['最新受注日'] instanceof Date 
      ? row['最新受注日'].toISOString() 
      : String(row['最新受注日'] || row['最終受注日'] || ''),
    designName: String(row['デザイン名'] || '')
  };
};

/**
 * 本ツールで生成した見積書（Excel）の1行分を受注レコードにマッピングする。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapQuoteRowToOrderRecord = (row: Record<string, any>): OrderRecord => {
  const nameMaterial = String(row['商品名 / 材質'] || '');
  const [productName, materialName] = nameMaterial.split('\n');

  return {
    orderNumber: String(row['受注№'] || ''),
    category: String(row['種別'] || ''),
    weight: row['重量'] || 0,
    productCode: String(row['商品コード'] || ''),
    productName: productName || '',
    materialName: materialName || '',
    shape: String(row['形状'] || ''),
    quantity: Number(row['前回受注数']) || 0,
    currentPrice: Number(row['新単価']) || Number(row['現行単価']) || 0,
    printingCost: Number(row['改定印刷代単価']) || Number(row['現行印刷代']) || 0,
    salesGroup: Number(row['改定後 営G']) || Number(row['営G']) || 0,
    printingSalesGroup: Number(row['改定印刷代営G']) || Number(row['現行印刷営G']) || 0,
    totalColorCount: Number(row['色数']) || 0,
    thickness: String(row['厚み'] || ''),
    directDeliveryCode: String(row['直送先コード'] || ''),
    directDeliveryName: String(row['直送先名称'] || ''),
    printCode: String(row['印刷コード'] || ''),
    title: productName || '',
    frontColorCount: 0,
    backColorCount: 0,
    janCode: '',
    lastOrderDate: '',
    designName: ''
  };
};

/**
 * 行データを単価表マトリックスオブジェクトにマッピングする
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
};

/**
 * 既製マスターの行データをマッピングする
 */
const mapRowToReadymadeMaster = (row: any): ReadymadeMasterRow | null => {
  if (!row) return null;
  
  const cleanRow: Record<string, any> = {};
  const rawValues = Object.values(row);
  
  Object.keys(row).forEach(key => {
    const cleanKey = key.replace(/[\s\t\r\n\xA0]/g, '');
    cleanRow[cleanKey] = row[key];
  });

  const parseNum = (val: any) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const cleaned = String(val).replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // ABSコード: 1列目、または指定の見出し名から取得
  let absCode = String(cleanRow['ABSコード'] || cleanRow['ABSCD'] || '').replace(/\s+/g, '');
  if (!absCode && rawValues.length > 0) {
    absCode = String(rawValues[0]).replace(/\s+/g, '');
  }

  // 商品コード(NO.): 2列目、または指定の見出し名から取得
  let productCode = String(cleanRow['ＮＯ．'] || cleanRow['NO.'] || '').trim();
  if (!productCode && rawValues.length > 1) {
    productCode = String(rawValues[1]).trim();
  }

  // 必須項目がない場合はスキップ
  if (!absCode || absCode === 'ABSコード' || absCode === 'ABSCD') return null;

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
