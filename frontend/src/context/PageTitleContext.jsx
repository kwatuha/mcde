import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const PageTitleContext = createContext();

export const usePageTitle = () => {
  const context = useContext(PageTitleContext);
  if (!context) {
    throw new Error('usePageTitle must be used within a PageTitleProvider');
  }
  return context;
};

export const PageTitleProvider = ({ children }) => {
  const [pageTitle, setPageTitle] = useState('Dashboard');
  const [pageSubtitle, setPageSubtitle] = useState('');

  const updatePageTitle = useCallback((title, subtitle = '') => {
    setPageTitle(title);
    setPageSubtitle(subtitle);
  }, []);

  const value = useMemo(
    () => ({ pageTitle, pageSubtitle, updatePageTitle }),
    [pageTitle, pageSubtitle, updatePageTitle]
  );

  return (
    <PageTitleContext.Provider value={value}>
      {children}
    </PageTitleContext.Provider>
  );
};









