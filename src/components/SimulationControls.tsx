'use client';

import React, { ChangeEvent, RefObject } from 'react';
import styles from '../app/page.module.css';
import { IncreaseSimulationConditions, ReadymadePriceType, ReadymadeSegment, TimingBasis } from '../types';

type SimulationControlsProps = {
  activeTab: string;
  conditions: IncreaseSimulationConditions;
  setConditions: (c: IncreaseSimulationConditions) => void;
  implementationDate: string;
  setImplementationDate: (d: string) => void;
  timingBasis: TimingBasis;
  setTimingBasis: (b: TimingBasis) => void;
  lastIncreaseDate: string;
  setLastIncreaseDate: (d: string) => void;
  readymadePriceType: ReadymadePriceType;
  setReadymadePriceType: (t: ReadymadePriceType) => void;
  readymadeSegment: ReadymadeSegment;
  setReadymadeSegment: (s: ReadymadeSegment) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  handleResetSettings: () => void;
  handleSaveSettings: () => void;
  handleLoadSettings: (e: ChangeEvent<HTMLInputElement>) => void;
  handleSimulate: () => void;
  handleExportExcel: () => void;
  hasOrders: boolean;
  settingsInputRef: RefObject<HTMLInputElement | null>;
};

export default function SimulationControls({
  activeTab,
  conditions,
  setConditions,
  implementationDate,
  setImplementationDate,
  timingBasis,
  setTimingBasis,
  lastIncreaseDate,
  setLastIncreaseDate,
  readymadePriceType,
  setReadymadePriceType,
  readymadeSegment,
  setReadymadeSegment,
  searchQuery,
  setSearchQuery,
  handleResetSettings,
  handleSaveSettings,
  handleLoadSettings,
  handleSimulate,
  handleExportExcel,
  hasOrders,
  settingsInputRef,
}: SimulationControlsProps): React.ReactElement {
  return (
    <div className={`${styles.glassPanel} ${styles.controls}`}>
      {/* 1. Conditions Zone */}
      <div className={styles.controlTopBar}>
        <div className={styles.simulationParams}>
          {activeTab !== 'readymade' && (
            <>
              <div className={styles.controlGroup}>
                <span className={styles.controlLabel}>値上げ方式:</span>
                <div className={styles.segmentedControl}>
                  <button 
                    className={`${styles.segmentButton} ${conditions.customIncreaseType === 'percentage' ? styles.segmentActive : ''}`}
                    onClick={() => setConditions({ ...conditions, customIncreaseType: 'percentage' })}
                  >
                    比率 (%)
                  </button>
                  <button 
                    className={`${styles.segmentButton} ${conditions.customIncreaseType === 'amount' ? styles.segmentActive : ''}`}
                    onClick={() => setConditions({ ...conditions, customIncreaseType: 'amount' })}
                  >
                    一律金額
                  </button>
                </div>
              </div>

              <div className={styles.controlGroup}>
                <span className={styles.controlLabel}>{conditions.customIncreaseType === 'percentage' ? '値上げ率' : '値上げ額'}:</span>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    type="number" 
                    value={conditions.customIncreaseValue} 
                    onChange={(e) => setConditions({ ...conditions, customIncreaseValue: Number(e.target.value) })}
                    className={styles.manualInput}
                    style={{ width: '80px', paddingRight: conditions.customIncreaseType === 'percentage' ? '25px' : '10px' }}
                  />
                  {conditions.customIncreaseType === 'percentage' && (
                    <span style={{ position: 'absolute', right: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>%</span>
                  )}
                </div>
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
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <input type="date" value={implementationDate} onChange={(e) => setImplementationDate(e.target.value)} className={styles.manualInput} style={{ width: '135px' }} />
              <div className={styles.segmentedControl}>
                <button 
                  className={`${styles.segmentButton} ${timingBasis === 'order' ? styles.segmentActive : ''}`}
                  onClick={() => setTimingBasis('order')}
                  style={{ padding: '0 8px', fontSize: '0.75rem' }}
                >
                  受注分
                </button>
                <button 
                  className={`${styles.segmentButton} ${timingBasis === 'shipment' ? styles.segmentActive : ''}`}
                  onClick={() => setTimingBasis('shipment')}
                  style={{ padding: '0 8px', fontSize: '0.75rem' }}
                >
                  出荷分
                </button>
              </div>
            </div>
          </div>

          <div className={styles.controlGroup}>
            <span className={styles.controlLabel}>前回値上げ日:</span>
            <input type="date" value={lastIncreaseDate} onChange={(e) => setLastIncreaseDate(e.target.value)} className={styles.manualInput} style={{ width: '135px' }} title="これより前の受注日の商品は赤字になります" />
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
          
          {hasOrders && (
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
  );
}
