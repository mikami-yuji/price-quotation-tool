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
});
