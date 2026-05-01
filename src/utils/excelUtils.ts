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

  // 4. 既製品マスターの読み込み (商品コードベース)
  // まずは特定のキーワードを含むシートを探す
  let readySheet = sheetNames.find(n => 
    n.includes('既製品') || n.includes('価格表') || n.includes('マスター') || n.includes('Readymade')
  );

  // 見つからない場合、全シートをスキャンして「商品コード」等の列があるシートを探す
  if (!readySheet) {
    for (const name of sheetNames) {
      const sheet = workbook.Sheets[name];
      const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { header: 1, range: 0, defval: '' });
      const firstRow = json[0] || [];
      if (firstRow.some((cell: any) => String(cell).includes('商品コード') || String(cell).includes('商品CD'))) {
        readySheet = name;
        break;
      }
    }
  }

  if (readySheet) {
    const sheet = workbook.Sheets[readySheet];
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    readymadeMaster = rawData.map(row => mapRowToReadymadeMaster(row)).filter(row => row !== null) as ReadymadeMasterRow[];
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
 * 行データを既製品マスターオブジェクトにマッピングする
 * CSV/Excel両方の可能性を考慮し、複数のヘッダー名に対応
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRowToReadymadeMaster = (row: Record<string, any>): ReadymadeMasterRow | null => {
  const productCode = String(row['商品コード'] || row['商品CD'] || row['コード'] || '');
  if (!productCode || productCode === '商品コード') return null; // ヘッダー行をスキップ

  // 数量スライド（備考_2 から抽出）
  const remark = String(row['備考_2'] || row['数量下限'] || row['備考'] || '');
  let minQuantity = 0;
  const match = remark.match(/\((\d+)[～~-]/);
  if (match) {
    minQuantity = parseInt(match[1], 10);
  }

  return {
    productCode,
    minQuantity,
    campaign: {
      uru: Number(row['キャンペーン_売単価'] || row['キャン_売'] || row['キャンペーン売'] || 0),
      junD: Number(row['キャンペーン_準D単価'] || row['キャン_準D'] || row['キャンペーン準D'] || 0),
      d: Number(row['キャンペーン_D単価'] || row['キャン_D'] || row['キャンペーンD'] || 0),
    },
    normal: {
      uru: Number(row['通常_売単価'] || row['通常売'] || row['売単価'] || 0),
      junD: Number(row['通常_準D単価'] || row['通常準D'] || row['準D単価'] || 0),
      d: Number(row['通常_D単価'] || row['通常D'] || row['D単価'] || 0),
    }
  };
};
