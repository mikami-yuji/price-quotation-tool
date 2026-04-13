'use client';

import { useState, useRef, useEffect, ChangeEvent, useMemo, useCallback } from 'react';
import styles from './page.module.css';
import { parseExcelFile } from '../utils/excelUtils';
import { calculateNewPrices } from '../utils/calculator';
import { shortenProductName, normalizeCustomerName } from '../utils/stringUtils';
import { OrderRecord, CustomPriceMatrixRow, IncreaseSimulationConditions, ManualGroupSetting, IndividualManualSetting, SimulationSettings, QuoteHistoryEntry, ReadymadeMasterRow, ReadymadePriceType, ReadymadeSegment } from '../types';
import { generateQuoteExcel } from '../utils/excelGenerator';
import InlineNumericInput from '../components/InlineNumericInput';
import ColumnFilter from '../components/ColumnFilter';
import { parseReadymadeCSV } from '../utils/csvUtils';

type TabType = 'custom' | 'sp' | 'readymade' | 'sticker';

export default function Home(): React.ReactElement {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [priceMatrix, setPriceMatrix] = useState<CustomPriceMatrixRow[]>([]);
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
  const [history, setHistory] = useState<QuoteHistoryEntry[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [customMaster, setCustomMaster] = useState<CustomPriceMatrixRow[]>([]);
  const [spMaster, setSpMaster] = useState<CustomPriceMatrixRow[]>([]);
  const [readymadeMaster, setReadymadeMaster] = useState<CustomPriceMatrixRow[] | ReadymadeMasterRow[]>([]);
  const [stickerMaster, setStickerMaster] = useState<CustomPriceMatrixRow[]>([]);
  const [activeMasterTab, setActiveMasterTab] = useState<TabType>('custom');
  const [isMasterExpanded, setIsMasterExpanded] = useState(false);
  const [readymadePriceType, setReadymadePriceType] = useState<ReadymadePriceType>('normal');
  const [readymadeSegment, setReadymadeSegment] = useState<ReadymadeSegment>('uru');

  const simulatedOrders = useMemo(() => {
    return calculateNewPrices(orders, priceMatrix, conditions, manualSettings, individualSettings, {
      custom: customMaster,
      sp: spMaster,
      readymade: readymadeMaster,
      sticker: stickerMaster
    }, { type: readymadePriceType, segment: readymadeSegment });
  }, [orders, priceMatrix, conditions, manualSettings, individualSettings, customMaster, spMaster, readymadeMaster, stickerMaster, readymadePriceType, readymadeSegment]);

   
  useEffect(() => {
    setTimeout(() => setIsMounted(true), 0);
    if (typeof window !== 'undefined') {
      try {
        const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
        if (savedTheme) {
          setTimeout(() => {
            setTheme(savedTheme);
            document.documentElement.setAttribute('data-theme', savedTheme);
          }, 0);
        }

        const savedConditions = localStorage.getItem('price-quotation-conditions');
        if (savedConditions) setTimeout(() => setConditions(JSON.parse(savedConditions)), 0);
        
        const savedManualSettings = localStorage.getItem('price-quotation-manual-settings');
        if (savedManualSettings) setTimeout(() => setManualSettings(JSON.parse(savedManualSettings)), 0);

        const savedIndividualSettings = localStorage.getItem('price-quotation-individual-settings');
        if (savedIndividualSettings) setTimeout(() => setIndividualSettings(JSON.parse(savedIndividualSettings)), 0);

        const savedHistory = localStorage.getItem('price-quotation-history');
        if (savedHistory) setTimeout(() => setHistory(JSON.parse(savedHistory)), 0);

        const savedCustomMaster = localStorage.getItem('price-quotation-custom-master');
        if (savedCustomMaster) setTimeout(() => setCustomMaster(JSON.parse(savedCustomMaster)), 0);

        const savedSPMaster = localStorage.getItem('price-quotation-sp-master');
        if (savedSPMaster) setTimeout(() => setSpMaster(JSON.parse(savedSPMaster)), 0);

        const savedReadyMaster = localStorage.getItem('price-quotation-ready-master');
        if (savedReadyMaster) setTimeout(() => setReadymadeMaster(JSON.parse(savedReadyMaster)), 0);

        const savedReadyType = localStorage.getItem('price-quotation-ready-type') as ReadymadePriceType;
        if (savedReadyType) setTimeout(() => setReadymadePriceType(savedReadyType), 0);

        const savedReadySegment = localStorage.getItem('price-quotation-ready-segment') as ReadymadeSegment;
        if (savedReadySegment) setTimeout(() => setReadymadeSegment(savedReadySegment), 0);

        const savedStickerMaster = localStorage.getItem('price-quotation-sticker-master');
        if (savedStickerMaster) setTimeout(() => setStickerMaster(JSON.parse(savedStickerMaster)), 0);
      } catch (e) {
        console.error('Failed to load settings from localStorage', e);
      }
    }
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
      case 'sticker':
        return allOrders.filter(o => o.category === 'シール' || o.category === 'シール（フルオーダー）' || o.category.includes('シール'));
      case 'readymade':
        return allOrders.filter(o => 
          o.category !== '別注' && o.category !== 'ポリ別注' && o.category !== 'SP' && o.category !== 'シルク' && 
          !(o.category === 'シール' || o.category === 'シール（フルオーダー）' || o.category.includes('シール')) &&
          o.productCode !== '999999999'
        );
      default:
        return allOrders;
    }
  };

  // --- Handlers ---

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

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
  const settingsInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const parsedData = parseExcelFile(buffer);
    setOrders(parsedData.orders);
    setPriceMatrix(parsedData.priceMatrix);
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
  };

  const handleResetSettings = () => {
    const confirmReset = window.confirm('個別に手入力した設定をすべてリセットし、一括計算の状態に戻しますか？');
    if (!confirmReset) return;
    setManualSettings({});
    setIndividualSettings({});
  };

  const handleClearFile = () => {
    if (orders.length > 0) {
      const confirmClear = window.confirm('読み込んだデータをクリアして最初の画面に戻りますか？');
      if (!confirmClear) return;
      setOrders([]);
      setFileName('');
      setPriceMatrix([]);
      setColumnFilters({});
      setSearchQuery('');
    }
  };

  const handleSaveSettings = () => {
    const settings: SimulationSettings = {
      version: '1.0',
      savedAt: new Date().toISOString(),
      conditions,
      manualSettings,
      individualSettings,
      implementationDate
    };
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `price_settings_${getCustomerName(fileName) || 'simulation'}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadSettings = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const settings = JSON.parse(event.target?.result as string) as SimulationSettings;
        if (settings.conditions) setConditions(settings.conditions);
        if (settings.manualSettings) setManualSettings(settings.manualSettings);
        if (settings.individualSettings) setIndividualSettings(settings.individualSettings);
        if (settings.implementationDate) setImplementationDate(settings.implementationDate);
        alert('設定を正常に読み込みました。');
      } catch (err) {
        console.error('Failed to load settings', err);
        alert('設定ファイルの形式が正しくありません。');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleMasterUpload = async (e: ChangeEvent<HTMLInputElement>, type: TabType) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const buffer = await file.arrayBuffer();
      
      let parsedMatrix: CustomPriceMatrixRow[] | ReadymadeMasterRow[] = [];
      
      if (file.name.toLowerCase().endsWith('.csv')) {
        // CSVの場合は既製品用の高度な形式として処理
        parsedMatrix = parseReadymadeCSV(buffer);
      } else {
        // Excelの場合は通常の材質別単価表として処理
        const parsedData = parseExcelFile(buffer);
        parsedMatrix = parsedData.priceMatrix;
      }
      
      if (parsedMatrix.length === 0) {
        alert('「別注単価表」シートが見つからないか、データが空です。 (CSVの場合は形式を確認してください)');
        return;
      }

      if (type === 'custom') setCustomMaster(parsedMatrix as CustomPriceMatrixRow[]);
      if (type === 'sp') setSpMaster(parsedMatrix as CustomPriceMatrixRow[]);
      if (type === 'readymade') setReadymadeMaster(parsedMatrix);
      if (type === 'sticker') setStickerMaster(parsedMatrix as CustomPriceMatrixRow[]);
      
      alert(`${type.toUpperCase()}用のマスターデータを読み込みました。`);
    } catch (err) {
      console.error('Failed to parse master file', err);
      alert('ファイルの解析に失敗しました。');
    }
    e.target.value = '';
  };

  useEffect(() => {
    localStorage.setItem('price-quotation-history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('price-quotation-custom-master', JSON.stringify(customMaster));
  }, [customMaster]);

  useEffect(() => {
    localStorage.setItem('price-quotation-sp-master', JSON.stringify(spMaster));
  }, [spMaster]);

  useEffect(() => {
    localStorage.setItem('price-quotation-ready-master', JSON.stringify(readymadeMaster));
  }, [readymadeMaster]);

  useEffect(() => {
    localStorage.setItem('price-quotation-ready-type', readymadePriceType);
  }, [readymadePriceType]);

  useEffect(() => {
    localStorage.setItem('price-quotation-ready-segment', readymadeSegment);
  }, [readymadeSegment]);

  useEffect(() => {
    localStorage.setItem('price-quotation-sticker-master', JSON.stringify(stickerMaster));
  }, [stickerMaster]);

  /* eslint-disable react-hooks/purity */
  const recordHistory = (customerName: string, category: string) => {
    const newEntry: QuoteHistoryEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      customerName,
      fileName,
      category,
      itemCount: filteredOrders.length,
      totalBefore: summary.currentTotal,
      totalAfter: summary.newTotal,
      revisionRate: avgRevisionRate
    };
    setHistory(prev => [newEntry, ...prev.slice(0, 49)]); // Keep last 50
  };
  /* eslint-enable react-hooks/purity */

  const updateManualField = (key: string, field: 'price' | 'salesGroup' | 'printingPrice' | 'printingSalesGroup', value: number) => {
    const newSettings = { 
      ...manualSettings, 
      [key]: { ...manualSettings[key], [field]: value !== 0 ? value : undefined } 
    };
    setManualSettings(newSettings);
  };

  const updateIndividualField = (orderNumber: string, field: 'price' | 'salesGroup' | 'printingPrice' | 'printingSalesGroup', value: number) => {
    const newSettings = {
      ...individualSettings,
      [orderNumber]: { ...individualSettings[orderNumber], [field]: value !== 0 ? value : undefined }
    };
    setIndividualSettings(newSettings);
  };

  const handleSimulate = () => {
    // simulatedOrders is now derived via useMemo, but we keep the handler for consistency if needed or just remove it if really unused
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
    const customer = normalizeCustomerName(getCustomerName(fileName));
    const categoryName = activeTab === 'custom' ? '別注' : 
                         activeTab === 'sp' ? 'SP' : 
                         activeTab === 'sticker' ? 'シール' : '既製';
    
    await generateQuoteExcel(
      customer,
      filteredOrders,
      today,
      categoryName,
      activeTab !== 'custom',
      implementationDate
    );
    
    recordHistory(customer, categoryName);
  };

  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const matchesFilters = useCallback((order: OrderRecord, ignoreKey?: string) => {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        valToCompare = String((order as any)[key] || '');
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        valToCompare = (order as any)[key] || '';
      }

      if (!selectedValues.includes(valToCompare)) return false;
    }
    return true;
  }, [searchQuery, columnFilters]);

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        values = crossFiltered.map(o => String((o as any)[columnKey] || ''));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        values = crossFiltered.map(o => (o as any)[columnKey] || '');
      }
      return Array.from(new Set(values)).sort((a, b) => {
        if (columnKey === 'weight') return parseFloat(a) - parseFloat(b);
        if (columnKey === 'totalColorCount') return parseInt(a, 10) - parseInt(b, 10);
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
  }, [activeTab, simulatedOrders, matchesFilters]);

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
    readymade: getTabOrders('readymade', simulatedOrders).length,
    sticker: getTabOrders('sticker', simulatedOrders).length
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
            {/* 1. File & Context Zone */}
            <div className={styles.controlTopBar}>
              <div className={styles.fileInfo}>
                <div className={styles.fileIcon}>📄</div>
                <div className={styles.fileDetails}>
                  <div className={styles.fileTitleRow}>
                    <h3>読み込みファイル: {fileName}</h3>
                    <button className={styles.clearFileBtn} onClick={handleClearFile} title="ファイルを閉じる">
                      ✕ 読み取り解除
                    </button>
                  </div>
                  <p>{orders.length} 件のデータが見つかりました。</p>
                </div>
              </div>

              <div className={styles.simulationParams}>
                {activeTab === 'custom' && (
                  <>
                    <div className={styles.controlGroup}>
                      <span className={styles.controlLabel}>値上げベース:</span>
                      <div className={styles.segmentedControl}>
                        <button 
                          className={`${styles.segmentButton} ${conditions.customIncreaseType === 'percentage' ? styles.segmentActive : ''}`}
                          onClick={() => setConditions({ ...conditions, customIncreaseType: 'percentage' })}
                        >
                          一律 (%)
                        </button>
                        <button 
                          className={`${styles.segmentButton} ${conditions.customIncreaseType === 'amount' ? styles.segmentActive : ''}`}
                          onClick={() => setConditions({ ...conditions, customIncreaseType: 'amount' })}
                        >
                          一律 (円)
                        </button>
                      </div>
                    </div>
                    
                    <div className={styles.controlGroup}>
                      <span className={styles.controlLabel}>値幅:</span>
                      <InlineNumericInput 
                        value={conditions.customIncreaseValue}
                        onCommit={(val) => setConditions({ ...conditions, customIncreaseValue: val })}
                        className={styles.manualInput}
                        style={{ width: '80px' }}
                        decimals={1}
                      />
                    </div>

                    <div className={styles.controlGroup}>
                      <span className={styles.controlLabel}>端数丸め:</span>
                      <div className={styles.segmentedControl}>
                        <button 
                          className={`${styles.segmentButton} ${conditions.roundingMode === 'none' ? styles.segmentActive : ''}`}
                          onClick={() => setConditions({ ...conditions, roundingMode: 'none' })}
                        >
                          なし
                        </button>
                        <button 
                          className={`${styles.segmentButton} ${conditions.roundingMode === 'half' ? styles.segmentActive : ''}`}
                          onClick={() => setConditions({ ...conditions, roundingMode: 'half' })}
                        >
                          .00 / .50
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className={styles.controlGroup}>
                  <span className={styles.controlLabel}>実施時期:</span>
                  <input type="date" value={implementationDate} onChange={(e) => setImplementationDate(e.target.value)} className={styles.manualInput} style={{ width: '135px' }} />
                </div>

                {activeTab === 'readymade' && (
                  <>
                    <div className={styles.controlGroup}>
                      <span className={styles.controlLabel}>価格タイプ:</span>
                      <div className={styles.segmentedControl}>
                        <button 
                          className={`${styles.segmentButton} ${readymadePriceType === 'normal' ? styles.segmentActive : ''}`}
                          onClick={() => setReadymadePriceType('normal')}
                        >
                          通常
                        </button>
                        <button 
                          className={`${styles.segmentButton} ${readymadePriceType === 'campaign' ? styles.segmentActive : ''}`}
                          onClick={() => setReadymadePriceType('campaign')}
                        >
                          CP
                        </button>
                      </div>
                    </div>
                    <div className={styles.controlGroup}>
                      <span className={styles.controlLabel}>客層区分:</span>
                      <div className={styles.segmentedControl}>
                        {(['uru', 'junD', 'd'] as ReadymadeSegment[]).map(s => (
                          <button 
                            key={s}
                            className={`${styles.segmentButton} ${readymadeSegment === s ? styles.segmentActive : ''}`}
                            onClick={() => setReadymadeSegment(s)}
                          >
                            {s === 'uru' ? '売' : s === 'junD' ? '準D' : 'D'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            {/* 2. Global Toolbar Zone */}
            <div className={styles.toolbar}>
              <div className={styles.controlGroup}>
                <span className={styles.controlLabel}>🔍 検索:</span>
                <input 
                  type="text" 
                  placeholder="商品名、コードなどで絞り込み..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className={styles.manualInput} 
                  style={{ width: '250px' }} 
                />
              </div>

              <div className={styles.actionButtons}>
                <button className={styles.resetButton} onClick={handleResetSettings}>🔄 設定リセット</button>
                
                {simulatedOrders.length > 0 && (
                  <>
                    <button onClick={handleSaveSettings} className={styles.secondaryButton} title="設定保存">
                      💾 保存
                    </button>
                    <button onClick={() => settingsInputRef.current?.click()} className={styles.secondaryButton} title="設定読込">
                      📂 読込
                    </button>
                    <input type="file" accept=".json" hidden ref={settingsInputRef} onChange={handleLoadSettings} />
                    
                    <button className={styles.primaryButton} onClick={handleSimulate}>
                      ✨ 再計算
                    </button>

                    <button onClick={handleExportExcel} className={styles.pdfButton}>
                      🚀 {activeTab === 'custom' ? '別注' : activeTab === 'sp' ? 'SP' : activeTab === 'readymade' ? '既製' : 'シール'}見積書を出力
                    </button>
                  </>
                )}
              </div>
            </div>
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
            <button 
              className={`${styles.tabItem} ${activeTab === 'sticker' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('sticker')}
            >
              シール ({counts.sticker})
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
                                  <div className={styles.groupTopInfo}>
                                    <span className={styles.groupColors}>{group.colors}色</span>
                                    {group.printCode && <span className={styles.printCodeLabel}>{group.printCode}</span>}
                                  </div>
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
                                        <InlineNumericInput value={manualSettings[group.key]?.printingPrice ?? group.currentPrintingCost ?? 0} onCommit={(val) => updateManualField(group.key, 'printingPrice', val)} onKeyDown={preventArrowKeys} className={styles.manualInput} decimals={2} />
                                        <div className={styles.groupPriceDetail}>現行: ¥{(group.currentPrintingCost || 0).toFixed(2)}</div>
                                      </div>
                                      <div className={styles.inputWrapper}>
                                        <span className={styles.inputLabel}>印刷営G</span>
                                        <InlineNumericInput value={manualSettings[group.key]?.printingSalesGroup ?? group.currentPrintingSalesGroup ?? 0} onCommit={(val) => updateManualField(group.key, 'printingSalesGroup', val)} onKeyDown={preventArrowKeys} className={styles.manualInput} decimals={2} />
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
                    {activeTab !== 'readymade' && (
                      <th>
                        色数
                        <ColumnFilter columnKey="totalColorCount" options={filterOptions.totalColorCount} selectedValues={columnFilters.totalColorCount || []} onFilterChange={(vals) => handleColumnFilterChange('totalColorCount', vals)} title="色数" />
                      </th>
                    )}
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
                    const pCost = individualSettings[order.orderNumber]?.printingPrice ?? order.newPrintingCost ?? order.printingCost ?? 0;
                    const pSalesGroup = individualSettings[order.orderNumber]?.printingSalesGroup ?? order.newPrintingSalesGroup ?? order.printingSalesGroup ?? 0;
                    
                    const currentTotal = order.currentPrice + (order.printingCost || 0);
                    const newTotal = price + pCost;
                    const diff = currentTotal > 0 ? ((newTotal / currentTotal) - 1) * 100 : 0;
                    
                    return (
                      <tr key={i}>
                        <td style={{ fontSize: '0.8rem', opacity: 0.7 }}>{order.category}</td>
                        <td style={{ fontSize: '0.8rem' }}>{order.orderNumber}</td>
                        <td>{order.directDeliveryName}</td>
                        {activeTab !== 'custom' && <td>{order.productCode}</td>}
                        <td>
                          {order.category === '既製品' || order.category === '' 
                            ? order.productName 
                            : shortenProductName(order.title || order.productName)}
                        </td>
                        <td>{order.shape}</td>
                        <td>{order.quantity}</td>
                        <td>{order.materialName}</td>
                        {showPrintingCols && <td>{order.printCode}</td>}
                        <td>{order.weight}</td>
                        {activeTab !== 'readymade' && <td>{order.totalColorCount}</td>}
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
                              value={pCost} 
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
                              value={pSalesGroup} 
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
          
          {/* マスターデータ管理セクション */}
      <section className={`${styles.glassPanel} ${styles.historySection}`} style={{ marginTop: '2rem' }}>
        <div className={styles.historyHeader} onClick={() => setIsMasterExpanded(!isMasterExpanded)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span role="img" aria-label="database">📊</span>
            <h3>マスター価格表の管理（個別アップロード）</h3>
          </div>
          <span>{isMasterExpanded ? '▲ 閉じる' : '▼ 開く'}</span>
        </div>
        
        {isMasterExpanded && (
          <div className={styles.historyList}>
            <p className={styles.subtitle} style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              カテゴリーごとに固定の単価表をアップロードできます。設定したマスターはブラウザに保存され、見積作成時に自動適用されます。
            </p>
            
            <div className={styles.tabContainer} style={{ background: 'rgba(0,0,0,0.1)', marginBottom: '1.5rem' }}>
              <button 
                className={`${styles.tabItem} ${activeMasterTab === 'custom' ? styles.activeTab : ''}`}
                onClick={() => setActiveMasterTab('custom')}
              >
                別注マスター
                {customMaster.length > 0 && <span className={styles.statusBadge}>設定済</span>}
              </button>
              <button 
                className={`${styles.tabItem} ${activeMasterTab === 'sp' ? styles.activeTab : ''}`}
                onClick={() => setActiveMasterTab('sp')}
              >
                SPマスター
                {spMaster.length > 0 && <span className={styles.statusBadge}>設定済</span>}
              </button>
              <button 
                className={`${styles.tabItem} ${activeMasterTab === 'readymade' ? styles.activeTab : ''}`}
                onClick={() => setActiveMasterTab('readymade')}
              >
                既製マスター
                {readymadeMaster.length > 0 && <span className={styles.statusBadge}>設定済</span>}
              </button>
              <button 
                className={`${styles.tabItem} ${activeMasterTab === 'sticker' ? styles.activeTab : ''}`}
                onClick={() => setActiveMasterTab('sticker')}
              >
                シールマスター
                {stickerMaster.length > 0 && <span className={styles.statusBadge}>設定済</span>}
              </button>
            </div>

            <div className={styles.masterControlArea}>
              <div className={styles.masterInfo}>
                <h4>
                  {activeMasterTab === 'custom' ? '別注・ポリ別注' : 
                   activeMasterTab === 'sp' ? 'SP・シルク' : 
                   activeMasterTab === 'sticker' ? 'シール' : '既製品・その他'}用
                </h4>
                <p>登録件数: {
                  activeMasterTab === 'custom' ? customMaster.length : 
                  activeMasterTab === 'sp' ? spMaster.length : 
                  activeMasterTab === 'sticker' ? stickerMaster.length : readymadeMaster.length
                } 件</p>
              </div>
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <label className={styles.secondaryButton}>
                  <span role="img" aria-label="upload">📤</span> マスターをアップロード
                  <input 
                    type="file" 
                    accept=".xlsx, .xls, .csv" 
                    style={{ display: 'none' }} 
                    onChange={(e) => handleMasterUpload(e, activeMasterTab)}
                  />
                </label>
                {(activeMasterTab === 'custom' ? customMaster.length : 
                  activeMasterTab === 'sp' ? spMaster.length : readymadeMaster.length) > 0 && (
                  <button 
                    className={styles.resetButton}
                    onClick={() => {
                      if (confirm('このカテゴリーのマスターデータを削除しますか？')) {
                        if (activeMasterTab === 'custom') setCustomMaster([]);
                        if (activeMasterTab === 'sp') setSpMaster([]);
                        if (activeMasterTab === 'readymade') setReadymadeMaster([]);
                        if (activeMasterTab === 'sticker') setStickerMaster([]);
                      }
                    }}
                  >
                    リセット
                  </button>
                )}
              </div>
            </div>
            
            <div style={{ marginTop: '1rem', padding: '15px', background: 'rgba(0,0,0,0.05)', borderRadius: '8px', fontSize: '0.85rem' }}>
              <strong>ヒント:</strong> 「別注単価表」という名前のシートに、[材質名称, 重量, 1, 2, 3, 4, 5, 6, 7] の列を持つExcelファイルを読み込んでください。
            </div>
          </div>
        )}
      </section>

      {/* 作成履歴セクション */}
          <div className={`${styles.glassPanel} ${styles.historySection}`}>
            <div className={styles.historyHeader} onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}>
              <h3>📜 作成履歴 ({history.length})</h3>
              <span className={styles.expandIcon}>{isHistoryExpanded ? '▲' : '▼'}</span>
            </div>
            {isHistoryExpanded && (
              <div className={styles.historyList}>
                {history.length === 0 ? (
                  <p className={styles.noHistory}>履歴はまだありません</p>
                ) : (
                  <table className={styles.historyTable}>
                    <thead>
                      <tr>
                        <th>日時</th>
                        <th>得意先</th>
                        <th>種別</th>
                        <th>点数</th>
                        <th>旧売上合計</th>
                        <th>新売上合計</th>
                        <th>改定率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map(entry => (
                        <tr key={entry.id}>
                          <td>{new Date(entry.timestamp).toLocaleString('ja-JP')}</td>
                          <td>{entry.customerName}</td>
                          <td>{entry.category}</td>
                          <td>{entry.itemCount}</td>
                          <td>¥{entry.totalBefore.toLocaleString()}</td>
                          <td>¥{entry.totalAfter.toLocaleString()}</td>
                          <td className={styles.priceUp}>{entry.revisionRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
