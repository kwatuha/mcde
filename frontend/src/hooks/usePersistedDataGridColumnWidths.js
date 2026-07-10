import { useCallback, useMemo, useState } from 'react';

const DEFAULT_METADATA_RESOLUTION_WIDTHS = {
  fieldLabel: 96,
  foundValue: 140,
  suggestedValue: 200,
  rowCount: 68,
  resolveTo: 220,
  status: 108,
};

function readStoredWidths(storageKey, defaults) {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

export function usePersistedDataGridColumnWidths(
  storageKey,
  defaults = DEFAULT_METADATA_RESOLUTION_WIDTHS,
) {
  const [columnWidths, setColumnWidths] = useState(() => readStoredWidths(storageKey, defaults));

  const onColumnWidthChange = useCallback((params) => {
    const field = params.colDef?.field;
    const width = params.width;
    if (!field || !width) return;

    setColumnWidths((prev) => {
      const next = { ...prev, [field]: width };
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore quota / private mode errors
      }
      return next;
    });
  }, [storageKey]);

  const getWidth = useCallback(
    (field) => columnWidths[field] ?? defaults[field],
    [columnWidths, defaults],
  );

  return useMemo(
    () => ({ columnWidths, onColumnWidthChange, getWidth }),
    [columnWidths, onColumnWidthChange, getWidth],
  );
}

export { DEFAULT_METADATA_RESOLUTION_WIDTHS };
