'use client';

import { useState, useRef, useEffect, ChangeEvent, useMemo, useCallback } from 'react';
import styles from './page.module.css';
import { parseExcelFile } from '../utils/excelUtils';
import { calculateNewPrices } from '../utils/calculator';
import { shortenProductName, normalizeCustomerName } from '../utils/stringUtils';
import { OrderRecord, CustomPriceMatrixRow, IncreaseSimulationConditions, ManualGroupSetting, IndividualManualSetting, SimulationSettings, QuoteHistoryEntry, ReadymadeMasterRow, ReadymadePriceType, ReadymadeSegment, TimingBasis } from '../types';
import { generateQuoteExcel } from '../utils/excelGenerator';
import InlineNumericInput from '../components/InlineNumericInput';
import InlineTextInput from '../components/InlineTextInput';
import ColumnFilter from '../components/ColumnFilter';
import SummaryDashboard from '../components/SummaryDashboard';
import GroupPriceEditor from '../components/GroupPriceEditor';
import SimulationControls from '../components/SimulationControls';
import OrderDataTable from '../components/OrderDataTable';
import HistoryAndMasterManager from '../components/HistoryAndMasterManager';
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
  const [timingBasis, setTimingBasis] = useState<TimingBasis>('order');
  const [lastIncreaseDate, setLastIncreaseDate] = useState<string>('');
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

        const savedTimingBasis = localStorage.getItem('price-quotation-timing-basis') as TimingBasis;
        if (savedTimingBasis) setTimeout(() => setTimingBasis(savedTimingBasis), 0);

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

        const savedLastIncreaseDate = localStorage.getItem('price-quotation-last-increase-date');
        if (savedLastIncreaseDate) setTimeout(() => setLastIncreaseDate(savedLastIncreaseDate), 0);
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

  useEffect(() => {
    localStorage.setItem('price-quotation-timing-basis', timingBasis);
  }, [timingBasis]);

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
      implementationDate,
      timingBasis,
      lastIncreaseDate
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
        if (settings.timingBasis) setTimingBasis(settings.timingBasis);
        if (settings.lastIncreaseDate) setLastIncreaseDate(settings.lastIncreaseDate);
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

  useEffect(() => {
    localStorage.setItem('price-quotation-last-increase-date', lastIncreaseDate);
  }, [lastIncreaseDate]);

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

  const updateIndividualField = (
    orderNumber: string, 
    field: 'price' | 'salesGroup' | 'printingPrice' | 'printingSalesGroup' | 'thickness', 
    value: number | string
  ) => {
    const newSettings = {
      ...individualSettings,
      [orderNumber]: { 
        ...individualSettings[orderNumber], 
        [field]: field === 'thickness' ? (value || undefined) : (value !== 0 ? value : undefined) 
      }
    };
    setIndividualSettings(newSettings);
  };

  const updateIndividualPriceByRate = (orderNumber: string, currentPrice: number, printingCost: number, rate: number) => {
    // 逆算: 新単価 = (1 + rate / 100) * (現行単価 + 印刷代) - 印刷代
    const newPrice = (1 + rate / 100) * (currentPrice + (printingCost || 0)) - (printingCost || 0);
    // 浮動小数点の誤差を考慮して少し丸める（必要に応じて）
    updateIndividualField(orderNumber, 'price', Number(newPrice.toFixed(4)));
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
      implementationDate,
      timingBasis
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

  const targetGroupTab = activeTab;
  const editorGroups = getTabOrders(targetGroupTab, orders).reduce((acc, o) => {
    const isSP = targetGroupTab === 'sp';
    const isReady = targetGroupTab === 'readymade';
    const groupKey = isSP 
      ? `${o.materialName}-${o.weight}-${o.totalColorCount}-${o.printCode}`
      : isReady
      ? `${o.materialName}-${o.weight}`
      : `${o.materialName}-${o.weight}-${o.totalColorCount}`;
      
    const weightStr = `${o.weight} ㎏`;
    if (!acc[o.materialName]) acc[o.materialName] = {};
    if (!acc[o.materialName][weightStr]) acc[o.materialName][weightStr] = [];
    if (!acc[o.materialName][weightStr].find(g => g.key === groupKey)) {
      acc[o.materialName][weightStr].push({
        colors: isReady ? 0 : o.totalColorCount,
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
            {/* 1. File Context Zone */}
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
            </div>

            <SimulationControls 
              activeTab={activeTab}
              conditions={conditions}
              setConditions={setConditions}
              implementationDate={implementationDate}
              setImplementationDate={setImplementationDate}
              timingBasis={timingBasis}
              setTimingBasis={setTimingBasis}
              lastIncreaseDate={lastIncreaseDate}
              setLastIncreaseDate={setLastIncreaseDate}
              readymadePriceType={readymadePriceType}
              setReadymadePriceType={setReadymadePriceType}
              readymadeSegment={readymadeSegment}
              setReadymadeSegment={setReadymadeSegment}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              handleResetSettings={handleResetSettings}
              handleSaveSettings={handleSaveSettings}
              handleLoadSettings={handleLoadSettings}
              handleSimulate={handleSimulate}
              handleExportExcel={handleExportExcel}
              hasOrders={simulatedOrders.length > 0}
              settingsInputRef={settingsInputRef}
            />
          </div>

          <SummaryDashboard 
            itemCount={filteredOrders.length}
            currentTotal={summary.currentTotal}
            newTotal={summary.newTotal}
            revenueIncrease={revenueIncrease}
            avgRevisionRate={avgRevisionRate}
          />

          <div className={styles.tabContainer}>
            {(['custom', 'sp', 'readymade', 'sticker'] as TabType[]).map(tab => (
              <button 
                key={tab}
                className={`${styles.tabItem} ${activeTab === tab ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'custom' ? '別注・ポリ別注' : tab === 'sp' ? 'SP・シルク' : tab === 'readymade' ? '既製・その他' : 'シール'} ({counts[tab]})
              </button>
            ))}
          </div>

          <GroupPriceEditor 
            activeTab={activeTab}
            editorGroups={editorGroups}
            manualSettings={manualSettings}
            updateManualField={updateManualField}
            isExpanded={isGroupEditorExpanded}
            onToggleExpand={() => setIsGroupEditorExpanded(!isGroupEditorExpanded)}
            preventArrowKeys={preventArrowKeys}
          />

          <OrderDataTable 
            activeTab={activeTab}
            filteredOrders={filteredOrders}
            individualSettings={individualSettings}
            columnFilters={columnFilters}
            filterOptions={filterOptions}
            handleColumnFilterChange={handleColumnFilterChange}
            updateIndividualField={updateIndividualField}
            updateIndividualPriceByRate={updateIndividualPriceByRate}
            handleKeyDown={handleKeyDown}
            lastIncreaseDate={lastIncreaseDate}
          />

          <HistoryAndMasterManager 
            history={history}
            isHistoryExpanded={isHistoryExpanded}
            setIsHistoryExpanded={setIsHistoryExpanded}
            activeMasterTab={activeMasterTab}
            setActiveMasterTab={setActiveMasterTab}
            isMasterExpanded={isMasterExpanded}
            setIsMasterExpanded={setIsMasterExpanded}
            customMaster={customMaster}
            spMaster={spMaster}
            readymadeMaster={readymadeMaster}
            stickerMaster={stickerMaster}
            handleMasterUpload={handleMasterUpload}
            hasOrders={orders.length > 0}
          />
        </div>
      )}
    </div>
  );
}
