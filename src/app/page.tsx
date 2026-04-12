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
  const [isGroupEditorExpanded, setIsGroupEditorExpanded] = useState(false);
  const [implementationDate, setImplementationDate] = useState<string>('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // --- Utility Functions ---

  const getCustomerName = (name: string): string => {
    const baseName = name.replace(/\.[^/.]+$/, "");
    const match = baseName.match(/_(.+)$/);
    const rawName = match ? match[1] : baseName;
    return normalizeCustomerName(rawName);
  };

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
    setTheme(initialTheme);
    document.documentElement.setAttribute('data-theme', initialTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

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
    const result = calculateNewPrices(parsedData.orders, parsedData.priceMatrix, conditions, manualSettings, individualSettings);
    setSimulatedOrders(result);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

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
    const confirmReset = window.confirm('個別に手入力した設定をすべてリセットし、一括計算の状態に戻しますか？');
    if (!confirmReset) return;
    setManualSettings({});
    setIndividualSettings({});
    if (orders.length > 0) {
      const result = calculateNewPrices(orders, priceMatrix, conditions, {}, {});
      setSimulatedOrders(result);
    }
  };

  const updateManualField = (key: string, field: 'price' | 'salesGroup' | 'printingPrice' | 'printingSalesGroup', value: number) => {
    const newSettings = { 
      ...manualSettings, 
      [key]: { ...manualSettings[key], [field]: value !== 0 ? value : undefined } 
    };
    setManualSettings(newSettings);
    const result = calculateNewPrices(orders, priceMatrix, conditions, newSettings, individualSettings);
    setSimulatedOrders(result);
  };

  const updateIndividualField = (orderNumber: string, field: 'price' | 'salesGroup' | 'printingPrice' | 'printingSalesGroup', value: number) => {
    const newSettings = {
      ...individualSettings,
      [orderNumber]: { ...individualSettings[orderNumber], [field]: value !== 0 ? value : undefined }
    };
    setIndividualSettings(newSettings);
    const result = calculateNewPrices(orders, priceMatrix, conditions, manualSettings, newSettings);
    setSimulatedOrders(result);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colKey: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const isDown = e.key === 'Enter' || e.key === 'ArrowDown';
      const targetIndex = isDown ? rowIndex + 1 : rowIndex - 1;
      const target = document.querySelector(`input[data-row-index="${targetIndex}"][data-col-key="${colKey}"]`) as HTMLInputElement;
      if (target) {
        target.focus();
        setTimeout(() => target.select(), 0);
      }
    }
  };

  const preventArrowKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
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

  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const matchesFilters = (order: OrderRecord, ignoreKey?: string) => {
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

    for (const [key, selectedValues] of Object.entries(columnFilters)) {
      if (selectedValues.length === 0 || key === ignoreKey) continue;
      
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
  };

  const filterOptions = useMemo(() => {
    const tabOrders = getTabOrders(activeTab, simulatedOrders);
    const getOptions = (columnKey: string) => {
      const crossFiltered = tabOrders.filter(o => matchesFilters(o, columnKey));
      let values: string[] = [];
      if (columnKey === 'productName') {
        values = crossFiltered.map(o => (
          (o.category === 'SP' || o.category === 'シルク' || o.category === '別注' || o.category === 'ポリ別注') 
            ? shortenProductName(o.title || o.productName) 
            : (o.productName || '')
        ));
      } else if (columnKey === 'weight' || columnKey === 'totalColorCount') {
        values = crossFiltered.map(o => String((o as any)[columnKey] || ''));
      } else {
        values = crossFiltered.map(o => (o as any)[columnKey] || '');
      }
      return Array.from(new Set(values)).sort((a, b) => {
        if (columnKey === 'weight') return parseFloat(a) - parseFloat(b);
        if (columnKey === 'totalColorCount') return parseInt(a) - parseInt(b);
        return a.localeCompare(b, 'ja');
      });
    };

    return {
      category: getOptions('category'),
      orderNumber: getOptions('orderNumber'),
      directDeliveryName: getOptions('directDeliveryName'),
      productCode: getOptions('productCode'),
      productName: getOptions('productName'),
      materialName: getOptions('materialName'),
      weight: getOptions('weight'),
      totalColorCount: getOptions('totalColorCount'),
    };
  }, [activeTab, simulatedOrders, columnFilters, searchQuery]);

  const handleColumnFilterChange = (columnKey: string, values: string[]) => {
    setColumnFilters(prev => ({ ...prev, [columnKey]: values }));
  };

  const filteredOrders = getTabOrders(activeTab, simulatedOrders)
    .filter(order => matchesFilters(order))
    .sort((a, b) => {
      if (a.materialName !== b.materialName) return a.materialName.localeCompare(b.materialName, 'ja');
      const weightA = typeof a.weight === 'string' ? parseFloat(a.weight.replace(/[^\d.]/g, '')) : a.weight;
      const weightB = typeof b.weight === 'string' ? parseFloat(b.weight.replace(/[^\d.]/g, '')) : b.weight;
      if (weightA !== weightB) return (weightA || 0) - (weightB || 0);
      return a.totalColorCount - b.totalColorCount;
    });

  const summary = filteredOrders.reduce((acc, o) => {
    const qty = o.quantity || 0;
    acc.currentTotal += (o.currentPrice || 0) * qty;
    acc.newTotal += (o.newPrice || 0) * qty;
    return acc;
  }, { currentTotal: 0, newTotal: 0 });

  const revenueIncrease = summary.newTotal - summary.currentTotal;
  const avgRevisionRate = summary.currentTotal > 0 ? (summary.newTotal / summary.currentTotal - 1) * 100 : 0;

  const counts = {
    custom: getTabOrders('custom', simulatedOrders).length,
    sp: getTabOrders('sp', simulatedOrders).length,
    readymade: getTabOrders('readymade', simulatedOrders).length
  };

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
        currentPrintingCost: o.printingCost,
        currentPrintingSalesGroup: o.printingSalesGroup,
        key: groupKey
      });
      acc[o.materialName][weightStr].sort((a, b) => a.colors - b.colors);
    }
    return acc;
  }, {} as { [material: string]: { [weight: string]: Array<{ colors: number, key: string, printCode?: string, currentPrice: number, currentSalesGroup: number, currentPrintingCost: number, currentPrintingSalesGroup: number }> } });

  const showMarginCols = activeTab === 'sp' || activeTab === 'custom';
  const showPrintingCols = activeTab === 'sp';
  const displayColumnCount = 14 + (showMarginCols ? 2 : 0) + (showPrintingCols ? 3 : 0);

  if (!isMounted) return <div className={styles.container} />;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.titleArea}>
            <h1 className={styles.title}>価格改定見積書・作成ツール</h1>
            <p className={styles.subtitle}>得意先別のExcelを読み込み、新しい見積価格を簡単にシミュレーションできます。</p>
          </div>
          <button className={styles.themeToggle} onClick={toggleTheme}>
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
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>受注データ等が含まれるファイルを選択してください</p>
          <input type="file" accept=".xlsx, .xls" hidden ref={fileInputRef} onChange={handleFileUpload} />
        </div>
      ) : (
        <div className={styles.dashboard}>
          <div className={`${styles.glassPanel} ${styles.controls}`}>
            <div>
              <h3>📄 読み込みファイル: {fileName}</h3>
              <p className={styles.controlLabel}>{orders.length} 件のデータが見つかりました。</p>
            </div>
            
            <div style={{ flex: 1 }}></div>

            {/* --- ユーザーリクエスト: 別注タブの時のみ表示 --- */}
            {activeTab === 'custom' && (
              <>
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

                <div className={styles.controlGroup}>
                  <span className={styles.controlLabel}>端数丸め:</span>
                  <div className={styles.radioGroup}>
                    <label className={styles.radioLabel}>
                      <input type="radio" checked={conditions.roundingMode === 'none'} onChange={() => setConditions({ ...conditions, roundingMode: 'none' })} /> なし
                    </label>
                    <label className={styles.radioLabel}>
                      <input type="radio" checked={conditions.roundingMode === 'half'} onChange={() => setConditions({ ...conditions, roundingMode: 'half' })} /> .00 / .50
                    </label>
                  </div>
                </div>
              </>
            )}

            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>実施時期 (任意):</span>
              <input type="date" value={implementationDate} onChange={(e) => setImplementationDate(e.target.value)} className={styles.manualInput} style={{ width: '130px' }} />
            </div>

            <button className={styles.primaryButton} onClick={handleSimulate}>再計算</button>

            <div className={styles.controlGroup}>
              <span className={styles.controlLabel}>検索:</span>
              <input type="text" placeholder="商品名など..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={styles.manualInput} style={{ width: '150px' }} />
            </div>

            <button className={styles.resetButton} onClick={handleResetSettings}>🔄 リセット</button>

            {simulatedOrders.length > 0 && (
              <button 
                onClick={handleExportExcel} 
                className={styles.pdfButton}
              >
                {activeTab === 'custom' ? '別注' : activeTab === 'sp' ? 'SP' : '既製'}見積書を作成
              </button>
            )}
          </div>

          <div className={styles.summaryDashboard}>
            <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
              <span className={styles.summaryLabel}>表示アイテム数</span>
              <span className={styles.summaryValue}>{filteredOrders.length} 件</span>
            </div>
            <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
              <span className={styles.summaryLabel}>現行 売上合計</span>
              <span className={styles.summaryValue}>¥{summary.currentTotal.toLocaleString()}</span>
            </div>
            <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
              <span className={styles.summaryLabel}>改定後 予想売上</span>
              <span className={styles.summaryValue}>¥{summary.newTotal.toLocaleString()}</span>
              <span className={`${styles.summaryTrend} ${styles.trendUp}`}>+{revenueIncrease.toLocaleString()} 円増加</span>
            </div>
            <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
              <span className={styles.summaryLabel}>平均改定率</span>
              <span className={`${styles.summaryValue} ${styles.priceUp}`}>{avgRevisionRate.toFixed(1)}%</span>
            </div>
          </div>

          <div className={styles.tabContainer}>
            <button 
              className={`${styles.tabItem} ${activeTab === 'custom' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('custom')}
            >
              別注・ポリ別注 ({counts.custom})
            </button>
            <button 
              className={`${styles.tabItem} ${activeTab === 'sp' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('sp')}
            >
              SP・シルク ({counts.sp})
            </button>
            <button 
              className={`${styles.tabItem} ${activeTab === 'readymade' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('readymade')}
            >
              既製・その他 ({counts.readymade})
            </button>
          </div>

          {Object.keys(editorGroups).length > 0 && (
            <div className={`${styles.glassPanel} ${styles.groupPriceEditor} ${!isGroupEditorExpanded ? styles.collapsed : ''}`}>
              <header className={styles.editorHeader} onClick={() => setIsGroupEditorExpanded(!isGroupEditorExpanded)}>
                <div className={styles.editorTitle}>
                  <span className={styles.editorIcon}>🛠</span>
                  <h3>{activeTab === 'sp' ? 'SP' : '別注'}グループ単価設定</h3>
                  <span className={styles.expandIcon}>{isGroupEditorExpanded ? '▼' : '▶'}</span>
                </div>
                <p className={styles.controlLabel}>材質・重量・色数が同じ商品をまとめて単価設定できます。</p>
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
                            {groups.map((group) => (
                              <div key={group.key} className={styles.groupInputRow}>
                                <div className={styles.groupInfo}>
                                  <span className={styles.groupColors}>{group.colors}色</span>
                                  {group.printCode && <span className={styles.badge}>{group.printCode}</span>}
                                </div>
                                <div className={styles.groupInputs}>
                                  <div className={styles.inputWrapper}>
                                    <span className={styles.inputLabel}>単価</span>
                                    <InlineNumericInput value={manualSettings[group.key]?.price || 0} onCommit={(val) => updateManualField(group.key, 'price', val)} onKeyDown={preventArrowKeys} className={styles.manualInput} decimals={2} />
                                    <div className={styles.groupPriceDetail}>現行: ¥{group.currentPrice.toFixed(2)}</div>
                                  </div>
                                  <div className={styles.inputWrapper}>
                                    <span className={styles.inputLabel}>営G</span>
                                    <InlineNumericInput value={manualSettings[group.key]?.salesGroup || 0} onCommit={(val) => updateManualField(group.key, 'salesGroup', val)} onKeyDown={preventArrowKeys} className={styles.manualInput} decimals={2} />
                                    <div className={styles.groupPriceDetail}>現行: ¥{group.currentSalesGroup.toFixed(2)}</div>
                                  </div>
                                  {activeTab === 'sp' && (
                                    <>
                                      <div className={styles.inputWrapper}>
                                        <span className={styles.inputLabel}>印刷代</span>
                                        <InlineNumericInput value={manualSettings[group.key]?.printingPrice || 0} onCommit={(val) => updateManualField(group.key, 'printingPrice', val)} onKeyDown={preventArrowKeys} className={styles.manualInput} decimals={2} />
                                        <div className={styles.groupPriceDetail}>現行: ¥{(group.currentPrintingCost || 0).toFixed(2)}</div>
                                      </div>
                                      <div className={styles.inputWrapper}>
                                        <span className={styles.inputLabel}>印刷営G</span>
                                        <InlineNumericInput value={manualSettings[group.key]?.printingSalesGroup || 0} onCommit={(val) => updateManualField(group.key, 'printingSalesGroup', val)} onKeyDown={preventArrowKeys} className={styles.manualInput} decimals={2} />
                                        <div className={styles.groupPriceDetail}>現行: ¥{(group.currentPrintingSalesGroup || 0).toFixed(2)}</div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={styles.tableCard}>
            <div className={styles.tableContainer}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>
                      種別
                      <ColumnFilter columnKey="category" options={filterOptions.category} selectedValues={columnFilters.category || []} onFilterChange={(vals) => handleColumnFilterChange('category', vals)} title="種別" />
                    </th>
                    <th>
                      受注No
                      <ColumnFilter columnKey="orderNumber" options={filterOptions.orderNumber} selectedValues={columnFilters.orderNumber || []} onFilterChange={(vals) => handleColumnFilterChange('orderNumber', vals)} title="受注No" />
                    </th>
                    <th>
                      直送先
                      <ColumnFilter columnKey="directDeliveryName" options={filterOptions.directDeliveryName} selectedValues={columnFilters.directDeliveryName || []} onFilterChange={(vals) => handleColumnFilterChange('directDeliveryName', vals)} title="直送先" />
                    </th>
                    {activeTab !== 'custom' && (
                      <th>
                        商品コード
                        <ColumnFilter columnKey="productCode" options={filterOptions.productCode} selectedValues={columnFilters.productCode || []} onFilterChange={(vals) => handleColumnFilterChange('productCode', vals)} title="コード" />
                      </th>
                    )}
                    <th>
                      商品名
                      <ColumnFilter columnKey="productName" options={filterOptions.productName} selectedValues={columnFilters.productName || []} onFilterChange={(vals) => handleColumnFilterChange('productName', vals)} title="商品名" />
                    </th>
                    <th>形状</th>
                    <th>数量</th>
                    <th>
                      材質
                      <ColumnFilter columnKey="materialName" options={filterOptions.materialName} selectedValues={columnFilters.materialName || []} onFilterChange={(vals) => handleColumnFilterChange('materialName', vals)} title="材質" />
                    </th>
                    {showPrintingCols && <th>印刷コード</th>}
                    <th>
                      重量
                      <ColumnFilter columnKey="weight" options={filterOptions.weight} selectedValues={columnFilters.weight || []} onFilterChange={(vals) => handleColumnFilterChange('weight', vals)} title="重量" />
                    </th>
                    <th>
                      色数
                      <ColumnFilter columnKey="totalColorCount" options={filterOptions.totalColorCount} selectedValues={columnFilters.totalColorCount || []} onFilterChange={(vals) => handleColumnFilterChange('totalColorCount', vals)} title="色数" />
                    </th>
                    <th>現行単価</th>
                    <th className={styles.highlightHeader}>改定単価</th>
                    {showMarginCols && (
                      <>
                        <th>現行営G</th>
                        <th className={styles.highlightHeader}>改定営G</th>
                      </>
                    )}
                    {showPrintingCols && <th>印刷代</th>}
                    {showPrintingCols && <th className={`${styles.highlightHeader} ${styles.compactHeader}`}>改定印刷代単価</th>}
                    {showPrintingCols && <th>印刷営G</th>}
                    {showPrintingCols && <th className={`${styles.highlightHeader} ${styles.compactHeader}`}>改定印刷代営G</th>}
                    <th>値上率</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order, i) => {
                    const price = individualSettings[order.orderNumber]?.price ?? order.newPrice ?? order.currentPrice;
                    const salesGroup = individualSettings[order.orderNumber]?.salesGroup ?? order.newSalesGroup ?? order.salesGroup;
                    const diff = order.currentPrice > 0 ? ((price / order.currentPrice) - 1) * 100 : 0;
                    
                    return (
                      <tr key={i}>
                        <td style={{ fontSize: '0.8rem', opacity: 0.7 }}>{order.category}</td>
                        <td style={{ fontSize: '0.8rem' }}>{order.orderNumber}</td>
                        <td>{order.directDeliveryName}</td>
                        {activeTab !== 'custom' && <td>{order.productCode}</td>}
                        <td>{shortenProductName(order.title || order.productName)}</td>
                        <td>{order.shape}</td>
                        <td>{order.quantity}</td>
                        <td>{order.materialName}</td>
                        {showPrintingCols && <td>{order.printCode}</td>}
                        <td>{order.weight}</td>
                        <td>{order.totalColorCount}</td>
                        <td>¥{order.currentPrice.toFixed(2)}</td>
                        <td className={styles.highlightCell}>
                          <InlineNumericInput value={price} onCommit={(val) => updateIndividualField(order.orderNumber, 'price', val)} onKeyDown={(e) => handleKeyDown(e, i, 'price')} className={styles.manualInput} rowIndex={i} colKey="price" decimals={2} />
                        </td>
                        {showMarginCols && (
                          <>
                            <td style={{ fontSize: '0.85rem' }}>¥{order.salesGroup.toFixed(2)}</td>
                            <td className={styles.highlightCell}>
                              <InlineNumericInput value={salesGroup} onCommit={(val) => updateIndividualField(order.orderNumber, 'salesGroup', val)} onKeyDown={(e) => handleKeyDown(e, i, 'salesGroup')} className={styles.manualInput} rowIndex={i} colKey="salesGroup" decimals={2} />
                            </td>
                          </>
                        )}
                        {showPrintingCols && <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>¥{(order.printingCost || 0).toFixed(2)}</td>}
                        {showPrintingCols && (
                          <td className={`${styles.highlightCell} ${styles.compactCell}`}>
                            <InlineNumericInput 
                              value={order.newPrintingCost ?? order.printingCost} 
                              onCommit={(val) => updateIndividualField(order.orderNumber, 'printingPrice', val)} 
                              onKeyDown={(e) => handleKeyDown(e, i, 'printingPrice')} 
                              className={styles.manualInput} 
                              rowIndex={i} 
                              colKey="printingPrice" 
                              decimals={2} 
                            />
                          </td>
                        )}
                        {showPrintingCols && <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>¥{(order.printingSalesGroup || 0).toFixed(2)}</td>}
                        {showPrintingCols && (
                          <td className={`${styles.highlightCell} ${styles.compactCell}`}>
                            <InlineNumericInput 
                              value={order.newPrintingSalesGroup ?? order.printingSalesGroup} 
                              onCommit={(val) => updateIndividualField(order.orderNumber, 'printingSalesGroup', val)} 
                              onKeyDown={(e) => handleKeyDown(e, i, 'printingSalesGroup')} 
                              className={styles.manualInput} 
                              rowIndex={i} 
                              colKey="printingSalesGroup" 
                              decimals={2} 
                            />
                          </td>
                        )}
                        <td className={styles.priceUp}>{diff > 0 ? `${diff.toFixed(1)}%` : '-'}</td>
                      </tr>
                    );
                  })}
                  {filteredOrders.length === 0 && (
                    <tr>
                      <td colSpan={20} className={styles.emptyState}>該当するデータがありません</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
