'use client';

import React from 'react';
import styles from '../app/page.module.css';
import { QuoteHistoryEntry, CustomPriceMatrixRow, ReadymadeMasterRow } from '../types';

type TabType = 'custom' | 'sp' | 'readymade' | 'sticker';

type HistoryAndMasterManagerProps = {
  history: QuoteHistoryEntry[];
  isHistoryExpanded: boolean;
  setIsHistoryExpanded: (v: boolean) => void;
  activeMasterTab: TabType;
  setActiveMasterTab: (t: TabType) => void;
  isMasterExpanded: boolean;
  setIsMasterExpanded: (v: boolean) => void;
  customMaster: CustomPriceMatrixRow[];
  spMaster: CustomPriceMatrixRow[];
  readymadeMaster: CustomPriceMatrixRow[] | ReadymadeMasterRow[];
  stickerMaster: CustomPriceMatrixRow[];
  handleMasterUpload: (e: React.ChangeEvent<HTMLInputElement>, type: TabType) => void;
  hasOrders: boolean;
};

export default function HistoryAndMasterManager({
  history,
  isHistoryExpanded,
  setIsHistoryExpanded,
  activeMasterTab,
  setActiveMasterTab,
  isMasterExpanded,
  setIsMasterExpanded,
  customMaster,
  spMaster,
  readymadeMaster,
  stickerMaster,
  handleMasterUpload,
  hasOrders,
}: HistoryAndMasterManagerProps): React.ReactElement {
  return (
    <>
      {/* 4. History Section */}
      <div className={styles.historySection}>
        <header className={styles.historyHeader} onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <span style={{ fontSize: '1.2rem' }}>🕒</span>
            <h3>最近の履歴</h3>
          </div>
          <span className={styles.expandIcon}>{isHistoryExpanded ? '▼' : '▶'}</span>
        </header>
        
        {isHistoryExpanded && (
          <div className={styles.historyList}>
            {history.length === 0 ? (
              <p className={styles.noHistory}>履歴はまだありません</p>
            ) : (
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>得意先名</th>
                    <th>ファイル</th>
                    <th>種別</th>
                    <th>件数</th>
                    <th>改定率</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry) => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.timestamp).toLocaleString('ja-JP')}</td>
                      <td>{entry.customerName}</td>
                      <td>{entry.fileName}</td>
                      <td>{entry.category}</td>
                      <td>{entry.itemCount}件</td>
                      <td className={styles.priceUp}>{entry.revisionRate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {hasOrders && (
        <div className={styles.historySection} style={{ marginTop: '1.5rem' }}>
          <header className={styles.historyHeader} onClick={() => setIsMasterExpanded(!isMasterExpanded)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <span style={{ fontSize: '1.2rem' }}>💎</span>
              <h3>マスター単価表の管理</h3>
            </div>
            <span className={styles.expandIcon}>{isMasterExpanded ? '▼' : '▶'}</span>
          </header>
          
          {isMasterExpanded && (
            <div className={styles.historyList}>
              <div className={styles.tabContainer} style={{ marginBottom: '1.5rem', background: 'rgba(0,0,0,0.1)' }}>
                {(['custom', 'sp', 'readymade', 'sticker'] as TabType[]).map(t => (
                  <button 
                    key={t}
                    className={`${styles.tabItem} ${activeMasterTab === t ? styles.tabActive : ''}`}
                    onClick={() => setActiveMasterTab(t)}
                    style={{ fontSize: '0.85rem', padding: '0.6rem 1.2rem' }}
                  >
                    {t === 'custom' ? '別注' : t === 'sp' ? 'SP' : t === 'readymade' ? '既製' : 'シール'}
                    <span className={styles.statusBadge} style={{ background: (
                      (t === 'custom' && customMaster.length > 0) ||
                      (t === 'sp' && spMaster.length > 0) ||
                      (t === 'sticker' && stickerMaster.length > 0) ||
                      (t === 'readymade' && readymadeMaster.length > 0)
                    ) ? 'var(--success-color)' : '#94a3b8' }}>
                      {(
                        (t === 'custom' && customMaster.length > 0) ||
                        (t === 'sp' && spMaster.length > 0) ||
                        (t === 'sticker' && stickerMaster.length > 0) ||
                        (t === 'readymade' && readymadeMaster.length > 0)
                      ) ? '読込済' : '未設定'}
                    </span>
                  </button>
                ))}
              </div>

              <div className={styles.masterControlArea}>
                <div className={styles.masterInfo}>
                  <h4>{activeMasterTab.toUpperCase()}用マスターデータ</h4>
                  <p>Excelファイルを読み込むと、既定の計算よりも優先してこの単価を適用します。</p>
                  {(
                    (activeMasterTab === 'custom' && customMaster.length > 0) ||
                    (activeMasterTab === 'sp' && spMaster.length > 0) ||
                    (activeMasterTab === 'sticker' && stickerMaster.length > 0) ||
                    (activeMasterTab === 'readymade' && readymadeMaster.length > 0)
                  ) && (
                    <p style={{ color: 'var(--success-color)', fontWeight: 'bold', marginTop: '5px' }}>
                      現在 {
                        activeMasterTab === 'custom' ? customMaster.length : 
                        activeMasterTab === 'sp' ? spMaster.length : 
                        activeMasterTab === 'sticker' ? stickerMaster.length : 
                        readymadeMaster.length
                      } 件の単価データが有効です。
                    </p>
                  )}
                </div>
                <div className={styles.actionButtons}>
                  <button className={styles.secondaryButton} onClick={() => document.getElementById('master-upload')?.click()}>
                    📂 マスターExcelを読込
                  </button>
                  <input 
                    id="master-upload"
                    type="file" 
                    accept=".xlsx, .xls, .csv" 
                    hidden 
                    onChange={(e) => handleMasterUpload(e, activeMasterTab)} 
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
