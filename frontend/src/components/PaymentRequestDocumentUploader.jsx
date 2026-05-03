import React, { useState } from 'react';
import PropTypes from 'prop-types';
import GenericFileUploadModal from './GenericFileUploadModal';
import apiService from '../api';

const documentTypeOptions = [
    { 
        value: 'invoice', 
        label: 'Invoice',
        description: 'Official invoice from vendor or contractor',
        icon: '🧾'
    },
    { 
        value: 'photo_payment', 
        label: 'Progress Photo',
        description: 'Visual evidence of completed work',
        icon: '📸'
    },
    { 
        value: 'inspection_report', 
        label: 'Inspection Report',
        description: 'Quality assurance and compliance documentation',
        icon: '🔍'
    },
    { 
        value: 'receipt', 
        label: 'Receipt',
        description: 'Proof of payment or expense',
        icon: '💰'
    },
    { 
        value: 'contract_agreement', 
        label: 'Contract Agreement',
        description: 'Terms and conditions documentation',
        icon: '📋'
    },
    { 
        value: 'other', 
        label: 'Other Document',
        description: 'Additional supporting documentation',
        icon: '📄'
    }
];

const PaymentRequestDocumentUploader = ({ open, onClose, requestId, projectId, onUploadSuccess }) => {
    
    const uploadConfig = {
        options: documentTypeOptions,
        optionsLabel: 'Document Type',
        apiCallKey: 'documentType',
        description: {
            label: 'Document Description',
            placeholder: 'Provide a brief description of this document or photo. Include key details like dates, amounts, or specific work completed...',
        }
    };

    const submitUpload = async (formData) => {
        try {
            const result = await apiService.documents.uploadDocument(formData);
            
            // Call the success callback if provided
            if (onUploadSuccess) {
                onUploadSuccess(result);
            }
            
            return result;
        } catch (error) {
            console.error('Error uploading document:', error);
            throw error;
        }
    };

    const additionalData = {
        projectId: projectId,
        requestId: requestId,
        documentCategory: 'payment', // The category is 'payment' for all these documents
        status: 'pending_review', // Document status - matches database enum values
        uploadDate: new Date().toISOString(),
        uploadSource: 'payment_request_modal',
        // Additional metadata for better tracking
        uploadedBy: 'user', // Will be set by backend based on auth
        isActive: true
        // Note: documentType is handled by the modal based on user selection
    };

    return (
        <GenericFileUploadModal
            open={open}
            onClose={onClose}
            title="Attach Documents to Payment Request"
            uploadConfig={uploadConfig}
            submitFunction={submitUpload}
            additionalFormData={additionalData}
        />
    );
};

PaymentRequestDocumentUploader.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    requestId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    projectId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    onUploadSuccess: PropTypes.func, // Callback function when upload is successful
};

PaymentRequestDocumentUploader.defaultProps = {
    projectId: null,
    onUploadSuccess: null,
};

export default PaymentRequestDocumentUploader;
