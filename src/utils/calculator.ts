import { OrderRecord, CustomPriceMatrixRow, ReadymadeMasterRow, SPMasterRow, SimulationResult, IncreaseSimulationConditions, ManualGroupSetting, IndividualManualSetting, ReadymadeSegment } from '../types';

export const calculateNewPrices = (
  orders: OrderRecord[] = [],
  conditions: IncreaseSimulationConditions = { customIncreaseType: 'percentage', customIncreaseValue: 0, roundingMode: 'none' },
  manualSettings: ManualGroupSetting = {},
  individualSettings: IndividualManualSetting = {},
  masters: {
    custom: CustomPriceMatrixRow[];
    sp: SPMasterRow[];
    readymade: ReadymadeMasterRow[];
    sticker?: unknown[];
  } = { custom: [], sp: [], readymade: [], sticker: [] },
  options: {
    spPriceIncrease?: number;
    readymadePriceIncrease?: number;
    segment?: ReadymadeSegment;
    type?: 'normal' | 'campaign';
  } = {}
): SimulationResult => {
  const safeOrders = orders || [];
  const safeConditions = conditions || { customIncreaseType: 'percentage', customIncreaseValue: 0, roundingMode: 'none' };
  const safeManualSettings = manualSettings || {};
  const safeIndividualSettings = individualSettings || {};
  const safeMasters = masters || { custom: [], sp: [], readymade: [], sticker: [] };
  const safeOptions = options || {};

  return safeOrders.map(order => {
    const isCustom = (order.category.includes('別注') || order.category.includes('ポリ別注')) && !order.category.includes('SP');
    const isReadymade = order.category.includes('既製品') || order.category.includes('価格表');
    const isSP = (order.category.includes('SP') || order.category.includes('ＳＰ')) && !order.category.includes('シルク');

    const currentPrice = order.currentPrice;
    let newPrice = 0;
    let masterPrice: number | undefined = undefined;
    let matchMethod: 'code' | 'spec' | 'none' = 'none';
    let matchSource = '';
    let displayProductName = order.productName;

    // 1. 個別設定のチェック (最優先)
    const individual = safeIndividualSettings[order.productCode] || safeIndividualSettings[order.orderNumber];
    if (individual && individual.price !== undefined) {
      const p = individual.price;
      return {
        ...order,
        newPrice: p,
        newSalesGroup: individual.salesGroup || (order.salesGroup + (p - currentPrice)),
        priceDifference: p - currentPrice,
        priceDiff: p - currentPrice,
        matchMethod: 'none'
      };
    }

    // 2. グループ一括設定のチェック
    const isSP_Active = isSP;
    const groupKey = isSP_Active 
      ? `${order.materialName}-${order.weight}-${order.totalColorCount}-${order.printCode}`
      : `${order.materialName}-${order.weight}-${order.totalColorCount}`;
    
    const groupManual = safeManualSettings[groupKey];
    if (groupManual && groupManual.price !== undefined) {
      const p = groupManual.price;
      return {
        ...order,
        newPrice: p,
        newSalesGroup: groupManual.salesGroup || (order.salesGroup + (p - currentPrice)),
        priceDifference: p - currentPrice,
        priceDiff: p - currentPrice,
        matchMethod: 'none'
      };
    }

    // 3. SP商品の除外判定 (価格改定の対象外とする銘柄)
    const isExcludedSP = isSP && (
      order.materialName.includes('乳白Ｕ－0.5') ||
      order.materialName.includes('乳白U-0.5')
    );

    if (isExcludedSP) {
      return {
        ...order,
        newPrice: currentPrice,
        newSalesGroup: order.salesGroup,
        priceDifference: 0,
        priceDiff: 0,
        matchMethod: 'none',
        matchSource: '改定対象外(銘柄固定)'
      };
    }

    let spMasterMatched = false;

    // 4. 各種マスターとのマッチング
    if (isSP) {
      // 検索対象の正規化
      const normalizedCode = order.productCode.normalize('NFKC').replace(/\s+/g, '');
      const searchTarget = (normalizedCode + (order.productName || '') + (order.title || '') + (order.materialName || '')).normalize('NFKC').toLowerCase();
      
      // カタログ番号の抽出 (例: 00810... -> 810, 999... -> 999)
      const catalogMatch_RE = normalizedCode.match(/(?:00|^)(\d{3})/);
      const orderCatalog = catalogMatch_RE ? parseInt(catalogMatch_RE[1], 10).toString() : '';

      // 1. 形状判定の多角化
      const shapeStr = order.shape.trim().toUpperCase();
      const nameStr = order.productName.normalize('NFKC');
      const isRollShape = shapeStr.startsWith('R') || 
                          nameStr.includes('ロール') || 
                          nameStr.includes('【R】');
      const orderShape = isRollShape ? 'R' : '単袋';

      const candidates = safeMasters.sp.filter(m => {
        // カタログ番号一致
        const catalogMatch = orderCatalog && m.catalogNos && m.catalogNos.includes(orderCatalog);
        
        const kw = (m.materialHint || '').normalize('NFKC').toLowerCase().replace(/[（）() \t【】[\]]/g, '');
        const target = searchTarget.replace(/[（）() \t【】[\]]/g, '');
        
        // 和紙などの表記揺れ吸収
        const fix = (s: string) => s.replace(/窓付|窓有り/g, '窓').replace(/単袋|単/g, '').replace(/オフセット/g, '');
        const fKw = fix(kw);
        const fTarget = fix(target);
        const keywordMatch = fKw ? (fTarget.includes(fKw) || fKw.includes(fTarget)) : true;
        
        // 矛盾チェック (材質の不一致を検出)
        // マスターが「ポリ」なのに注文が「バリア」などの場合
        const majorMaterials = ['ポリ', 'バリア', 'ラミ', '和紙', 'クラフト', 'ナイロン'];
        const mMat = majorMaterials.find(mm => kw.includes(mm));
        const oMat = majorMaterials.find(mm => target.includes(mm));
        const materialConflict = mMat && oMat && mMat !== oMat;

        const mWeight = typeof m.weight === 'number' ? m.weight : parseFloat(String(m.weight || 0));
        const oWeight = typeof order.weight === 'number' ? order.weight : parseFloat(String(order.weight || 0));
        const weightMatch = (mWeight > 0 && Math.abs(mWeight - oWeight) < 0.1);
        const shapeMatch = m.shape === orderShape;
        
        if (materialConflict) return false;
        
        if (catalogMatch && weightMatch && shapeMatch) return true;
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

            if (safeOptions.segment === 'uru' && pUru > 0) { targetPrice = pUru; segmentLabel = '売'; }
            else if (safeOptions.segment === 'junD' && pJun > 0) { targetPrice = pJun; segmentLabel = '準D'; }
            else if (safeOptions.segment === 'd' && pD > 0) { targetPrice = pD; segmentLabel = 'D'; }
            
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

      // SPの商品名を短縮する（仕様部分を削り、商品名だけを残す）
      const shortenProductName = (name: string): string => {
        let n = name.normalize('NFKC').trim();
        n = n.replace(/^[●★☆◆◇■□]+/g, '');
        let prev = '';
        for (let i = 0; i < 5; i++) {
          prev = n;
          n = n.replace(/^[0-9.]+[kK][gG]?[ 　]*/, '');
          n = n.replace(/^[^ 　]*?(ポリ|ラミ|マット|バイオマス)[^ 　]*[ 　]*/, '');
          n = n.replace(/^【(単|R|ロール|単袋|枚|仕上)】[ 　]*/, '');
          if (n === prev) break;
        }
        n = n.replace(/[ 　]*(RASP|CSP|SP).*$/, '');
        return n.trim() || name;
      };
      displayProductName = shortenProductName(order.productName);
    } else if (isReadymade) {
      // 既製品の数量スライド対応
      const candidates = (safeMasters.readymade || []).filter(m => 
        (m.absCode && m.absCode === order.absCode) || 
        (m.productCode && m.productCode === order.productCode)
      );
      
      if (candidates.length > 0) {
        // 到達している最大のロットを選択
        const validLots = candidates.filter(c => (c.minQuantity || 0) <= order.quantity + 2);
        const bestMatch = validLots.length > 0 
          ? validLots.reduce((prev, curr) => (curr.minQuantity || 0) > (prev.minQuantity || 0) ? curr : prev)
          : candidates[0];

        // セグメント（売/準D/D）に応じた価格取得
        let baseP = 0;
        const p = bestMatch.normal || {};
        if (safeOptions.segment === 'uru') baseP = p.uru || bestMatch.normalPrice;
        else if (safeOptions.segment === 'junD') baseP = p.junD || bestMatch.normalPrice;
        else if (safeOptions.segment === 'd') baseP = p.d || bestMatch.normalPrice;
        else baseP = bestMatch.normalPrice || p.uru;

        masterPrice = baseP || 0;
        newPrice = masterPrice + (safeOptions?.readymadePriceIncrease || 0);
        matchMethod = 'code';
        spMasterMatched = true;
      }
    } else if (isCustom) {
      const matched = (safeMasters.custom || []).find(m => {
        const mName = (m.materialName || '').normalize('NFKC').toLowerCase();
        const oName = (order.materialName || '').normalize('NFKC').toLowerCase();
        return oName.includes(mName) && m.weight === order.weight;
      });
      if (matched) {
        const color = order.totalColorCount || 1;
        const prices = matched.colorPrices;
        masterPrice = prices[color] || prices[1];
        if (masterPrice) {
          newPrice = masterPrice + (safeConditions.customIncreaseType === 'amount' ? safeConditions.customIncreaseValue : masterPrice * (safeConditions.customIncreaseValue / 100));
          matchMethod = 'spec';
          spMasterMatched = true;
        }
      }
    }

    // 5. マッチしなかった場合のデフォルト計算
    let idealNewPrice = currentPrice;
    if (matchMethod === 'none' && !isExcludedSP) {
      const spInc = safeOptions.spPriceIncrease || (safeConditions.customIncreaseType === 'amount' ? safeConditions.customIncreaseValue : currentPrice * (safeConditions.customIncreaseValue / 100));
      const readyInc = safeOptions.readymadePriceIncrease || (safeConditions.customIncreaseType === 'amount' ? safeConditions.customIncreaseValue : currentPrice * (safeConditions.customIncreaseValue / 100));
      const increase = isSP ? spInc : (isReadymade ? readyInc : (safeConditions.customIncreaseType === 'amount' ? safeConditions.customIncreaseValue : currentPrice * (safeConditions.customIncreaseValue / 100)));
      
      idealNewPrice = currentPrice + increase;
      
      // 丸め処理の適用
      if (safeConditions.roundingMode === 'half') {
        newPrice = Math.round(idealNewPrice * 2) / 2;
      } else {
        newPrice = idealNewPrice;
      }
    } else {
      idealNewPrice = newPrice;
    }

    const diffForSalesGroup = idealNewPrice - currentPrice;
    const newSalesGroup = Math.round((order.salesGroup + diffForSalesGroup) * 1000) / 1000;
    const priceDifference = Math.round((newPrice - currentPrice) * 1000) / 1000;

    return {
      ...order,
      productName: displayProductName,
      currentPrice,
      newPrice,
      newSalesGroup,
      priceDifference,
      priceDiff: priceDifference,
      masterPrice: masterPrice || 0,
      matchMethod,
      matchSource,
      spMasterMatched
    };
  });
};
