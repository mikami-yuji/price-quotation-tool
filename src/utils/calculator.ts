import { 
  OrderRecord, 
  CustomPriceMatrixRow, 
  ReadymadeMasterRow, 
  SPMasterRow, 
  SimulationResult, 
  IncreaseSimulationConditions, 
  ManualGroupSetting, 
  IndividualManualSetting, 
  ReadymadeSegment 
} from '../types';
import { shortenProductName, isSPCategory } from './stringUtils';

/**
 * 価格シミュレーションのメイン計算ロジック
 */
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
  // 安全な初期値の設定
  const safeOrders = orders || [];
  const safeConditions = conditions || { customIncreaseType: 'percentage', customIncreaseValue: 0, roundingMode: 'none' };
  const safeMasters = masters || { custom: [], sp: [], readymade: [], sticker: [] };
  const safeOptions = options || {};

  return safeOrders.map(order => {
    // 1. カテゴリ判定と品名短縮
    const isSP = isSPCategory(order.category);
    const isReadymade = order.category.includes('既製品') || order.category.includes('価格表');
    const isCustom = (order.category.includes('別注') || order.category.includes('ポリ別注')) && !isSP;
    const displayProductName = (isSP || isCustom) ? shortenProductName(order.productName) : order.productName;

    // 2. 基本情報の抽出
    const currentPrice = order.currentPrice;
    let newPrice = 0;
    let masterPrice: number | undefined = undefined;
    let matchMethod: 'code' | 'spec' | 'none' = 'none';
    let matchSource = '';
    let spMasterMatched = false;

    // 3. 個別設定のチェック (最優先)
    const individual = individualSettings[order.productCode] || individualSettings[order.orderNumber];
    if (individual && individual.price !== undefined) {
      const p = individual.price;
      return {
        ...order,
        productName: displayProductName,
        newPrice: p,
        newSalesGroup: individual.salesGroup || (order.salesGroup + (p - currentPrice)),
        priceDifference: p - currentPrice,
        priceDiff: p - currentPrice,
        matchMethod: 'none'
      };
    }

    // 4. グループ一括設定のチェック
    const groupKey = isSP 
      ? `${order.materialName}-${order.weight}-${order.totalColorCount}-${order.printCode}`
      : `${order.materialName}-${order.weight}-${order.totalColorCount}`;
    
    const groupManual = manualSettings[groupKey];
    if (groupManual && groupManual.price !== undefined) {
      const p = groupManual.price;
      return {
        ...order,
        productName: displayProductName,
        newPrice: p,
        newSalesGroup: groupManual.salesGroup || (order.salesGroup + (p - currentPrice)),
        priceDifference: p - currentPrice,
        priceDiff: p - currentPrice,
        matchMethod: 'none'
      };
    }

    // 5. 特定銘柄の除外判定
    const isExcludedSP = isSP && (
      order.materialName.includes('乳白Ｕ－0.5') ||
      order.materialName.includes('乳白U-0.5')
    );

    if (isExcludedSP) {
      return {
        ...order,
        productName: displayProductName,
        newPrice: currentPrice,
        newSalesGroup: order.salesGroup,
        priceDifference: 0,
        priceDiff: 0,
        matchMethod: 'none',
        matchSource: '改定対象外(銘柄固定)'
      };
    }

    // 6. 各種マスターとのマッチング
    if (isSP) {
      // --- SPマッチングロジック ---
      const normalizedCode = order.productCode.normalize('NFKC').replace(/\s+/g, '');
      const searchTarget = (normalizedCode + (order.productName || '') + (order.title || '') + (order.materialName || '')).normalize('NFKC').toLowerCase();
      const catalogMatch_RE = normalizedCode.match(/(?:00|^)(\d{3})/);
      const orderCatalog = catalogMatch_RE ? parseInt(catalogMatch_RE[1], 10).toString() : '';

      const shapeStr = order.shape.trim().toUpperCase();
      const isRollShape = shapeStr.startsWith('R') || displayProductName.includes('ロール') || displayProductName.includes('【R】');
      const orderShape = isRollShape ? 'R' : '単袋';

      const candidates = (safeMasters.sp || []).filter(m => {
        const catalogMatch = orderCatalog && m.catalogNos && m.catalogNos.includes(orderCatalog);
        const kw = (m.materialHint || '').normalize('NFKC').toLowerCase().replace(/[（）() \t【】[\]]/g, '');
        const target = searchTarget.replace(/[（）() \t【】[\]]/g, '');
        const fix = (s: string) => s.replace(/窓付|窓有り/g, '窓').replace(/単袋|単/g, '').replace(/オフセット/g, '');
        const keywordMatch = fix(kw) ? (fix(target).includes(fix(kw)) || fix(kw).includes(fix(target))) : true;
        
        const majorMaterials = ['ポリ', 'バリア', 'ラミ', '和紙', 'クラフト', 'ナイロン'];
        const mMat = majorMaterials.find(mm => kw.includes(mm));
        const oMat = majorMaterials.find(mm => target.includes(mm));
        if (mMat && oMat && mMat !== oMat) return false;

        const mWeight = typeof m.weight === 'number' ? m.weight : parseFloat(String(m.weight || 0));
        const weightMatch = (mWeight > 0 && Math.abs(mWeight - order.weight) < 0.1);
        const shapeMatch = m.shape === orderShape;
        
        return (catalogMatch && weightMatch && shapeMatch) || (keywordMatch && weightMatch && shapeMatch);
      });

      candidates.sort((a, b) => (b.materialHint || '').length - (a.materialHint || '').length);

      if (candidates.length > 0) {
        const validLots = candidates.filter(c => c.minQuantity <= order.quantity + 2);
        const bestMatch = validLots.length > 0 
          ? validLots.reduce((p, c) => c.minQuantity > p.minQuantity ? c : p)
          : null;

        if (bestMatch) {
          const cleanPrintCode = order.printCode.normalize('NFKC').replace(/\s+/g, '');
          let colorCount = order.totalColorCount;
          const printM = cleanPrintCode.match(/([1-8])色/);
          if (printM) colorCount = parseInt(printM[1], 10);

          const prices = bestMatch.colorPrices[colorCount] || bestMatch.colorPrices[1];
          if (prices) {
            const seg = safeOptions.segment;
            let targetPrice = seg === 'uru' ? prices.uru : seg === 'junD' ? prices.junD : seg === 'd' ? prices.d : 0;
            let segmentLabel = seg === 'uru' ? '売' : seg === 'junD' ? '準D' : seg === 'd' ? 'D' : '';

            if (targetPrice <= 0) {
              const dU = prices.uru > 0 ? Math.abs(currentPrice - prices.uru) : Infinity;
              const dJ = prices.junD > 0 ? Math.abs(currentPrice - prices.junD) : Infinity;
              const dD = prices.d > 0 ? Math.abs(currentPrice - prices.d) : Infinity;
              const closest = Math.min(dU, dJ, dD);
              if (closest === dU) { targetPrice = prices.uru; segmentLabel = '売(自)'; }
              else if (closest === dJ) { targetPrice = prices.junD; segmentLabel = '準D(自)'; }
              else if (closest === dD) { targetPrice = prices.d; segmentLabel = 'D(自)'; }
            }

            if (targetPrice > 0) {
              masterPrice = targetPrice;
              newPrice = targetPrice;
              matchMethod = 'spec';
              spMasterMatched = true;
              matchSource = `SP:${bestMatch.materialHint} ${bestMatch.weight}k ${bestMatch.minQuantity}${bestMatch.unit} [${segmentLabel}:¥${targetPrice}]`;
            }
          }
        }
      }
    } else if (isReadymade) {
      // --- 既製品マッチング ---
      const candidates = (safeMasters.readymade || []).filter(m => 
        (m.absCode && m.absCode === order.absCode) || (m.productCode && m.productCode === order.productCode)
      );
      if (candidates.length > 0) {
        const validLots = candidates.filter(c => (c.minQuantity || 0) <= order.quantity + 2);
        const bestMatch = validLots.length > 0 
          ? validLots.reduce((p, c) => (c.minQuantity || 0) > (p.minQuantity || 0) ? c : p)
          : candidates[0];

        const seg = safeOptions.segment;
        const p = (bestMatch.normal || {}) as { uru?: number; junD?: number; d?: number };
        const baseP = seg === 'uru' ? (p.uru || bestMatch.normalPrice) : 
                     seg === 'junD' ? (p.junD || bestMatch.normalPrice) : 
                     seg === 'd' ? (p.d || bestMatch.normalPrice) : 
                     (bestMatch.normalPrice || p.uru || 0);

        masterPrice = baseP || 0;
        newPrice = (baseP || 0) + (safeOptions?.readymadePriceIncrease || 0);
        matchMethod = 'code';
        spMasterMatched = true;
      }
    } else if (isCustom) {
      // --- 別注マッチング ---
      const matched = (safeMasters.custom || []).find(m => {
        const mName = (m.materialName || '').normalize('NFKC').toLowerCase();
        const oName = (order.materialName || '').normalize('NFKC').toLowerCase();
        return oName.includes(mName) && m.weight === order.weight;
      });
      if (matched) {
        const color = order.totalColorCount || 1;
        const price = matched.colorPrices[color] || matched.colorPrices[1];
        if (price) {
          masterPrice = price;
          newPrice = price + (safeConditions.customIncreaseType === 'amount' ? safeConditions.customIncreaseValue : price * (safeConditions.customIncreaseValue / 100));
          matchMethod = 'spec';
          spMasterMatched = true;
        }
      }
    }

    // 7. マッチしなかった場合の計算
    let idealNewPrice = newPrice || currentPrice;
    if (matchMethod === 'none') {
      const spInc = safeOptions.spPriceIncrease || 0;
      const readyInc = safeOptions.readymadePriceIncrease || 0;
      const customInc = safeConditions.customIncreaseType === 'amount' ? safeConditions.customIncreaseValue : currentPrice * (safeConditions.customIncreaseValue / 100);
      const increase = isSP ? spInc : isReadymade ? readyInc : customInc;
      idealNewPrice = currentPrice + increase;
      
      if (safeConditions.roundingMode === 'half') {
        newPrice = Math.round(idealNewPrice * 2) / 2;
      } else {
        newPrice = idealNewPrice;
      }
    }

    const priceDifference = Math.round((newPrice - currentPrice) * 1000) / 1000;
    const newSalesGroup = Math.round((order.salesGroup + (idealNewPrice - currentPrice)) * 1000) / 1000;

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
