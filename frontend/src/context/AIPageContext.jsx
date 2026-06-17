import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const AIPageContext = createContext(null);

export function AIPageContextProvider({ children }) {
  const [pageContext, setPageContextState] = useState({});

  const setPageContext = useCallback((next) => {
    setPageContextState((prev) => {
      if (typeof next === 'function') return next(prev) || {};
      if (!next || typeof next !== 'object') return {};
      return { ...next };
    });
  }, []);

  const clearPageContext = useCallback(() => {
    setPageContextState({});
  }, []);

  const value = useMemo(
    () => ({ pageContext, setPageContext, clearPageContext }),
    [pageContext, setPageContext, clearPageContext]
  );

  return (
    <AIPageContext.Provider value={value}>
      {children}
    </AIPageContext.Provider>
  );
}

export function useAIPageContextState() {
  const context = useContext(AIPageContext);
  if (!context) {
    return { pageContext: {}, setPageContext: () => {}, clearPageContext: () => {} };
  }
  return context;
}

/** Pages call this to publish rich entity context for the floating assistant. */
export function useAIPageContext() {
  const { setPageContext, clearPageContext } = useAIPageContextState();
  return { setAIPageContext: setPageContext, clearAIPageContext: clearPageContext };
}
