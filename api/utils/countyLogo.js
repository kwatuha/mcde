const fs = require('fs');
const path = require('path');

let logoBufferCache = undefined;

function getCountyOfficialName() {
  return process.env.CERT_COUNTY_NAME
    || process.env.VITE_CERT_COUNTY_NAME
    || 'County Government of Machakos';
}

function countyLogoCandidates() {
  const explicit = process.env.COUNTY_LOGO_PATH
    || process.env.CERT_LOGO_PATH
    || process.env.VITE_CERT_LOGO_PATH;
  const roots = [
    path.resolve(__dirname, '..', '..'),
    path.resolve(process.cwd()),
    path.resolve(__dirname, '..'),
  ];
  const candidates = [
    explicit,
    ...roots.flatMap((root) => [
      path.join(root, 'api', 'assets', 'gpris.png'),
      path.join(root, 'api', 'assets', 'logo.png'),
      path.join(root, 'assets', 'gpris.png'),
      path.join(root, 'assets', 'logo.png'),
      path.join(root, 'frontend', 'src', 'assets', 'gpris.png'),
      path.join(root, 'frontend', 'src', 'assets', 'logo.png'),
      path.join(root, 'src', 'assets', 'gpris.png'),
      path.join(root, 'public', 'gpris.png'),
    ]),
  ].filter(Boolean);

  for (const root of roots) {
    const distAssets = path.join(root, 'frontend', 'dist', 'assets');
    if (!fs.existsSync(distAssets)) continue;
    try {
      const files = fs.readdirSync(distAssets)
        .filter((file) => /^gpris.*\.png$/i.test(file) || /^logo.*\.png$/i.test(file));
      for (const file of files) candidates.push(path.join(distAssets, file));
    } catch {
      // ignore unreadable dist asset folders
    }
  }

  return [...new Set(candidates)];
}

function resolveCountyLogoPath() {
  return countyLogoCandidates().find((candidate) => {
    try {
      return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  }) || null;
}

function getCountyLogoBuffer() {
  if (logoBufferCache !== undefined) return logoBufferCache;
  const logoPath = resolveCountyLogoPath();
  if (!logoPath) {
    logoBufferCache = null;
    return logoBufferCache;
  }
  try {
    logoBufferCache = fs.readFileSync(logoPath);
  } catch {
    logoBufferCache = null;
  }
  return logoBufferCache;
}

function imageBufferFromDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  const match = raw.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!match) return null;
  try {
    return {
      data: Buffer.from(match[2], 'base64'),
      type: match[1].toLowerCase() === 'png' ? 'png' : 'jpg',
    };
  } catch {
    return null;
  }
}

function resolveCountyLogoImage(logoDataUrl) {
  const embeddedLogo = imageBufferFromDataUrl(logoDataUrl);
  if (embeddedLogo) return embeddedLogo;
  const diskLogo = getCountyLogoBuffer();
  return diskLogo ? { data: diskLogo, type: 'png' } : null;
}

/** Draw official county header on a PDFKit document (matches budget-justification style). */
function drawPdfkitOfficialHeader(doc, options = {}) {
  const {
    title,
    subtitle = '',
    logoPath = resolveCountyLogoPath(),
    logoBuffer = null,
  } = options;

  const pageWidth = doc.page.width;
  const margin = doc.page.margins?.left ?? 50;
  let y = margin;

  const buffer = logoBuffer || (logoPath ? getCountyLogoBuffer() : null);
  if (buffer && buffer.length) {
    try {
      const logoWidth = 58;
      doc.image(buffer, (pageWidth - logoWidth) / 2, y, { width: logoWidth });
      y += logoWidth + 12;
    } catch {
      y += 4;
    }
  }

  const countyName = getCountyOfficialName();
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827')
    .text('REPUBLIC OF KENYA', margin, y, { width: pageWidth - margin * 2, align: 'center' });
  y += 14;
  doc.fontSize(11).text(String(countyName).toUpperCase(), margin, y, { width: pageWidth - margin * 2, align: 'center' });
  y += 16;
  if (title) {
    doc.fontSize(14).fillColor('#1F4E79')
      .text(String(title).toUpperCase(), margin, y, { width: pageWidth - margin * 2, align: 'center' });
    y += 18;
  }
  if (subtitle) {
    doc.font('Helvetica').fontSize(9).fillColor('#4B5563')
      .text(subtitle, margin, y, { width: pageWidth - margin * 2, align: 'center' });
    y += 14;
  }
  doc.moveTo(margin, y).lineTo(pageWidth - margin, y).strokeColor('#CBD5E1').lineWidth(0.7).stroke();
  doc.y = y + 14;
  doc.font('Helvetica').fontSize(10).fillColor('#212529');
  return doc.y;
}

/** Build DOCX header paragraphs with centered county logo. */
function buildDocxOfficialHeaderParagraphs(title, details = [], logoDataUrl = null) {
  const { AlignmentType, ImageRun, Paragraph, TextRun } = require('docx');
  const logo = resolveCountyLogoImage(logoDataUrl);
  const children = [];

  if (logo?.data?.length) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new ImageRun({
          data: logo.data,
          transformation: { width: 78, height: 78 },
          type: logo.type || 'png',
        }),
      ],
    }));
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: 'REPUBLIC OF KENYA', bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: getCountyOfficialName().toUpperCase(), bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      children: [new TextRun({ text: String(title || ''), bold: true, size: 32, color: '1F4E79' })],
    })
  );

  details.filter(Boolean).forEach((detail) => {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: String(detail), size: 22 })],
    }));
  });

  return children;
}

module.exports = {
  getCountyOfficialName,
  countyLogoCandidates,
  resolveCountyLogoPath,
  getCountyLogoBuffer,
  resolveCountyLogoImage,
  drawPdfkitOfficialHeader,
  buildDocxOfficialHeaderParagraphs,
};
