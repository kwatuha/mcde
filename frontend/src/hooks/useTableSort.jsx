// src/hooks/useTableSort.jsx

import { useState, useMemo, useCallback } from 'react';
import { getComparator, stableSort } from '../utils/tableHelpers';

const useTableSort = (data, projectTableColumnsConfig, initialSort) => {
  const { orderBy: initialOrderBy = '', order: initialOrder = 'asc' } = initialSort || {};
  const [order, setOrder] = useState(initialOrder);
  const [orderBy, setOrderBy] = useState(initialOrderBy);

  const handleRequestSort = useCallback((event, property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  }, [order, orderBy]);

  const sortedData = useMemo(() => {
    // If no data or no sort key, return original array
    if (!data || !orderBy) {
      return data;
    }
    return stableSort(data, getComparator(order, orderBy));
  }, [data, order, orderBy]);

  return {
    order,
    orderBy,
    handleRequestSort,
    sortedData,
  };
};

export default useTableSort;