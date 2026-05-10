import * as XLSX from 'xlsx';
import { OrderRecord, CustomPriceMatrixRow, ReadymadeMasterRow, SPMasterRow } from '../types';
import { isSPCategory } from './stringUtils';

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
      const headerRow = rows.find(r => 
        Array.isArray(r) && 
        (r.includes('受注№') || r.includes('種別') || r.includes('商品コード') || r.includes('商品名') || r.includes('受注No') || r.includes('No'))
      ) as unknown[] | undefined;
      if (headerRow) {
        const headerIdx = rows.indexOf(headerRow);
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const order = mapRowArrayToOrderRecord(rows[i] as unknown[], headerRow);
          if (order.orderNumber || order.productCode || order.productName) orders.push(order);
        }
      }
    }
  }
  return { orders, priceMatrix, readymadeMaster };
};

const getSPRowType = (val: string): 'uru' | 'junD' | 'd' | null => {
  const v = String(val || '').normalize('NFKC').trim().toLowerCase();
  if (!v) return null;
  // 「売」の判定
  if (v.includes('売') || v.includes('通常') || v.includes('うる') || v.includes('sale')) return 'uru';
  // 「準」の判定 (Dが含まれていても「準」があれば準Dとして扱う)
  if (v.includes('準') || v.includes('jun')) return 'junD';
  // 純粋な「D」の判定
  if (v.includes('d') || v.includes('ｄ') || v.includes('バラ') || v.includes('小口')) return 'd';
  return null;
};

export type SPParseResult = {
  data: SPMasterRow[];
  diagnostics: string[];
};

/**
 * 「Noカタログ形式」対応のSPマスターパーサー
 * 品番（カタログNo）に頼らず、材質キーワードと仕様でマッチングします。
 */
export const parseSPMasterFile = (arrayBuffer: ArrayBuffer): SPParseResult => {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const spMaster: SPMasterRow[] = [];
  const diagnostics: string[] = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (rows.length < 2) continue;

    // ヘッダー行の特定
    let headerRowIdx = -1;
    const colIdx = {
      keyword: -1, // 材質キーワード列
      weight: -1,
      qty: -1,
      unit: -1,
      type: -1,
      colors: {} as { [key: number]: number }
    };

    let firstRowStr = '';
    if (rows[0] && Array.isArray(rows[0])) {
      firstRowStr = rows[0].map(c => String(c)).join(' | ');
    }

    for (let r = 0; r < Math.min(rows.length, 100); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const rowStr = row.map(c => String(c || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase());
      
      const hasQty = rowStr.some(s => s.includes('数量') || s.includes('ロット'));
      const hasColor = rowStr.some(s => s.match(/[1-8]色/));

      if (hasQty || hasColor) {
        headerRowIdx = r;
        rowStr.forEach((s, i) => {
          if (s.includes('キーワード') || s.includes('材質')) colIdx.keyword = i;
          if (s.includes('kg') || s.includes('重量') || s.includes('㎏')) colIdx.weight = i;
          if (s.includes('数量') || s.includes('ロット') || s.includes('枚数') || s.includes('本数')) colIdx.qty = i;
          if (s.includes('単位')) colIdx.unit = i;
          if (s.includes('区分') || s.includes('タイプ')) colIdx.type = i;
          const m = s.match(/([1-8])色/);
          if (m) colIdx.colors[i] = parseInt(m[1], 10);
        });
        break;
      }
    }

    if (headerRowIdx === -1) {
      diagnostics.push(`${sheetName}: スキップ (ヘッダー未検出) [1行目: ${firstRowStr.slice(0, 50)}]`);
      continue;
    }

    // シート名からのデフォルトキーワード
    const sheetKeyword = sheetName.replace(/^[0-9_]+/, '').replace(/SP/g, '').trim();
    let recordCount = 0;

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      // 1. 材質キーワードの特定
      const rowKeyword = colIdx.keyword !== -1 ? String(row[colIdx.keyword] || '').trim() : '';
      const finalKeyword = rowKeyword || sheetKeyword;
      if (!finalKeyword) {
        if (recordCount === 0) diagnostics.push(`Skip(keyword): ${JSON.stringify(row)}`);
        continue;
      }

      // 2. 仕様の抽出
      let currentWeight = 0;
      let currentQty = 0;
      let currentUnit: 'm' | 'pcs' = 'pcs';

      if (colIdx.weight !== -1) {
        const w = parseFloat(String(row[colIdx.weight] || '').replace(/[^\d.]/g, ''));
        if (!isNaN(w)) currentWeight = w;
      }
      if (colIdx.qty !== -1) {
        const qVal = String(row[colIdx.qty] || '');
        const q = parseFloat(qVal.replace(/[^\d.]/g, ''));
        if (!isNaN(q)) {
          currentQty = q;
          if (qVal.includes('m') || qVal.includes('ｍ')) currentUnit = 'm';
          else if (qVal.includes('枚')) currentUnit = 'pcs';
        }
      }
      if (colIdx.unit !== -1) {
        const u = String(row[colIdx.unit] || '');
        if (u.includes('m') || u.includes('ｍ')) currentUnit = 'm';
        else if (u.includes('枚')) currentUnit = 'pcs';
      }

      if (currentQty === 0) {
        if (recordCount === 0) diagnostics.push(`Skip(qty=0): colIdx.qty=${colIdx.qty}, val=${row[colIdx.qty]}`);
        continue;
      }

      // 3. 価格区分の判定
      let rowType: 'uru' | 'junD' | 'd' | null = null;
      if (colIdx.type !== -1) {
        rowType = getSPRowType(String(row[colIdx.type] || ''));
      }
      if (!rowType) {
        for (let i = 0; i < row.length; i++) {
          rowType = getSPRowType(String(row[i] || ''));
          if (rowType) break;
        }
      }
      if (!rowType) {
        if (recordCount === 0) diagnostics.push(`Skip(type): colIdx.type=${colIdx.type}, val=${row[colIdx.type]}`);
        continue;
      }

      // 4. 価格の抽出
      const colorPrices: { [color: number]: { uru: number; junD: number; d: number } } = {};
      Object.entries(colIdx.colors).forEach(([iStr, color]) => {
        const i = parseInt(iStr, 10);
        const pStr = String(row[i] || '').replace(/[売準DＤ￥\\$,\s]/g, '');
        const p = parseFloat(pStr);
        if (!isNaN(p) && p > 0) {
          if (!colorPrices[color]) colorPrices[color] = { uru: 0, junD: 0, d: 0 };
          colorPrices[color][rowType!] = p;
        }
      });

      if (Object.keys(colorPrices).length === 0) {
        if (recordCount === 0) diagnostics.push(`Skip(price): colIdx.colors=${JSON.stringify(colIdx.colors)}, rowVals=${Object.keys(colIdx.colors).map(i => row[Number(i)])}`);
        continue;
      }

      // 5. データの登録（既存データへのマージ）
      // 材質、重量、数量、単位、形状がすべて一致するものを探す
      const currentShape = currentUnit === 'm' ? 'R' : '単袋';
      
      const existing = spMaster.find(ex => 
        ex.materialHint === finalKeyword && 
        ex.weight === currentWeight && 
        ex.minQuantity === currentQty && 
        ex.unit === currentUnit &&
        ex.shape === currentShape
      );

      if (existing) {
        Object.entries(colorPrices).forEach(([colorStr, prices]) => {
          const color = parseInt(colorStr, 10);
          if (!existing!.colorPrices[color]) {
            existing!.colorPrices[color] = { uru: 0, junD: 0, d: 0 };
          }
          // 値がある場合のみ上書き（既存の他の区分を消さない）
          if (prices.uru) existing!.colorPrices[color].uru = prices.uru;
          if (prices.junD) existing!.colorPrices[color].junD = prices.junD;
          if (prices.d) existing!.colorPrices[color].d = prices.d;
        });
      } else {
        spMaster.push({
          materialHint: finalKeyword,
          catalogNos: [],
          weight: currentWeight,
          minQuantity: currentQty,
          lotType: 'above',
          unit: currentUnit,
          shape: currentShape,
          colorPrices
        });
        recordCount++;
      }
    }
    
    diagnostics.push(`${sheetName}: ${recordCount}件 (colIdx: ${JSON.stringify(colIdx)})`);
  }

  return { data: spMaster, diagnostics };
};

const parseReadymadeMaster = (rows: unknown[]): ReadymadeMasterRow[] => {
  const master: ReadymadeMasterRow[] = [];
  if (rows.length < 2) return master;

  // ヘッダー行の特定
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i];
    if (Array.isArray(r) && (r.includes('商品コード') || r.includes('商品CD') || r.includes('ABS-CD'))) {
      headerRowIdx = i;
      break;
    }
  }
  if (headerRowIdx === -1) headerRowIdx = 0;

  const headerRow = rows[headerRowIdx] as unknown[];
  const getIdx = (keywords: string[]) => headerRow.findIndex(c => keywords.some(k => String(c || '').includes(k)));
  
  const idxMap = {
    code: getIdx(['商品コード', '商品CD', 'コード', 'ABS-CD']),
    name: getIdx(['商品名', '品名', '規格名']),
    // 客層別価格の列特定
    uru: getIdx(['売', '通常', '現行', '販売単価']),
    junD: getIdx(['準D', '準']),
    d: getIdx(['D', 'ｄ', '小口']),
    // キャンペーン価格の列特定 (もしあれば)
    cpUru: getIdx(['CP売', '特売', 'キャンペーン']),
    cpJunD: getIdx(['CP準D']),
    cpD: getIdx(['CP D']),
    // スライド
    slideQty: getIdx(['スライド数量', 'ケース']),
    slidePrice: getIdx(['スライド単価'])
  };

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!Array.isArray(row)) continue;
    
    const code = String(row[idxMap.code] || '').trim();
    if (!code) continue;

    const parseP = (idx: number) => {
      if (idx === -1) return 0;
      const v = String(row[idx] || '').replace(/[^\d.]/g, '');
      return parseFloat(v) || 0;
    };

    master.push({
      productCode: code,
      absCode: code.replace(/\s+/g, ''),
      productName: String(row[idxMap.name] || ''),
      normal: {
        uru: parseP(idxMap.uru),
        junD: parseP(idxMap.junD),
        d: parseP(idxMap.d)
      },
      campaign: {
        uru: parseP(idxMap.cpUru) || parseP(idxMap.uru),
        junD: parseP(idxMap.cpJunD) || parseP(idxMap.junD),
        d: parseP(idxMap.cpD) || parseP(idxMap.d)
      },
      minQuantity: parseP(idxMap.slideQty) || 0,
      normalPrice: parseP(idxMap.uru) // 下位互換用
    });
  }
  return master;
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
  const getIdx = (keywords: string[]) => {
    const exact = header.findIndex((c: unknown) => keywords.some(k => String(c) === k));
    if (exact !== -1) return exact;
    return header.findIndex((c: unknown) => keywords.some(k => String(c).includes(k)));
  };
  const idxMap = {
    orderNumber: getIdx(['受注№', '受注番号', 'No', '№', '注文番号']),
    category: getIdx(['種別', 'カテゴリ', '種']),
    productCode: getIdx(['商品コード', '商品CD', 'コード', 'CD', '商品']),
    productName: getIdx(['商品名', '品名', '規格名', '摘要']),
    quantity: getIdx(['受注数量', '受注数', '数量', '個数']),
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
    directDeliveryName: getIdx(['直送先名称', '直送先名', '直送先']),
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
  
  // 種別（カテゴリ）のみで判断
  const isSP = isSPCategory(category);
  
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
