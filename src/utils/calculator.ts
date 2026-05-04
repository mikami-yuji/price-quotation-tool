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
    const isCustom = order.category === '別注' || order.category === 'ポリ別注';
    const isSP = order.category === 'SP';
    const isSticker = order.category === 'シール' || order.category === 'シール（フルオーダー）' || order.category.includes('シール');
    const category = (order.category || '').trim();
    const isReady = category.includes('既製品') || category.includes('既製') || category === 'シルク' || category === '' || category.toUpperCase() === 'READYMADE';
    
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
          const orderCode = normalize(order.productCode || order.absCode);
          const matches = (categorizedMasters.sp as SPMasterRow[]).filter(m => {
            const codeMatch = m.catalogNos.some(no => orderCode.includes(normalize(no)));
            const weightMatch = Number(m.weight) === Number(order.weight);
            const shapeMatch = (m.shape === order.shape || (order.shape === 'R' && m.shape === 'R') || (order.shape === '単袋' && m.shape === '単袋'));
            
            let materialMatch = true;
            if (m.materialHint && order.materialName) {
              const normM = normalize(order.materialName);
              const normH = normalize(m.materialHint);
              materialMatch = normM.includes(normH) || normH.includes(normM);
            }
            return codeMatch && weightMatch && shapeMatch && materialMatch;
          });
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
        if (!spMatched) {
          const mappedPrice = findPriceFromMatrix(order, priceMatrix);
          if (mappedPrice !== null) { newPrice = mappedPrice; }
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
      ...order, newPrice, newSalesGroup: resultSalesGroup,
      newPrintingCost, newPrintingSalesGroup, priceDifference,
      thickness: individual?.thickness
    };
  });
};

const findPriceFromMatrix = (order: OrderRecord, matrix: CustomPriceMatrixRow[]): number | null => {
  const row = matrix.find(r => r.materialName === order.materialName && String(r.weight) === String(order.weight));
  if (!row) return null;
  return row.colorPrices[order.totalColorCount] || null;
};

const calculateCustomIncrease = (currentPrice: number, conditions: IncreaseSimulationConditions): number => {
  if (conditions.customIncreaseType === 'percentage') {
    return currentPrice * (1 + conditions.customIncreaseValue / 100);
  } else {
    return currentPrice + conditions.customIncreaseValue;
  }
};
