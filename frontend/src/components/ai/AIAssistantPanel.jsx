import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import DownloadIcon from '@mui/icons-material/Download';
import SendIcon from '@mui/icons-material/Send';
import aiAssistantService from '../../api/aiAssistantService';
import {
  buildReportPromptFromChat,
  detectReportIntent,
  detectReportOutputFormat,
  formatAssistantSections,
  formatDataSourceLabel,
  getAIStarterMessages,
  getDefaultReportPrompt,
  getDefaultReportType,
  inferReportType,
  parseInlineMarkdown,
  REPORT_TYPE_OPTIONS,
} from '../../utils/aiAssistantHelpers';

function InlineMarkdownText({ text, variant = 'body2', sx = {} }) {
  const segments = parseInlineMarkdown(text);
  return (
    <Typography variant={variant} component="span" sx={{ whiteSpace: 'pre-wrap', ...sx }}>
      {segments.map((segment, index) => {
        if (segment.type === 'bold') {
          return (
            <Box key={index} component="strong" sx={{ fontWeight: 700 }}>
              {segment.value}
            </Box>
          );
        }
        if (segment.type === 'italic') {
          return (
            <Box key={index} component="em" sx={{ fontStyle: 'italic' }}>
              {segment.value}
            </Box>
          );
        }
        if (segment.type === 'code') {
          return (
            <Box
              key={index}
              component="code"
              sx={{
                fontFamily: 'monospace',
                fontSize: '0.9em',
                px: 0.5,
                py: 0.15,
                borderRadius: 0.5,
                bgcolor: 'action.hover',
              }}
            >
              {segment.value}
            </Box>
          );
        }
        return <span key={index}>{segment.value}</span>;
      })}
    </Typography>
  );
}

function AssistantBlocks({ blocks }) {
  return (
    <Stack spacing={0.75}>
      {(blocks || []).map((block, index) => {
        if (block.type === 'bullet-list' || block.type === 'ordered-list') {
          const ListTag = block.type === 'ordered-list' ? 'ol' : 'ul';
          return (
            <Box
              key={`list-${index}`}
              component={ListTag}
              sx={{
                m: 0,
                pl: 2.5,
                '& li': { mb: 0.35 },
              }}
            >
              {block.items.map((item, itemIndex) => (
                <Box key={itemIndex} component="li">
                  <InlineMarkdownText text={item} />
                </Box>
              ))}
            </Box>
          );
        }
        return (
          <InlineMarkdownText key={`para-${index}`} text={block.text || ''} />
        );
      })}
    </Stack>
  );
}

function AssistantMessageContent({ content }) {
  const sections = useMemo(() => formatAssistantSections(content), [content]);

  return (
    <Stack spacing={1}>
      {sections.map((section, index) => {
        if (section.type === 'section') {
          return (
            <Box key={`section-${index}`}>
              <InlineMarkdownText
                text={section.title}
                variant="subtitle2"
                sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}
              />
              <AssistantBlocks blocks={section.blocks} />
            </Box>
          );
        }
        return (
          <AssistantBlocks key={`paragraph-${index}`} blocks={section.blocks} />
        );
      })}
    </Stack>
  );
}

function makeGreeting() {
  return {
    role: 'assistant',
    content: 'Hello, I am the M&E AI Assistant. Ask workflow questions, request live summaries, or say "create a well formatted report" to download a professional Word or PDF document for the page you are on.',
  };
}

function filenameFromDisposition(disposition, fallback) {
  const match = String(disposition || '').match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

function downloadReportBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  const defaultReportType = useMemo(() => getDefaultReportType(pageContext || {}), [pageContext]);
  const defaultReportPrompt = useMemo(() => getDefaultReportPrompt(pageContext || {}), [pageContext]);
  const [reportPrompt, setReportPrompt] = useState(defaultReportPrompt);
  const [reportType, setReportType] = useState(defaultReportType);
  const [reportOutput, setReportOutput] = useState('docx');
  const [reportGenerating, setReportGenerating] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    setReportType(defaultReportType);
    setReportPrompt(defaultReportPrompt);
  }, [defaultReportType, defaultReportPrompt]);

  const starterMessages = useMemo(
    () => getAIStarterMessages(pageContext || {}),
    [pageContext]
  );

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
  }, [messages, sending, reportGenerating]);

  const runProfessionalReport = async ({
    prompt,
    reportType: type,
    output,
    sourceMessage = '',
  }) => {
    const response = await aiAssistantService.generateReport({
      prompt,
      reportType: type,
      output,
      context: pageContext,
    });
    const extension = output === 'pdf' ? 'pdf' : 'docx';
    const fileName = filenameFromDisposition(
      response.headers?.['content-disposition'],
      `ai-generated-report.${extension}`
    );
    const blob = new Blob([response.data], {
      type: output === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    downloadReportBlob(blob, fileName);
    return {
      fileName,
      output,
      reportType: type,
      prompt: sourceMessage || prompt,
      dataContextUsed: String(response.headers?.['x-ai-data-context-used'] || '').toLowerCase() === 'true',
    };
  };

  const handleDownloadReportVariant = async (message, output) => {
    if (reportGenerating || !message?.reportMeta) return;
    setReportGenerating(true);
    setError('');
    try {
      const result = await runProfessionalReport({
        prompt: buildReportPromptFromChat(message.reportMeta.prompt, pageContext),
        reportType: message.reportMeta.reportType,
        output,
        sourceMessage: message.reportMeta.prompt,
      });
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Downloaded ${output.toUpperCase()} report: ${result.fileName}`,
        reportGenerated: true,
        reportMeta: {
          ...message.reportMeta,
          fileName: result.fileName,
          lastOutput: output,
        },
      }]);
    } catch (err) {
      const errMessage = err?.response?.data?.message || err?.message || 'AI report generation failed.';
      setError(errMessage);
    } finally {
      setReportGenerating(false);
    }
  };

  const sendPrompt = async (promptText = input) => {
    const text = String(promptText || '').trim();
    if (!text || sending || reportGenerating) return;

    const nextMessages = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setError('');

    if (detectReportIntent(text)) {
      const type = inferReportType(text, pageContext);
      const output = detectReportOutputFormat(text);
      const reportPromptText = buildReportPromptFromChat(text, pageContext);

      setSending(true);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Preparing your ${type} as a professional ${output.toUpperCase()} document using live data from this screen...`,
          reportGenerating: true,
        },
      ]);

      try {
        const result = await runProfessionalReport({
          prompt: reportPromptText,
          reportType: type,
          output,
          sourceMessage: text,
        });
        setMessages((prev) => {
          const withoutPlaceholder = prev.filter((message) => !message.reportGenerating);
          return [
            ...withoutPlaceholder,
            {
              role: 'assistant',
              content: [
                `Your ${type} has been generated and downloaded as ${result.fileName}.`,
                'The document uses the official system template with executive summary, sections, tables, and recommendations.',
                'Use the buttons below if you need another format.',
              ].join('\n\n'),
              reportGenerated: true,
              dataContextUsed: result.dataContextUsed,
              reportMeta: {
                prompt: text,
                reportType: type,
                fileName: result.fileName,
                lastOutput: output,
              },
            },
          ];
        });
      } catch (err) {
        const errMessage = err?.response?.data?.message || err?.message || 'AI report generation failed.';
        setError(errMessage);
        setMessages((prev) => {
          const withoutPlaceholder = prev.filter((message) => !message.reportGenerating);
          return [...withoutPlaceholder, { role: 'assistant', content: errMessage }];
        });
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    try {
      const response = await aiAssistantService.sendMessage({
        messages: nextMessages,
        context: pageContext,
      });
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: response?.answer || 'I could not generate a response.',
        dataContextUsed: Boolean(response?.dataContextUsed),
        dataSources: Array.isArray(response?.dataSources) ? response.dataSources : [],
      }]);
    } catch (err) {
      const errMessage = err?.response?.data?.message || err?.message || 'AI assistant request failed.';
      setError(errMessage);
      setMessages((prev) => [...prev, { role: 'assistant', content: errMessage }]);
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

  const handleGenerateReport = async () => {
    const prompt = String(reportPrompt || '').trim();
    if (!prompt || reportGenerating) return;
    setReportGenerating(true);
    setError('');
    try {
      const result = await runProfessionalReport({
        prompt: buildReportPromptFromChat(prompt, pageContext),
        reportType,
        output: reportOutput,
        sourceMessage: prompt,
      });
      setReportOpen(false);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Professional ${reportOutput.toUpperCase()} report generated and downloaded (${result.fileName}).`,
          reportGenerated: true,
          reportMeta: {
            prompt,
            reportType,
            fileName: result.fileName,
            lastOutput: reportOutput,
          },
        },
      ]);
    } catch (err) {
      const errMessage = err?.response?.data?.message || err?.message || 'AI report generation failed.';
      setError(errMessage);
    } finally {
      setReportGenerating(false);
    }
  };

  const busy = sending || reportGenerating;

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
          aria-label="Open AI assistant"
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
              Workflow, reporting, and system guidance
            </Typography>
          </Box>
          <IconButton onClick={() => setOpen(false)} aria-label="Close AI assistant">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
          {statusLoaded && !status.configured ? (
            <Alert severity="warning">
              AI assistance is not configured yet. Add the assistant service credentials and restart the API.
            </Alert>
          ) : null}
          {statusLoaded && status.configured ? (
            <Alert severity="info">
              Ask questions for live summaries, or request a &quot;well formatted report&quot; to download Word/PDF.
              Reports use data from the screen you are on
              {pageContext?.pageType ? ` (${pageContext.pageType.replace(/-/g, ' ')})` : pageContext?.path ? ` (${pageContext.path})` : ''}.
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
                      }}
                    >
                      {message.reportGenerating ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <CircularProgress size={16} />
                          <Typography variant="body2">{message.content}</Typography>
                        </Box>
                      ) : isUser ? (
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{message.content}</Typography>
                      ) : (
                        <AssistantMessageContent content={message.content} />
                      )}
                      {!isUser && message.dataContextUsed ? (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                          <Chip size="small" label="Live data used" color="success" variant="outlined" />
                          {(message.dataSources || []).slice(0, 6).map((source) => (
                            <Chip
                              key={source}
                              size="small"
                              label={formatDataSourceLabel(source)}
                              variant="outlined"
                            />
                          ))}
                        </Stack>
                      ) : null}
                      {!isUser && message.reportGenerated && message.reportMeta ? (
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<DownloadIcon />}
                            disabled={busy}
                            onClick={() => handleDownloadReportVariant(message, 'docx')}
                          >
                            Download Word
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<DownloadIcon />}
                            disabled={busy}
                            onClick={() => handleDownloadReportVariant(message, 'pdf')}
                          >
                            Download PDF
                          </Button>
                        </Stack>
                      ) : null}
                    </Paper>
                  </Box>
                );
              })}
              {sending && !messages.some((message) => message.reportGenerating) ? (
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
              {starterMessages.map((starter) => (
                <Button
                  key={starter}
                  size="small"
                  variant="outlined"
                  onClick={() => sendPrompt(starter)}
                  disabled={busy || (statusLoaded && !status.configured)}
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
              disabled={busy || (statusLoaded && !status.configured)}
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
              placeholder="Ask a question, or say: create a well formatted report for this page..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy || (statusLoaded && !status.configured)}
            />
            <Button
              variant="contained"
              onClick={() => sendPrompt()}
              disabled={!input.trim() || busy || (statusLoaded && !status.configured)}
              sx={{ minWidth: 44, height: 40 }}
            >
              {busy ? <CircularProgress size={18} color="inherit" /> : <SendIcon fontSize="small" />}
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
              AI drafts structured content from this screen&apos;s data, then formats the final Word/PDF document.
              Default report type: {defaultReportType}.
            </Alert>
            <TextField
              select
              fullWidth
              size="small"
              label="Report type"
              value={reportType}
              onChange={(event) => setReportType(event.target.value)}
            >
              {REPORT_TYPE_OPTIONS.map((type) => (
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
