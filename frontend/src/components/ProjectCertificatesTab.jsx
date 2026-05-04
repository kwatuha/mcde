import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Chip,
  Collapse,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  UploadFile as UploadFileIcon,
  FactCheck as FactCheckIcon,
  PictureAsPdf as PictureAsPdfIcon,
} from '@mui/icons-material';
import apiService from '../api';
import projectService from '../api/projectService';
import { useAuth } from '../context/AuthContext.jsx';
import ApprovalWorkflowPanel from './approval/ApprovalWorkflowPanel.jsx';
import { workflowChipProps, workflowDetailLine } from '../utils/certificateWorkflowDisplay.js';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
/** Same emblem as the login page (county / GPRIS branding). */
import countyLogoUrl from '../assets/gpris.png';

const CERTIFICATE_TYPES = [
  'Interim Payment Certificate',
  'Final Payment Certificate',
  'Completion Certificate',
  'Inspection Certificate',
  'Work Progress Certificate',
  'Other',
];

const STATUS_OPTIONS = ['pending', 'approved', 'rejected'];
const CERT_DEFAULTS = {
  countyName: import.meta.env.VITE_CERT_COUNTY_NAME || '',
};

/** Parse `projectcertificate.certificateData` JSON for PDF regeneration. */
function parseStoredCertificateData(cert) {
  let data = {};
  try {
    const raw = cert.certificateData ?? cert.certificatedata;
    if (typeof raw === 'string') data = JSON.parse(raw);
    else if (raw && typeof raw === 'object') data = { ...raw };
  } catch {
    /* ignore */
  }
  return data;
}

function formFieldsFromCertificateRow(cert) {
  return {
    certType: cert.certType || cert.certtype || 'Interim Payment Certificate',
    certSubType: cert.certSubType || cert.certsubtype || '',
    certNumber: cert.certNumber || cert.certnumber || '',
    progressStatus: cert.progressStatus || cert.progressstatus || '',
    applicationStatus: cert.applicationStatus || cert.applicationstatus || 'pending',
    requesterRemarks: cert.requesterRemarks || cert.requesterremarks || '',
    requestDate: cert.requestDate || cert.requestdate
      ? String(cert.requestDate || cert.requestdate).slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  };
}

const CERTIFICATE_APPROVAL_ENTITY = 'project_certificate';

const ProjectCertificatesTab = ({ projectId, canModify = true }) => {
  const { user } = useAuth();
  /** Data URL for jsPDF `addImage` (preloaded from bundled asset). */
  const countyLogoDataUrlRef = useRef(null);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [workflowOpenForId, setWorkflowOpenForId] = useState(null);
  const [pdfWithApprovalsBusyId, setPdfWithApprovalsBusyId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    certType: 'Interim Payment Certificate',
    certSubType: '',
    certNumber: '',
    progressStatus: '',
    applicationStatus: 'pending',
    requesterRemarks: '',
    requestDate: new Date().toISOString().slice(0, 10),
  });
  const [file, setFile] = useState(null);
  const [generatedPdfFile, setGeneratedPdfFile] = useState(null);
  const [bqItems, setBqItems] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [projectDetails, setProjectDetails] = useState(null);
  const [draft, setDraft] = useState({
    countyName: CERT_DEFAULTS.countyName,
    issuingMinistry: '',
    referenceNo: '',
    recipientOffice: '',
    recipientAddress: '',
    projectTitle: '',
    tenderNo: '',
    contractSum: '',
    clientMinistry: '',
    contractorName: '',
    advanceRecovery: '',
    previousCumulative: '',
  });

  const loadCertificates = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError('');
    try {
      const data = await projectService.certificates.getByProject(projectId);
      setCertificates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load project certificates.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadCertificates();
  }, [loadCertificates]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(countyLogoUrl);
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result);
          fr.onerror = reject;
          fr.readAsDataURL(blob);
        });
        if (!cancelled) countyLogoDataUrlRef.current = dataUrl;
      } catch {
        /* PDF works without logo */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadBqItems = async () => {
      if (!projectId) return;
      try {
        const items = await projectService.bq.getItems(projectId);
        setBqItems(Array.isArray(items) ? items : []);
      } catch (err) {
        // Non-blocking for certificate flow; BQ section will simply be empty.
        setBqItems([]);
      }
    };
    loadBqItems();
  }, [projectId]);

  useEffect(() => {
    const loadTaxRates = async () => {
      try {
        const rates = await projectService.taxRates.getActive(form.requestDate);
        setTaxRates(Array.isArray(rates) ? rates : []);
      } catch (err) {
        setTaxRates([]);
      }
    };
    loadTaxRates();
  }, [form.requestDate]);

  useEffect(() => {
    const loadProjectDetails = async () => {
      if (!projectId) return;
      try {
        const data = await projectService.projects.getProjectById(projectId);
        setProjectDetails(data || null);
      } catch (err) {
        setProjectDetails(null);
      }
    };
    loadProjectDetails();
  }, [projectId]);

  useEffect(() => {
    if (!projectDetails) return;
    const fallbackDepartment = projectDetails.departmentName || projectDetails.directorate || projectDetails.ministry || '';
    const fallbackCounty = projectDetails.countyName || '';
    const fallbackProjectTitle = projectDetails.projectName || projectDetails.name || '';
    const fallbackRef = projectDetails.ProjectRefNum || projectDetails.projectRefNum || projectDetails.referenceNo || '';
    const fallbackContractSum = projectDetails.costOfProject || projectDetails.budget || '';

    setDraft((prev) => ({
      ...prev,
      countyName: prev.countyName || fallbackCounty,
      issuingMinistry: prev.issuingMinistry || fallbackDepartment,
      recipientOffice: prev.recipientOffice || fallbackDepartment,
      projectTitle: prev.projectTitle || fallbackProjectTitle,
      referenceNo: prev.referenceNo || fallbackRef,
      contractSum: prev.contractSum || String(fallbackContractSum || ''),
      clientMinistry: prev.clientMinistry || fallbackDepartment,
    }));
  }, [projectDetails]);

  const downloadName = useMemo(() => {
    if (file) return file.name;
    if (generatedPdfFile) return generatedPdfFile.name;
    return '';
  }, [file, generatedPdfFile]);

  const suggestedCertificateNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const nextIndex = (Array.isArray(certificates) ? certificates.length : 0) + 1;
    const padded = String(nextIndex).padStart(3, '0');
    return `PC-${projectId}-${year}-${padded}`;
  }, [certificates, projectId]);

  const calculateCertificateAmounts = useCallback((draftSnapshot) => {
    const d = draftSnapshot || draft;
    const parseMoney = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
    const rateLookup = taxRates.reduce((acc, row) => {
      acc[String(row.tax_type || '').toLowerCase()] = {
        rate: Number(row.rate_percent || 0),
        withholdingRate: Number(row.withholding_rate || 0),
      };
      return acc;
    }, {});
    const vatRate = rateLookup.vat?.rate || 0;
    const withholdingTaxRate = rateLookup.withholding_tax?.rate || 0;
    const vatWithholdingRate = rateLookup.vat?.withholdingRate || 0;
    const retentionRate = rateLookup.retention?.rate || 0;

    const normalizedBq = bqItems.map((item) => {
      const budget = Number(item.budgetAmount || 0);
      const progress = Number(item.progressPercent || 0);
      const payable = (budget * progress) / 100;
      return {
        code: item.sortOrder ? String(item.sortOrder) : '',
        description: item.activityName || item.milestoneName || '-',
        qty: budget,
        percent: progress,
        amount: payable,
      };
    });
    const totalBqAmount = normalizedBq.reduce((sum, i) => sum + i.amount, 0);
    const totalExclusive = totalBqAmount;
    const computedVatAmount = totalExclusive * (vatRate / 100);
    const computedWithholdingAmount = totalExclusive * (withholdingTaxRate / 100);
    const computedRetentionAmount = totalExclusive * (retentionRate / 100);
    // VAT withholding is applied on work done (tax exclusive), not on VAT amount.
    const vatDeduction = totalExclusive * (vatWithholdingRate / 100);
    const advanceRecovery = parseMoney(d.advanceRecovery);
    const previousCumulative = parseMoney(d.previousCumulative);
    const computedInclusive = totalExclusive + computedVatAmount;
    const computedGross = computedInclusive - computedWithholdingAmount - vatDeduction - computedRetentionAmount;
    const computedNet = computedGross - advanceRecovery - previousCumulative;
    return {
      normalizedBq,
      totalBqAmount,
      totalExclusive,
      computedVatAmount,
      computedWithholdingAmount,
      computedRetentionAmount,
      vatDeduction,
      advanceRecovery,
      previousCumulative,
      computedInclusive,
      computedGross,
      computedNet,
      vatRate,
      withholdingTaxRate,
      vatWithholdingRate,
      retentionRate,
    };
  }, [bqItems, draft, taxRates]);

  const createCertificatePdfFile = async (params = {}) => {
    const d = { ...draft, ...(params.draft || {}) };
    const f = { ...form, ...(params.form || {}) };
    const workflowDetail = params.workflowDetail ?? null;
    const bqProgressAttribution = params.bqProgressAttribution ?? null;

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const today = f.requestDate || new Date().toISOString().slice(0, 10);
    const certNo = f.certNumber || suggestedCertificateNumber || 'N/A';
    const title = d.projectTitle || `Project #${projectId}`;
    const {
      normalizedBq,
      totalBqAmount,
      totalExclusive,
      computedVatAmount,
      computedWithholdingAmount,
      computedRetentionAmount,
      vatDeduction,
      advanceRecovery,
      previousCumulative,
      computedInclusive,
      computedGross,
      computedNet,
      vatRate,
      withholdingTaxRate,
      vatWithholdingRate,
      retentionRate,
    } = calculateCertificateAmounts(d);
    const contractSumValue = Number(String(d.contractSum || '').replace(/,/g, '')) || 0;
    const contractSumFormatted = contractSumValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const contractor = String(d.contractorName || '').trim();
    const clientMinistry = String(d.clientMinistry || '').trim();

    let y = 32;
    const logoData = countyLogoDataUrlRef.current;
    if (logoData) {
      const lw = 68;
      const lh = 68;
      const lx = (pageWidth - lw) / 2;
      try {
        doc.addImage(logoData, 'PNG', lx, y, lw, lh);
        y += lh + 12;
      } catch {
        y = 40;
      }
    } else {
      y = 40;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('REPUBLIC OF KENYA', pageWidth / 2, y, { align: 'center' });
    y += 18;
    doc.text(d.countyName || CERT_DEFAULTS.countyName || 'COUNTY GOVERNMENT', pageWidth / 2, y, { align: 'center' });
    y += 18;
    doc.text(
      (d.issuingMinistry || 'MINISTRY / DEPARTMENT').toUpperCase(),
      pageWidth / 2,
      y,
      { align: 'center' }
    );
    y += 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (contractor) {
      const line = `Contractor: ${contractor}`;
      doc.splitTextToSize(line, pageWidth - margin * 2).forEach((ln) => {
        doc.text(ln, margin, y);
        y += 11;
      });
    }
    if (clientMinistry) {
      const line = `Client ministry / department: ${clientMinistry}`;
      doc.splitTextToSize(line, pageWidth - margin * 2).forEach((ln) => {
        doc.text(ln, margin, y);
        y += 11;
      });
    }
    y += 8;

    doc.setFontSize(10);
    doc.text(`Ref No: ${d.referenceNo || '-'}`, margin, y);
    doc.text(`Date: ${today}`, pageWidth - margin, y, { align: 'right' });

    y += 20;
    doc.text(`To: ${d.recipientOffice || '-'}`, margin, y);
    y += 14;
    const recipientAddress = d.recipientAddress || '-';
    const wrappedAddress = doc.splitTextToSize(recipientAddress, pageWidth - margin * 2);
    doc.text(wrappedAddress, margin, y);
    y += wrappedAddress.length * 12 + 12;

    doc.setFont('helvetica', 'bold');
    doc.text(`RE: ${title.toUpperCase()}`, margin, y);
    y += 16;
    doc.text(`TENDER NO: ${d.tenderNo || '-'}`, margin, y);
    y += 16;
    doc.text(`${(f.certType || 'PAYMENT CERTIFICATE').toUpperCase()} NO. ${certNo}`, margin, y);
    y += 18;

    doc.setFont('helvetica', 'normal');
    const intro = `The above project currently under construction with contract sum Ksh. ${contractSumFormatted} refers.`;
    const wrappedIntro = doc.splitTextToSize(intro, pageWidth - margin * 2);
    doc.text(wrappedIntro, margin, y);
    y += wrappedIntro.length * 12 + 10;

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      head: [['Item', 'Amount (Ksh)']],
      body: [
        ['Total Work Done (Tax Inclusive)', computedInclusive.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
        ['Total Work Done (Tax Exclusive)', totalExclusive.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
        [`VAT Amount (${vatRate.toFixed(2)}%)`, computedVatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
        [`Withholding Tax (${withholdingTaxRate.toFixed(2)}%)`, computedWithholdingAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
        [`VAT Deduction (${vatWithholdingRate.toFixed(2)}% of Work Done)`, vatDeduction.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
        [`Retention Amount (${retentionRate.toFixed(2)}%)`, computedRetentionAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
        ['Advance Recovery', d.advanceRecovery || '0.00'],
        ['Previous Cumulative Certificates', d.previousCumulative || '0.00'],
        ['Gross Amount', computedGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
        ['Net Amount Due', computedNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
      ],
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    y = (doc.lastAutoTable?.finalY || y) + 18;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('BQ ACTIVITY SUMMARY', margin, y);
    y += 8;

    const bqRows = normalizedBq.map((row, idx) => ([
      String.fromCharCode(65 + (idx % 26)),
      row.description,
      row.qty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      `${row.percent.toFixed(2)}%`,
      row.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    ]));

    if (bqRows.length > 0) {
      autoTable(doc, {
        startY: y,
        theme: 'grid',
        head: [['ITEM', 'DESCRIPTION', 'QTY', '%', 'AMOUNT']],
        body: [
          ...bqRows,
          ['', 'TOTAL FOR THEATRE BLOCK', '', '', totalBqAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })],
        ],
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: [80, 80, 80] },
        columnStyles: {
          0: { cellWidth: 36 },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
        },
      });
      y = (doc.lastAutoTable?.finalY || y) + 16;
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text('No BQ activities available for this project.', margin, y + 10);
      y += 24;
    }

    const lineHg = 11;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(55, 65, 81);
    const att = bqProgressAttribution;
    const attName = att?.fullName || att?.full_name || '';
    const attRole = att?.roleName || att?.role_name || '';
    const attAct = att?.activityName || att?.activity_name || '';
    const attPct = att?.progressPercent ?? att?.progress_percent;
    const attProgDate = att?.progressDate || att?.progress_date;
    const attRec = att?.recordedAt || att?.recorded_at;
    const progDateStr = attProgDate ? new Date(attProgDate).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
    const recDateStr = attRec ? new Date(attRec).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
    const flushAttLines = (text) => {
      doc.splitTextToSize(text, pageWidth - margin * 2).forEach((ln) => {
        if (y > pageH - 48) {
          doc.addPage();
          y = 44;
        }
        doc.text(ln, margin, y);
        y += lineHg;
      });
    };
    if (att && attName) {
      const rolePart = attRole ? ` (${attRole})` : '';
      const pctTxt = attPct != null && attPct !== '' ? `${Number(attPct).toFixed(2)}%` : '—';
      flushAttLines(
        `Progress assessed by: ${attName}${rolePart}. BQ line: ${attAct || '—'}. Completion ${pctTxt} as at ${progDateStr || '—'}, recorded electronically ${recDateStr || '—'}.`
      );
    } else if (att && !attName) {
      const pctTxt = attPct != null && attPct !== '' ? `${Number(attPct).toFixed(2)}%` : '—';
      flushAttLines(
        `Progress: latest BQ entry (${pctTxt}, ${attAct || 'BQ item'}, dated ${progDateStr || '—'}) predates user attribution. Save a new dated progress entry on the BQ tab to record who confirmed progress on the certificate.`
      );
    } else {
      flushAttLines(
        'Progress assessed by: no dated BQ progress history found for this project. Record progress on the Bill of Quantities tab before generating this certificate.'
      );
    }
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    y += 6;

    doc.text(`Remarks: ${f.requesterRemarks || '-'}`, margin, y);
    y += 22;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Prepared by', margin, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('___________________________', margin, y);
    y += 22;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('ELECTRONIC APPROVALS', margin, y);
    y += 10;

    const wfSteps = (workflowDetail?.steps || [])
      .slice()
      .sort(
        (a, b) =>
          (Number(a.step_order ?? a.stepOrder) || 0) - (Number(b.step_order ?? b.stepOrder) || 0)
      );

    const statusLower = (s) => String(s.status || '').toLowerCase();

    let approvalBodyRows;
    if (wfSteps.length > 0) {
      approvalBodyRows = wfSteps.map((s) => {
        const ord = s.step_order ?? s.stepOrder;
        const nm = s.step_name || s.stepName || 'Step';
        const stepLabel =
          ord !== '' && ord != null && !Number.isNaN(Number(ord)) ? `${ord}. ${nm}` : nm;
        const role = s.stepApproverRoleName || s.step_approver_role_name || '—';
        const st = statusLower(s);
        let approvedBy = '—';
        let dateStr = '—';
        if (st === 'approved') {
          approvedBy = s.signerFullName || s.signer_full_name || '—';
          const rawDt = s.completed_at || s.completedAt;
          dateStr = rawDt
            ? new Date(rawDt).toLocaleDateString(undefined, { dateStyle: 'medium' })
            : '—';
        } else if (st === 'pending') {
          approvedBy = 'Pending (electronic)';
        } else if (st === 'waiting') {
          approvedBy = 'Awaiting prior steps';
        } else if (st === 'rejected') {
          approvedBy = 'Rejected (electronic)';
          const rawDt = s.completed_at || s.completedAt;
          dateStr = rawDt
            ? new Date(rawDt).toLocaleDateString(undefined, { dateStyle: 'medium' })
            : '—';
        }
        return [stepLabel, role, approvedBy, dateStr, ''];
      });
    } else {
      approvalBodyRows = [
        ['—', '—', 'No approval workflow attached for this certificate yet.', '—', ''],
      ];
    }

    if (y > pageH - 100) {
      doc.addPage();
      y = 44;
    }

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      head: [['STEP', 'ROLE', 'APPROVED BY (ELECTRONIC)', 'DATE', 'SIGNATURE']],
      body: approvalBodyRows,
      margin: { left: margin, right: margin },
      styles: { fontSize: 8.5, cellPadding: 4, valign: 'middle', minCellHeight: 26 },
      headStyles: { fillColor: [80, 80, 80], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 70 },
        2: { cellWidth: 110 },
        3: { cellWidth: 64 },
        4: { cellWidth: 84 },
      },
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const c = data.cell;
          doc.setDrawColor(170, 170, 170);
          doc.setLineWidth(0.35);
          const bottom = c.y + c.height - 4;
          doc.line(c.x + 4, bottom, c.x + c.width - 4, bottom);
        }
      },
    });

    y = (doc.lastAutoTable?.finalY || y) + 6;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(85, 85, 85);
    doc.text(
      'Sign in the Signature column on the physical copy where required. Regenerate this PDF after further electronic approvals to refresh the table.',
      margin,
      y
    );
    doc.setTextColor(0, 0, 0);

    try {
      const portalOrigin =
        (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PUBLIC_PORTAL_ORIGIN?.replace(/\/$/, '')) || '';
      const base = portalOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
      const cn = String(certNo || '').trim();
      if (base && cn && cn !== 'N/A') {
        const verifyUrl = `${base}/verify-certificate?cert=${encodeURIComponent(cn)}`;
        const QRCode = (await import('qrcode')).default;
        const dataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 180, errorCorrectionLevel: 'M' });
        const pageCount = doc.internal.getNumberOfPages();
        doc.setPage(pageCount);
        const pw = doc.internal.pageSize.getWidth();
        const ph = doc.internal.pageSize.getHeight();
        const qrSize = 72;
        const qrX = pw - margin - qrSize;
        const qrY = ph - margin - qrSize - 16;
        doc.addImage(dataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(60, 60, 60);
        doc.text('Scan to verify this certificate', qrX + qrSize / 2, ph - margin - 4, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      }
    } catch (e) {
      console.warn('Certificate PDF QR skipped:', e?.message || e);
    }

    const blob = doc.output('blob');
    const safeCertNo = String(certNo).replace(/[^a-zA-Z0-9-_]/g, '_');
    return new File([blob], `payment-certificate-${safeCertNo}.pdf`, { type: 'application/pdf' });
  };
  const handleGenerateDraftPdf = async () => {
    setError('');
    try {
      let bqProgressAttribution = null;
      try {
        bqProgressAttribution = await projectService.bq.getLatestProgressAttribution(projectId);
      } catch {
        /* non-blocking */
      }
      const generated = await createCertificatePdfFile({ workflowDetail: null, bqProgressAttribution });
      setGeneratedPdfFile(generated);
      setMessage('Certificate PDF draft generated. Save to upload it.');
    } catch (err) {
      setError(err?.message || 'Failed to generate certificate PDF draft.');
    }
  };

  const handleGeneratePdfWithApprovals = async (cert) => {
    const cid = cert.certificateId ?? cert.certificateid;
    if (cid == null) return;
    setPdfWithApprovalsBusyId(cid);
    setError('');
    try {
      const [workflowDetail, bqProgressAttribution] = await Promise.all([
        apiService.approvalWorkflow
          .getByEntity(CERTIFICATE_APPROVAL_ENTITY, String(cid))
          .catch((e) => {
            if (e?.response?.status === 404) return null;
            throw e;
          }),
        projectService.bq.getLatestProgressAttribution(projectId).catch(() => null),
      ]);
      const stored = { ...draft, ...parseStoredCertificateData(cert) };
      const f = formFieldsFromCertificateRow(cert);
      const file = await createCertificatePdfFile({ draft: stored, form: f, workflowDetail, bqProgressAttribution });
      const blobUrl = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(blobUrl);
      setMessage('PDF with current approval signatures downloaded.');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to generate PDF with approvals.');
    } finally {
      setPdfWithApprovalsBusyId(null);
    }
  };

  const handleOpenAddCertificate = () => {
    setError('');
    setMessage('');
    setFile(null);
    setGeneratedPdfFile(null);
    setForm((prev) => ({
      ...prev,
      certNumber: prev.certNumber || suggestedCertificateNumber,
      requestDate: prev.requestDate || new Date().toISOString().slice(0, 10),
    }));
    setOpenDialog(true);
  };

  const handleSubmit = async () => {
    const fileToUpload = file || generatedPdfFile;
    if (!fileToUpload) {
      setError('Attach a certificate file or generate a draft PDF before submitting.');
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const payload = new FormData();
      const uploadSource = generatedPdfFile && !file ? 'generated' : 'attached';
      payload.append('projectId', String(projectId));
      payload.append('document', fileToUpload);
      payload.append('certificateData', JSON.stringify(draft));
      payload.append('uploadSource', uploadSource);
      Object.entries(form).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          payload.append(key, value);
        }
      });
      await projectService.certificates.upload(payload);
      setOpenDialog(false);
      setFile(null);
      setGeneratedPdfFile(null);
      setForm({
        certType: 'Interim Payment Certificate',
        certSubType: '',
        certNumber: '',
        progressStatus: '',
        applicationStatus: 'pending',
        requesterRemarks: '',
        requestDate: new Date().toISOString().slice(0, 10),
      });
      setMessage('Certificate uploaded successfully.');
      await loadCertificates();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to upload certificate.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (certificateId) => {
    if (!window.confirm('Delete this certificate record?')) return;
    setError('');
    setMessage('');
    try {
      await projectService.certificates.remove(certificateId);
      setMessage('Certificate deleted.');
      await loadCertificates();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to delete certificate.');
    }
  };

  const handleDownload = async (certificate) => {
    try {
      const blob = await projectService.certificates.download(certificate.certificateId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fallbackName = `certificate-${certificate.certificateId}`;
      link.href = url;
      link.download = certificate.fileName || certificate.certNumber || fallbackName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to download certificate file.');
    }
  };

  const getUploadSource = (certificate) => {
    const explicit = String(certificate?.uploadSource || '').toLowerCase();
    if (explicit === 'generated' || explicit === 'attached') return explicit;
    const name = String(certificate?.fileName || '').toLowerCase();
    if (name.startsWith('payment-certificate-')) return 'generated';
    return 'attached';
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Payment Certificates
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Upload certificates used to request payment for completed work. Use the PDF icon on a row to download a
            certificate PDF that lists completed approval steps with signer name, role, and date.
          </Typography>
        </Box>
        {canModify && (
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            onClick={handleOpenAddCertificate}
          >
            Add Certificate
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : certificates.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No certificates uploaded for this project yet.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Cert Number</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Application</TableCell>
                  <TableCell>Workflow</TableCell>
                  <TableCell>Request Date</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>File</TableCell>
                  <TableCell align="center">Approval</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {certificates.map((cert) => {
                  const cid = cert.certificateId ?? cert.certificateid ?? cert.id;
                  const approvalOpen = workflowOpenForId === cid;
                  return (
                    <Fragment key={cid}>
                      <TableRow>
                        <TableCell>{cert.certNumber || '-'}</TableCell>
                        <TableCell>{cert.certType || '-'}</TableCell>
                        <TableCell>{cert.applicationStatus || '-'}</TableCell>
                        <TableCell>
                          <Tooltip title={workflowDetailLine(cert)} placement="top" enterDelay={400}>
                            <Chip size="small" variant="outlined" {...workflowChipProps(cert)} />
                          </Tooltip>
                        </TableCell>
                        <TableCell>{cert.requestDate ? String(cert.requestDate).slice(0, 10) : '-'}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={getUploadSource(cert) === 'generated' ? 'Generated' : 'Attached'}
                            color={getUploadSource(cert) === 'generated' ? 'success' : 'default'}
                            variant={getUploadSource(cert) === 'generated' ? 'filled' : 'outlined'}
                          />
                        </TableCell>
                        <TableCell>{cert.fileName || 'attachment'}</TableCell>
                        <TableCell align="center">
                          <Tooltip title={approvalOpen ? 'Hide approval' : 'Submit or track approval'}>
                            <IconButton
                              size="small"
                              color={approvalOpen ? 'primary' : 'default'}
                              onClick={() => setWorkflowOpenForId(approvalOpen ? null : cid)}
                              aria-expanded={approvalOpen}
                              aria-label="Certificate approval workflow"
                            >
                              <FactCheckIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="PDF with approvals (name, role, date per completed step)">
                            <span>
                              <IconButton
                                size="small"
                                color="secondary"
                                disabled={pdfWithApprovalsBusyId === cid}
                                onClick={() => handleGeneratePdfWithApprovals(cert)}
                                aria-label="Download PDF including workflow approvals"
                              >
                                {pdfWithApprovalsBusyId === cid ? (
                                  <CircularProgress color="inherit" size={18} />
                                ) : (
                                  <PictureAsPdfIcon fontSize="small" />
                                )}
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Download stored file">
                            <IconButton onClick={() => handleDownload(cert)} size="small" color="primary">
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {canModify && (
                            <Tooltip title="Delete">
                              <IconButton
                                onClick={() => handleDelete(cid)}
                                size="small"
                                color="error"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={9} sx={{ py: 0, borderBottom: approvalOpen ? undefined : 'none' }}>
                          <Collapse in={approvalOpen} timeout="auto" unmountOnExit>
                            <Box sx={{ py: 1.5, px: 1, bgcolor: 'background.default' }}>
                              <ApprovalWorkflowPanel
                                entityType={CERTIFICATE_APPROVAL_ENTITY}
                                entityId={String(cid)}
                                user={user}
                                compact
                                onChanged={() => {
                                  loadCertificates();
                                }}
                              />
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle>Add Project Certificate</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} md={6}>
              <TextField
                select
                fullWidth
                label="Certificate Type"
                value={form.certType}
                onChange={(e) => setForm((p) => ({ ...p, certType: e.target.value }))}
              >
                {CERTIFICATE_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Certificate Number"
                value={form.certNumber}
                onChange={(e) => setForm((p) => ({ ...p, certNumber: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                select
                fullWidth
                label="Application Status"
                value={form.applicationStatus}
                onChange={(e) => setForm((p) => ({ ...p, applicationStatus: e.target.value }))}
              >
                {STATUS_OPTIONS.map((status) => (
                  <MenuItem key={status} value={status}>{status}</MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Request Date"
                type="date"
                value={form.requestDate}
                onChange={(e) => setForm((p) => ({ ...p, requestDate: e.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Progress Status"
                value={form.progressStatus}
                onChange={(e) => setForm((p) => ({ ...p, progressStatus: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                minRows={3}
                label="Requester Remarks"
                value={form.requesterRemarks}
                onChange={(e) => setForm((p) => ({ ...p, requesterRemarks: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle2" sx={{ mb: 1, mt: 0.5 }}>Certificate Generation Details</Typography>
            </Grid>
            {!CERT_DEFAULTS.countyName && (
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="County Government Name" value={draft.countyName} onChange={(e) => setDraft((p) => ({ ...p, countyName: e.target.value }))} />
              </Grid>
            )}
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Issuing Ministry/Department" value={draft.issuingMinistry} onChange={(e) => setDraft((p) => ({ ...p, issuingMinistry: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Reference No" value={draft.referenceNo} onChange={(e) => setDraft((p) => ({ ...p, referenceNo: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Recipient Office" value={draft.recipientOffice} onChange={(e) => setDraft((p) => ({ ...p, recipientOffice: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth label="Recipient Address" value={draft.recipientAddress} onChange={(e) => setDraft((p) => ({ ...p, recipientAddress: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Project Title" value={draft.projectTitle} onChange={(e) => setDraft((p) => ({ ...p, projectTitle: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Tender / Contract No" value={draft.tenderNo} onChange={(e) => setDraft((p) => ({ ...p, tenderNo: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Contract Sum (Ksh)" value={draft.contractSum} onChange={(e) => setDraft((p) => ({ ...p, contractSum: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Client Ministry" value={draft.clientMinistry} onChange={(e) => setDraft((p) => ({ ...p, clientMinistry: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Contractor Name" value={draft.contractorName} onChange={(e) => setDraft((p) => ({ ...p, contractorName: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Advance Recovery" value={draft.advanceRecovery} onChange={(e) => setDraft((p) => ({ ...p, advanceRecovery: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Previous Cumulative" value={draft.previousCumulative} onChange={(e) => setDraft((p) => ({ ...p, previousCumulative: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary">
                BQ-based payable summary in PDF uses current BQ items ({bqItems.length} rows). Amount per row = Budget x % Complete.
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Applied rates for {form.requestDate || 'today'}
                {' '}
                → VAT: {Number(taxRates.find((r) => String(r.tax_type).toLowerCase() === 'vat')?.rate_percent || 0).toFixed(2)}%, Withholding Tax: {Number(taxRates.find((r) => String(r.tax_type).toLowerCase() === 'withholding_tax')?.rate_percent || 0).toFixed(2)}%, VAT Withholding: {Number(taxRates.find((r) => String(r.tax_type).toLowerCase() === 'vat')?.withholding_rate || 0).toFixed(2)}%, Retention: {Number(taxRates.find((r) => String(r.tax_type).toLowerCase() === 'retention')?.rate_percent || 0).toFixed(2)}%.
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Financial totals are auto-generated from BQ progress and active tax rates.
              </Typography>
            </Grid>
            <Grid item xs={12}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button variant="outlined" onClick={handleGenerateDraftPdf}>
                  Generate Draft PDF
                </Button>
                <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
                Attach Certificate File
                <input
                  hidden
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                </Button>
              </Stack>
              <Typography variant="caption" display="block" sx={{ mt: 0.75 }} color="text.secondary">
                {downloadName || 'No file selected'}
              </Typography>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
            {submitting ? 'Uploading...' : 'Save Certificate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

ProjectCertificatesTab.propTypes = {
  projectId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  canModify: PropTypes.bool,
};

export default ProjectCertificatesTab;
