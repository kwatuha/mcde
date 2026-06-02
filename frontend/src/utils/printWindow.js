const collectPrintableDocumentStyles = () => {
  const stylesheetLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join('\n');

  const stylesheetRules = Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules || [])
          .map((rule) => rule.cssText)
          .join('\n');
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .join('\n');

  const inlineStyles = Array.from(document.querySelectorAll('style'))
    .map((node) => node.textContent || '')
    .filter((content) => content.trim())
    .join('\n');

  return `
    ${stylesheetLinks}
    <style>${stylesheetRules}\n${inlineStyles}</style>
  `;
};

const waitForPrintWindowResources = async (printWindow) => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const withTimeout = (promise, ms) => Promise.race([promise, wait(ms)]);
  const printDocument = printWindow.document;

  const stylesheetLoads = Array.from(printDocument.querySelectorAll('link[rel="stylesheet"]')).map(
    (link) =>
      new Promise((resolve) => {
        if (link.sheet) {
          resolve();
          return;
        }
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', resolve, { once: true });
      })
  );
  await withTimeout(Promise.all(stylesheetLoads), 2500);

  if (printDocument.fonts?.ready) {
    await withTimeout(printDocument.fonts.ready, 2000);
  }

  const imageLoads = Array.from(printDocument.images).map(
    (image) =>
      new Promise((resolve) => {
        if (image.complete) {
          resolve();
          return;
        }
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      })
  );
  await withTimeout(Promise.all(imageLoads), 2500);

  await new Promise((resolve) => {
    if (printWindow.requestAnimationFrame) {
      printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(resolve));
      return;
    }
    setTimeout(resolve, 100);
  });
};

export const printElementInNewWindow = ({
  element,
  title,
  removeSelectors = [],
  extraStyles = '',
  windowFeatures = 'width=1200,height=900',
  closeDelayMs = 500,
  fallback = () => window.print(),
}) => {
  if (!element) {
    fallback();
    return;
  }

  const clonedReport = element.cloneNode(true);
  removeSelectors.forEach((selector) => {
    clonedReport.querySelectorAll(selector).forEach((node) => node.remove());
  });

  const printWindow = window.open('', '_blank', windowFeatures);
  if (!printWindow) {
    fallback();
    return;
  }

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${title}</title>
        ${collectPrintableDocumentStyles()}
        <style>${extraStyles}</style>
      </head>
      <body>${clonedReport.outerHTML}</body>
    </html>
  `);
  printWindow.document.close();

  const printWhenReady = async () => {
    try {
      await waitForPrintWindowResources(printWindow);
    } finally {
      if (printWindow.closed) return;
      printWindow.focus();
      printWindow.print();
      setTimeout(() => {
        if (!printWindow.closed) printWindow.close();
      }, closeDelayMs);
    }
  };

  void printWhenReady();
};
