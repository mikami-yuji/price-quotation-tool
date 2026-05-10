import { describe, it, expect } from 'vitest';
import { calculateNewPrices } from './calculator';
import { OrderRecord, IncreaseSimulationConditions } from '../types';

describe('Calculator Logic (Multilevel Precedence)', () => {

  const sampleOrders: OrderRecord[] = [
    {
      orderNumber: '1001',
      category: '別注',
      weight: 5,
      productCode: '',
      productName: 'Sample Custom 1',
      shape: '',
      quantity: 1000,
      currentPrice: 80,
      printingCost: 0,
      salesGroup: 60,
      printingSalesGroup: 0,
      materialName: '【ポリ】',
      printCode: '',
      frontColorCount: 4,
      backColorCount: 0,
      totalColorCount: 4,
      janCode: '',
      directDeliveryCode: '',
      directDeliveryName: '',
      lastOrderDate: ''
    },
    {
      orderNumber: '1002',
      category: '別注',
      weight: 5,
      productCode: '',
      productName: 'Sample Custom 2 (Same Group)',
      shape: '',
      quantity: 500,
      currentPrice: 80,
      printingCost: 0,
      salesGroup: 60,
      printingSalesGroup: 0,
      materialName: '【ポリ】',
      printCode: '',
      frontColorCount: 4,
      backColorCount: 0,
      totalColorCount: 4,
      janCode: '',
      directDeliveryCode: '',
      directDeliveryName: '',
      lastOrderDate: ''
    }
  ];

  const defaultConditions: IncreaseSimulationConditions = {
    customIncreaseType: 'percentage',
    customIncreaseValue: 10,
    roundingMode: 'none',
    spColorOffset: false
  };

  it('デフォルト計算: 10%アップが適用されること', () => {
    const results = calculateNewPrices(sampleOrders, defaultConditions);
    expect(results[0].newPrice).toBe(88);
    expect(results[0].newSalesGroup).toBe(68); // 60 + (88-80)
  });

  it('グループ設定優先: グループ単価を指定した場合、デフォルト計算より優先されること', () => {
    // 【ポリ】-5-4 のグループキー
    const groupSettings = {
      '【ポリ】-5-4': { price: 95, salesGroup: 70 }
    };
    const results = calculateNewPrices(sampleOrders, defaultConditions, groupSettings);
    expect(results[0].newPrice).toBe(95);
    expect(results[0].newSalesGroup).toBe(70);
    expect(results[1].newPrice).toBe(95); // 同グループの別商品も適用される
  });

  it('個別修正最優先: リスト入力がグループ設定よりも優先されること', () => {
    const groupSettings = {
      '【ポリ】-5-4': { price: 95, salesGroup: 70 }
    };
    const individualSettings = {
      '1001': { price: 100, salesGroup: 80 }
    };
    
    const results = calculateNewPrices(sampleOrders, defaultConditions, groupSettings, individualSettings);
    
    // 1001 は個別設定が適用
    expect(results[0].newPrice).toBe(100);
    expect(results[0].newSalesGroup).toBe(80);
    
    // 1002 はグループ設定が適用（1001の個別には影響されない）
    expect(results[1].newPrice).toBe(95);
    expect(results[1].newSalesGroup).toBe(70);
  });

  it('営G自動計算: 単価のみ手入力し営Gが空の場合、差額が旧営Gに加算されること', () => {
    const individualSettings = {
      '1001': { price: 100 } // priceのみ設定
    };
    const results = calculateNewPrices(sampleOrders, defaultConditions, {}, individualSettings);
    
    expect(results[0].newPrice).toBe(100);
    expect(results[0].priceDifference).toBe(20);
    expect(results[0].newSalesGroup).toBe(80); // 60 (旧) + 20 (差額)
  });

  it('丸め処理: 0.50単位の丸め込みが正しく動くこと', () => {
    const conditions: IncreaseSimulationConditions = {
      customIncreaseType: 'amount',
      customIncreaseValue: 0.3,
      roundingMode: 'half'
    };
    const results = calculateNewPrices(sampleOrders, conditions);
    // 80 + 0.3 = 80.3 -> 80.5 に丸まる
    expect(results[0].newPrice).toBe(80.5);
  });

  it('丸め処理の修正確認: 改定単価は丸めるが、改定営Gは理想値を維持すること', () => {
    const conditions: IncreaseSimulationConditions = {
      customIncreaseType: 'amount',
      customIncreaseValue: 0.35, // 80 + 0.35 = 80.35
      roundingMode: 'half'      // -> 単価は 80.5 に丸まる
    };
    const results = calculateNewPrices(sampleOrders, conditions);
    
    expect(results[0].newPrice).toBe(80.5); // 丸め適用
    // 旧営G 60 + 理想増分 0.35 = 60.35 (丸め後の 80.5-80 = 0.5 ではない)
    expect(results[0].newSalesGroup).toBe(60.35); 
  });

  it('手入力の尊重: 手入力時はシミュレーションの丸め設定を無視すること', () => {
    const conditions: IncreaseSimulationConditions = {
      customIncreaseType: 'percentage',
      customIncreaseValue: 10,
      roundingMode: 'half'
    };
    const individualSettings = {
      '1001': { price: 100.22 } // あえて .50 単位ではない数値を入力
    };
    const results = calculateNewPrices(sampleOrders, conditions, {}, individualSettings);
    
    expect(results[0].newPrice).toBe(100.22); // 丸められずにそのまま維持
    expect(results[0].newSalesGroup).toBe(60 + (100.22 - 80)); // 営Gも入力値ベース
  });

  describe('既製品ボリュームスライド (数量スライド) の検証', () => {
    const readyOrders: OrderRecord[] = [
      { orderNumber: 'R1', category: '既製品', weight: 0, productCode: 'ITEM-X', quantity: 100, currentPrice: 50, productName: '', shape: '', printingCost: 0, salesGroup: 0, printingSalesGroup: 0, materialName: '', printCode: '', frontColorCount: 0, backColorCount: 0, totalColorCount: 0, janCode: '', directDeliveryCode: '', directDeliveryName: '', lastOrderDate: '' },
      { orderNumber: 'R2', category: '既製品', weight: 0, productCode: 'ITEM-X', quantity: 600, currentPrice: 50, productName: '', shape: '', printingCost: 0, salesGroup: 0, printingSalesGroup: 0, materialName: '', printCode: '', frontColorCount: 0, backColorCount: 0, totalColorCount: 0, janCode: '', directDeliveryCode: '', directDeliveryName: '', lastOrderDate: '' },
    ];

    const readyMaster = [
      { productCode: 'ITEM-X', minQuantity: 0, normal: { uru: 45, junD: 40, d: 35 }, campaign: { uru: 45, junD: 40, d: 35 } },
      { productCode: 'ITEM-X', minQuantity: 500, normal: { uru: 40, junD: 35, d: 30 }, campaign: { uru: 40, junD: 35, d: 30 } },
    ];

    it('数量に応じて適切なマスター価格が選択されること', () => {
      const results = calculateNewPrices(readyOrders, defaultConditions, {}, {}, {
        custom: [], sp: [], sticker: [], readymade: readyMaster
      }, { type: 'normal', segment: 'uru' });

      // R1 (100個) -> minQuantity: 0 の単価 45 が適用
      expect(results[0].newPrice).toBe(45);
      
      // R2 (600個) -> minQuantity: 500 の単価 40 が適用
      expect(results[1].newPrice).toBe(40);
    });
  });

  describe('SPマスターマッチングの検証', () => {
    const spOrders: OrderRecord[] = [
      { 
        orderNumber: 'SP1', 
        category: 'SP', 
        productCode: '008100501', // カタログ810, 重量5kg, 形状01(単袋)
        quantity: 1000, 
        currentPrice: 100, 
        productName: 'SP 810', 
        materialName: 'ポリ', 
        weight: 5,
        totalColorCount: 1,
        shape: '単袋',
        printingCost: 0, salesGroup: 80, printingSalesGroup: 0, printCode: '', frontColorCount: 1, backColorCount: 0, janCode: '', directDeliveryCode: '', directDeliveryName: '', lastOrderDate: '' 
      },
      { 
        orderNumber: 'SP2', 
        category: 'SP', 
        productCode: '008100202', // カタログ810, 重量2kg, 形状02(R)
        quantity: 1000, 
        currentPrice: 100, 
        productName: 'SP 810 R', 
        materialName: 'ポリ', 
        weight: 2,
        totalColorCount: 2,
        shape: 'R',
        printingCost: 0, salesGroup: 80, printingSalesGroup: 0, printCode: '', frontColorCount: 2, backColorCount: 0, janCode: '', directDeliveryCode: '', directDeliveryName: '', lastOrderDate: '' 
      },
    ];

    const spMaster = [
      {
        catalogNos: ['810'],
        weight: 5,
        shape: '単袋' as const,
        minQuantity: 500,
        colorPrices: {
          1: { uru: 120, junD: 110, d: 100 },
          2: { uru: 140, junD: 130, d: 120 }
        },
        materialHint: 'ポリ'
      },
      {
        catalogNos: ['810'],
        weight: 2,
        shape: 'R' as const,
        minQuantity: 500,
        colorPrices: {
          1: { uru: 110, junD: 100, d: 90 },
          2: { uru: 130, junD: 120, d: 110 }
        },
        materialHint: 'ポリ'
      }
    ];

    it('商品コードデコードに基づく正確なマッチングが行われること', () => {
      const results = calculateNewPrices(spOrders, defaultConditions, {}, {}, {
        custom: [], sp: spMaster, sticker: [], readymade: []
      }, { type: 'normal', segment: 'uru' });

      // SP1: カタログ810, 5kg, 単袋, 1色 -> 120
      expect(results[0].newPrice).toBe(120);
      
      // SP2: カタログ810, 2kg, R, 2色 -> 130
      expect(results[1].newPrice).toBe(130);
    });

    it('材質が一致しない場合は価格据え置き(0%)となること', () => {
      const mismatchedOrders = [{ ...spOrders[0], materialName: 'バリア' }];
      const results = calculateNewPrices(mismatchedOrders, defaultConditions, {}, {}, {
        custom: [], sp: spMaster, sticker: [], readymade: []
      });
      // SPはマスター未マッチ時は据え置き: 100 -> 100
      expect(results[0].newPrice).toBe(100);
    });

    it('シールの場合はマスターがないため、常に価格据え置きとなること', () => {
      const stickerOrder: OrderRecord[] = [{
        ...spOrders[0],
        category: 'シール',
        currentPrice: 50
      }];
      const results = calculateNewPrices(stickerOrder, defaultConditions);
      // シールは一括値上げ設定(10%)を無視して据え置き
      expect(results[0].newPrice).toBe(50);
    });

    it('丸め設定が別注のみに適用され、SPには適用されないこと', () => {
      const conditions: IncreaseSimulationConditions = {
        ...defaultConditions,
        customIncreaseType: 'amount', // 金額指定
        customIncreaseValue: 0.3,
        roundingMode: 'half' // 0.50単位丸め
      };
      const mixedOrders: OrderRecord[] = [
        { ...sampleOrders[0], currentPrice: 80 }, // 別注
        { ...spOrders[0], category: 'SP', currentPrice: 100 } // SP
      ];
      const results = calculateNewPrices(mixedOrders, conditions);
      
      // 別注: 80 + 0.3 = 80.3 -> 80.5 (丸め適用)
      expect(results[0].newPrice).toBe(80.5);
      // SP: マスターなし -> 据え置き 100 (丸めも増分も適用外)
      expect(results[1].newPrice).toBe(100);
    });

    it('SP商品の「乳白Ｕ－0.5」は価格改定の対象外（現状維持）となること', () => {
      const excludedOrder: OrderRecord[] = [{
        ...spOrders[0],
        category: 'SP', // SP商品
        materialName: '【ポリ】乳白Ｕ－0.5',
        currentPrice: 100,
        salesGroup: 80
      }];
      const results = calculateNewPrices(excludedOrder, defaultConditions);
      expect(results[0].newPrice).toBe(100);
      expect(results[0].priceDifference).toBe(0);
    });

    it('SP以外（別注など）の「乳白Ｕ－0.5」は通常通り改定対象となること', () => {
      const customOrder: OrderRecord[] = [{
        ...spOrders[0],
        category: '別注', // SP以外
        materialName: '【ポリ】乳白Ｕ－0.5',
        currentPrice: 100,
        salesGroup: 80
      }];
      const results = calculateNewPrices(customOrder, defaultConditions);
      expect(results[0].newPrice).toBe(110);
    });

    it('全角数字や全角「ｋ」を含むマスター情報が正しく解析されること', () => {
      const zenkakuMaster: SPMasterRow[] = [{
        catalogNos: ['999'],
        weight: 10,
        shape: '単袋',
        minQuantity: 500,
        colorPrices: { 1: { uru: 150, junD: 140, d: 130 } },
        materialHint: 'ポリ'
      }];
      const zenkakuOrder: OrderRecord[] = [{
        ...spOrders[0],
        productCode: '009991001',
        materialName: '【ポリ】透明',
        weight: 10,
        totalColorCount: 1
      }];
      const results = calculateNewPrices(zenkakuOrder, defaultConditions, {}, {}, {
        custom: [], sp: zenkakuMaster, sticker: [], readymade: []
      }, { segment: 'uru' });
      expect(results[0].newPrice).toBe(150);
    });

    it('「クラフト 窓有り」が「クラフト（単）」に正しくマッチすること', () => {
      const craftMaster: SPMasterRow[] = [{
        catalogNos: ['811'],
        weight: 3,
        shape: '単袋',
        minQuantity: 1000,
        colorPrices: { 1: { uru: 125, junD: 119, d: 113.5 } },
        materialHint: 'クラフト（単）',
        sourceSheet: '05_SP和紙・ソフトクラフト'
      }];
      
      const craftOrder: OrderRecord[] = [{
        ...spOrders[0],
        category: 'SPオフセット',
        productCode: '008110301', // カタログ811, 3kg, 単袋
        materialName: '【クラフト】窓有り',
        weight: 3,
        quantity: 1000,
        totalColorCount: 1
      }];

      const results = calculateNewPrices(craftOrder, defaultConditions, {}, {}, {
        custom: [], sp: craftMaster, sticker: [], readymade: []
      }, { segment: 'uru' });
      
      expect(results[0].newPrice).toBe(125);
    });

    it('「和紙 雲竜」の1000枚価格が正しく引用されること', () => {
      const unryuMaster: SPMasterRow[] = [
        {
          catalogNos: ['810'],
          weight: 5,
          shape: '単袋',
          minQuantity: 500,
          colorPrices: { 2: { uru: 154, junD: 146.5, d: 141 } },
          materialHint: '和紙窓付雲竜',
          sourceSheet: '10_SP金銀和紙・和紙雲竜'
        },
        {
          catalogNos: ['810'],
          weight: 5,
          shape: '単袋',
          minQuantity: 1000,
          colorPrices: { 2: { uru: 143, junD: 136, d: 130 } },
          materialHint: '和紙窓付雲竜',
          sourceSheet: '10_SP金銀和紙・和紙雲竜'
        }
      ];
      
      const unryuOrder: OrderRecord[] = [{
        ...spOrders[0],
        category: 'SPオフセット',
        productCode: '008100501', // カタログ810, 5kg, 単袋
        materialName: '【和紙 雲竜】窓有り',
        quantity: 1000,
        totalColorCount: 2
      }];

      const results = calculateNewPrices(unryuOrder, defaultConditions, {}, {}, {
        custom: [], sp: unryuMaster, sticker: [], readymade: []
      }, { segment: 'uru' });
      
      // 1000枚の価格 143 が引用されること
      expect(results[0].newPrice).toBe(143);
    });
  });
});
