'use client';

import { useState, useMemo, useCallback } from 'react';
import { OrderRecord } from '../types';
import { shortenProductName } from '../utils/stringUtils';

export const useFilters = (orders: OrderRecord[], activeTab: string) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  const matchesFilters = useCallback((order: OrderRecord, ignoreKey?: string) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchSearch = (
        (order.productName || '').toLowerCase().includes(query) ||
        (order.orderNumber || '').toLowerCase().includes(query) ||
        (order.directDeliveryName || '').toLowerCase().includes(query) ||
        (order.productCode || '').toLowerCase().includes(query) ||
        (order.materialName || '').toLowerCase().includes(query) ||
        (order.title || '').toLowerCase().includes(query)
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
      } else {
        valToCompare = String(order[key as keyof OrderRecord] || '');
      }

      if (!selectedValues.includes(valToCompare)) return false;
    }
    return true;
  }, [searchQuery, columnFilters]);

  const filterOptions = useMemo(() => {
    const getOptions = (columnKey: string) => {
      const crossFiltered = orders.filter(o => matchesFilters(o, columnKey));
      let values: string[] = [];
      if (columnKey === 'productName') {
        values = crossFiltered.map(o => (
          (o.category === 'SP' || o.category === 'シルク' || o.category === '別注' || o.category === 'ポリ別注') 
            ? shortenProductName(o.title || o.productName) 
            : (o.productName || '')
        ));
      } else {
        values = crossFiltered.map(o => String(o[columnKey as keyof OrderRecord] || ''));
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
  }, [orders, matchesFilters]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter(order => matchesFilters(order))
      .sort((a, b) => {
        if (a.materialName !== b.materialName) return a.materialName.localeCompare(b.materialName, 'ja');
        const weightA = typeof a.weight === 'string' ? parseFloat(a.weight.replace(/[^\d.]/g, '')) : a.weight;
        const weightB = typeof b.weight === 'string' ? parseFloat(b.weight.replace(/[^\d.]/g, '')) : b.weight;
        if (weightA !== weightB) return (weightA || 0) - (weightB || 0);
        return (a.totalColorCount || 0) - (b.totalColorCount || 0);
      });
  }, [orders, matchesFilters]);

  const handleColumnFilterChange = useCallback((columnKey: string, values: string[]) => {
    setColumnFilters(prev => ({
      ...prev,
      [columnKey]: values
    }));
  }, []);

  return {
    searchQuery, setSearchQuery,
    columnFilters, setColumnFilters,
    filterOptions,
    filteredOrders,
    handleColumnFilterChange
  };
};
