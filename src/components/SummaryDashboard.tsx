'use client';

import React from 'react';
import styles from '../app/page.module.css';

type SummaryDashboardProps = {
  itemCount: number;
  currentTotal: number;
  newTotal: number;
  revenueIncrease: number;
  avgRevisionRate: number;
  matchedCount: number;
};

export default function SummaryDashboard({
  itemCount,
  currentTotal,
  newTotal,
  revenueIncrease,
  avgRevisionRate,
  matchedCount,
}: SummaryDashboardProps): React.ReactElement {
  return (
    <div className={styles.summaryDashboard}>
      <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
        <span className={styles.summaryLabel}>表示アイテム数</span>
        <span className={styles.summaryValue}>{itemCount} 件</span>
        {matchedCount > 0 && (
          <span className={`${styles.summaryTrend} ${styles.trendUp}`} style={{ fontSize: '0.75rem' }}>
            (うち {matchedCount} 件 マスター照合)
          </span>
        )}
      </div>
      <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
        <span className={styles.summaryLabel}>現行 売上合計</span>
        <span className={styles.summaryValue}>¥{currentTotal.toLocaleString()}</span>
      </div>
      <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
        <span className={styles.summaryLabel}>改定後 予想売上</span>
        <span className={styles.summaryValue}>¥{newTotal.toLocaleString()}</span>
        <span className={`${styles.summaryTrend} ${revenueIncrease >= 0 ? styles.trendUp : styles.trendDown}`}>
          {revenueIncrease >= 0 ? '+' : ''}{revenueIncrease.toLocaleString()} 円{revenueIncrease >= 0 ? '増加' : '減少'}
        </span>
      </div>
      <div className={`${styles.glassPanel} ${styles.summaryCard}`}>
        <span className={styles.summaryLabel}>平均改定率</span>
        <span className={`${styles.summaryValue} ${avgRevisionRate >= 0 ? styles.priceUp : styles.priceDown}`}>
          {avgRevisionRate > 0 ? '+' : ''}{avgRevisionRate.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
