import { OrderRecord, CustomPriceMatrixRow, ReadymadeMasterRow, SPMasterRow, SimulationResult, IncreaseSimulationConditions, ManualGroupSetting, IndividualManualSetting, ReadymadeSegment } from '../types';

export const calculateNewPrices = (
  orders: OrderRecord[],
  priceMatrix: CustomPriceMatrixRow[],
  conditions: IncreaseSimulationConditions,
  manualSettings: ManualGroupSetting,
  individualSettings: IndividualManualSetting,
  masters: {
    custom: CustomPriceMatrixRow[];
    sp: SPMasterRow[];
    readymade: ReadymadeMasterRow[];
    sticker: CustomPriceMatrixRow[];
  },
  options: {
    spPriceIncrease: number;
    readymadePriceIncrease: number;
    segment?: ReadymadeSegment; // 売/準D/D の選択
  }
): SimulationResult[] => {
  return orders.map(order => {
    const isCustom = (order.category.includes('別注') || order.category.includes('ポリ別注')) && !order.category.includes('SP');
    const isReadymade = order.category.includes('既製品') || order.category.includes('価格表');
    const isSP = (order.category.includes('SP') || order.category.includes('ＳＰ')) && !order.category.includes('シルク');

    let currentPrice = order.currentPrice;
    let newPrice = 0;
    let masterPrice: number | undefined = undefined;
    let matchMethod: 'code' | 'spec' | 'none' = 'none';
    let matchSource = '';

    // 1. 個別設定のチェック (最優先)
    const individual = individualSettings[order.orderNumber];
    if (individual && individual.price !== undefined) {
      return {
        ...order,
        newPrice: individual.price,
        priceDiff: individual.price - currentPrice,
        matchMethod: 'none'
      };
    }

    // 2. グループ一括設定のチェック
    const isSP_Active = isSP;
    const groupKey = isSP_Active 
      ? `${order.materialName}-${order.weight}-${order.totalColorCount}-${order.printCode}`
      : `${order.materialName}-${order.weight}-${order.totalColorCount}`;
    
    const groupManual = manualSettings[groupKey];
    if (groupManual && groupManual.price !== undefined) {
      return {
        ...order,
        newPrice: groupManual.price,
        priceDiff: groupManual.price - currentPrice,
        matchMethod: 'none'
      };
    }

    let spMasterMatched = false;

    // 3. 各種マスターとのマッチング
    if (isSP) {
      // 検索対象の正規化
      const searchTarget = (order.productName + (order.title || '') + (order.materialName || '')).normalize('NFKC').toLowerCase();
      
      // 1. 形状判定の厳格化: 「形状」列を最優先にする
      const isRollShape = order.shape.trim().toUpperCase().startsWith('R');
      const orderShape = isRollShape ? 'R' : '単袋';

      const candidates = masters.sp.filter(m => {
        const kw = (m.materialHint || '').toLowerCase();
        // キーワード判定: 曖昧さを排除し、マスターのキーワードが品名等に含まれていること
        const keywordMatch = kw && searchTarget.includes(kw);
        // 重量判定: 厳密一致
        const weightMatch = (m.weight !== 0 && Number(m.weight) === Number(order.weight));
        // 形状判定: 厳密一致
        const shapeMatch = m.shape === orderShape;
        
        return keywordMatch && weightMatch && shapeMatch;
      });

      // キーワードがより長い（具体的な）ものを優先する
      candidates.sort((a, b) => (b.materialHint || '').length - (a.materialHint || '').length);

      if (candidates.length > 0) {
        // ロット（数量）の判定: 注文数が到達している最大の区分を厳密に選択
        // 1850の注文で1900の単価を拾わないよう、許容誤差を最小限(2)にする
        const strictTolerance = 2;
        const validLots = candidates.filter(c => c.minQuantity <= order.quantity + strictTolerance);
        
        let bestMatch: SPMasterRow | null = null;
        if (validLots.length > 0) {
          // 到達している最大のロットを選択
          bestMatch = validLots.reduce((prev, curr) => 
            curr.minQuantity > prev.minQuantity ? curr : prev
          );
        } else {
          // どのロットにも達していない場合はマッチングさせない
        }

        if (bestMatch) {
          // 色数判定
          const cleanPrintCode = order.printCode.normalize('NFKC').replace(/\s+/g, '');
          let colorCount = order.totalColorCount;
          const printM = cleanPrintCode.match(/([1-8])色/);
          if (printM) colorCount = parseInt(printM[1], 10);

          const prices = bestMatch.colorPrices[colorCount] || bestMatch.colorPrices[1];
          if (prices) {
            const pUru = prices.uru || 0;
            const pJun = prices.junD || 0;
            const pD = prices.d || 0;

            let targetPrice = 0;
            let segmentLabel = '';

            if (options.segment === 'uru' && pUru > 0) { targetPrice = pUru; segmentLabel = '売'; }
            else if (options.segment === 'junD' && pJun > 0) { targetPrice = pJun; segmentLabel = '準D'; }
            else if (options.segment === 'd' && pD > 0) { targetPrice = pD; segmentLabel = 'D'; }
            
            if (targetPrice <= 0) {
              const dU = pUru > 0 ? Math.abs(currentPrice - pUru) : Infinity;
              const dJ = pJun > 0 ? Math.abs(currentPrice - pJun) : Infinity;
              const dD = pD > 0 ? Math.abs(currentPrice - pD) : Infinity;
              const closest = Math.min(dU, dJ, dD);
              if (closest !== Infinity) {
                if (closest === dU) { targetPrice = pUru; segmentLabel = '売(自)'; }
                else if (closest === dJ) { targetPrice = pJun; segmentLabel = '準D(自)'; }
                else if (closest === dD) { targetPrice = pD; segmentLabel = 'D(自)'; }
              }
            }

            if (targetPrice > 0) {
              masterPrice = targetPrice;
              // マスター自体が改定後の価格設定なので、加算せずにそのまま採用する
              newPrice = masterPrice;
              matchMethod = 'spec';
              spMasterMatched = true;
              matchSource = `SP:${bestMatch.materialHint} ${bestMatch.weight}k ${bestMatch.minQuantity}${bestMatch.unit} [${segmentLabel}:¥${targetPrice}]`;
            } else {
              matchSource = `SP:価格設定なし(${bestMatch.materialHint} ${bestMatch.weight}k ${bestMatch.minQuantity}${bestMatch.unit})`;
            }
          }
        }
      }
    }
 else if (isReadymade) {
      const matched = masters.readymade.find(m => m.absCode === order.absCode);
      if (matched) {
        // 既製品も区分を考慮 (必要に応じて)
        masterPrice = matched.normalPrice;
        newPrice = masterPrice + options.readymadePriceIncrease;
        matchMethod = 'code';
        spMasterMatched = true;
      }
    } else if (isCustom) {
      const matched = masters.custom.find(m => 
        order.materialName.includes(m.materialName) && m.weight === order.weight
      );
      if (matched) {
        const color = order.totalColorCount || 1;
        const prices = matched.colorPrices;
        masterPrice = prices[color] || prices[1];
        if (masterPrice) {
          newPrice = masterPrice + (conditions.customIncreaseType === 'fixed' ? conditions.customIncreaseValue : masterPrice * (conditions.customIncreaseValue / 100));
          matchMethod = 'spec';
          spMasterMatched = true;
        }
      }
    }

    // 4. マッチしなかった場合のデフォルト計算
    if (matchMethod === 'none') {
      const increase = isSP ? options.spPriceIncrease : (isReadymade ? options.readymadePriceIncrease : (conditions.customIncreaseType === 'fixed' ? conditions.customIncreaseValue : currentPrice * (conditions.customIncreaseValue / 100)));
      newPrice = currentPrice + increase;
    }

    return {
      ...order,
      newPrice,
      priceDiff: newPrice - currentPrice,
      masterPrice,
      matchMethod,
      spMasterMatched
    };
  });
};
