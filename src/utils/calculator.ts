import { 
  OrderRecord, 
  CustomPriceMatrixRow, 
  IncreaseSimulationConditions, 
  ManualGroupSetting, 
  IndividualManualSetting,
  ReadymadeMasterRow,
  ReadymadePriceType,
  ReadymadeSegment,
  SPMasterRow
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
    sp: SPMasterRow[], 
    readymade: ReadymadeMasterRow[],
    sticker: CustomPriceMatrixRow[]
  } = { custom: [], sp: [], readymade: [], sticker: [] },
  readymadePrefs?: { type: ReadymadePriceType; segment: ReadymadeSegment }
): OrderRecord[] => {
  return orders.map(order => {
    let newPrice = order.currentPrice;
    const individual = individualSettings[order.orderNumber];
    const category = (order.category || '').trim();
    const isCustom = category.includes('別注') || category.includes('ポリ');
    const isSticker = category === 'シール' || category === 'シール（フルオーダー）' || category.includes('シール');
    const isSP = (category.includes('SP') || category.includes('ＳＰ')) && !category.includes('シルク');
    const isReady = !isCustom && !isSP && !isSticker && order.productCode !== '999999999';
    
    // グループキーの生成
    const groupKey = isSP 
      ? `${order.materialName}-${order.weight}-${order.totalColorCount}-${order.printCode}`
      : isReady ? `${order.materialName}-${order.weight}`
      : `${order.materialName}-${order.weight}-${order.totalColorCount}`;
      
    const group = (isCustom || isSP || isSticker || isReady) ? groupSettings[groupKey] : null;

    let isManualPrice = false;
    if (individual?.price !== undefined && individual.price !== 0) {
      newPrice = individual.price;
      isManualPrice = true;
    } else if (group?.price !== undefined && group.price !== 0) {
      newPrice = group.price;
      isManualPrice = true;
    } else {
      const normalize = (s: unknown): string => (!s ? '' : String(s).replace(/\s+/g, '').replace(/^0+/, '').toUpperCase());
      if (isCustom) {
        const masterPrice = findPriceFromMatrix(order, categorizedMasters.custom as CustomPriceMatrixRow[]);
        if (masterPrice !== null) {
          newPrice = masterPrice;
        } else {
          newPrice = calculateCustomIncrease(order.currentPrice, conditions);
        }
      } else if (isSP) {
        let spMatched = false;
        if (categorizedMasters.sp && categorizedMasters.sp.length > 0) {
          const baseMatches = (categorizedMasters.sp as SPMasterRow[]).filter(m => {
            const weightMatch = Math.abs(Number(m.weight) - Number(order.weight)) < 0.1;
            const orderShape = String(order.shape || '').toUpperCase();
            const mShape = String(m.shape || '').toUpperCase();
            const shapeMatch = mShape === 'R' ? orderShape.includes('R') : orderShape.includes(mShape);
            
            let materialMatch = true;
            if (m.materialHint && order.materialName) {
              let normM = normalize(order.materialName).replace(/[【】]/g, '');
              // ユーザー指示：「ポリ透明はポリです。コンビポリやSFポリとは異なります」
              // 部分一致だとSFポリもポリに合致してしまうため、完全一致に変更し、特定の表記ゆれを吸収する
              if (normM === 'ポリ透明') {
                normM = 'ポリ';
              }
              const normH = normalize(m.materialHint).replace(/[【】]/g, '');
              materialMatch = (normM === normH);
            }
            return weightMatch && shapeMatch && materialMatch;
          });

          // 1段階目：商品コードが一致するものを優先して探す
          const orderCode = normalize(order.productCode || order.absCode);
          let matches = baseMatches.filter(m => {
            return m.catalogNos.some(no => {
              const normNo = normalize(no);
              return orderCode.includes(normNo) || normNo.includes(orderCode);
            });
          });

          // 2段階目：コード一致が見つからず、かつ重量が5kg以上（10kなど）の場合は、コード一致を無視してフォールバック
          if (matches.length === 0 && Number(order.weight) >= 5) {
            matches = baseMatches.filter(m => m.catalogNos.some(no => no.toUpperCase().includes('K') || Number.isNaN(Number(normalize(no)))));
            // マスター側に「△10K」などの表記がある汎用行を優先的に拾う
            if (matches.length === 0) {
               matches = baseMatches;
            }
          }
          const matched = matches.filter(m => order.quantity >= m.minQuantity).sort((a, b) => b.minQuantity - a.minQuantity)[0];
          if (matched) {
            const segment = readymadePrefs?.segment || 'uru';
            const colorCount = order.totalColorCount || (order.frontColorCount + order.backColorCount);
            const priceObj = matched.colorPrices[colorCount];
            if (priceObj) {
              const price = priceObj[segment];
              if (price > 0) { newPrice = price; spMatched = true; }
            }
          }
        }
      } else if (isSticker) {
        const masterPrice = findPriceFromMatrix(order, categorizedMasters.sticker as CustomPriceMatrixRow[]);
        if (masterPrice !== null) {
          newPrice = masterPrice;
        } else {
          const mappedPrice = findPriceFromMatrix(order, priceMatrix);
          if (mappedPrice !== null) { newPrice = mappedPrice; }
        }
      } else if (isReady) {
        const masterTable = categorizedMasters.readymade;
        if (masterTable.length > 0) {
          if ('campaign' in masterTable[0]) {
            const orderCode = normalize(order.productCode || order.absCode);
            const masterRows = masterTable as ReadymadeMasterRow[];
            const matches = masterRows.filter(m => normalize(m.productCode) === orderCode || (m.absCode && normalize(m.absCode) === orderCode));
            const matched = matches.filter(m => order.quantity >= (m.minQuantity || 0)).sort((a, b) => (b.minQuantity || 0) - (a.minQuantity || 0))[0];
            if (matched && readymadePrefs) {
              const priceGroup = readymadePrefs.type === 'campaign' ? matched.campaign : matched.normal;
              const price = priceGroup[readymadePrefs.segment];
              if (price > 0) newPrice = price;
            }
          } else {
            const mappedPrice = findPriceFromMatrix(order, masterTable as unknown as CustomPriceMatrixRow[]);
            if (mappedPrice !== null) newPrice = mappedPrice;
          }
        } else {
          const mappedPrice = findPriceFromMatrix(order, priceMatrix);
          if (mappedPrice !== null) { newPrice = mappedPrice; }
        }
      }
    }

    const unroundedPriceDifference = Math.round((newPrice - order.currentPrice) * 100) / 100;
    
    // 商品名のクリーンアップ (特にSP)
    let displayProductName = order.productName;
    if (isSP && order.title) {
      // 日付、重量(5k, 5kg, 1.4K等)、材質(ﾎﾟﾘﾎﾟﾘ, SFﾎﾟﾘ等)を除去
      displayProductName = order.title
        .replace(/^\d{4}-\d{2}-\d{2}\s*/, '') // 日付
        .replace(/^[^\s]*\s*/, '') // 行頭の管理記号等
        .replace(/^\d+(\.\d+)?[kK]([gG])?\s*/, '') // 重量
        .replace(/^(ﾎ|ﾎﾟ)ﾘ(ﾎ|ﾎﾟ)ﾘ\s*/, '') // 材質
        .replace(/^SF(ﾎ|ﾎﾟ)ﾘ\s*/, '') // 材質
        .trim();
      if (!displayProductName) displayProductName = order.productName;
    }

    if (!isManualPrice) {
      if (conditions.roundingMode === 'half') {
        newPrice = Math.round(newPrice * 2) / 2;
      } else {
        newPrice = Math.round(newPrice * 100) / 100;
      }
    }
    let resultSalesGroup: number;
    if (individual?.salesGroup !== undefined && individual.salesGroup !== 0) {
      resultSalesGroup = individual.salesGroup;
    } else if (group?.salesGroup !== undefined && group.salesGroup !== 0) {
      resultSalesGroup = group.salesGroup;
    } else {
      resultSalesGroup = Math.round((order.salesGroup + unroundedPriceDifference) * 100) / 100;
    }
    const priceDifference = Math.round((newPrice - order.currentPrice) * 100) / 100;
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
      productName: displayProductName,
      newPrice, newSalesGroup: resultSalesGroup,
      newPrintingCost, newPrintingSalesGroup, priceDifference,
      thickness: individual?.thickness
    };
  });
};

const findPriceFromMatrix = (order: OrderRecord, matrix: CustomPriceMatrixRow[]): number | null => {
  const norm = (s: string) => s.replace(/[【】]/g, '').trim();
  const oMat = norm(order.materialName);
  
  // 材質名と重量で検索 (前方一致を許容)
  const row = matrix.find(r => {
    const rMat = norm(r.materialName);
    const matMatch = oMat.startsWith(rMat) || rMat.startsWith(oMat);
    const weightMatch = String(r.weight) === String(order.weight);
    return matMatch && weightMatch;
  });
  
  if (!row) return null;

  // 指定の色数で検索
  if (row.colorPrices[order.totalColorCount] !== undefined) {
    return row.colorPrices[order.totalColorCount];
  }

  // 見つからない場合、ポリ系の特定ロジック(色数-1)を試行
  if (oMat.includes('ポリ') && !oMat.includes('SF')) {
    const offsetPrice = row.colorPrices[order.totalColorCount - 1];
    if (offsetPrice !== undefined) return offsetPrice;
  }

  return null;
};

const calculateCustomIncrease = (currentPrice: number, conditions: IncreaseSimulationConditions): number => {
  if (conditions.customIncreaseType === 'percentage') {
    return currentPrice * (1 + conditions.customIncreaseValue / 100);
  } else {
    return currentPrice + conditions.customIncreaseValue;
  }
};
