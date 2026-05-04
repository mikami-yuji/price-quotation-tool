'use client';

import React from 'react';
import styles from '../app/page.module.css';
import { OrderRecord, IndividualManualSetting } from '../types';
import InlineNumericInput from './InlineNumericInput';
import InlineTextInput from './InlineTextInput';
import ColumnFilter from './ColumnFilter';
import { shortenProductName } from '../utils/stringUtils';

type OrderDataTableProps = {
  activeTab: string;
  filteredOrders: OrderRecord[];
  individualSettings: IndividualManualSetting;
  columnFilters: Record<string, string[]>;
  filterOptions: { [key: string]: string[] };
  handleColumnFilterChange: (columnKey: string, values: string[]) => void;
  updateIndividualField: (orderNumber: string, field: 'price' | 'salesGroup' | 'printingPrice' | 'printingSalesGroup' | 'thickness', value: number | string) => void;
  updateIndividualPriceByRate: (orderNumber: string, currentPrice: number, printingCost: number, rate: number) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colKey: string) => void;
  lastIncreaseDate: string;
};

export default function OrderDataTable({
  activeTab,
  filteredOrders,
  individualSettings,
  columnFilters,
  filterOptions,
  handleColumnFilterChange,
  updateIndividualField,
  updateIndividualPriceByRate,
  handleKeyDown,
  lastIncreaseDate,
}: OrderDataTableProps): React.ReactElement {
  const showMarginCols = activeTab === 'sp' || activeTab === 'custom';
  const showPrintingCols = activeTab === 'sp' || activeTab === 'readymade';

  return (
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
              {(activeTab === 'custom') && (
                <th className={styles.manualHeader}>厚み</th>
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
              
              const isInactive = lastIncreaseDate && order.lastOrderDate && (
                new Date(order.lastOrderDate).getTime() <= new Date(lastIncreaseDate).getTime()
              );
              
              return (
                <tr key={i} className={isInactive ? styles.inactiveRow : ''}>
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
                  {(activeTab === 'custom') && (
                    <td className={styles.highlightCell}>
                      <InlineTextInput 
                        value={individualSettings[order.orderNumber]?.thickness || ''} 
                        onCommit={(val) => updateIndividualField(order.orderNumber, 'thickness', val)} 
                        onKeyDown={(e) => handleKeyDown(e, i, 'thickness')} 
                        className={styles.manualInput} 
                        rowIndex={i} 
                        colKey="thickness" 
                        placeholder="厚み"
                      />
                    </td>
                  )}
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
                  <td className={`${styles.highlightRateCell} ${styles.compactCell}`}>
                    <InlineNumericInput 
                      value={diff} 
                      onCommit={(val) => updateIndividualPriceByRate(order.orderNumber, order.currentPrice, order.printingCost, val)} 
                      onKeyDown={(e) => handleKeyDown(e, i, 'diff')} 
                      className={styles.manualInput} 
                      rowIndex={i} 
                      colKey="diff" 
                      decimals={1} 
                      suffix="%"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
