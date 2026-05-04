'use client';

import { useState, useMemo, useEffect, useCallback, ChangeEvent } from 'react';
import { 
  OrderRecord, 
  CustomPriceMatrixRow, 
  IncreaseSimulationConditions, 
  ManualGroupSetting, 
  IndividualManualSetting, 
  QuoteHistoryEntry, 
  ReadymadeMasterRow, 
  SPMasterRow,
  ReadymadePriceType, 
  ReadymadeSegment, 
  TimingBasis,
  SimulationSettings,
  TabType
} from '../types';

import { calculateNewPrices } from '../utils/calculator';
import { parseExcelFile, parseSPMasterFile } from '../utils/excelUtils';
import { generateQuoteExcel } from '../utils/excelGenerator';
import { parseReadymadeCSV } from '../utils/csvUtils';

import { normalizeCustomerName } from '../utils/stringUtils';

export const usePriceSimulation = () => {
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
  const [implementationDate, setImplementationDate] = useState<string>('');
  const [timingBasis, setTimingBasis] = useState<TimingBasis>('order');
  const [lastIncreaseDate, setLastIncreaseDate] = useState<string>('');
  
  const [customMaster, setCustomMaster] = useState<CustomPriceMatrixRow[]>([]);
  const [spMaster, setSpMaster] = useState<SPMasterRow[]>([]);
  const [readymadeMaster, setReadymadeMaster] = useState<CustomPriceMatrixRow[] | ReadymadeMasterRow[]>([]);
  const [stickerMaster, setStickerMaster] = useState<CustomPriceMatrixRow[]>([]);
  const [readymadePriceType, setReadymadePriceType] = useState<ReadymadePriceType>('normal');
  const [readymadeSegment, setReadymadeSegment] = useState<ReadymadeSegment>('uru');

  const getCustomerName = useCallback((name: string): string => {
    const baseName = name.replace(/\.[^/.]+$/, "");
    const match = baseName.match(/_(.+)$/);
    const rawName = match ? match[1] : baseName;
    return normalizeCustomerName(rawName);
  }, []);

  const getTabOrders = useCallback((tab: TabType, allOrders: OrderRecord[]) => {
    if (allOrders.length === 0) return [];
    switch (tab) {
      case 'custom':
        return allOrders.filter(o => o.category === '別注' || o.category === 'ポリ別注');
      case 'sp':
        return allOrders.filter(o => (o.category.includes('SP') || o.category.includes('ＳＰ')) && !o.category.includes('シルク'));
      case 'sticker':
        return allOrders.filter(o => o.category === 'シール' || o.category === 'シール（フルオーダー）' || o.category.includes('シール'));
      case 'readymade':
        return allOrders.filter(o => 
          !o.category.includes('別注') && !o.category.includes('ポリ') && 
          !o.category.includes('シール') &&
          ((!o.category.includes('SP') && !o.category.includes('ＳＰ')) || o.category.includes('シルク')) &&
          o.productCode !== '999999999'
        );
      default:
        return allOrders;
    }
  }, []);

  const simulatedOrders = useMemo(() => {
    return calculateNewPrices(orders, priceMatrix, conditions, manualSettings, individualSettings, {
      custom: customMaster,
      sp: spMaster,
      readymade: readymadeMaster as ReadymadeMasterRow[],
      sticker: stickerMaster
    }, { type: readymadePriceType, segment: readymadeSegment });
  }, [orders, priceMatrix, conditions, manualSettings, individualSettings, customMaster, spMaster, readymadeMaster, stickerMaster, readymadePriceType, readymadeSegment]);

  const counts = useMemo(() => ({
    custom: getTabOrders('custom', simulatedOrders).length,
    sp: getTabOrders('sp', simulatedOrders).length,
    readymade: getTabOrders('readymade', simulatedOrders).length,
    sticker: getTabOrders('sticker', simulatedOrders).length
  }), [simulatedOrders, getTabOrders]);

  const summary = useMemo(() => {
    return simulatedOrders.reduce((acc, o) => {
      acc.currentTotal += (o.currentPrice + (o.printingCost || 0)) * o.quantity;
      acc.newTotal += ((o.newPrice || 0) + (o.newPrintingCost || 0)) * o.quantity;
      return acc;
    }, { currentTotal: 0, newTotal: 0 });
  }, [simulatedOrders]);

  const revenueIncrease = summary.newTotal - summary.currentTotal;
  const avgRevisionRate = summary.currentTotal > 0 ? (summary.newTotal / summary.currentTotal - 1) * 100 : 0;

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const parsedData = parseExcelFile(buffer);
    setOrders(parsedData.orders);
    setPriceMatrix(parsedData.priceMatrix);
  };

  const handleMasterUpload = async (e: ChangeEvent<HTMLInputElement>, type: TabType) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const buffer = await file.arrayBuffer();
      console.log(`Master Upload Start - Mode: ${type}, File: ${file.name}`);

      // 1. まず SP マスターとして解析を試みる（「売」の文字を探す強力な方式）
      const spData = parseSPMasterFile(buffer);
      
      // もし SP タブが選ばれている、あるいは SP データらしきものが 10 件以上見つかった場合
      if (type === 'sp' || (spData && spData.length > 10)) {
        if (spData && spData.length > 0) {
          setSpMaster(spData);
          alert(`SPマスターを${spData.length}件読み込みました。`);
          return;
        } else if (type === 'sp') {
          alert('SPマスター形式のデータが見つかりませんでした。Excel内の「売」「準」「Ｄ」という文字を確認してください。');
          return;
        }
      }

      // 2. SP でない場合、または SP タブだがデータが見つからなかった場合の通常処理
      let parsedMatrix: CustomPriceMatrixRow[] | ReadymadeMasterRow[] = [];
      if (file.name.toLowerCase().endsWith('.csv')) {
        parsedMatrix = parseReadymadeCSV(buffer);
      } else {
        const parsedData = parseExcelFile(buffer);
        if (type === 'readymade') {
          if (parsedData.readymadeMaster && parsedData.readymadeMaster.length > 0) {
            parsedMatrix = parsedData.readymadeMaster;
          } else if (parsedData.orders && parsedData.orders.length > 0) {
            parsedMatrix = parsedData.orders
              .filter(o => o.productCode && o.productCode !== '999999999')
              .map(o => ({
                productCode: o.productCode,
                minQuantity: 0,
                campaign: { uru: 0, junD: 0, d: 0 },
                normal: { uru: o.currentPrice, junD: 0, d: 0 }
              }));
          }
        } else {
          parsedMatrix = parsedData.priceMatrix;
        }
      }
      
      if (parsedMatrix.length === 0) {
        // ここでもう一度だけ SP 解析の結果があれば救済
        if (spData && spData.length > 0) {
          setSpMaster(spData);
          alert(`自動判別により、SPマスターとして${spData.length}件読み込みました。`);
          return;
        }
        alert('マスターデータの形式を確認してください。適切なシート名や列名、または単価ラベル（売・準・Ｄ）が必要です。');
        return;
      }

      if (type === 'custom') setCustomMaster(parsedMatrix as CustomPriceMatrixRow[]);
      if (type === 'readymade') setReadymadeMaster(parsedMatrix);
      if (type === 'sticker') setStickerMaster(parsedMatrix as CustomPriceMatrixRow[]);
      
      alert(`${type === 'readymade' ? '既製品' : type.toUpperCase()}マスターを読み込みました。`);
    } catch (err) {
      console.error('Master upload error:', err);
      alert('読み込み中にエラーが発生しました: ' + String(err));
    }
  };

  const [history, setHistory] = useState<QuoteHistoryEntry[]>([]);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isMounted, setIsMounted] = useState(false);


  // Persistence (Load)
  useEffect(() => {
    const loadFromLocalStorage = () => {
      setIsMounted(true);
      if (typeof window !== 'undefined') {
        try {
          const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
          if (savedTheme) {
            setTheme(savedTheme);
            document.documentElement.setAttribute('data-theme', savedTheme);
          }

          const savedHistory = localStorage.getItem('price-quotation-history');
          if (savedHistory) setHistory(JSON.parse(savedHistory));

          const savedConditions = localStorage.getItem('price-quotation-conditions');
          if (savedConditions) setConditions(JSON.parse(savedConditions));
          
          const savedManualSettings = localStorage.getItem('price-quotation-manual-settings');
          if (savedManualSettings) setManualSettings(JSON.parse(savedManualSettings));

          const savedIndividualSettings = localStorage.getItem('price-quotation-individual-settings');
          if (savedIndividualSettings) setIndividualSettings(JSON.parse(savedIndividualSettings));

          const savedTimingBasis = localStorage.getItem('price-quotation-timing-basis') as TimingBasis;
          if (savedTimingBasis) setTimingBasis(savedTimingBasis);

          const savedCustomMaster = localStorage.getItem('price-quotation-custom-master');
          if (savedCustomMaster) setCustomMaster(JSON.parse(savedCustomMaster));

          const savedSPMaster = localStorage.getItem('price-quotation-sp-master');
          if (savedSPMaster) setSpMaster(JSON.parse(savedSPMaster));

          const savedReadyMaster = localStorage.getItem('price-quotation-ready-master');
          if (savedReadyMaster) setReadymadeMaster(JSON.parse(savedReadyMaster));

          const savedReadyType = localStorage.getItem('price-quotation-ready-type') as ReadymadePriceType;
          if (savedReadyType) setReadymadePriceType(savedReadyType);

          const savedReadySegment = localStorage.getItem('price-quotation-ready-segment') as ReadymadeSegment;
          if (savedReadySegment) setReadymadeSegment(savedReadySegment);

          const savedStickerMaster = localStorage.getItem('price-quotation-sticker-master');
          if (savedStickerMaster) setStickerMaster(JSON.parse(savedStickerMaster));

          const savedLastIncreaseDate = localStorage.getItem('price-quotation-last-increase-date');
          if (savedLastIncreaseDate) setLastIncreaseDate(savedLastIncreaseDate);
        } catch (e) {
          console.error('Failed to load settings from localStorage', e);
        }
      }
    };

    setTimeout(loadFromLocalStorage, 0);
  }, []);

  // Persistence (Save)
  useEffect(() => {
    if (isMounted) {
      localStorage.setItem('price-quotation-conditions', JSON.stringify(conditions));
      localStorage.setItem('price-quotation-manual-settings', JSON.stringify(manualSettings));
      localStorage.setItem('price-quotation-individual-settings', JSON.stringify(individualSettings));
      localStorage.setItem('price-quotation-timing-basis', timingBasis);
      localStorage.setItem('price-quotation-custom-master', JSON.stringify(customMaster));
      localStorage.setItem('price-quotation-sp-master', JSON.stringify(spMaster));
      localStorage.setItem('price-quotation-ready-master', JSON.stringify(readymadeMaster));
      localStorage.setItem('price-quotation-ready-type', readymadePriceType);
      localStorage.setItem('price-quotation-ready-segment', readymadeSegment);
      localStorage.setItem('price-quotation-sticker-master', JSON.stringify(stickerMaster));
      localStorage.setItem('price-quotation-last-increase-date', lastIncreaseDate);
      localStorage.setItem('price-quotation-history', JSON.stringify(history));
    }
  }, [isMounted, conditions, manualSettings, individualSettings, timingBasis, customMaster, spMaster, readymadeMaster, readymadePriceType, readymadeSegment, stickerMaster, lastIncreaseDate, history]);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const addHistoryEntry = (entry: QuoteHistoryEntry) => {
    setHistory(prev => [entry, ...prev].slice(0, 50));
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
    e.target.value = '';
  };

  const handleExportExcel = async (filteredOrders: OrderRecord[]) => {
    if (simulatedOrders.length === 0) return;
    const customer = normalizeCustomerName(getCustomerName(fileName));
    const categoryName = activeTab === 'custom' ? '別注' : 
                         activeTab === 'sp' ? 'SP' : 
                         activeTab === 'sticker' ? 'シール' : '既製';
    
    await generateQuoteExcel(
      customer,
      filteredOrders,
      new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' }),
      categoryName,
      activeTab !== 'custom',
      implementationDate,
      timingBasis
    );
    
    addHistoryEntry({
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      customerName: customer,
      fileName,
      category: categoryName,
      itemCount: filteredOrders.length,
      totalBefore: filteredOrders.reduce((acc, o) => acc + (o.currentPrice + (o.printingCost || 0)) * o.quantity, 0),
      totalAfter: filteredOrders.reduce((acc, o) => acc + ((o.newPrice || 0) + (o.newPrintingCost || 0)) * o.quantity, 0),
      revisionRate: avgRevisionRate
    });
  };

  const updateManualField = (key: string, field: 'price' | 'salesGroup' | 'printingPrice' | 'printingSalesGroup', value: number) => {
    setManualSettings(prev => ({ 
      ...prev, 
      [key]: { ...prev[key], [field]: value !== 0 ? value : undefined } 
    }));
  };

  const updateIndividualField = (
    orderNumber: string, 
    field: 'price' | 'salesGroup' | 'printingPrice' | 'printingSalesGroup' | 'thickness', 
    value: number | string
  ) => {
    setIndividualSettings(prev => ({
      ...prev,
      [orderNumber]: { 
        ...prev[orderNumber], 
        [field]: field === 'thickness' ? (value || undefined) : (value !== 0 ? value : undefined) 
      }
    }));
  };

  const updateIndividualPriceByRate = (orderNumber: string, currentPrice: number, printingCost: number, rate: number) => {
    const newPrice = (1 + rate / 100) * (currentPrice + (printingCost || 0)) - (printingCost || 0);
    updateIndividualField(orderNumber, 'price', Number(newPrice.toFixed(4)));
  };

  const resetAllIndividualSettings = () => {
    setManualSettings({});
    setIndividualSettings({});
  };

  const clearLoadedFile = () => {
    setOrders([]);
    setFileName('');
  };
  return {
    orders, setOrders,
    priceMatrix, setPriceMatrix,
    fileName, setFileName,
    conditions, setConditions,
    activeTab, setActiveTab,
    manualSettings, setManualSettings,
    individualSettings, setIndividualSettings,
    implementationDate, setImplementationDate,
    timingBasis, setTimingBasis,
    lastIncreaseDate, setLastIncreaseDate,
    customMaster, setCustomMaster,
    spMaster, setSpMaster,
    readymadeMaster, setReadymadeMaster,
    stickerMaster, setStickerMaster,
    readymadePriceType, setReadymadePriceType,
    readymadeSegment, setReadymadeSegment,
    simulatedOrders,
    counts,
    summary,
    revenueIncrease,
    avgRevisionRate,
    isMounted,
    history, setHistory,
    isHistoryExpanded: false,
    theme, setTheme,
    toggleTheme,
    addHistoryEntry,
    handleFileUpload,
    handleMasterUpload,
    handleSaveSettings,
    handleLoadSettings,
    handleExportExcel,
    updateManualField,
    updateIndividualField,
    updateIndividualPriceByRate,
    resetAllIndividualSettings,
    clearLoadedFile,
    getCustomerName,
    getTabOrders
  };
};
