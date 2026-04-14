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
    roundingMode: 'none'
  };

  it('デフォルト計算: 10%アップが適用されること', () => {
    const results = calculateNewPrices(sampleOrders, [], defaultConditions);
    expect(results[0].newPrice).toBe(88);
    expect(results[0].newSalesGroup).toBe(68); // 60 + (88-80)
  });

  it('グループ設定優先: グループ単価を指定した場合、デフォルト計算より優先されること', () => {
    // 【ポリ】-5-4 のグループキー
    const groupSettings = {
      '【ポリ】-5-4': { price: 95, salesGroup: 70 }
    };
    const results = calculateNewPrices(sampleOrders, [], defaultConditions, groupSettings);
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
    
    const results = calculateNewPrices(sampleOrders, [], defaultConditions, groupSettings, individualSettings);
    
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
    const results = calculateNewPrices(sampleOrders, [], defaultConditions, {}, individualSettings);
    
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
    const results = calculateNewPrices(sampleOrders, [], conditions);
    // 80 + 0.3 = 80.3 -> 80.5 に丸まる
    expect(results[0].newPrice).toBe(80.5);
  });

  it('丸め処理の修正確認: 改定単価は丸めるが、改定営Gは理想値を維持すること', () => {
    const conditions: IncreaseSimulationConditions = {
      customIncreaseType: 'amount',
      customIncreaseValue: 0.35, // 80 + 0.35 = 80.35
      roundingMode: 'half'      // -> 単価は 80.5 に丸まる
    };
    const results = calculateNewPrices(sampleOrders, [], conditions);
    
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
    const results = calculateNewPrices(sampleOrders, [], conditions, {}, individualSettings);
    
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
      const results = calculateNewPrices(readyOrders, [], defaultConditions, {}, {}, {
        custom: [], sp: [], sticker: [], readymade: readyMaster
      }, { type: 'normal', segment: 'uru' });

      // R1 (100個) -> minQuantity: 0 の単価 45 が適用
      expect(results[0].newPrice).toBe(45);
      
      // R2 (600個) -> minQuantity: 500 の単価 40 が適用
      expect(results[1].newPrice).toBe(40);
    });
  });
});
