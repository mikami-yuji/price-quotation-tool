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
import { decodeSPProductCode } from './stringUtils';

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

    // 特定の除外材質のチェック（SP商品の「乳白Ｕ－0.5」は価格表がないため改定対象外とする）
    if (isSP && order.materialName.includes('乳白Ｕ－0.5')) {
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
          const decoded = decodeSPProductCode(order.productCode);
          
            const normMat = (s: string) => {
              return s.replace(/[ \s　【】（）()]/g, '')
                      .replace(/窓(有り|あり|付)/g, '窓')
                      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, m => String.fromCharCode(m.charCodeAt(0) - 0xFEE0))
                      .replace(/ＳＦ/g, 'SF') // 念のため
                      .toUpperCase();
            };


            const baseMatches = (categorizedMasters.sp as SPMasterRow[]).filter(m => {
              // 材質チェック
              if (!m.materialHint || !order.materialName) return false;
              
              const targetNorm = normMat(order.materialName);
              const normH = m.materialHint.replace(/^([0-9]{1,2}_)?(SP|ＳＰ|SPNEW|ＳＰＮＥＷ)/, '');
              const hints = normH.split(/[・/／\r\n]+/).map(h => h.trim()).filter(Boolean);
              
              const materialMatch = hints.length === 0 || hints.some(h => {
                const hintNorm = normMat(h);
                const tNorm = normMat(order.materialName);
                
                // 完全一致
                if (hintNorm === tNorm) return true;
                
                // 特定のキーワードが含まれているかどうかの不一致があれば除外
                const keywords = ['マット', 'SF', 'ＳＦ', 'コンビ', 'バイオマス', '乳白', '和紙', 'クラフト', 'ラミ', '真空', 'ソフクラ', '透明'];
                for (const k of keywords) {
                  if (hintNorm.includes(k) !== tNorm.includes(k)) return false;
                }
                
                return hintNorm.includes(tNorm) || tNorm.includes(hintNorm);
              });
              
              return materialMatch;
            });

            // 候補をスコアリングして最適なものを選ぶ
            const targetWeight = decoded ? decoded.weight : Number(order.weight);
            const targetShape = decoded ? decoded.shape : (String(order.shape || '').toUpperCase().includes('R') ? 'R' : '単袋');
            const orderCode = normalize(order.productCode || order.absCode);

            let candidates = baseMatches.map(m => {
              let score = 0;
              
              // 1. コード一致 (最優先)
              const hasCode = m.catalogNos.some(no => {
                const normNo = normalize(no);
                return orderCode.includes(normNo) || (normNo.length >= 3 && orderCode.startsWith(normNo));
              });
              if (hasCode) score += 1000;
              
              // 2. 重量一致
              const weightDiff = Math.abs(Number(m.weight) - targetWeight);
              if (weightDiff < 0.1) score += 100;
              else if (weightDiff < 2.1) score += 50;
              
              // 3. 形状一致
              if (m.shape === targetShape) score += 10;
              
              // 4. 数量の適合性 (単位変換を考慮)
              let effectiveQty = order.quantity;
              const masterUnit = m.unit || 'm';
              const orderUnit = (order.shape === 'R' ? 'm' : 'pcs');
              
              if (masterUnit === 'm' && orderUnit === 'pcs') {
                 // 枚 -> m 変換 (5k=0.2m, 10k=0.25m と仮定)
                 const metersPerPcs = targetWeight >= 5 ? 0.25 : 0.2;
                 effectiveQty = order.quantity * metersPerPcs;
              } else if (masterUnit === 'pcs' && orderUnit === 'm') {
                 // m -> 枚 変換
                 const pcsPerMeter = targetWeight >= 5 ? 4 : 5;
                 effectiveQty = order.quantity * pcsPerMeter;
              }
              
              const isFit = effectiveQty >= m.minQuantity;
              if (isFit) score += 1;

              return { m, score, weightDiff, effectiveQty, isFit };
            });

            // スコアの高い順にソート。スコアが同じなら重量差が小さい順。さらに数量の適合性を考慮
            candidates.sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              if (a.weightDiff !== b.weightDiff) return a.weightDiff - b.weightDiff;
              
              // 数量の適合性によるソート
              // 基本的には effectiveQty を超えない最大のスライド（＝より条件に近い小口価格）を優先する
              if (a.isFit !== b.isFit) return a.isFit ? -1 : 1;
              
              // 両方適合する場合、または両方不足する場合、minQuantity が大きい方を優先（より条件に近いほう）
              return b.m.minQuantity - a.m.minQuantity;
            });

            // 最もスコアが高いもの
            let matchedEntry = candidates[0];
            
            // 重要：カタログ番号一致がない場合は、10kなどの特殊なフォールバック以外はマッチングさせない
            // これにより、材質と重量だけで全く別の商品をマッチングしてしまうのを防ぐ
            if (matchedEntry && matchedEntry.score < 1000) {
               const is10kFallback = targetWeight >= 5 && matchedEntry.m.catalogNos.some(no => no.toUpperCase().includes('K'));
               if (!is10kFallback) {
                 matchedEntry = null;
               }
            }

            const matched = matchedEntry ? matchedEntry.m : null;
            if (matched) {
              const segment = readymadePrefs?.segment || 'uru';
              const colorCount = order.totalColorCount || (order.frontColorCount + order.backColorCount);
              
              const priceObj = matched.colorPrices[colorCount];
              if (priceObj) {
                const price = priceObj[segment];
                if (price > 0) { 
                  newPrice = price; 
                  spMatched = true; 
                }
              }
            }
          }
        }
        
        // マスターに一致しなかった場合はカスタム値上げを適用
        if (!spMatched) {
          newPrice = calculateCustomIncrease(order.currentPrice, conditions);
        }
      } else if (isSticker) {
        const masterPrice = findPriceFromMatrix(order, categorizedMasters.sticker as CustomPriceMatrixRow[]);
        if (masterPrice !== null) {
          newPrice = masterPrice;
        } else {
          const mappedPrice = findPriceFromMatrix(order, priceMatrix);
          if (mappedPrice !== null) { newPrice = mappedPrice; }
          else {
            newPrice = calculateCustomIncrease(order.currentPrice, conditions);
          }
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
  
  const row = matrix.find(r => {
    const rMat = norm(r.materialName);
    const matMatch = oMat.startsWith(rMat) || rMat.startsWith(oMat);
    const weightMatch = String(r.weight) === String(order.weight);
    return matMatch && weightMatch;
  });
  
  if (!row) return null;

  if (row.colorPrices[order.totalColorCount] !== undefined) {
    return row.colorPrices[order.totalColorCount];
  }

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
