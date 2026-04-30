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
  const [draft, setDraft] = useState({
    countyName: 'COUNTY GOVERNMENT',
    issuingMinistry: '',
    referenceNo: '',
    recipientOffice: '',
    recipientAddress: '',
    projectTitle: '',
    tenderNo: '',
    contractSum: '',
    clientMinistry: '',
    contractorName: '',
    totalWorkInclusive: '',
    totalWorkExclusive: '',
    vatAmount: '',
    withholdingTax: '',
    vatDeduction: '',
    retentionAmount: '',
    advanceRecovery: '',
    previousCumulative: '',
    grossAmount: '',
    netAmount: '',
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

  const downloadName = useMemo(() => {
    if (file) return file.name;
    if (generatedPdfFile) return generatedPdfFile.name;
    return '';
  }, [file, generatedPdfFile]);

  const createCertificatePdfFile = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const today = form.requestDate || new Date().toISOString().slice(0, 10);
    const certNo = form.certNumber || 'N/A';
    const title = draft.projectTitle || `Project #${projectId}`;

    let y = 44;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('REPUBLIC OF KENYA', pageWidth / 2, y, { align: 'center' });
    y += 18;
    doc.text(draft.countyName || 'COUNTY GOVERNMENT', pageWidth / 2, y, { align: 'center' });
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
    const intro = `The above project currently under construction with contract sum Ksh. ${draft.contractSum || '0.00'} refers.`;
    const wrappedIntro = doc.splitTextToSize(intro, pageWidth - margin * 2);
    doc.text(wrappedIntro, margin, y);
    y += wrappedIntro.length * 12 + 10;

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      head: [['Item', 'Amount (Ksh)']],
      body: [
        ['Total Work Done (Tax Inclusive)', draft.totalWorkInclusive || '0.00'],
        ['Total Work Done (Tax Exclusive)', draft.totalWorkExclusive || '0.00'],
        ['VAT Amount', draft.vatAmount || '0.00'],
        ['Withholding Tax', draft.withholdingTax || '0.00'],
        ['VAT Deduction', draft.vatDeduction || '0.00'],
        ['Retention Amount', draft.retentionAmount || '0.00'],
        ['Advance Recovery', draft.advanceRecovery || '0.00'],
        ['Previous Cumulative Certificates', draft.previousCumulative || '0.00'],
        ['Gross Amount', draft.grossAmount || '0.00'],
        ['Net Amount Due', draft.netAmount || '0.00'],
      ],
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    y = (doc.lastAutoTable?.finalY || y) + 16;
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
      payload.append('projectId', String(projectId));
      payload.append('document', fileToUpload);
      payload.append('certificateData', JSON.stringify(draft));
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
            onClick={() => setOpenDialog(true)}
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
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="County Government Name" value={draft.countyName} onChange={(e) => setDraft((p) => ({ ...p, countyName: e.target.value }))} />
            </Grid>
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
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Total Work Inclusive" value={draft.totalWorkInclusive} onChange={(e) => setDraft((p) => ({ ...p, totalWorkInclusive: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Total Work Exclusive" value={draft.totalWorkExclusive} onChange={(e) => setDraft((p) => ({ ...p, totalWorkExclusive: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="VAT Amount" value={draft.vatAmount} onChange={(e) => setDraft((p) => ({ ...p, vatAmount: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Withholding Tax" value={draft.withholdingTax} onChange={(e) => setDraft((p) => ({ ...p, withholdingTax: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="VAT Deduction" value={draft.vatDeduction} onChange={(e) => setDraft((p) => ({ ...p, vatDeduction: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Retention Amount" value={draft.retentionAmount} onChange={(e) => setDraft((p) => ({ ...p, retentionAmount: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Advance Recovery" value={draft.advanceRecovery} onChange={(e) => setDraft((p) => ({ ...p, advanceRecovery: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Previous Cumulative" value={draft.previousCumulative} onChange={(e) => setDraft((p) => ({ ...p, previousCumulative: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Gross Amount" value={draft.grossAmount} onChange={(e) => setDraft((p) => ({ ...p, grossAmount: e.target.value }))} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Net Amount Due" value={draft.netAmount} onChange={(e) => setDraft((p) => ({ ...p, netAmount: e.target.value }))} />
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
