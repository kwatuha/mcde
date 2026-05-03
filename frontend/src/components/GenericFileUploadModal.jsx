import React, { useState, useCallback, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Box, Typography, Button, List, ListItem, ListItemText, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert, CircularProgress,
  FormControl, InputLabel, Select, MenuItem,
  ListItemIcon, Paper, Stack, FormControlLabel, Checkbox,
} from '@mui/material';
import { CloudUpload as CloudUploadIcon, InsertDriveFile as DocumentIcon, Photo as PhotoIcon } from '@mui/icons-material';
import { useTheme, alpha } from '@mui/material/styles';
import { tokens } from '../pages/dashboard/theme.js';

/**
 * A reusable modal component for uploading files.
 * @param {boolean} open - Controls the visibility of the modal.
 * @param {function} onClose - Function to call when the modal is closed.
 * @param {string} title - The title of the upload dialog.
 * @param {object} uploadConfig - Configuration for the upload process.
 * - {array} options - Array of objects for the dropdown selector { value, label }.
 * - {string} optionsLabel - Label for the dropdown selector.
 * - {string} apiCallKey - The key to append to the FormData for the selected option.
 * - {object} description - Optional configuration for a description text field.
 * @param {function} submitFunction - The API service function to call for the upload. It should accept a FormData object.
 * @param {object} additionalFormData - An object of additional key-value pairs to append to the FormData.
 */
function GenericFileUploadModal({ open, onClose, title, uploadConfig, submitFunction, additionalFormData }) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedOption, setSelectedOption] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  // NEW: State to control the accepted file types for the file input
  const [acceptedFileTypes, setAcceptedFileTypes] = useState('');
  const [followUpFlagChecked, setFollowUpFlagChecked] = useState(true);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(false);
    setLoading(false);
    setSelectedFiles([]);
    setSelectedOption('');
    setDescription('');
    setAcceptedFileTypes('');
    setFollowUpFlagChecked(uploadConfig?.followUpFlag?.defaultChecked !== false);
  }, [open, uploadConfig?.followUpFlag?.defaultChecked]);

  const handleFileChange = useCallback((event) => {
    setSelectedFiles(Array.from(event.target.files));
  }, []);

  const handleUploadClick = () => {
    fileInputRef.current.click();
  };

  const handleOptionChange = useCallback(
    (e) => {
      const selectedValue = e.target.value;
      setSelectedOption(selectedValue);
      if (selectedValue.startsWith('photo')) {
        setAcceptedFileTypes('image/*');
      } else {
        setAcceptedFileTypes('');
      }
      const types = uploadConfig?.followUpFlag?.documentTypeValues;
      if (Array.isArray(types) && types.includes(selectedValue)) {
        setFollowUpFlagChecked(uploadConfig.followUpFlag.defaultChecked !== false);
      } else {
        setFollowUpFlagChecked(false);
      }
    },
    [uploadConfig?.followUpFlag]
  );
  
  const handleDescriptionChange = useCallback((e) => {
    setDescription(e.target.value);
  }, []);

  const handleRemoveFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (fileType) => {
    if (fileType.startsWith('image/')) {
      return <PhotoIcon sx={{ color: colors.greenAccent[500] }} />;
    }
    return <DocumentIcon sx={{ color: colors.blueAccent[500] }} />;
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one file to upload.');
      return;
    }
    if (uploadConfig.options && !selectedOption) {
      setError(`Please select a ${uploadConfig.optionsLabel}.`);
      return;
    }
    
    // 🔧 ADDITIONAL VALIDATION: Check required fields
    if (!validateRequiredFields()) {
      setError('Missing required information. Please check all fields and try again.');
      return;
    }

    // NEW: Add validation to check if selected files match the accepted type
    if (acceptedFileTypes === 'image/*' && !selectedFiles.every(file => file.type.startsWith('image/'))) {
      setError('Please upload only image files for this document type.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();

      // 🔧 FIX: Smart field handling to avoid duplicates
      // First, add all additional data EXCEPT documentType (we'll handle it separately)
      for (const key in additionalFormData) {
        if (Object.prototype.hasOwnProperty.call(additionalFormData, key) && key !== 'documentType') {
          formData.append(key, additionalFormData[key]);
        }
      }

      // 🔧 FIX: Handle documentType properly - prioritize user selection over default
      let finalDocumentType = 'other'; // fallback
      
      if (uploadConfig.options && selectedOption) {
        // User selected a document type from the form
        finalDocumentType = selectedOption;
        // 🔧 CRITICAL FIX: Only append if apiCallKey is NOT 'documentType' to avoid duplicates
        if (uploadConfig.apiCallKey !== 'documentType') {
          formData.append(uploadConfig.apiCallKey, selectedOption);
          console.log(`🔧 Appending ${uploadConfig.apiCallKey}:`, selectedOption);
        } else {
          console.log(`🔧 Skipping duplicate append for apiCallKey 'documentType' to avoid SQL error`);
        }
      } else if (additionalFormData.documentType) {
        // Use the document type from additional data
        finalDocumentType = additionalFormData.documentType;
      }
      
      // Always append the final documentType (this is the single source of truth)
      formData.append('documentType', finalDocumentType);
      console.log(`🔧 Appending documentType:`, finalDocumentType);
      
      // 🔧 SAFETY CHECK: Ensure no duplicate fields exist
      const formDataKeys = [];
      const entries = Array.from(formData.entries());
      entries.forEach(([key, value]) => {
        if (formDataKeys.includes(key)) {
          console.warn(`⚠️ Duplicate field detected: ${key}`);
          console.warn(`⚠️ First value: ${formDataKeys.indexOf(key)}`);
          console.warn(`⚠️ Second value: ${value}`);
        } else {
          formDataKeys.push(key);
        }
      });
      
      // 🔧 CRITICAL CHECK: Ensure documentType appears only once
      const documentTypeValues = entries.filter(([key]) => key === 'documentType').map(([, value]) => value);
      if (documentTypeValues.length > 1) {
        console.error(`🚨 CRITICAL ERROR: documentType appears ${documentTypeValues.length} times!`);
        console.error(`🚨 Values:`, documentTypeValues);
        throw new Error(`Document type field appears multiple times: ${documentTypeValues.join(', ')}`);
      }
      
      // NEW: Append the description if configured
      if (uploadConfig.description && description) {
        formData.append('description', description);
      }

      const flagTypes = uploadConfig?.followUpFlag?.documentTypeValues;
      const flagField = uploadConfig?.followUpFlag?.formFieldName || 'isFlagged';
      if (Array.isArray(flagTypes) && flagTypes.includes(finalDocumentType)) {
        formData.append(flagField, followUpFlagChecked ? 'true' : 'false');
      }

      // 🔧 FIX: Add missing required fields that the backend expects
      // Ensure documentCategory is always present
      if (!formData.has('documentCategory')) {
        formData.append('documentCategory', 'general');
      }
      
      // Add status field (default to 'pending_review' for new uploads - matches database enum)
      if (!formData.has('status')) {
        formData.append('status', 'pending_review');
      }
      
      // Ensure projectId is always present (either from config or as fallback)
      if (!formData.has('projectId') && additionalFormData.projectId) {
        formData.append('projectId', additionalFormData.projectId);
      }

      // Append the files under the key 'documents'
      // 🐛 FIX: This is the critical part that ensures multer receives the file array
      selectedFiles.forEach(file => {
        formData.append('documents', file);
      });

      // Backend stores originalFileName on project_documents (first file when batching)
      if (selectedFiles.length > 0 && !formData.has('originalFileName')) {
        formData.append('originalFileName', selectedFiles[0].name);
      }

      // 🔍 DEBUGGING: Enhanced logging to check FormData content before sending
      console.log('📋 FormData Contents:');
      console.log('📁 Files to upload:', selectedFiles.length);
      console.log('🏷️ Selected Option:', selectedOption);
      console.log('🏷️ Final Document Type:', finalDocumentType);
      console.log('📝 Description:', description);
      console.log('📊 Additional Data (filtered):', Object.fromEntries(
        Object.entries(additionalFormData).filter(([key]) => key !== 'documentType')
      ));
      
      console.log('🔍 Final FormData entries:');
      const finalEntries = Array.from(formData.entries());
      finalEntries.forEach(([key, value]) => {
        console.log(`  ${key}:`, value);
      });
      
      console.log('✅ FormData validation complete - No duplicate fields');

      // The submitFunction will handle the API call
      await submitFunction(formData);

      setSuccess(true);
      setSelectedFiles([]);
      setSelectedOption('');
      setDescription('');
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      console.error('Error uploading document:', err);
      const data = err.response?.data;
      const apiMsg =
        (typeof data?.message === 'string' && data.message) ||
        (typeof data?.error === 'string' && data.error) ||
        (typeof data?.details === 'string' && data.details) ||
        (data?.error && typeof data.error === 'object' && data.error.message);
      setError(apiMsg || err.message || 'Failed to upload document.');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = selectedFiles.length > 0 && (!uploadConfig.options || selectedOption);
  
  // 🔧 ADDITIONAL VALIDATION: Check if all required fields are present
  const validateRequiredFields = () => {
    const requiredFields = ['projectId', 'documentType', 'documentCategory', 'status'];
    const missingFields = [];
    
    // Check if additionalFormData has required fields
    requiredFields.forEach(field => {
      if (!additionalFormData[field] && field !== 'documentType') {
        missingFields.push(field);
      }
    });
    
    // Check if documentType will be set
    if (uploadConfig.options && !selectedOption) {
      missingFields.push('documentType');
    }
    
    if (missingFields.length > 0) {
      console.warn('⚠️ Missing required fields:', missingFields);
      return false;
    }
    
    return true;
  };

  const sectionPaperSx = {
    p: 1.5,
    borderRadius: 1,
    bgcolor: 'background.paper',
    borderColor: 'divider',
    borderWidth: 1,
    borderStyle: 'solid',
  };

  const listRowSx = {
    mb: 0.5,
    py: 0.5,
    px: 1,
    borderRadius: 1,
    border: '1px solid',
    borderColor: 'divider',
    bgcolor: (t) =>
      t.palette.mode === 'dark'
        ? alpha(t.palette.common.white, 0.06)
        : alpha(t.palette.text.primary, 0.04),
    '&:hover': {
      bgcolor: (t) =>
        t.palette.mode === 'dark'
          ? alpha(t.palette.common.white, 0.1)
          : alpha(t.palette.text.primary, 0.07),
    },
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      scroll="paper"
      sx={{
        '& .MuiDialog-paper': {
          borderRadius: 2,
          maxHeight: 'min(520px, 88vh)',
          display: 'flex',
          flexDirection: 'column',
          m: { xs: 1, sm: 2 },
          boxShadow:
            theme.palette.mode === 'dark'
              ? '0 12px 32px rgba(0,0,0,0.65)'
              : '0 8px 24px rgba(0,0,0,0.12)',
        },
      }}
    >
      <DialogTitle
        sx={{
          flexShrink: 0,
          py: 1.25,
          px: 2,
          background: `linear-gradient(135deg, ${colors.blueAccent[400]}, ${colors.primary[500]})`,
          color: '#fff',
          fontWeight: 700,
          borderBottom: `2px solid ${alpha('#fff', 0.25)}`,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {title}
        </Typography>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          px: 2,
          py: 1.5,
          bgcolor: 'background.default',
          '& .MuiDivider-root': { borderColor: 'divider' },
        }}
      >
        {error && (
          <Alert severity="error" sx={{ mb: 1.5, py: 0.5, '& .MuiAlert-message': { color: 'text.primary' } }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {error}
            </Typography>
            {error.includes('Missing required information') && (
              <Typography variant="caption" component="div" sx={{ mt: 0.5, color: 'text.secondary' }}>
                Required: projectId, documentType, documentCategory, status
              </Typography>
            )}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 1.5, py: 0.5, '& .MuiAlert-message': { color: 'text.primary' } }}>
            Upload successful.
          </Alert>
        )}

        <Stack spacing={1.25}>
          <Paper variant="outlined" sx={sectionPaperSx}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
              Files
            </Typography>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              multiple
              accept={acceptedFileTypes}
            />

            <Button
              variant="outlined"
              size="small"
              startIcon={<CloudUploadIcon />}
              onClick={handleUploadClick}
              fullWidth
              sx={{
                py: 0.75,
                borderColor: colors.blueAccent[400],
                color: colors.blueAccent[500],
                fontWeight: 600,
                '&:hover': {
                  borderColor: colors.blueAccent[500],
                  bgcolor: alpha(colors.blueAccent[500], 0.08),
                },
              }}
            >
              {selectedFiles.length > 0 ? `${selectedFiles.length} selected` : 'Choose file(s)'}
            </Button>

            {selectedFiles.length > 0 && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                  Selected
                </Typography>
                <List dense disablePadding sx={{ maxHeight: 120, overflowY: 'auto' }}>
                  {selectedFiles.map((file, index) => (
                    <ListItem key={index} sx={listRowSx}>
                      <ListItemIcon sx={{ minWidth: 36 }}>{getFileIcon(file.type)}</ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography noWrap variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                            {file.name}
                          </Typography>
                        }
                        secondary={
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {formatFileSize(file.size)}
                          </Typography>
                        }
                      />
                      <IconButton size="small" onClick={() => handleRemoveFile(index)} aria-label="Remove file" sx={{ color: 'error.main' }}>
                        ✕
                      </IconButton>
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Paper>

          {uploadConfig.options && (
            <Paper variant="outlined" sx={sectionPaperSx}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                Document type
              </Typography>

              <FormControl fullWidth size="small">
                <InputLabel id="document-type-label">{uploadConfig.optionsLabel}</InputLabel>
                <Select
                  labelId="document-type-label"
                  label={uploadConfig.optionsLabel}
                  value={selectedOption}
                  onChange={handleOptionChange}
                  required
                  sx={{ bgcolor: 'background.paper' }}
                >
                  {uploadConfig.options.map((option) => (
                    <MenuItem key={option.value} value={option.value} dense>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {option.label}
                      </Typography>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Paper>
          )}

          {uploadConfig.followUpFlag &&
            Array.isArray(uploadConfig.followUpFlag.documentTypeValues) &&
            uploadConfig.followUpFlag.documentTypeValues.includes(selectedOption) && (
              <Paper variant="outlined" sx={sectionPaperSx}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                  Follow-up
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={followUpFlagChecked}
                      onChange={(e) => setFollowUpFlagChecked(e.target.checked)}
                      color="warning"
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {uploadConfig.followUpFlag.label ||
                        'Flag this upload for compliance / follow-up (shows in Flagged tab)'}
                    </Typography>
                  }
                />
              </Paper>
            )}

          {uploadConfig.description && (
            <Paper variant="outlined" sx={sectionPaperSx}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                Description (optional)
              </Typography>

              <TextField
                fullWidth
                size="small"
                label={uploadConfig.description.label}
                placeholder={uploadConfig.description.placeholder}
                value={description}
                onChange={handleDescriptionChange}
                multiline
                minRows={2}
                maxRows={4}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' } }}
              />
            </Paper>
          )}
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          flexShrink: 0,
          px: 2,
          py: 1,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderTopColor: 'divider',
          gap: 1,
        }}
      >
        <Button onClick={onClose} variant="outlined" size="small" color="inherit">
          Cancel
        </Button>

        <Button
          onClick={handleUploadSubmit}
          variant="contained"
          size="small"
          disabled={loading || !isFormValid}
          startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <CloudUploadIcon />}
          sx={{
            bgcolor: colors.greenAccent[500],
            fontWeight: 700,
            '&:hover': { bgcolor: colors.greenAccent[600] },
            '&:disabled': { bgcolor: 'action.disabledBackground' },
          }}
        >
          {loading ? 'Uploading…' : 'Upload'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

GenericFileUploadModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string.isRequired,
  uploadConfig: PropTypes.shape({
    options: PropTypes.arrayOf(PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })),
    optionsLabel: PropTypes.string,
    apiCallKey: PropTypes.string,
    description: PropTypes.shape({
        label: PropTypes.string,
        placeholder: PropTypes.string,
    }),
    followUpFlag: PropTypes.shape({
      documentTypeValues: PropTypes.arrayOf(PropTypes.string),
      formFieldName: PropTypes.string,
      label: PropTypes.string,
      defaultChecked: PropTypes.bool,
    }),
  }),
  submitFunction: PropTypes.func.isRequired,
  additionalFormData: PropTypes.object,
};

GenericFileUploadModal.defaultProps = {
  additionalFormData: {},
};

export default GenericFileUploadModal;
