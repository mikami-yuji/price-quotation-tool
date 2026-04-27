import * as XLSX from 'xlsx';
import { OrderRecord, CustomPriceMatrixRow } from '../types';

/**
 * Excelのファイルオブジェクト（ArrayBuffer）を読み込み、受注データと別注単価表の配列を返します。
 * @param arrayBuffer ブラウザで読み込んだExcelファイルのArrayBuffer
 * @returns 抽出されたデータ
 */
export const parseExcelFile = (arrayBuffer: ArrayBuffer): { orders: OrderRecord[], priceMatrix: CustomPriceMatrixRow[] } => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames;

  let orders: OrderRecord[] = [];
  let priceMatrix: CustomPriceMatrixRow[] = [];

  // 受注データの読み込み (システムからのエクスポート)
  if (sheetNames.includes('受注データ')) {
    const sheet = workbook.Sheets['受注データ'];
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    orders = rawData.map((row) => mapRowToOrderRecord(row));
  } 
  // 見積書データの読み込み (本ツールで生成したExcelからの再利用)
  else if (sheetNames.includes('見積書')) {
    const sheet = workbook.Sheets['見積書'];
    // 行13(インデックス12)からヘッダーが始まると想定
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { range: 12, defval: '' });
    orders = rawData.map((row) => mapQuoteRowToOrderRecord(row));
  }

  // 別注単価表の読み込み
  if (sheetNames.includes('別注単価表')) {
    const sheet = workbook.Sheets['別注単価表'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawMatrix = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    priceMatrix = rawMatrix.map((row: any) => mapRowToPriceMatrix(row)).filter(row => row !== null) as CustomPriceMatrixRow[];
  }

  return { orders, priceMatrix };
};

/**
 * 行データを受注レコードオブジェクトにマッピングする
 * @param row Excelの1行分のJSONデータ
 * @returns OrderRecordオブジェクト
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRowToOrderRecord = (row: Record<string, any>): OrderRecord => {
  return {
    orderNumber: String(row['受注№'] || ''),
    category: String(row['種別'] || ''),
    weight: row['重量'] || 0,
    productCode: String(row['商品コード'] || ''),
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
 * 再値上げのシミュレーション用に、「新単価」を「現行単価」として扱う。
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
    // 以下の項目は見積書には含まれないか、重要性が低いため初期値を設定
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
 * @param row Excelの1行分のJSONデータ
 * @returns CustomPriceMatrixRowオブジェクト、または無効な行ならnull
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRowToPriceMatrix = (row: Record<string, any>): CustomPriceMatrixRow | null => {
  const materialName = row['材質名称'] as string;
  const weight = row['重量'];
  
  if (!materialName) return null;

  const colorPrices: { [key: number]: number } = {};
  
  // 1〜7の色数キーが存在するか確認し、価格を格納（カンマ区切りがある場合は最初の値を採用、または平均化するか要検討ですが今回は最初）
  for (let i = 1; i <= 7; i++) {
    const val = row[String(i)];
    if (val) {
      if (typeof val === 'number') {
        colorPrices[i] = val;
      } else if (typeof val === 'string') {
        // "39.0, 50.5" のような文字列なら最初の値を抽出
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
