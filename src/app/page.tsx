'use client';

import { useState, useRef, useEffect, ChangeEvent } from 'react';
import styles from './page.module.css';
import { parseExcelFile } from '../utils/excelUtils';
import { calculateNewPrices } from '../utils/calculator';
import { shortenProductName, normalizeCustomerName } from '../utils/stringUtils';
import { OrderRecord, CustomPriceMatrixRow, IncreaseSimulationConditions, ManualGroupSetting, IndividualManualSetting } from '../types';
import { generateQuoteExcel } from '../utils/excelGenerator';
import InlineNumericInput from '../components/InlineNumericInput';
import ColumnFilter from '../components/ColumnFilter';
import { useMemo } from 'react';

type TabType = 'custom' | 'sp' | 'readymade';

export default function Home(): React.ReactElement {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [priceMatrix, setPriceMatrix] = useState<CustomPriceMatrixRow[]>([]);
  const [simulatedOrders, setSimulatedOrders] = useState<OrderRecord[]>([]);
  const [fileName, setFileName] = useState<string>('');
  
  const [conditions, setConditions] = useState<IncreaseSimulationConditions>({
    customIncreaseType: 'percentage',
    customIncreaseValue: 10,
    roundingMode: 'none',
  });

  const [activeTab, setActiveTab] = useState<TabType>('custom');
  const [manualSettings, setManualSettings] = useState<ManualGroupSetting>({});
  const [individualSettings, setIndividualSettings] = useState<IndividualManualSetting>({});
  const [isGroupEditorExpanded, setIsGroupEditorExpanded] = useState(true);
  const [implementationDate, setImplementationDate] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // --- Utility Functions ---

  // ファイル名から得意先名を抽出（例: 43006_幸南食糧（株）.xlsx -> 幸南食糧（株））
  const getCustomerName = (name: string): string => {
    const baseName = name.replace(/\.[^/.]+$/, ""); // 拡張子削除
    const match = baseName.match(/_(.+)$/);
    const rawName = match ? match[1] : baseName;
    return normalizeCustomerName(rawName);
  };

  // タブごとのデータ取得ロジック
  const getTabOrders = (tab: TabType, allOrders: OrderRecord[]) => {
    if (allOrders.length === 0) return [];
    
    switch (tab) {
      case 'custom':
        return allOrders.filter(o => o.category === '別注' || o.category === 'ポリ別注');
      case 'sp':
        return allOrders.filter(o => o.category === 'SP' || o.category === 'シルク');
      case 'readymade':
        return allOrders.filter(o => o.category !== '別注' && o.category !== 'ポリ別注' && o.category !== 'SP' && o.category !== 'シルク');
      default:
        return allOrders;
    }
  };

  // --- Handlers ---

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
    const initialTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Load settings from localStorage on initial mount
  useEffect(() => {
    try {
      const savedConditions = localStorage.getItem('price-quotation-conditions');
      if (savedConditions) setConditions(JSON.parse(savedConditions));
      
      const savedManualSettings = localStorage.getItem('price-quotation-manual-settings');
      if (savedManualSettings) setManualSettings(JSON.parse(savedManualSettings));

      const savedIndividualSettings = localStorage.getItem('price-quotation-individual-settings');
      if (savedIndividualSettings) setIndividualSettings(JSON.parse(savedIndividualSettings));
    } catch (e) {
      console.error('Failed to load settings from localStorage', e);
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('price-quotation-conditions', JSON.stringify(conditions));
  }, [conditions]);

  useEffect(() => {
    localStorage.setItem('price-quotation-manual-settings', JSON.stringify(manualSettings));
  }, [manualSettings]);

  useEffect(() => {
    localStorage.setItem('price-quotation-individual-settings', JSON.stringify(individualSettings));
  }, [individualSettings]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    
    const buffer = await file.arrayBuffer();
    const parsedData = parseExcelFile(buffer);
    
    setOrders(parsedData.orders);
    setPriceMatrix(parsedData.priceMatrix);
    
    // 初回のシミュレーション実行
    const result = calculateNewPrices(parsedData.orders, parsedData.priceMatrix, conditions, manualSettings, individualSettings);
    setSimulatedOrders(result);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const parsedData = parseExcelFile(buffer);
    
    setOrders(parsedData.orders);
    setPriceMatrix(parsedData.priceMatrix);
    
    const result = calculateNewPrices(parsedData.orders, parsedData.priceMatrix, conditions, manualSettings, individualSettings);
    setSimulatedOrders(result);
  };

  const handleSimulate = () => {
    const result = calculateNewPrices(orders, priceMatrix, conditions, manualSettings, individualSettings);
    setSimulatedOrders(result);
  };

  const handleResetSettings = () => {
    const confirmReset = window.confirm('個別に手入力した「改定単価」と「改定後営G」をすべて初期状態（シミュレーション値）に戻しますか？');
    if (!confirmReset) return;
    
    setManualSettings({});
    setIndividualSettings({});
    
    if (orders.length > 0) {
      const result = calculateNewPrices(orders, priceMatrix, conditions, {}, {});
      setSimulatedOrders(result);
    }
  };

  const updateManualField = (key: string, field: 'price' | 'salesGroup', value: number) => {
    const newSettings = { 
      ...manualSettings, 
      [key]: { 
        ...manualSettings[key],
        [field]: value !== 0 ? value : undefined
      } 
    };
    setManualSettings(newSettings);
    const result = calculateNewPrices(orders, priceMatrix, conditions, newSettings, individualSettings);
    setSimulatedOrders(result);
  };

  const updateIndividualField = (orderNumber: string, field: 'price' | 'salesGroup', value: number) => {
    const newSettings = {
      ...individualSettings,
      [orderNumber]: {
        ...individualSettings[orderNumber],
        [field]: value !== 0 ? value : undefined
      }
    };
    setIndividualSettings(newSettings);
    const result = calculateNewPrices(orders, priceMatrix, conditions, manualSettings, newSettings);
    setSimulatedOrders(result);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colKey: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); // デフォルトの挙動（数値の増減）を阻止
      const isDown = e.key === 'Enter' || e.key === 'ArrowDown';
      const targetIndex = isDown ? rowIndex + 1 : rowIndex - 1;
      const target = document.querySelector(`input[data-row-index="${targetIndex}"][data-col-key="${colKey}"]`) as HTMLInputElement;
      if (target) {
        target.focus();
        // InlineNumericInput側でonFocus時にselectされるため、ここでは省略可能だが念のため
        setTimeout(() => target.select(), 0);
      }
    }
  };

  const preventArrowKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
    }
  };

  const handleExportExcel = async () => {
    if (simulatedOrders.length === 0) return;
    
    await generateQuoteExcel(
      normalizeCustomerName(getCustomerName(fileName)),
      filteredOrders,
      today,
      activeTab === 'custom' ? '別注' : activeTab === 'sp' ? 'SP' : '既製',
      activeTab !== 'custom',
      implementationDate
    );
  };

  // 1. 各列のユニークな値リストを抽出 (フィルタ用)
  const filterOptions = useMemo(() => {
    const tabOrders = getTabOrders(activeTab, simulatedOrders);
    const options: Record<string, string[]> = {
      category: Array.from(new Set(tabOrders.map(o => o.category || ''))).sort(),
      orderNumber: Array.from(new Set(tabOrders.map(o => o.orderNumber || ''))).sort(),
      directDeliveryName: Array.from(new Set(tabOrders.map(o => o.directDeliveryName || ''))).sort(),
      productCode: Array.from(new Set(tabOrders.map(o => o.productCode || ''))).sort(),
      productName: Array.from(new Set(tabOrders.map(o => {
        return (o.category === 'SP' || o.category === 'シルク' || o.category === '別注' || o.category === 'ポリ別注') 
          ? shortenProductName(o.title || o.productName) 
          : (o.productName || '');
      }))).sort(),
      materialName: Array.from(new Set(tabOrders.map(o => o.materialName || ''))).sort(),
      weight: Array.from(new Set(tabOrders.map(o => String(o.weight || '')))).sort((a, b) => parseFloat(a) - parseFloat(b)),
      totalColorCount: Array.from(new Set(tabOrders.map(o => String(o.totalColorCount || '0')))).sort((a, b) => parseInt(a) - parseInt(b)),
    };
    return options;
  }, [activeTab, simulatedOrders]);

  const handleColumnFilterChange = (columnKey: string, values: string[]) => {
    setColumnFilters(prev => ({
      ...prev,
      [columnKey]: values
    }));
  };

  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });



  const filteredOrders = getTabOrders(activeTab, simulatedOrders).filter(order => {
    // 1. 全体検索フィルター
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchSearch = (
        (order.productName || '').toLowerCase().includes(query) ||
        (order.orderNumber || '').toLowerCase().includes(query) ||
        (order.directDeliveryName || '').toLowerCase().includes(query) ||
        (order.productCode || '').toLowerCase().includes(query) ||
        (order.materialName || '').toLowerCase().includes(query)
      );
      if (!matchSearch) return false;
    }

    // 2. 列ごとのフィルター
    for (const [key, selectedValues] of Object.entries(columnFilters)) {
      if (selectedValues.length === 0) continue;
      
      let valToCompare = '';
      if (key === 'productName') {
        valToCompare = (order.category === 'SP' || order.category === 'シルク' || order.category === '別注' || order.category === 'ポリ別注') 
          ? shortenProductName(order.title || order.productName) 
          : (order.productName || '');
      } else if (key === 'weight' || key === 'totalColorCount') {
        valToCompare = String((order as any)[key] || '');
      } else {
        valToCompare = (order as any)[key] || '';
      }

      if (!selectedValues.includes(valToCompare)) return false;
    }

    return true;
  }).sort((a, b) => {
    // 1. 材質名称 (Material Name)
    if (a.materialName !== b.materialName) {
      return a.materialName.localeCompare(b.materialName, 'ja');
    }
    
    // 2. 重量 (Weight)
    const weightA = typeof a.weight === 'string' ? parseFloat(a.weight.replace(/[^\d.]/g, '')) : a.weight;
    const weightB = typeof b.weight === 'string' ? parseFloat(b.weight.replace(/[^\d.]/g, '')) : b.weight;
    if (weightA !== weightB) {
      return (weightA || 0) - (weightB || 0);
    }
    
    // 3. 総色数 (Total Color Count)
    return a.totalColorCount - b.totalColorCount;
  });
  
  const counts = {
    custom: getTabOrders('custom', simulatedOrders).length,
    sp: getTabOrders('sp', simulatedOrders).length,
    readymade: getTabOrders('readymade', simulatedOrders).length
  };

  // サマリー計算 (現在の表示対象)
  const summary = filteredOrders.reduce((acc, o) => {
    const qty = o.quantity || 0;
    acc.currentTotal += (o.currentPrice || 0) * qty;
    acc.newTotal += (o.newPrice || 0) * qty;
    return acc;
  }, { currentTotal: 0, newTotal: 0 });

  const revenueIncrease = summary.newTotal - summary.currentTotal;
  const avgRevisionRate = summary.currentTotal > 0 
    ? (summary.newTotal / summary.currentTotal - 1) * 100 
    : 0;

  // ユニークなグループを抽出し、材質 > 重量 ごとに階層化
  const editorGroups = getTabOrders(activeTab === 'sp' ? 'sp' : 'custom', orders).reduce((acc, o) => {
    const isSP = activeTab === 'sp';
    const groupKey = isSP 
      ? `${o.materialName}-${o.weight}-${o.totalColorCount}-${o.printCode}`
      : `${o.materialName}-${o.weight}-${o.totalColorCount}`;
      
    const weightStr = `${o.weight} ㎏`;
    
    if (!acc[o.materialName]) acc[o.materialName] = {};
    if (!acc[o.materialName][weightStr]) acc[o.materialName][weightStr] = [];
    
    if (!acc[o.materialName][weightStr].find(g => g.key === groupKey)) {
      acc[o.materialName][weightStr].push({
        colors: o.totalColorCount,
        printCode: isSP ? o.printCode : undefined,
        currentPrice: o.currentPrice,
        currentSalesGroup: o.salesGroup,
        key: groupKey
      });
      // 色数・印刷コード順にソートしておくと見やすい
      acc[o.materialName][weightStr].sort((a, b) => {
        if (a.colors !== b.colors) return a.colors - b.colors;
        if (a.printCode && b.printCode) return a.printCode.localeCompare(b.printCode);
        return 0;
      });
    }
    return acc;
  }, {} as { [material: string]: { [weight: string]: Array<{ colors: number, key: string, printCode?: string, currentPrice: number, currentSalesGroup: number }> } });

  const showMarginCols = activeTab === 'sp' || activeTab === 'custom';
  const showPrintingCols = activeTab === 'sp';
  const displayColumnCount = 14 + (showMarginCols ? 2 : 0) + (showPrintingCols ? 3 : 0);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.titleArea}>
            <h1 className={styles.title}>価格改定見積書・作成ツール</h1>
            <p className={styles.subtitle}>得意先別のExcelを読み込み、新しい見積価格を簡単にシミュレーションできます。</p>
          </div>
          <button 
            className={styles.themeToggle} 
            onClick={toggleTheme}
            title={theme === 'light' ? 'ダークモードに切り替え' : 'ライトモードに切り替え'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      {orders.length === 0 ? (
        <div 
          className={`${styles.glassPanel} ${styles.uploadSection}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <div className={styles.uploadIcon}>📄</div>
          <h2>Excelファイルをドロップ、またはクリックしてアップロード</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            受注データ、別注単価表が含まれるファイルを選択してください
          </p>
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            hidden 
            ref={fileInputRef} 
            onChange={handleFileUpload}
          />
        </div>
      ) : (
        <div className={styles.dashboard}>
          <div className={`${styles.glassPanel} ${styles.controls}`}>
            <div>
              <h3>📄 読み込みファイル: {fileName}</h3>
              <p className={styles.controlLabel}>{orders.length} 件のデータが見つかりました。</p>
            </div>
            
            <div style={{ flex: 1 }}></div>

            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>別注・値上げベース:</span>
              <select 
                value={conditions.customIncreaseType}
                onChange={(e) => setConditions({ ...conditions, customIncreaseType: e.target.value as 'percentage' | 'amount' })}
              >
                <option value="percentage">一律パーセント (%)</option>
                <option value="amount">一律金額アップ (円)</option>
              </select>
            </div>
            {(activeTab === 'custom' || activeTab === 'sp') && (
              <div className={styles.controlGroup}>
                <span className={styles.controlLabel}>値幅:</span>
                <InlineNumericInput 
                  value={conditions.customIncreaseValue}
                  onCommit={(val) => setConditions({ ...conditions, customIncreaseValue: val })}
                  className={styles.manualInput}
                  style={{ width: '80px' } as any}
                  decimals={1}
                />
              </div>
            )}

            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>端数丸め:</span>
              <div className={styles.radioGroup}>
                <label className={styles.radioLabel}>
                  <input 
                    type="radio" 
                    name="rounding" 
                    checked={conditions.roundingMode === 'none'}
                    onChange={() => setConditions({ ...conditions, roundingMode: 'none' })}
                  />
                  なし
                </label>
                <label className={styles.radioLabel}>
                  <input 
                    type="radio" 
                    name="rounding" 
                    checked={conditions.roundingMode === 'half'}
                    onChange={() => setConditions({ ...conditions, roundingMode: 'half' })}
                  />
                  .00 / .50
                </label>
              </div>
            </div>

            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>実施時期 (任意):</span>
              <input 
                type="date" 
                value={implementationDate}
                onChange={(e) => setImplementationDate(e.target.value)}
                className={styles.manualInput} // 既存のスタイルを一部借用しつつ微調整
                style={{ width: '150px', cursor: 'pointer' }}
              />
            </div>

            <button className={styles.primaryButton} onClick={handleSimulate}>
              再計算
            </button>

            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>全体検索:</span>
              <input 
                type="text" 
                placeholder="商品名、No、直送先等..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.manualInput}
                style={{ width: '200px' }}
              />
            </div>

            <div className={styles.controlGroup}>
              <button 
                className={styles.resetButton} 
                onClick={handleResetSettings}
                title="手入力した設定をすべてクリア"
              >
                🔄 リセット
              </button>
            </div>

            {simulatedOrders.length > 0 && (
              <button 
                onClick={handleExportExcel}
                className={styles.pdfButton} // スタイルは既存のボタン用を再利用
              >
                {activeTab === 'custom' ? '別注' : activeTab === 'sp' ? 'SP' : '既製'}見積書を作成 (Excel)
              </button>
            )}
          </div>

          <div className={styles.summaryDashboard}>
            <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
              <span className={styles.summaryLabel}>対象アイテム数</span>
              <span className={styles.summaryValue}>{filteredOrders.length} <small style={{ fontSize: '0.8rem', fontWeight: 500 }}>件</small></span>
            </div>
            <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
              <span className={styles.summaryLabel}>現行 売上合計 (月換算等)</span>
              <span className={styles.summaryValue}>¥{summary.currentTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
            <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
              <span className={styles.summaryLabel}>改定後 予想売上</span>
              <span className={styles.summaryValue}>¥{summary.newTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              <span className={`${styles.summaryTrend} ${styles.trendUp}`}>
                +{revenueIncrease.toLocaleString()} 円増加
              </span>
            </div>
            <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
              <span className={styles.summaryLabel}>平均改定率 (加重平均)</span>
              <span className={`${styles.summaryValue} ${styles.priceUp}`}>
                {avgRevisionRate.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className={styles.tabContainer}>
            <button 
              className={`${styles.tabItem} ${activeTab === 'custom' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('custom')}
            >
              別注・ポリ別注 <span className={styles.tabBadge}>{counts.custom}</span>
            </button>
            <button 
              className={`${styles.tabItem} ${activeTab === 'sp' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('sp')}
            >
              SP・シルク <span className={styles.tabBadge}>{counts.sp}</span>
            </button>
            <button 
              className={`${styles.tabItem} ${activeTab === 'readymade' ? styles.activeTab : ''}`}
              onClick={() => setActiveTab('readymade')}
            >
              既製品・その他 <span className={styles.tabBadge}>{counts.readymade}</span>
            </button>
          </div>

          {(activeTab === 'custom' || activeTab === 'sp') && Object.keys(editorGroups).length > 0 && (
            <div className={`${styles.glassPanel} ${styles.groupPriceEditor} ${!isGroupEditorExpanded ? styles.collapsed : ''}`}>
              <header className={styles.editorHeader} onClick={() => setIsGroupEditorExpanded(!isGroupEditorExpanded)}>
                <div className={styles.editorTitle}>
                  <span className={styles.editorIcon}>🛠</span>
                  <h3>{activeTab === 'custom' ? '別注' : 'SP'}グループ単価設定</h3>
                  <span className={styles.expandIcon}>{isGroupEditorExpanded ? '▼' : '▶'}</span>
                </div>
                <p className={styles.controlLabel}>材質・重量・色数{activeTab === 'sp' ? '・印刷コード' : ''}が同じ商品をまとめて単価設定できます。入力がない場合は一律計算が適用されます。</p>
              </header>
              
              {isGroupEditorExpanded && (
                <div className={styles.editorContent}>
                  {Object.entries(editorGroups).map(([material, weights]) => (
                    <div key={material} className={styles.materialSection}>
                      <h4 className={styles.materialHeader}>{material}</h4>
                      
                      {Object.entries(weights).map(([weight, groups]) => (
                        <div key={weight} className={styles.weightGroup}>
                          <h5 className={styles.weightHeader}>{weight}</h5>
                          <div className={styles.groupGrid}>
                            {groups.map((group) => {
                              const manualPrice = manualSettings[group.key]?.price;
                              const manualSalesGroup = manualSettings[group.key]?.salesGroup;
                              return (
                                <div key={group.key} className={styles.groupInputRow}>
                                  <div className={styles.groupInfo}>
                                    <span className={styles.groupColors}>{group.colors}色</span>
                                    {group.printCode && (
                                      <span style={{ fontSize: '0.75rem', opacity: 0.7, marginLeft: '8px' }}>
                                        [{group.printCode}]
                                      </span>
                                    )}
                                  </div>
                                  <div className={styles.groupInputs}>
                                    <div className={styles.inputWrapper}>
                                      <span className={styles.inputLabel}>改定単価</span>
                                      <InlineNumericInput 
                                        placeholder="単価"
                                        value={manualPrice || 0} 
                                        onCommit={(val) => updateManualField(group.key, 'price', val)}
                                        onKeyDown={preventArrowKeys}
                                        className={styles.manualInput}
                                        decimals={2}
                                      />
                                      <div className={styles.groupPriceDetail}>
                                        <span>現行: ¥{group.currentPrice.toFixed(2)}</span>
                                        {manualPrice !== undefined && manualPrice !== 0 ? (
                                          <span className={styles.priceUp} style={{ marginLeft: '8px' }}>
                                            (+{(((manualPrice - group.currentPrice) / group.currentPrice) * 100).toFixed(1)}%)
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                    {activeTab !== 'sp' && (
                                      <div className={styles.inputWrapper}>
                                        <span className={styles.inputLabel}>改定後営G</span>
                                        <InlineNumericInput 
                                          placeholder="営G"
                                          value={manualSalesGroup || 0} 
                                          onCommit={(val) => updateManualField(group.key, 'salesGroup', val)}
                                          onKeyDown={preventArrowKeys}
                                          className={styles.manualInput}
                                          decimals={2}
                                        />
                                        <div className={styles.groupPriceDetail}>
                                          <span>現行: ¥{group.currentSalesGroup.toFixed(2)}</span>
                                          {manualSalesGroup !== undefined && manualSalesGroup !== 0 && group.currentSalesGroup !== 0 ? (
                                            <span className={styles.priceUp} style={{ marginLeft: '8px' }}>
                                              (+{(((manualSalesGroup - group.currentSalesGroup) / group.currentSalesGroup) * 100).toFixed(1)}%)
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={styles.tableContainer}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>
                    種別
                    <ColumnFilter 
                      columnKey="category"
                      options={filterOptions.category}
                      selectedValues={columnFilters.category || []}
                      onFilterChange={(vals) => handleColumnFilterChange('category', vals)}
                      title="種別"
                    />
                  </th>
                  <th>
                    受注No
                    <ColumnFilter 
                      columnKey="orderNumber"
                      options={filterOptions.orderNumber}
                      selectedValues={columnFilters.orderNumber || []}
                      onFilterChange={(vals) => handleColumnFilterChange('orderNumber', vals)}
                      title="受注No"
                    />
                  </th>
                  <th>直送先コード</th>
                  <th>
                    直送先名称
                    <ColumnFilter 
                      columnKey="directDeliveryName"
                      options={filterOptions.directDeliveryName}
                      selectedValues={columnFilters.directDeliveryName || []}
                      onFilterChange={(vals) => handleColumnFilterChange('directDeliveryName', vals)}
                      title="直送先名称"
                    />
                  </th>
                  {activeTab !== 'custom' && (
                    <th>
                      商品コード
                      <ColumnFilter 
                        columnKey="productCode"
                        options={filterOptions.productCode}
                        selectedValues={columnFilters.productCode || []}
                        onFilterChange={(vals) => handleColumnFilterChange('productCode', vals)}
                        title="商品コード"
                      />
                    </th>
                  )}
                  <th>
                    商品名
                    <ColumnFilter 
                      columnKey="productName"
                      options={filterOptions.productName}
                      selectedValues={columnFilters.productName || []}
                      onFilterChange={(vals) => handleColumnFilterChange('productName', vals)}
                      title="商品名"
                    />
                  </th>
                  <th>形状</th>
                  <th>受注数</th>
                  <th>
                    材質
                    <ColumnFilter 
                      columnKey="materialName"
                      options={filterOptions.materialName}
                      selectedValues={columnFilters.materialName || []}
                      onFilterChange={(vals) => handleColumnFilterChange('materialName', vals)}
                      title="材質"
                    />
                  </th>
                  {showPrintingCols && <th>印刷コード</th>}
                  <th>
                    重量
                    <ColumnFilter 
                      columnKey="weight"
                      options={filterOptions.weight}
                      selectedValues={columnFilters.weight || []}
                      onFilterChange={(vals) => handleColumnFilterChange('weight', vals)}
                      title="重量"
                    />
                  </th>
                  <th>
                    色数
                    <ColumnFilter 
                      columnKey="totalColorCount"
                      options={filterOptions.totalColorCount}
                      selectedValues={columnFilters.totalColorCount || []}
                      onFilterChange={(vals) => handleColumnFilterChange('totalColorCount', vals)}
                      title="色数"
                    />
                  </th>
                  <th>現行単価</th>
                  <th className={styles.highlightHeader}>改定単価</th>
                  {showMarginCols && (
                    <>
                      <th>営G</th>
                      <th className={styles.highlightHeader}>改定後 営G</th>
                    </>
                  )}
                  {showPrintingCols && <th>印刷代</th>}
                  {showPrintingCols && <th>印刷営G</th>}
                  <th>値上げ率 (%)</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order, index) => (
                  <tr key={index} className={(order.newPrice !== undefined && order.newPrice <= order.currentPrice) ? styles.warningRow : ''}>
                    <td>
                      <span style={{ 
                        background: (order.category === '別注' || order.category === 'ポリ別注') ? 'rgba(99, 102, 241, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.85rem'
                      }}>
                        {order.category || '未分類'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{order.orderNumber}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>{order.directDeliveryCode}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>{order.directDeliveryName}</div>
                    </td>
                    {activeTab !== 'custom' && (
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>{order.productCode}</div>
                    </td>
                    )}
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {(order.category === 'SP' || order.category === 'シルク' || order.category === '別注' || order.category === 'ポリ別注') 
                          ? shortenProductName(order.title || order.productName) 
                          : (order.productName || '名前なし')}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.9rem' }}>{order.shape}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.9rem' }}>{order.quantity}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.9rem' }}>{order.materialName}</div>
                    </td>
                    {showPrintingCols && (
                      <td>
                        <div style={{ fontSize: '0.85rem' }}>{order.printCode}</div>
                      </td>
                    )}
                    <td>{order.weight}</td>
                    <td>{order.totalColorCount}</td>
                    <td>¥{order.currentPrice.toFixed(2)}</td>
                    <td className={`${styles.newPriceHighlight} ${individualSettings[order.orderNumber]?.price ? styles.individualOverride : ''}`}>
                      <InlineNumericInput 
                        rowIndex={index}
                        colKey="price"
                        value={order.newPrice || 0}
                        onCommit={(val) => updateIndividualField(order.orderNumber, 'price', val)}
                        onKeyDown={(e) => handleKeyDown(e, index, 'price')}
                        className={styles.inlineInput}
                        decimals={2}
                      />
                    </td>
                    {showMarginCols && (
                      <>
                        <td>{order.salesGroup}</td>
                        <td className={`${styles.newSalesHighlight} ${individualSettings[order.orderNumber]?.salesGroup ? styles.individualOverride : ''}`}>
                          <InlineNumericInput 
                            rowIndex={index}
                            colKey="salesGroup"
                            value={order.newSalesGroup || 0}
                            onCommit={(val) => updateIndividualField(order.orderNumber, 'salesGroup', val)}
                            onKeyDown={(e) => handleKeyDown(e, index, 'salesGroup')}
                            className={styles.inlineInput}
                            decimals={2}
                          />
                        </td>
                      </>
                    )}
                    {showPrintingCols && <td>¥{(order.printingCost || 0).toFixed(2)}</td>}
                    {showPrintingCols && <td>{order.printingSalesGroup}</td>}
                    <td className={styles.priceUp}>
                      {order.newPrice !== undefined && order.currentPrice > 0 
                        ? `${(((order.newPrice - order.currentPrice) / order.currentPrice) * 100).toFixed(1)}%` 
                        : '-'}
                    </td>
                  </tr>
                ))}
                {simulatedOrders.length === 0 && (
                  <tr>
                    <td colSpan={displayColumnCount} className={styles.emptyState}>データがありません</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
