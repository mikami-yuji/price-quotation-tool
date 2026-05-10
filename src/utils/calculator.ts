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

  return safeOrders.map((order: OrderRecord): OrderRecord => {
    // 1. カテゴリ判定と品名短縮
    const isSP = isSPCategory(order.category);
    const isSticker = order.category.includes('シール');
    const isCustom = (order.category.includes('別注') || order.category.includes('ポリ別注')) && !isSP;
    // SP, シール, 別注のいずれでもないものを既製品として扱う (タブ表示ロジックと合わせる)
    const isReadymade = !isSP && !isSticker && !isCustom && order.productCode !== '999999999';
    
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
        matchMethod: 'none',
        matchSource: '改定対象外(銘柄固定)'
      };
    }

    // SPマスターから価格を検索する内部ヘルパー
    const findSPMatch = () => {
      const normalizedCode = order.productCode.normalize('NFKC').replace(/\s+/g, '');
      const searchTarget = (normalizedCode + (order.productName || '') + (order.title || '') + (order.materialName || '')).normalize('NFKC').toLowerCase();
      const catalogMatch_RE = normalizedCode.match(/(?:00|^)(\d{3})/);
      const orderCatalog = catalogMatch_RE ? parseInt(catalogMatch_RE[1], 10).toString() : '';

      const shapeStr = order.shape.trim().toUpperCase();
      const isRollShape = shapeStr.startsWith('R') || displayProductName.includes('ロール') || displayProductName.includes('【R】');
      const orderShape = isRollShape ? 'R' : '単袋';

      const candidates = (safeMasters.sp || []).filter((m: SPMasterRow): boolean => {
        const catalogMatch = orderCatalog && m.catalogNos && m.catalogNos.includes(orderCatalog);
        const kw = (m.materialHint || '').normalize('NFKC').toLowerCase().replace(/[（）() \t【】[\]]/g, '');
        const target = searchTarget.replace(/[（）() \t【】[\]]/g, '');
        const fix = (s: string): string => s.replace(/窓付|窓有り/g, '窓').replace(/単袋|単/g, '').replace(/オフセット/g, '');
        const keywordMatch = fix(kw) ? (fix(target).includes(fix(kw)) || fix(kw).includes(fix(target))) : true;
        
        const orderShape = (order.shape || '').normalize('NFKC').trim();
        const majorMaterials = ['ポリ', 'バリア', 'ラミ', '和紙', 'クラフト', 'ナイロン'];
        const mMat = majorMaterials.find((mm: string): boolean => kw.includes(mm));
        const oMat = majorMaterials.find((mm: string): boolean => target.includes(mm));
        if (mMat && oMat && mMat !== oMat) return false;

        const oWeight = typeof order.weight === 'number' ? order.weight : parseFloat(String(order.weight || 0));
        const mWeight = typeof m.weight === 'number' ? m.weight : parseFloat(String(m.weight || 0));
        const weightMatch = (mWeight > 0 && Math.abs(mWeight - oWeight) < 0.1);
        const shapeMatch = m.shape === orderShape;
        
        return !!((catalogMatch && weightMatch && shapeMatch) || (keywordMatch && weightMatch && shapeMatch));
      });

      if (candidates.length > 0) {
        // より具体的なキーワード（文字数が長いもの）を優先する
        candidates.sort((a, b) => ((b.materialHint || '').length || 0) - ((a.materialHint || '').length || 0));
        
        // 同じキーワード内では、数量条件が合うものを探す
        const topKeyword = candidates[0].materialHint;
        const sameKeywordCandidates = candidates.filter(c => c.materialHint === topKeyword);
        
        const validLots = sameKeywordCandidates.filter((m: SPMasterRow) => (m.minQuantity || 0) <= order.quantity + 2);
        const bestMatch = validLots.length > 0 
          ? validLots.reduce((p: SPMasterRow, c: SPMasterRow) => (c.minQuantity || 0) > (p.minQuantity || 0) ? c : p)
          : sameKeywordCandidates[0];

        if (bestMatch) {
          const cleanPrintCode = order.printCode.normalize('NFKC').replace(/\s+/g, '');
          let colorCount = order.totalColorCount;
          const printM = cleanPrintCode.match(/([1-8])色/);
          if (printM) colorCount = parseInt(printM[1], 10);

          const prices = bestMatch.colorPrices[colorCount] || bestMatch.colorPrices[1];
          if (prices) {
            const seg = safeOptions.segment || 'uru';
            const targetPrice = seg === 'uru' ? prices.uru : seg === 'junD' ? prices.junD : seg === 'd' ? prices.d : 0;
            const segLabel = seg === 'uru' ? '売' : seg === 'junD' ? '準D' : seg === 'd' ? 'D' : '';
            const colorLabel = `${colorCount}色`;
            return { price: targetPrice, matchSource: `${bestMatch.materialHint}:${segLabel}:${colorLabel}(${bestMatch.minQuantity}${bestMatch.unit})` };
          }
        }
      }
      return null;
    };

    // 6. 各種マスターとのマッチング
    if (isSP) {
      const spMatch = findSPMatch();
      if (spMatch && spMatch.price > 0) {
        masterPrice = spMatch.price;
        newPrice = spMatch.price;
        matchMethod = 'spec';
        spMasterMatched = true;
        matchSource = spMatch.matchSource + ` [¥${spMatch.price}]`;
      }
    } else if (isReadymade) {
      // --- 既製品マッチング ---
      const orderAbs = (order.absCode || '').normalize('NFKC').trim();
      const orderProd = (order.productCode || '').normalize('NFKC').trim();

      const candidates = (safeMasters.readymade || []).filter((m: ReadymadeMasterRow): boolean => {
        const mAbs = (m.absCode || '').normalize('NFKC').trim();
        const mProd = (m.productCode || '').normalize('NFKC').trim();
        return !!((mAbs && mAbs === orderAbs) || (mProd && mProd === orderProd));
      });

      if (candidates.length > 0) {
        const validLots = candidates.filter((c: ReadymadeMasterRow): boolean => (c.minQuantity || 0) <= order.quantity + 2);
        const bestMatch = validLots.length > 0 
          ? validLots.reduce((p: ReadymadeMasterRow, c: ReadymadeMasterRow): ReadymadeMasterRow => (c.minQuantity || 0) > (p.minQuantity || 0) ? c : p)
          : candidates[0];

        const seg = safeOptions.segment || 'uru';
        const type = safeOptions.type || 'normal';
        const pObj = (type === 'campaign' ? (bestMatch.campaign || bestMatch.normal) : bestMatch.normal) || {};
        const p = pObj as { uru?: number; junD?: number; d?: number };
        
        const baseP = seg === 'uru' ? (p.uru || bestMatch.normalPrice) : 
                     seg === 'junD' ? (p.junD || bestMatch.normalPrice) : 
                     seg === 'd' ? (p.d || bestMatch.normalPrice) : 
                     (bestMatch.normalPrice || p.uru || 0);

        if (baseP && baseP > 0) {
          const segLabel = seg === 'uru' ? '売' : seg === 'junD' ? '準D' : seg === 'd' ? 'D' : '';
          const typeLabel = type === 'campaign' ? 'CP' : '通常';
          const qtyLabel = bestMatch.minQuantity ? `(${bestMatch.minQuantity}～)` : '';
          masterPrice = baseP;
          newPrice = baseP + (safeOptions?.readymadePriceIncrease || 0);
          matchMethod = 'code';
          spMasterMatched = true;
          matchSource = `${bestMatch.absCode || bestMatch.productCode}:${segLabel}:${typeLabel}${qtyLabel}`;
        }
      }
    } else if (isCustom) {
      // --- 別注マッチング ---
      const matched = (safeMasters.custom || []).find((m: CustomPriceMatrixRow): boolean => {
        const mName = (m.materialName || '').normalize('NFKC').toLowerCase();
        const oName = (order.materialName || '').normalize('NFKC').toLowerCase();
        return !!(oName.includes(mName) && Number(m.weight) === Number(order.weight));
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
      const isSticker = order.category.includes('シール');
      
      // SP・シール・既製品は一括値上げ設定（customIncreaseValue）を無視し、マスター未マッチ時は0増分とする
      const spInc = 0; 
      const readyInc = safeOptions.readymadePriceIncrease || 0;
      const stickerInc = 0;
      const customInc = safeConditions.customIncreaseType === 'amount' 
        ? safeConditions.customIncreaseValue 
        : currentPrice * (safeConditions.customIncreaseValue / 100);
      
      const increase = isSP ? spInc : isReadymade ? readyInc : isSticker ? stickerInc : customInc;
      idealNewPrice = currentPrice + increase;
      
      // 端数丸めは「別注」のみに適用し、SP・シール・既製品は常に「なし」
      if (isCustom && safeConditions.roundingMode === 'half') {
        newPrice = Math.round(idealNewPrice * 2) / 2;
      } else {
        newPrice = idealNewPrice;
      }
    }

    const priceDifference = Math.round((newPrice - currentPrice) * 1000) / 1000;
    const newSalesGroup = Math.round((order.salesGroup + (idealNewPrice - currentPrice)) * 1000) / 1000;

    // 印刷代の計算 (据え置き)
    const newPrintingCost = order.printingCost;
    const newPrintingSalesGroup = order.printingSalesGroup;

    return {
      ...order,
      productName: displayProductName,
      currentPrice,
      newPrice,
      newSalesGroup,
      priceDifference,
      newPrintingCost,
      newPrintingSalesGroup,
      masterPrice: masterPrice || 0,
      matchMethod,
      matchSource,
      spMasterMatched
    };
  });
};
