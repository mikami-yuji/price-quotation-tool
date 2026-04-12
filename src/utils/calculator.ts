import { 
  OrderRecord, 
  CustomPriceMatrixRow, 
  IncreaseSimulationConditions, 
  ManualGroupSetting, 
  IndividualManualSetting,
  ReadymadeMasterRow,
  ReadymadePriceType,
  ReadymadeSegment
} from '../types';

/**
 * 全オーダーレコードに対してシミュレーション結果を計算する
 */
export const calculateNewPrices = (
  orders: OrderRecord[],
  priceMatrix: CustomPriceMatrixRow[],
  conditions: IncreaseSimulationConditions,
  groupSettings: ManualGroupSetting = {},
  individualSettings: IndividualManualSetting = {},
  categorizedMasters: { 
    custom: CustomPriceMatrixRow[], 
    sp: CustomPriceMatrixRow[], 
    readymade: CustomPriceMatrixRow[] | ReadymadeMasterRow[],
    sticker: CustomPriceMatrixRow[]
  } = { custom: [], sp: [], readymade: [], sticker: [] },
  readymadePrefs?: { type: ReadymadePriceType; segment: ReadymadeSegment }
): OrderRecord[] => {
  return orders.map(order => {
    let newPrice = order.currentPrice;
    
    // 優先順位: 個別設定 > グループ設定 > デフォルト
    const individual = individualSettings[order.orderNumber];
    
    // SP・シルクの場合は印刷コードも含めた4項目でグルーピング
    const isCustom = order.category === '別注' || order.category === 'ポリ別注';
    const isSP = order.category === 'SP' || order.category === 'シルク';
    const isSticker = order.category === 'シール' || order.category === 'シール（フルオーダー）' || order.category.includes('シール');
    const isReady = order.category === '既製品' || order.category === '';

    const groupKey = isSP 
      ? `${order.materialName}-${order.weight}-${order.totalColorCount}-${order.printCode}`
      : `${order.materialName}-${order.weight}-${order.totalColorCount}`;
    
    const group = (isCustom || isSP || isSticker) ? groupSettings[groupKey] : null;

    // 1. 改定単価の決定
    if (individual?.price !== undefined && individual.price !== 0) {
      newPrice = individual.price;
    } else if (group?.price !== undefined && group.price !== 0) {
      newPrice = group.price;
    } else {
      if (isCustom) {
        // 先に手アップロードのマスター、なければ共用(Excel内)の単価表をチェック
        const masterPrice = findPriceFromMatrix(order, categorizedMasters.custom as CustomPriceMatrixRow[]);
        if (masterPrice !== null) {
          newPrice = masterPrice;
        } else {
          newPrice = calculateCustomIncrease(order.currentPrice, conditions);
        }
      } else if (isSP) {
        // SPマスターを優先チェック
        const masterPrice = findPriceFromMatrix(order, categorizedMasters.sp as CustomPriceMatrixRow[]);
        if (masterPrice !== null) {
          newPrice = masterPrice;
        } else {
          // 既存の共用テーブルチェック (SP対応済み)
          const mappedPrice = findPriceFromMatrix(order, priceMatrix);
          if (mappedPrice !== null) {
            newPrice = mappedPrice;
          }
        }
      } else if (isSticker) {
        // シールマスターを優先チェック
        const masterPrice = findPriceFromMatrix(order, categorizedMasters.sticker as CustomPriceMatrixRow[]);
        if (masterPrice !== null) {
          newPrice = masterPrice;
        } else {
          // シールも基本は別注と同じ扱いで単価表をチェック
          const mappedPrice = findPriceFromMatrix(order, priceMatrix);
          if (mappedPrice !== null) {
            newPrice = mappedPrice;
          }
        }
      } else if (isReady) {
        // 既製マスター（高度な価格表含む）を優先チェック
        const masterTable = categorizedMasters.readymade;
        if (masterTable.length > 0) {
          if ('campaign' in masterTable[0]) {
            // ReadymadeMasterRow 型として処理
            // ReadymadeMasterRow 型として処理
            // 同じ商品コードの中で、受注数(order.quantity)が設定された最小数量(minQuantity)を満たすもののうち、
            // 最もしきい値が高い（＝より大口の条件に合致する）行を選択する
            const matches = (masterTable as ReadymadeMasterRow[]).filter(m => m.productCode === order.productCode);
            const mapped = matches
              .filter(m => (order.quantity || 0) >= m.minQuantity)
              .sort((a, b) => b.minQuantity - a.minQuantity)[0];

            if (mapped && readymadePrefs) {
              const priceGroup = readymadePrefs.type === 'campaign' ? mapped.campaign : mapped.normal;
              const price = priceGroup[readymadePrefs.segment];
              if (price > 0) newPrice = price;
            }
          } else {
            // 標準の CustomPriceMatrixRow 型として処理
            const mappedPrice = findPriceFromMatrix(order, masterTable as CustomPriceMatrixRow[]);
            if (mappedPrice !== null) newPrice = mappedPrice;
          }
        } else {
          // 共用テーブル（Excel内）チェック
          const mappedPrice = findPriceFromMatrix(order, priceMatrix);
          if (mappedPrice !== null) {
            newPrice = mappedPrice;
          }
        }
      }
    }

    // 端数処理
    if (conditions.roundingMode === 'half') {
      // 0.5単位で丸める (.00 または .50)
      newPrice = Math.round(newPrice * 2) / 2;
    } else {
      // 通常（小数点第2位あたりで四捨五入）
      newPrice = Math.round(newPrice * 100) / 100;
    }
    
    // JSの浮動小数点問題を避けるため
    const priceDifference = Math.round((newPrice - order.currentPrice) * 100) / 100;
    
    // 2. 改定後営Gの決定 (優先順位: 個別 > グループ > 差額加算)
    let resultSalesGroup: number;
    if (individual?.salesGroup !== undefined && individual.salesGroup !== 0) {
      resultSalesGroup = individual.salesGroup;
    } else if (group?.salesGroup !== undefined && group.salesGroup !== 0) {
      resultSalesGroup = group.salesGroup;
    } else {
      resultSalesGroup = Math.round((order.salesGroup + priceDifference) * 100) / 100;
    }

    // 3. 改定印刷代・改定印刷営Gの決定
    let newPrintingCost = order.printingCost;
    let newPrintingSalesGroup = order.printingSalesGroup;

    if (individual?.printingPrice !== undefined && individual.printingPrice !== 0) {
      newPrintingCost = individual.printingPrice;
    } else if (group?.printingPrice !== undefined && group.printingPrice !== 0) {
      newPrintingCost = group.printingPrice;
    }

    if (individual?.printingSalesGroup !== undefined && individual.printingSalesGroup !== 0) {
      newPrintingSalesGroup = individual.printingSalesGroup;
    } else if (group?.printingSalesGroup !== undefined && group.printingSalesGroup !== 0) {
      newPrintingSalesGroup = group.printingSalesGroup;
    }

    return {
      ...order,
      newPrice,
      newSalesGroup: resultSalesGroup,
      newPrintingCost,
      newPrintingSalesGroup,
      priceDifference
    };
  });
};

/**
 * 価格表から該当する条件の単価を検索する
 */
const findPriceFromMatrix = (order: OrderRecord, matrix: CustomPriceMatrixRow[]): number | null => {
  const row = matrix.find(r => r.materialName === order.materialName && String(r.weight) === String(order.weight));
  if (!row) return null;
  
  return row.colorPrices[order.totalColorCount] || null;
};

/**
 * 別注の一律値上げ計算を行う
 */
const calculateCustomIncrease = (currentPrice: number, conditions: IncreaseSimulationConditions): number => {
  if (conditions.customIncreaseType === 'percentage') {
    return currentPrice * (1 + conditions.customIncreaseValue / 100);
  } else {
    return currentPrice + conditions.customIncreaseValue;
  }
};
