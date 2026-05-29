import countyLogoUrl from '../assets/gpris.png';

const DEFAULT_COUNTY_NAME = import.meta.env.VITE_CERT_COUNTY_NAME || 'County Government';

let logoDataUrlPromise = null;

export const getCountyOfficialName = () => DEFAULT_COUNTY_NAME;

export const getCountyLogoDataUrl = async () => {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = (async () => {
      try {
        const res = await fetch(countyLogoUrl);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })();
  }
  return logoDataUrlPromise;
};

export const drawCountyOfficialHeader = (doc, options = {}) => {
  const {
    startY,
    margin = 40,
    unit = 'pt',
    countyName = DEFAULT_COUNTY_NAME,
    departmentName = '',
    fallbackDepartmentName = '',
    logoDataUrl = null,
    title = '',
    titleGap,
  } = options;

  const pageWidth = doc.internal.pageSize.getWidth();
  const isMm = unit === 'mm';
  const logoSize = isMm ? 24 : 68;
  const logoGap = isMm ? 4.5 : 12;
  const lineStep = isMm ? 6.5 : 18;
  const afterHeaderGap = isMm ? 5 : 16;
  const titleStep = isMm ? 7 : 20;
  const titleSpacing = titleGap ?? (isMm ? 5 : 14);
  let y = startY ?? (isMm ? 12 : 32);

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', (pageWidth - logoSize) / 2, y, logoSize, logoSize);
      y += logoSize + logoGap;
    } catch {
      y += isMm ? 2 : 8;
    }
  }

  doc.setTextColor(33, 37, 41);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('REPUBLIC OF KENYA', pageWidth / 2, y, { align: 'center' });
  y += lineStep;
  doc.text(countyName || DEFAULT_COUNTY_NAME || 'COUNTY GOVERNMENT', pageWidth / 2, y, { align: 'center' });
  y += lineStep;

  const dept = String(departmentName || fallbackDepartmentName || '').trim();
  if (dept) {
    doc.text(dept.toUpperCase(), pageWidth / 2, y, { align: 'center' });
    y += isMm ? 5.5 : 16;
  }

  if (title) {
    y += titleSpacing;
    doc.setFontSize(isMm ? 13 : 15);
    doc.text(String(title).toUpperCase(), pageWidth / 2, y, { align: 'center' });
    y += titleStep;
  } else {
    y += afterHeaderGap;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isMm ? 10 : 10);
  doc.setTextColor(33, 37, 41);

  if (margin) {
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(isMm ? 0.2 : 0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += isMm ? 5 : 14;
  }

  return y;
};
