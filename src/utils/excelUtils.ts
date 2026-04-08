import * as XLSX from 'xlsx';
import { OrderRecord, CustomPriceMatrixRow } from '../types';

/**
 * Excelのファイルオブジェクト（ArrayBuffer）を読み込み、受注データと別注単価表の配列を返します。
 * @param arrayBuffer ブラウザで読み込んだExcelファイルのArrayBuffer
 * @returns 抽出されたデータ
 */
export const parseExcelFile = (arrayBuffer: ArrayBuffer): { orders: OrderRecord[], priceMatrix: CustomPriceMatrixRow[] } => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;

  let orders: OrderRecord[] = [];
  let priceMatrix: CustomPriceMatrixRow[] = [];

  // 受注データの読み込み
  if (sheetNames.includes('受注データ')) {
    const sheet = workbook.Sheets['受注データ'];
    // 最初の行をヘッダーとしてJSON化
    const rawData = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
    orders = rawData.map((row) => mapRowToOrderRecord(row));
  }

  // 別注単価表の読み込み
  if (sheetNames.includes('別注単価表')) {
    const sheet = workbook.Sheets['別注単価表'];
    const rawMatrix = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });
    priceMatrix = rawMatrix.map(row => mapRowToPriceMatrix(row)).filter(row => row !== null) as CustomPriceMatrixRow[];
  }

  return { orders, priceMatrix };
};

/**
 * 行データを受注レコードオブジェクトにマッピングする
 * @param row Excelの1行分のJSONデータ
 * @returns OrderRecordオブジェクト
 */
const mapRowToOrderRecord = (row: any): OrderRecord => {
  return {
    orderNumber: String(row['受注№'] || ''),
    category: String(row['種別'] || ''),
    weight: row['重量'] || 0,
    productCode: String(row['商品コード'] || ''),
    productName: String(row['商品名'] || ''),
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
    lastOrderDate: String(row['最終受注日'] || ''),
    designName: String(row['デザイン名'] || '')
  };
};

/**
 * 行データを単価表マトリックスオブジェクトにマッピングする
 * @param row Excelの1行分のJSONデータ
 * @returns CustomPriceMatrixRowオブジェクト、または無効な行ならnull
 */
const mapRowToPriceMatrix = (row: any): CustomPriceMatrixRow | null => {
  const materialName = row['材質名称'];
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
