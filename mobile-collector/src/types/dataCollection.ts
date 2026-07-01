export type ChecklistItemType =
  | 'yes_no'
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'photo'
  | 'location'
  | 'area_location'
  | 'user'
  | 'progress_status'
  | 'project_milestones'
  | 'project_bq_items'
  | 'indicator';

export type VisitSubjectType = 'project' | 'rri_programme';

export interface ChecklistPhotoEntry {
  fileId?: number;
  url?: string;
  fileName?: string;
  localUri?: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  capturedAt?: string;
}

export interface ChecklistPhotoAnswer {
  photos: ChecklistPhotoEntry[];
}

export interface ChecklistLocationAnswer {
  lat: number;
  lng: number;
  accuracy?: number | null;
  capturedAt?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  type: ChecklistItemType;
  required?: boolean;
  options?: string[];
  maxPhotos?: number;
  requireGps?: boolean;
  allowMultiple?: boolean;
  /** For type `user`: which attribute to emphasize (stored object always includes full profile). */
  userDisplay?: 'name' | 'email' | 'role';
  showIf?: {
    itemId?: string;
    op?: string;
    value?: unknown;
    values?: string[];
    all?: Array<{
      itemId: string;
      op?: string;
      value?: unknown;
      values?: string[];
    }>;
    any?: Array<{
      itemId: string;
      op?: string;
      value?: unknown;
      values?: string[];
    }>;
  };
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
  allowedSubjectTypes?: VisitSubjectType[];
  updatedAt?: string;
}

export interface RriProgrammeLite {
  programmeId: number;
  name: string;
  status?: string;
  sector?: string;
}

export interface ProjectLite {
  id: number;
  projectName: string;
  status?: string;
  departmentName?: string;
}

export interface DataCollectionAttachment {
  fileId: number;
  url: string;
  fileName: string;
  mimeType?: string;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  capturedAt?: string;
}

export interface DataCollectionSubmission {
  submissionId: number;
  templateId: number;
  templateName?: string;
  subjectType?: VisitSubjectType;
  projectId?: number | null;
  rriProgrammeId?: number | null;
  rriProgrammeName?: string | null;
  visitDate?: string | null;
  title?: string | null;
  answers: Record<string, unknown>;
  progressStatus?: string | null;
  workflowStatus?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PendingSubmission {
  localId: string;
  templateId: number;
  templateName: string;
  subjectType?: VisitSubjectType;
  projectId?: number;
  projectName?: string;
  rriProgrammeId?: number;
  rriProgrammeName?: string;
  visitDate: string;
  title: string;
  answers: Record<string, unknown>;
  createdAt: string;
  status: 'pending' | 'failed';
  lastError?: string;
}

export interface VisitDraft {
  templateId?: number;
  subjectType?: VisitSubjectType;
  projectId?: number;
  rriProgrammeId?: number;
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
