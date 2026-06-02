// src/configs/strategicPlanningLabels.js

const strategicPlanningLabels = {
  strategicPlan: {
    singular: 'Strategic Plan',
    plural: 'Strategic Plans',
    fields: {
      cidpid: 'Plan ID',
      cidpName: 'Plan Name',
      startDate: 'Start Date',
      endDate: 'End Date',
      vision: 'Vision',
      mission: 'Mission',
      strategicGoal: 'Strategic Goal',
      // Add other fields from strategicplans here
    },
  },
  program: {
    singular: 'Programme',
    plural: 'Programmes',
    // Keep legacy import aliases, but display CIDP programmes as programmes in the UI.
    altNames: ['Programme', 'Program', 'Strategic Objective'],
    fields: {
      programme: 'Programme', // This is the field name in your DB
      departmentId: 'Department',
      sectionId: 'Section',
      needsPriorities: 'Needs & Priorities',
      strategies: 'Strategies',
      objectives: 'Objectives',
      outcomes: 'Outcomes',
      remarks: 'Remarks',
      // Add other fields from programs here
    },
  },
  subprogram: {
    singular: 'Sub-programme',
    plural: 'Sub-programmes',
    // Define alternative names that clients might use for "Subprogram"
    altNames: ['Initiative', 'Action Plan', 'Project Activity'],
    fields: {
      subProgramme: 'Sub-programme', // This is the field name in your DB
      keyOutcome: 'Key Outcome',
      planningIndicator: 'KPI / indicator',
      kpi: 'KPI',
      unitOfMeasure: 'Unit of Measure',
      baseline: 'Baseline',
      yr1Targets: 'Year 1 Targets',
      yr2Targets: 'Year 2 Targets',
      yr3Targets: 'Year 3 Targets',
      yr4Targets: 'Year 4 Targets',
      yr5Targets: 'Year 5 Targets',
      yr1Budget: 'Year 1 Budget',
      yr2Budget: 'Year 2 Budget',
      yr3Budget: 'Year 3 Budget',
      yr4Budget: 'Year 4 Budget',
      yr5Budget: 'Year 5 Budget',
      totalBudget: 'Total Budget',
      remarks: 'Remarks',
      // Add other fields from subprograms here
    },
  },
  // Add other sections if you have more entities to label
  attachments: {
    title: 'Attachments',
    uploadButton: 'Upload Document ded',
    noDocuments: 'No documents attached to this {entityType}.',
    uploadDialogTitle: 'Upload New Document',
    descriptionLabel: 'Description (Optional)',
    chooseFileButton: 'Choose File',
  }
};

export default strategicPlanningLabels;
