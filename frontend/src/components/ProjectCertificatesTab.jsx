import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  UploadFile as UploadFileIcon,
} from '@mui/icons-material';
import projectService from '../api/projectService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

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

const ProjectCertificatesTab = ({ projectId, canModify = true }) => {
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
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

  const calculateCertificateAmounts = useCallback(() => {
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
    const advanceRecovery = parseMoney(draft.advanceRecovery);
    const previousCumulative = parseMoney(draft.previousCumulative);
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
  }, [bqItems, draft.advanceRecovery, draft.previousCumulative, taxRates]);

  const createCertificatePdfFile = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const today = form.requestDate || new Date().toISOString().slice(0, 10);
    const certNo = form.certNumber || suggestedCertificateNumber || 'N/A';
    const title = draft.projectTitle || `Project #${projectId}`;
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
    } = calculateCertificateAmounts();
    const contractSumValue = Number(String(draft.contractSum || '').replace(/,/g, '')) || 0;
    const contractSumFormatted = contractSumValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let y = 44;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('REPUBLIC OF KENYA', pageWidth / 2, y, { align: 'center' });
    y += 18;
    doc.text(draft.countyName || CERT_DEFAULTS.countyName || 'COUNTY GOVERNMENT', pageWidth / 2, y, { align: 'center' });
    y += 18;
    doc.text(
      (draft.issuingMinistry || 'MINISTRY / DEPARTMENT').toUpperCase(),
      pageWidth / 2,
      y,
      { align: 'center' }
    );

    y += 24;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Ref No: ${draft.referenceNo || '-'}`, margin, y);
    doc.text(`Date: ${today}`, pageWidth - margin, y, { align: 'right' });

    y += 20;
    doc.text(`To: ${draft.recipientOffice || '-'}`, margin, y);
    y += 14;
    const recipientAddress = draft.recipientAddress || '-';
    const wrappedAddress = doc.splitTextToSize(recipientAddress, pageWidth - margin * 2);
    doc.text(wrappedAddress, margin, y);
    y += wrappedAddress.length * 12 + 12;

    doc.setFont('helvetica', 'bold');
    doc.text(`RE: ${title.toUpperCase()}`, margin, y);
    y += 16;
    doc.text(`TENDER NO: ${draft.tenderNo || '-'}`, margin, y);
    y += 16;
    doc.text(`${(form.certType || 'PAYMENT CERTIFICATE').toUpperCase()} NO. ${certNo}`, margin, y);
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
        ['Advance Recovery', draft.advanceRecovery || '0.00'],
        ['Previous Cumulative Certificates', draft.previousCumulative || '0.00'],
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

    doc.setFont('helvetica', 'normal');
    const contractor = draft.contractorName || '-';
    const clientMinistry = draft.clientMinistry || '-';
    doc.text(`Contractor: ${contractor}`, margin, y);
    y += 14;
    doc.text(`Client Ministry/Department: ${clientMinistry}`, margin, y);
    y += 14;
    doc.text(`Remarks: ${form.requesterRemarks || '-'}`, margin, y);
    y += 28;
    doc.text('Prepared by: ___________________________', margin, y);
    doc.text('Approved by: ___________________________', margin + 240, y);

    const blob = doc.output('blob');
    const safeCertNo = String(certNo).replace(/[^a-zA-Z0-9-_]/g, '_');
    return new File([blob], `payment-certificate-${safeCertNo}.pdf`, { type: 'application/pdf' });
  };
  const handleGenerateDraftPdf = () => {
    setError('');
    try {
      const generated = createCertificatePdfFile();
      setGeneratedPdfFile(generated);
      setMessage('Certificate PDF draft generated. Save to upload it.');
    } catch (err) {
      setError(err?.message || 'Failed to generate certificate PDF draft.');
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
            Upload certificates used to request payment for completed work.
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
                  <TableCell>Status</TableCell>
                  <TableCell>Request Date</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>File</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {certificates.map((cert) => (
                  <TableRow key={cert.certificateId}>
                    <TableCell>{cert.certNumber || '-'}</TableCell>
                    <TableCell>{cert.certType || '-'}</TableCell>
                    <TableCell>{cert.applicationStatus || '-'}</TableCell>
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
                    <TableCell align="right">
                      <Tooltip title="Download">
                        <IconButton onClick={() => handleDownload(cert)} size="small" color="primary">
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {canModify && (
                        <Tooltip title="Delete">
                          <IconButton
                            onClick={() => handleDelete(cert.certificateId)}
                            size="small"
                            color="error"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
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
                Applied rates for {form.requestDate || 'today'} -> VAT: {Number(taxRates.find((r) => String(r.tax_type).toLowerCase() === 'vat')?.rate_percent || 0).toFixed(2)}%, Withholding Tax: {Number(taxRates.find((r) => String(r.tax_type).toLowerCase() === 'withholding_tax')?.rate_percent || 0).toFixed(2)}%, VAT Withholding: {Number(taxRates.find((r) => String(r.tax_type).toLowerCase() === 'vat')?.withholding_rate || 0).toFixed(2)}%, Retention: {Number(taxRates.find((r) => String(r.tax_type).toLowerCase() === 'retention')?.rate_percent || 0).toFixed(2)}%.
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
