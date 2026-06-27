export type ChecklistItemType =
  | 'yes_no'
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multi_select';

export interface ChecklistItem {
  id: string;
  label: string;
  type: ChecklistItemType;
  required?: boolean;
  options?: string[];
}

export interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface TemplateStructure {
  sections: ChecklistSection[];
}

export interface DataCollectionTemplate {
  templateId: number;
  name: string;
  description?: string | null;
  templateCategory?: string;
  structure: TemplateStructure;
  isActive?: boolean;
  updatedAt?: string;
}

export interface ProjectLite {
  id: number;
  projectName: string;
  status?: string;
  departmentName?: string;
}

export interface DataCollectionSubmission {
  submissionId: number;
  templateId: number;
  templateName?: string;
  projectId: number;
  visitDate?: string | null;
  title?: string | null;
  answers: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface PendingSubmission {
  localId: string;
  templateId: number;
  templateName: string;
  projectId: number;
  projectName: string;
  visitDate: string;
  title: string;
  answers: Record<string, unknown>;
  createdAt: string;
  status: 'pending' | 'failed';
  lastError?: string;
}

export interface VisitDraft {
  templateId?: number;
  projectId?: number;
  visitDate?: string;
  title?: string;
  answers?: Record<string, unknown>;
  savedAt?: string;
}

export interface LoginOtpChallenge {
  otpRequired: true;
  otpChallengeId: string;
  otpChannel?: string;
  maskedPhone?: string;
  message?: string;
}
