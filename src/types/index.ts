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
  thickness?: string;
};

// 別注単価表の1行を表すデータ
export type CustomPriceMatrixRow = {
  materialName: string; // 材質名称
  weight: number | string; // 重量
  colorPrices: {
    [colorCount: number]: number; // 色数(1~7) をキーにして単価を持つ
  };
};

// 既製品用の高度な単価データ
export type ReadymadeMasterRow = {
  productCode: string;
  minQuantity: number; // 数量スライド用の最小数量 (備考_2から算出)
  campaign: { uru: number; junD: number; d: number };
  normal: { uru: number; junD: number; d: number };
};

export type ReadymadePriceType = 'normal' | 'campaign';
export type ReadymadeSegment = 'uru' | 'junD' | 'd';

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

// 履歴の1件分を表すデータ
export type QuoteHistoryEntry = {
  id: string;
  timestamp: string;
  customerName: string;
  fileName: string;
  category: string;
  itemCount: number;
  totalBefore: number;
  totalAfter: number;
  revisionRate: number;
};

export type TimingBasis = 'order' | 'shipment';

// 保存・読み込み用の設定一式
export type SimulationSettings = {
  version: string;
  savedAt: string;
  conditions: IncreaseSimulationConditions;
  manualSettings: ManualGroupSetting;
  individualSettings: IndividualManualSetting;
  implementationDate?: string;
  timingBasis?: TimingBasis;
  lastIncreaseDate?: string;
  readymadePriceType?: ReadymadePriceType;
  readymadeSegment?: ReadymadeSegment;
};

// 受注Noごとの個別設定 (リストでの直接入力)
export type IndividualManualSetting = {
  [orderNumber: string]: {
    price?: number;
    salesGroup?: number;
    printingPrice?: number;
    printingSalesGroup?: number;
    thickness?: string;
  };
};
