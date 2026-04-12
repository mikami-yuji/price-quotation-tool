export type OrderCategory = '別注' | '既製品' | 'SP' | string;

export type OrderRecord = {
  orderNumber: string; // 受注№
  category: OrderCategory; // 種別
  weight: number | string; // 重量
  productCode: string; // 商品コード
  productName: string; // 商品名
  title?: string; // タイトル
  shape: string; // 形状
  quantity: number; // 受注数
  currentPrice: number; // 単価
  printingCost: number; // 印刷代
  salesGroup: number; // 営G
  printingSalesGroup: number; // 印刷営G
  materialName: string; // 材質名称
  printCode: string; // 印刷コード
  frontColorCount: number; // 表色数
  backColorCount: number; // 裏色数
  totalColorCount: number; // 総色数
  janCode: string; // JANコード
  directDeliveryCode: string; // 直送先コード
  directDeliveryName: string; // 直送先名称
  lastOrderDate: string; // 最終受注日
  designName?: string; // デザイン名
  
  // シミュレーション用の追加フィールド
  newPrice?: number;
  newSalesGroup?: number;
  newPrintingCost?: number;
  newPrintingSalesGroup?: number;
  priceDifference?: number;
};

// 別注単価表の1行を表すデータ
export type CustomPriceMatrixRow = {
  materialName: string; // 材質名称
  weight: number | string; // 重量
  colorPrices: {
    [colorCount: number]: number; // 色数(1~7) をキーにして単価を持つ
  };
};

// 値上げのシミュレーション条件
export type IncreaseSimulationConditions = {
  customIncreaseType: 'percentage' | 'amount';
  customIncreaseValue: number;
  roundingMode: 'none' | 'half';
};

// 別注・ポリ別注・SPの手入力設定 (キー: "材質-重量-色数[-印刷コード]")
export type ManualGroupSetting = {
  [groupKey: string]: {
    price?: number;
    salesGroup?: number;
    printingPrice?: number;
    printingSalesGroup?: number;
  };
};

// 受注Noごとの個別設定 (リストでの直接入力)
export type IndividualManualSetting = {
  [orderNumber: string]: {
    price?: number;
    salesGroup?: number;
    printingPrice?: number;
    printingSalesGroup?: number;
  };
};
