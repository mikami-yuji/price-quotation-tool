import { 
  OrderRecord, 
  CustomPriceMatrixRow, 
  IncreaseSimulationConditions, 
  ManualGroupSetting, 
  IndividualManualSetting,
  ReadymadeMasterRow,
  SPMasterRow
} from '../types';
import { decodeSPProductCode } from './stringUtils';

export const calculateNewPrices = (
  orders: OrderRecord[],
  priceMatrix: CustomPriceMatrixRow[],
  conditions: IncreaseSimulationConditions,
  manualSettings: ManualGroupSetting = {},
  individualSettings: IndividualManualSetting = {},
  categorizedMasters: {
    custom: CustomPriceMatrixRow[];
    sp: SPMasterRow[];
    readymade: ReadymadeMasterRow[];
    sticker: CustomPriceMatrixRow[];
  } = { custom: [], sp: [], readymade: [], sticker: [] },
  readymadePrefs?: { type: string; segment: 'uru' | 'junD' | 'd' }
): OrderRecord[] => {
  return orders.map((order) => {
    const isCustom = order.category === '別注' || order.category === 'ポリ別注';
    const isSP = (order.category.includes('SP') || order.category.includes('ＳＰ')) && !order.category.includes('シルク');
    const isSticker = order.category === 'シール' || order.category === 'シール（フルオーダー）' || order.category.includes('シール');
    const isReady = !isCustom && !isSP && !isSticker;

    const colorCount = order.totalColorCount || (order.frontColorCount + order.backColorCount);
    // テスト互換性のためのグループキー: 材質-重量-色数
    const groupKey = `${order.materialName}-${order.weight}-${colorCount}`;
    const group = manualSettings[groupKey];
    const individual = individualSettings[order.orderNumber];

    let newPrice = order.currentPrice;
    let idealPrice = order.currentPrice;
    let spMatched = false;
    let matchSource: string | undefined = undefined;
    
    // 値上げ計算のロジック
    const calculateCustomIncrease = (current: number, cond: IncreaseSimulationConditions): number => {
      if (cond.customIncreaseType === 'percentage') {
        return current * (1 + cond.customIncreaseValue / 100);
      } else {
        return current + cond.customIncreaseValue;
      }
    };

    const findPriceFromMatrix = (ord: OrderRecord, matrix: CustomPriceMatrixRow[]): number | null => {
      if (!matrix) return null;
      const match = matrix.find(m => 
        m.materialName === ord.materialName && 
        Math.abs(Number(m.weight) - Number(ord.weight)) < 0.01
      );
      if (match) {
        const cCount = ord.totalColorCount || (ord.frontColorCount + ord.backColorCount);
        return match.colorPrices[cCount] || null;
      }
      return null;
    };

    const normalize = (s: unknown): string => (!s ? '' : String(s).replace(/\s+/g, '').replace(/^0+/, '').toUpperCase());

    if (order.quantity === 0) {
      return {
        ...order,
        newPrice: order.currentPrice,
        newSalesGroup: order.salesGroup,
        newPrintingCost: order.printingCost,
        newPrintingSalesGroup: order.printingSalesGroup,
        priceDifference: 0
      };
    }

    let isManualPrice = false;

    if (individual?.price !== undefined && individual.price !== 0) {
      newPrice = individual.price;
      idealPrice = newPrice;
      isManualPrice = true;
    } else if (group?.price !== undefined && group.price !== 0) {
      newPrice = group.price;
      idealPrice = newPrice;
      isManualPrice = true;
    } else {
      const masters = categorizedMasters || { custom: [], sp: [], readymade: [], sticker: [] };
      
      // 特殊除外ルール: SP商品の「乳白Ｕ－0.5」は価格改定対象外（現状維持）
      const isExcludedSP = isSP && (order.materialName || '').includes('乳白Ｕ－0.5');

      if (isExcludedSP) {
        newPrice = order.currentPrice;
        idealPrice = newPrice;
      } else if (isCustom) {
        const masterPrice = findPriceFromMatrix(order, masters.custom);
        if (masterPrice !== null) {
          newPrice = masterPrice;
          idealPrice = newPrice;
        } else {
          newPrice = calculateCustomIncrease(order.currentPrice, conditions);
          idealPrice = newPrice;
        }
      } else if (isSP) {
        if (masters.sp && masters.sp.length > 0) {
          const decoded = decodeSPProductCode(order.productCode);
          const normMat = (s: string) => {
            return s.replace(/[ \s　【】（）()]/g, '')
                    .replace(/窓(有り|あり|付|つき)?/g, '')
                    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0))
                    .toUpperCase();
          };

          const baseMatches = masters.sp.filter(m => {
            if (!m.materialHint || !order.materialName) return false;
            // 1. 材質の適合性（フィルタ）
            const hintNorm = normMat(m.materialHint || '');
            const tNorm = normMat(order.materialName + (order.printCode || ''));
            
            // 基礎的な材質（ポリポリ vs ポリ vs バリア 等）が一致するかチェック
            const baseKeywords = ['ポリポリ', 'バリア', '和紙', '雲竜', 'アルミ', 'クラフト', 'ラミ', '真空', 'ジップ', 'ZIP', 'ポリ'];
            for (const k of baseKeywords) {
              if (hintNorm.includes(k) !== tNorm.includes(k)) {
                // ポリポリとポリの相互互換は許容する
                if ((k === 'ポリポリ' && (hintNorm.includes('ポリ') || tNorm.includes('ポリ'))) ||
                    (k === 'ポリ' && (hintNorm.includes('ポリポリ') || tNorm.includes('ポリポリ')))) {
                  continue;
                }
                return false;
              }
            }
            
            return true;
          });

          const targetWeight = decoded ? decoded.weight : Number(order.weight);
          const targetShape = decoded ? decoded.shape : (String(order.shape || '').toUpperCase().includes('R') ? 'R' : '単袋');
          const orderCode = normalize(order.productCode || order.absCode);
          
          const scoreKeywords = ['マット', 'SF', 'ＳＦ', 'コンビ', 'バイオマス', 'ポリポリ', 'ソフトクラフト', '金銀'];

          const candidates = baseMatches.map(m => {
            let score = 0;
            
            // カタログ番号の一致（最優先）
            const hasCode = m.catalogNos.some(no => {
              const normNo = normalize(no);
              if (normNo.length <= 2) return false;
              return orderCode === normNo || orderCode.startsWith(normNo) || (normNo.length >= 4 && orderCode.includes(normNo));
            });
            if (hasCode) score += 2000;

            // 材質のキーワード一致ボーナス
            const hintNorm = normMat(m.materialHint || '');
            const tNorm = normMat(order.materialName + (order.printCode || ''));
            scoreKeywords.forEach(kw => {
              const inOrder = tNorm.includes(kw);
              const inMaster = hintNorm.includes(kw);
              if (inOrder && inMaster) score += 100;
              else if (inOrder && !inMaster) score -= 20; 
            });

            const weightDiff = Math.abs(Number(m.weight) - (targetWeight === 8 ? 10 : targetWeight));
            if (weightDiff < 0.1) score += 500;
            else if (weightDiff < 2.1) score += 100;
            if (m.shape === targetShape) score += 100;

            let effectiveQty = order.quantity;
            const masterUnit = m.unit || (m.shape === '単袋' ? 'pcs' : 'm');
            const orderUnit = (order.shape === 'R' ? 'm' : 'pcs');
            if (masterUnit === 'm' && orderUnit === 'pcs') {
               effectiveQty = order.quantity * (targetWeight >= 5 ? 0.6 : 0.4);
            } else if (masterUnit === 'pcs' && orderUnit === 'm') {
               effectiveQty = order.quantity * (targetWeight >= 5 ? 1.66 : 2.5);
            }

            const isFit = m.lotType === 'above' 
              ? (effectiveQty >= m.minQuantity - 1)
              : (effectiveQty <= m.minQuantity + 1);
            
            if (isFit) score += 1000; // ロット一致を重視

            return { m, score, weightDiff, isFit };
          });

          candidates.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (a.weightDiff !== b.weightDiff) return a.weightDiff - b.weightDiff;
            if (a.isFit && b.isFit) {
              if (a.m.lotType === 'above') return b.m.minQuantity - a.m.minQuantity;
              return a.m.minQuantity - b.m.minQuantity;
            }
            return a.isFit ? -1 : 1;
          });

          const matched = candidates[0]?.m;
          if (matched) {
            const segment = readymadePrefs?.segment || 'uru';
            const cCount = order.totalColorCount || (order.frontColorCount + order.backColorCount);
            
            // 商品名や印刷コードから色数を推測（優先）
            let bestCCount = cCount;
            const printM = (order.printCode || '').match(/([1-8])色/);
            if (printM) bestCCount = parseInt(printM[1]);

            // 色数の一致（なければ最も近い色数を使用）
            let priceObj = matched.colorPrices[bestCCount];
            if (!priceObj) {
              const available = Object.keys(matched.colorPrices).map(Number).sort((a, b) => a - b);
              if (available.length > 0) {
                const target = bestCCount === 0 ? available[0] : available.reduce((p, c) => 
                  Math.abs(c - bestCCount) < Math.abs(p - bestCCount) ? c : p
                , available[0]);
                priceObj = matched.colorPrices[target];
              }
            }


            if (priceObj && priceObj[segment] > 0) {
              newPrice = priceObj[segment];
              idealPrice = newPrice;
              spMatched = true;
              matchSource = matched.materialHint;
            }
          }
        }
        if (!spMatched) {
          newPrice = calculateCustomIncrease(order.currentPrice, conditions);
          idealPrice = newPrice;
        }
      } else if (isSticker) {
        const masterPrice = findPriceFromMatrix(order, masters.sticker);
        newPrice = masterPrice !== null ? masterPrice : calculateCustomIncrease(order.currentPrice, conditions);
        idealPrice = newPrice;
      } else if (isReady) {
        const masterTable = masters.readymade;
        if (masterTable && masterTable.length > 0 && 'campaign' in masterTable[0]) {
          const orderCode = normalize(order.productCode || order.absCode);
          const matches = (masterTable as ReadymadeMasterRow[]).filter(m => normalize(m.productCode) === orderCode || (m.absCode && normalize(m.absCode) === orderCode));
          if (matches.length > 0) {
            matches.sort((a, b) => b.minQuantity - a.minQuantity);
            const match = matches.find(m => order.quantity >= m.minQuantity) || matches[matches.length - 1];
            const segment = readymadePrefs?.segment || 'uru';
            const type = readymadePrefs?.type || 'normal';
            newPrice = type === 'campaign' ? match.campaign[segment] : match.normal[segment];
            idealPrice = newPrice;
          } else {
            newPrice = calculateCustomIncrease(order.currentPrice, conditions);
            idealPrice = newPrice;
          }
        } else {
          newPrice = calculateCustomIncrease(order.currentPrice, conditions);
          idealPrice = newPrice;
        }
      }
    }

    if (!isManualPrice) {
      if (isCustom && conditions.roundingMode === 'half') {
        newPrice = Math.round(newPrice * 2) / 2;
      } else {
        newPrice = Math.round(newPrice * 100) / 100;
      }
    }

    // SalesGroupの計算には「理想的な差分」を使用する（丸め込み前の価格差）
    const idealDiff = idealPrice - order.currentPrice;
    let resultSalesGroup: number;
    if (individual?.salesGroup) resultSalesGroup = individual.salesGroup;
    else if (group?.salesGroup) resultSalesGroup = group.salesGroup;
    else resultSalesGroup = Math.round((order.salesGroup + idealDiff) * 100) / 100;

    let newPrintingCost = order.printingCost;
    let newPrintingSalesGroup = order.printingSalesGroup;
    if (individual?.printingPrice) newPrintingCost = individual.printingPrice;
    else if (group?.printingPrice) newPrintingCost = group.printingPrice;
    if (individual?.printingSalesGroup) newPrintingSalesGroup = individual.printingSalesGroup;
    else if (group?.printingSalesGroup) newPrintingSalesGroup = group.printingSalesGroup;

    // SPのタイトル（カラムU）からの表示名抽出
    // 冗長な日付や管理記号を削るが、品名の核心（【】内など）は残す
    const cleanSPTitle = (title: string) => {
      return title
        .replace(/^\d{4}-\d{2}-\d{2}\s*/, '') // 日付削除
        .replace(/^\d{7,}\s*/, '')           // 受注番号と思われる数字削除
        .replace(/^[a-zA-Z0-9-]{10,}\s*/, '') // 長い商品コード削除
        .trim();
    };

    const displayProductName = (isSP && order.title) 
      ? (cleanSPTitle(order.title) || order.productName) 
      : order.productName;

    return {
      ...order,
      productName: displayProductName,
      newPrice, 
      newSalesGroup: resultSalesGroup,
      newPrintingCost, 
      newPrintingSalesGroup, 
      priceDifference: Math.round((newPrice - order.currentPrice) * 100) / 100,
      spMasterMatched: isSP ? spMatched : undefined,
      matchSource
    };
  });
};
