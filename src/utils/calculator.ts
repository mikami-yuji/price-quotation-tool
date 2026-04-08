import { OrderRecord, CustomPriceMatrixRow, IncreaseSimulationConditions, ManualGroupSetting, IndividualManualSetting } from '../types';

/**
 * 全オーダーレコードに対してシミュレーション結果を計算する
 * @param orders 受注データ
 * @param priceMatrix 別注単価表データ
 * @param conditions 別注用の一律値上げ条件
 * @param groupSettings 別注用のグループ設定 (任意)
 * @param individualSettings 受注Noごとの個別設定 (任意)
 * @returns 新しい単価と差額が設定された受注データの配列
 */
export const calculateNewPrices = (
  orders: OrderRecord[],
  priceMatrix: CustomPriceMatrixRow[],
  conditions: IncreaseSimulationConditions,
  groupSettings: ManualGroupSetting = {},
  individualSettings: IndividualManualSetting = {}
): OrderRecord[] => {
  return orders.map(order => {
    let newPrice = order.currentPrice;
    
    // 優先順位: 個別設定 > グループ設定 > デフォルト
    const individual = individualSettings[order.orderNumber];
    const groupKey = `${order.materialName}-${order.weight}-${order.totalColorCount}`;
    const group = (order.category === '別注' || order.category === 'ポリ別注') ? groupSettings[groupKey] : null;

    // 1. 改定単価の決定
    if (individual?.price !== undefined && individual.price !== 0) {
      newPrice = individual.price;
    } else if (group?.price !== undefined && group.price !== 0) {
      newPrice = group.price;
    } else {
      if (order.category === '別注' || order.category === 'ポリ別注') {
        newPrice = calculateCustomIncrease(order.currentPrice, conditions);
      } else if (order.category === '既製品' || order.category === 'SP' || order.category === 'シルク' || order.category === '') {
        const mappedPrice = findPriceFromMatrix(order, priceMatrix);
        if (mappedPrice !== null) {
          newPrice = mappedPrice;
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

    return {
      ...order,
      newPrice,
      newSalesGroup: resultSalesGroup,
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
