import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fab,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import aiAssistantService from '../../api/aiAssistantService';

const STARTER_MESSAGES = [
  'Summarize projects I can access by status.',
  'Which projects are stalled or need attention?',
  'Summarize CIDP linkage for my accessible projects.',
];

const REPORT_TYPES = [
  'Project Status Report',
  'Finance Summary Report',
  'CIDP Linkage Report',
  'Monitoring Summary Report',
  'General M&E Report',
];

function makeGreeting() {
  return {
    role: 'assistant',
    content: 'Hello, I am the M&E AI Assistant. I can help with workflows, reports, CIDP/ADP linkage, project monitoring, and system navigation.',
  };
}

export default function AIAssistantPanel({ pageContext }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState({ enabled: false, configured: false, model: '' });
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [messages, setMessages] = useState(() => [makeGreeting()]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportPrompt, setReportPrompt] = useState('Draft a professional report using my accessible live project data.');
  const [reportType, setReportType] = useState(REPORT_TYPES[0]);
  const [reportOutput, setReportOutput] = useState('docx');
  const [reportGenerating, setReportGenerating] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    aiAssistantService.getStatus()
      .then((data) => {
        if (mounted) setStatus(data || {});
      })
      .catch(() => {
        if (mounted) setStatus({ enabled: false, configured: false, model: '' });
      })
      .finally(() => {
        if (mounted) setStatusLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const sendPrompt = async (promptText = input) => {
    const text = String(promptText || '').trim();
    if (!text || sending) return;
    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setError('');
    try {
      const response = await aiAssistantService.sendMessage({
        messages: nextMessages,
        context: pageContext,
      });
      const dataNote = response?.dataContextUsed ? '\n\nData used: live scoped system data.' : '';
      setMessages((prev) => [...prev, { role: 'assistant', content: `${response?.answer || 'I could not generate a response.'}${dataNote}` }]);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'AI assistant request failed.';
      setError(message);
      setMessages((prev) => [...prev, { role: 'assistant', content: message }]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendPrompt();
    }
  };

  const filenameFromDisposition = (disposition, fallback) => {
    const match = String(disposition || '').match(/filename="?([^";]+)"?/i);
    return match?.[1] || fallback;
  };

  const handleGenerateReport = async () => {
    const prompt = String(reportPrompt || '').trim();
    if (!prompt || reportGenerating) return;
    setReportGenerating(true);
    setError('');
    try {
      const response = await aiAssistantService.generateReport({
        prompt,
        reportType,
        output: reportOutput,
        context: pageContext,
      });
      const extension = reportOutput === 'pdf' ? 'pdf' : 'docx';
      const fileName = filenameFromDisposition(
        response.headers?.['content-disposition'],
        `ai-generated-report.${extension}`
      );
      const blob = new Blob([response.data], {
        type: reportOutput === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setReportOpen(false);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Professional ${reportOutput.toUpperCase()} report generated and downloaded. The document was formatted by the system template for consistent official styling.`,
        },
      ]);
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'AI report generation failed.';
      setError(message);
    } finally {
      setReportGenerating(false);
    }
  };

  return (
    <>
      <Tooltip title="AI Assistance">
        <Fab
          color="primary"
          onClick={() => setOpen(true)}
          sx={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 1200,
            background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #1d4ed8 0%, #6d28d9 100%)',
            },
          }}
          aria-label="Open AI assistance"
        >
          <AutoAwesomeIcon />
        </Fab>
      </Tooltip>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            height: { xs: '82vh', sm: 640 },
            borderRadius: 3,
            position: { sm: 'fixed' },
            right: { sm: 24 },
            bottom: { sm: 96 },
            m: { xs: 1, sm: 0 },
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pr: 1 }}>
          <AutoAwesomeIcon color="primary" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>M&E AI Assistant</Typography>
            <Typography variant="caption" color="text.secondary">
              {status?.model ? `Model: ${status.model}` : 'Workflow, reporting, and system guidance'}
            </Typography>
          </Box>
          <IconButton onClick={() => setOpen(false)} aria-label="Close AI assistant">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
          {statusLoaded && !status.configured ? (
            <Alert severity="warning">
              AI assistance is not configured yet. Add <strong>OPENAI_API_KEY</strong> to <code>api/.env</code> and restart the API.
            </Alert>
          ) : null}
          {statusLoaded && status.configured ? (
            <Alert severity="info">
              This assistant can use compact live data summaries for project, status, budget, CIDP, and report questions,
              restricted to your user access scope.
            </Alert>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}

          <Box sx={{ flex: 1, overflow: 'auto', pr: 0.5 }}>
            <Stack spacing={1.25}>
              {messages.map((message, index) => {
                const isUser = message.role === 'user';
                return (
                  <Box key={`${message.role}-${index}`} sx={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                    <Paper
                      elevation={0}
                      sx={{
                        maxWidth: '86%',
                        p: 1.25,
                        borderRadius: 2,
                        bgcolor: isUser ? 'primary.main' : 'grey.100',
                        color: isUser ? 'primary.contrastText' : 'text.primary',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      <Typography variant="body2">{message.content}</Typography>
                    </Paper>
                  </Box>
                );
              })}
              {sending ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={16} />
                  <Typography variant="caption" color="text.secondary">AI is thinking...</Typography>
                </Box>
              ) : null}
              <div ref={messagesEndRef} />
            </Stack>
          </Box>

          {messages.length <= 1 ? (
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {STARTER_MESSAGES.map((starter) => (
                <Button
                  key={starter}
                  size="small"
                  variant="outlined"
                  onClick={() => sendPrompt(starter)}
                  disabled={sending || (statusLoaded && !status.configured)}
                >
                  {starter}
                </Button>
              ))}
            </Stack>
          ) : null}

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setReportOpen(true)}
              disabled={sending || reportGenerating || (statusLoaded && !status.configured)}
            >
              Generate Professional Report
            </Button>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="flex-end">
            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={5}
              size="small"
              placeholder="Ask about workflows, reports, CIDP linkage, project monitoring..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending || (statusLoaded && !status.configured)}
            />
            <Button
              variant="contained"
              onClick={() => sendPrompt()}
              disabled={!input.trim() || sending || (statusLoaded && !status.configured)}
              sx={{ minWidth: 44, height: 40 }}
            >
              {sending ? <CircularProgress size={18} color="inherit" /> : <SendIcon fontSize="small" />}
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            AI responses are advisory. Review outputs before using them in official reports or submissions.
          </Typography>
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onClose={() => setReportOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Generate Professional Report</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info">
              Low-cost mode: AI drafts structured content, then the system formats the final Word/PDF document using a fixed professional template.
            </Alert>
            <TextField
              select
              fullWidth
              size="small"
              label="Report type"
              value={reportType}
              onChange={(event) => setReportType(event.target.value)}
            >
              {REPORT_TYPES.map((type) => (
                <MenuItem key={type} value={type}>{type}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              fullWidth
              size="small"
              label="Output"
              value={reportOutput}
              onChange={(event) => setReportOutput(event.target.value)}
            >
              <MenuItem value="docx">Word document (.docx)</MenuItem>
              <MenuItem value="pdf">PDF document (.pdf)</MenuItem>
            </TextField>
            <TextField
              fullWidth
              multiline
              minRows={4}
              label="Instructions"
              value={reportPrompt}
              onChange={(event) => setReportPrompt(event.target.value)}
              placeholder="Example: Draft a status report for projects I can access, highlighting completed, ongoing, stalled projects, risks, and recommendations."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReportOpen(false)} disabled={reportGenerating}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleGenerateReport}
            disabled={!reportPrompt.trim() || reportGenerating}
          >
            {reportGenerating ? <CircularProgress size={18} color="inherit" /> : 'Generate'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
