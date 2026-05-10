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
      
      // カタログNoの抽出 (品番の先頭00に続く3桁、または最初の3桁を候補にする)
      const orderCatalogs: string[] = [];
      const mainMatch = normalizedCode.match(/^00(\d{3})/);
      if (mainMatch) {
        orderCatalogs.push(parseInt(mainMatch[1], 10).toString());
      } else {
        const first3 = normalizedCode.match(/\d{3}/);
        if (first3) orderCatalogs.push(parseInt(first3[0], 10).toString());
      }

      const shapeStr = order.shape.trim().toUpperCase();
      const isRollShape = shapeStr.startsWith('R') || displayProductName.includes('ロール') || displayProductName.includes('【R】');
      const orderShape = isRollShape ? 'R' : '単袋';

      // 品番またはキーワードが一致し、かつ重量が一致すれば候補とする
      const initialCandidates = (safeMasters.sp || []).filter((m: SPMasterRow): boolean => {
        // 品番マッチング: マスターのカタログNoが受注の候補に含まれているか
        const catalogMatch = m.catalogNos && m.catalogNos.some(c => orderCatalogs.includes(c.replace(/\D/g, '')));
        
        const kw = (m.materialHint || '').normalize('NFKC').toLowerCase().replace(/[（）() \t【】[\]]/g, '');
        const target = searchTarget.replace(/[（）() \t【】[\]]/g, '');
        const fix = (s: string): string => s.replace(/窓付|窓有り/g, '窓').replace(/単袋|単/g, '').replace(/オフセット/g, '');
        const keywordMatch = fix(kw) ? (fix(target).includes(fix(kw)) || fix(kw).includes(fix(target))) : true;
        
        const majorMaterials = ['ポリ', 'バリア', 'ラミ', '和紙', 'クラフト', 'ナイロン'];
        const mMat = majorMaterials.find((mm: string): boolean => kw.includes(mm));
        const oMat = majorMaterials.find((mm: string): boolean => target.includes(mm));
        if (mMat && oMat && mMat !== oMat) return false;

        const mWeight = Number(m.weight || 0);
        const oWeight = Number(order.weight || 0);
        const weightMatch = mWeight === 0 || oWeight === 0 || Math.abs(mWeight - oWeight) < 0.1;
        
        // 判定条件の緩和: カタログNoが一致すれば、重量が0同士または近似していれば一致とする
        const weightMatchRelaxed = weightMatch || mWeight === 0 || oWeight === 0;
        
        return !!((catalogMatch || keywordMatch) && weightMatchRelaxed);
      });

      // SPオフセットの場合は特定のシートに限定する
      const isOffset = order.category.includes('オフセット');
      const offsetSheets = ['05_SP和紙・ソフトクラフト', '09_SP和紙包', '10_SP金銀和紙・和紙雲竜', 'クラフト'];
      
      const candidates = isOffset 
        ? initialCandidates.filter(c => c.sourceSheet && offsetSheets.some(os => c.sourceSheet!.includes(os)))
        : initialCandidates;

      if (candidates.length > 0) {
        // カタログNo一致があるものを最優先、次にキーワードの長さを優先、次に重量の正確さを優先
        candidates.sort((a, b) => {
          const aCat = a.catalogNos && a.catalogNos.some(c => orderCatalogs.includes(c.replace(/\D/g, '')));
          const bCat = b.catalogNos && b.catalogNos.some(c => orderCatalogs.includes(c.replace(/\D/g, '')));
          if (aCat && !bCat) return -1;
          if (!aCat && bCat) return 1;
          
          const aW = Math.abs(Number(a.weight || 0) - Number(order.weight || 0));
          const bW = Math.abs(Number(b.weight || 0) - Number(order.weight || 0));
          if (aW !== bW) return aW - bW;

          return ((b.materialHint || '').length || 0) - ((a.materialHint || '').length || 0);
        });
        
        // 1. 最も関連性の高いカタログ/材質のグループを特定する
        const top = candidates[0];
        const isTopCat = top.catalogNos && top.catalogNos.some(c => orderCatalogs.includes(c.replace(/\D/g, '')));
        
        const bestGroup = candidates.filter(c => {
          const cCat = c.catalogNos && c.catalogNos.some(cn => orderCatalogs.includes(cn.replace(/\D/g, '')));
          return cCat === isTopCat && c.materialHint === top.materialHint;
        });

        // 2. そのグループ内で、受注数量に合う最大の minQuantity を探す
        const validLots = bestGroup.filter((m: SPMasterRow) => (m.minQuantity || 0) <= order.quantity + 2);
        const bestMatch = validLots.length > 0 
          ? validLots.reduce((p: SPMasterRow, c: SPMasterRow) => (c.minQuantity || 0) > (p.minQuantity || 0) ? c : p)
          : bestGroup[0];

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
            const catLabel = bestMatch.catalogNos?.[0] || 'No.';
            // 単位の判定: マスターにない場合、品番の下一桁で判定 (1=枚, 2or3=m)
            let unitLabel: string = bestMatch.unit || '';
            if (unitLabel === 'pcs') unitLabel = '枚';
            
            if (!unitLabel) {
              const lastDigit = order.productCode.trim().slice(-1);
              if (lastDigit === '1') unitLabel = '枚';
              else if (lastDigit === '2' || lastDigit === '3') unitLabel = 'm';
              else unitLabel = '枚'; // デフォルト
            }
            
            return { 
              price: targetPrice, 
              matchSource: `${catLabel}:${bestMatch.materialHint}:¥${targetPrice}:${segLabel}(${bestMatch.minQuantity}${unitLabel})` 
            };
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
