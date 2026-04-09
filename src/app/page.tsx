'use client';

import { useState, useRef, ChangeEvent } from 'react';
import styles from './page.module.css';
import { parseExcelFile } from '../utils/excelUtils';
import { calculateNewPrices } from '../utils/calculator';
import { shortenProductName } from '../utils/stringUtils';
import { OrderRecord, CustomPriceMatrixRow, IncreaseSimulationConditions, ManualGroupSetting, IndividualManualSetting } from '../types';
import { generateQuoteExcel } from '../utils/excelGenerator';

type TabType = 'custom' | 'sp' | 'readymade';

export default function Home() {
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
      const isDown = e.key === 'Enter' || e.key === 'ArrowDown';
      const targetIndex = isDown ? rowIndex + 1 : rowIndex - 1;
      const target = document.querySelector(`input[data-row-index="${targetIndex}"][data-col-key="${colKey}"]`) as HTMLInputElement;
      if (target) {
        e.preventDefault();
        target.focus();
        setTimeout(() => target.select(), 0);
      }
    }
  };

  const handleExportExcel = async () => {
    if (simulatedOrders.length === 0) return;
    
    await generateQuoteExcel(
      getCustomerName(fileName),
      filteredOrders,
      today,
      activeTab === 'custom' ? '別注' : activeTab === 'sp' ? 'SP' : '既製',
      activeTab !== 'custom'
    );
  };

  // ファイル名から得意先名を抽出（例: 43006_幸南食糧（株）.xlsx -> 幸南食糧（株））
  const getCustomerName = (name: string): string => {
    const baseName = name.replace(/\.[^/.]+$/, ""); // 拡張子削除
    const match = baseName.match(/_(.+)$/);
    return match ? match[1] : baseName;
  };

  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

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

  const filteredOrders = getTabOrders(activeTab, simulatedOrders).sort((a, b) => {
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
  const displayColumnCount = 12 + (showMarginCols ? 2 : 0) + (showPrintingCols ? 3 : 0);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>値上げ見積書・作成ツール</h1>
        <p className={styles.subtitle}>得意先別のExcelを読み込み、新しい見積価格を簡単にシミュレーションできます。</p>
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
                <input 
                  type="number" 
                  value={conditions.customIncreaseValue}
                  style={{ width: '80px' }}
                  step="0.1"
                  onChange={(e) => setConditions({ ...conditions, customIncreaseValue: Number(e.target.value) })}
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

            <button className={styles.primaryButton} onClick={handleSimulate}>
              再計算
            </button>

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
                                      <input 
                                        type="number" 
                                        placeholder="単価"
                                        value={manualPrice || ''} 
                                        onChange={(e) => updateManualField(group.key, 'price', Number(e.target.value))}
                                        className={styles.manualInput}
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
                                        <input 
                                          type="number" 
                                          placeholder="営G"
                                          value={manualSalesGroup || ''} 
                                          onChange={(e) => updateManualField(group.key, 'salesGroup', Number(e.target.value))}
                                          className={styles.manualInput}
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
                  <th>種別</th>
                  <th>受注No</th>
                  {activeTab !== 'custom' && <th>商品コード</th>}
                  <th>商品名</th>
                  <th>形状</th>
                  <th>受注数</th>
                  <th>材質</th>
                  {showPrintingCols && <th>印刷コード</th>}
                  <th>重量</th>
                  <th>色数</th>
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
                      <input 
                        type="number" 
                        data-row-index={index}
                        data-col-key="price"
                        value={order.newPrice?.toFixed(2) || ''}
                        onChange={(e) => updateIndividualField(order.orderNumber, 'price', Number(e.target.value))}
                        onKeyDown={(e) => handleKeyDown(e, index, 'price')}
                        className={styles.inlineInput}
                      />
                    </td>
                    {showMarginCols && (
                      <>
                        <td>{order.salesGroup}</td>
                        <td className={`${styles.newSalesHighlight} ${individualSettings[order.orderNumber]?.salesGroup ? styles.individualOverride : ''}`}>
                          <input 
                            type="number" 
                            data-row-index={index}
                            data-col-key="salesGroup"
                            value={order.newSalesGroup?.toFixed(2) || ''}
                            onChange={(e) => updateIndividualField(order.orderNumber, 'salesGroup', Number(e.target.value))}
                            onKeyDown={(e) => handleKeyDown(e, index, 'salesGroup')}
                            className={styles.inlineInput}
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

      {/* フローティングアクションボタン */}
      {simulatedOrders.length > 0 && (
        <div className={styles.floatingActions}>
          <button 
            onClick={handleExportExcel} 
            className={`${styles.pdfButton} ${styles.floatingButton}`}
            title="Excel形式で見積書を出力"
          >
            <span style={{ fontSize: '1.2rem' }}>📊</span>
            {activeTab === 'custom' ? '別注' : activeTab === 'sp' ? 'SP' : '既製'}出力
          </button>
        </div>
      )}
    </div>
  );
}
