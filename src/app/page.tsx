'use client';

import React, { useState, useRef, useMemo } from 'react';
import styles from './page.module.css';
import SummaryDashboard from '../components/SummaryDashboard';
import GroupPriceEditor from '../components/GroupPriceEditor';
import SimulationControls from '../components/SimulationControls';
import OrderDataTable from '../components/OrderDataTable';
import HistoryAndMasterManager from '../components/HistoryAndMasterManager';
import { usePriceSimulation } from '../hooks/usePriceSimulation';
import { useFilters } from '../hooks/useFilters';
import { TabType } from '../types';
export default function Home(): React.ReactElement {
  const {
    orders,
    fileName,
    conditions, setConditions,
    activeTab, setActiveTab,
    manualSettings,
    individualSettings,
    implementationDate, setImplementationDate,
    timingBasis, setTimingBasis,
    lastIncreaseDate, setLastIncreaseDate,
    customMaster,
    spMaster,
    readymadeMaster,
    stickerMaster,
    readymadePriceType, setReadymadePriceType,
    readymadeSegment, setReadymadeSegment,
    simulatedOrders,
    counts,
    summary,
    revenueIncrease,
    avgRevisionRate,
    isMounted,
    history,
    theme,
    toggleTheme,
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
    getTabOrders
  } = usePriceSimulation();

  const {
    searchQuery, setSearchQuery,
    columnFilters,
    filterOptions,
    filteredOrders,
    handleColumnFilterChange
  } = useFilters(getTabOrders(activeTab, simulatedOrders));

  const [isGroupEditorExpanded, setIsGroupEditorExpanded] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [activeMasterTab, setActiveMasterTab] = useState<TabType>('custom');
  const [isMasterExpanded, setIsMasterExpanded] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const settingsInputRef = useRef<HTMLInputElement>(null);

  // --- UI Handlers ---

  const handleResetSettings = () => {
    if (window.confirm('個別に手入力した設定をすべてリセットし、一括計算の状態に戻しますか？')) {
      resetAllIndividualSettings();
    }
  };

  const handleClearFile = () => {
    if (orders.length > 0 && window.confirm('読み込んだデータをクリアして最初の画面に戻りますか？')) {
      clearLoadedFile();
    }
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

  // Derive editor groups
  const editorGroups = useMemo(() => {
    const targetGroupOrders = getTabOrders(activeTab, orders);
    type GroupEntry = {
      colors: number;
      key: string;
      printCode?: string;
      currentPrice: number;
      currentSalesGroup: number;
      currentPrintingCost: number;
      currentPrintingSalesGroup: number;
    };
    type Accumulator = { [material: string]: { [weight: string]: GroupEntry[] } };

    return targetGroupOrders.reduce((acc: Accumulator, o) => {
      const isSP = activeTab === 'sp';
      const isReady = activeTab === 'readymade';
      const groupKey = isSP 
        ? `${o.materialName}-${o.weight}-${o.totalColorCount}-${o.printCode}`
        : isReady
        ? `${o.materialName}-${o.weight}`
        : `${o.materialName}-${o.weight}-${o.totalColorCount}`;
        
      const weightStr = `${o.weight} ㎏`;
      if (!acc[o.materialName]) acc[o.materialName] = {};
      if (!acc[o.materialName][weightStr]) acc[o.materialName][weightStr] = [];
      if (!acc[o.materialName][weightStr].find((g: GroupEntry) => g.key === groupKey)) {
        acc[o.materialName][weightStr].push({
          colors: isReady ? 0 : (o.totalColorCount || 0),
          printCode: isSP ? o.printCode : undefined,
          currentPrice: o.currentPrice,
          currentSalesGroup: o.salesGroup,
          currentPrintingCost: o.printingCost || 0,
          currentPrintingSalesGroup: o.printingSalesGroup || 0,
          key: groupKey
        });
        acc[o.materialName][weightStr].sort((a, b) => a.colors - b.colors);
      }
      return acc;
    }, {} as Accumulator);
  }, [activeTab, orders, getTabOrders]);

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
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) {
              const dT = new DataTransfer();
              dT.items.add(file);
              if (fileInputRef.current) fileInputRef.current.files = dT.files;
              handleFileUpload({ target: { files: dT.files } } as React.ChangeEvent<HTMLInputElement>);
            }
          }}
        >
          <div className={styles.uploadIcon}>📄</div>
          <h2>Excelファイルをドロップ、またはクリックしてアップロード</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>受注データ等が含まれるファイルを選択してください</p>
          <input type="file" accept=".xlsx, .xls" hidden ref={fileInputRef} onChange={handleFileUpload} />
        </div>
      ) : (
        <div className={styles.dashboard}>
          <div className={`${styles.glassPanel} ${styles.controls}`}>
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
              handleSimulate={() => {}}
              handleExportExcel={() => handleExportExcel(filteredOrders)}
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
                onClick={() => {
                  setActiveTab(tab);
                  // Reset filters when switching tabs if needed
                }}
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

