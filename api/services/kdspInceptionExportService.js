const PDFDocument = require('pdfkit');
const {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} = require('docx');
const { runQuery, runQueryOptional } = require('../utils/kdspDbHelpers');
const {
  drawPdfkitOfficialHeader,
  buildDocxOfficialHeaderParagraphs,
} = require('../utils/countyLogo');

const PROJECT_OVERVIEW_SQL = `
  SELECT
    p.project_id AS id,
    p.name AS "projectName",
    p.description AS "projectDescription",
    p.progress->>'status' AS status,
    p.sector AS sector,
    (p.timeline->>'start_date')::date AS "startDate",
    (p.timeline->>'expected_completion_date')::date AS "endDate",
    p.timeline->>'financial_year' AS "financialYear",
    (p.budget->>'allocated_amount_kes')::numeric AS "allocatedBudget",
    p.notes->>'objective' AS objective,
    p.notes->>'expected_output' AS "expectedOutput",
    p.notes->>'expected_outcome' AS "expectedOutcome",
    p.implementing_agency AS directorate,
    proj_cat."categoryName" AS "categoryName"
  FROM projects p
  LEFT JOIN categories proj_cat ON proj_cat."categoryId" = p.category_id
    AND COALESCE(proj_cat.voided, false) = false
  WHERE p.project_id = ?
    AND COALESCE(p.voided, false) = false
  LIMIT 1
`;

function asBool(value) {
  return value === true || value === 1 || value === '1';
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return 'N/A';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `KES ${n.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

function bulletLines(text) {
  if (!text) return [];
  return String(text).split('\n').map((line) => line.trim()).filter(Boolean);
}

async function loadInceptionExportData(projectId) {
  const [
    projectRows,
    conceptNote,
    needsAssessment,
    financials,
    fyBreakdown,
    sustainability,
    implementationPlan,
    mAndE,
    risks,
    stakeholders,
    readiness,
    hazardAssessment,
    climateRisk,
    esohsgScreening,
    bqSummary,
  ] = await Promise.all([
    runQuery(PROJECT_OVERVIEW_SQL, [projectId]),
    runQueryOptional('SELECT * FROM project_concept_notes WHERE "projectId" = ?', [projectId]),
    runQueryOptional('SELECT * FROM project_needs_assessment WHERE "projectId" = ?', [projectId]),
    runQueryOptional('SELECT * FROM project_financials WHERE "projectId" = ?', [projectId]),
    runQueryOptional('SELECT * FROM project_fy_breakdown WHERE "projectId" = ? ORDER BY "financialYear"', [projectId]),
    runQueryOptional('SELECT * FROM project_sustainability WHERE "projectId" = ?', [projectId]),
    runQueryOptional('SELECT * FROM project_implementation_plan WHERE "projectId" = ?', [projectId]),
    runQueryOptional('SELECT * FROM project_m_and_e WHERE "projectId" = ?', [projectId]),
    runQueryOptional('SELECT * FROM project_risks WHERE "projectId" = ?', [projectId]),
    runQueryOptional('SELECT * FROM project_stakeholders WHERE "projectId" = ?', [projectId]),
    runQueryOptional('SELECT * FROM project_readiness WHERE "projectId" = ?', [projectId]),
    runQueryOptional('SELECT * FROM project_hazard_assessment WHERE "projectId" = ?', [projectId]),
    runQueryOptional('SELECT * FROM project_climate_risk WHERE "projectId" = ?', [projectId]),
    runQueryOptional('SELECT * FROM project_esohsg_screening WHERE "projectId" = ?', [projectId]),
    runQueryOptional(
      `SELECT COUNT(*)::int AS "itemCount",
              COALESCE(SUM(budget_amount), 0)::numeric AS "budgetTotal"
       FROM project_bq_items
       WHERE project_id = ? AND COALESCE(voided, false) = false`,
      [projectId]
    ),
  ]);

  if (!projectRows.length) {
    return null;
  }

  return {
    project: projectRows[0],
    conceptNote: conceptNote[0] || null,
    needsAssessment: needsAssessment[0] || null,
    financials: financials[0] || null,
    fyBreakdown,
    sustainability: sustainability[0] || null,
    implementationPlan: implementationPlan[0] || null,
    mAndE: mAndE[0] || null,
    risks,
    stakeholders,
    readiness: readiness[0] || null,
    hazardAssessment,
    climateRisk,
    esohsgScreening: esohsgScreening[0] || null,
    bqSummary: bqSummary[0] || { itemCount: 0, budgetTotal: 0 },
  };
}

function drawPdfOfficialHeader(doc, title) {
  drawPdfkitOfficialHeader(doc, { title });
}

function buildPdfReport(data) {
  const { project } = data;
  const doc = new PDFDocument({ margin: 50 });
  const chunks = [];

  doc.on('data', (chunk) => chunks.push(chunk));

  const addSection = (title, contentCallback) => {
    if (doc.y + 50 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#1F4E79').text(title, { underline: true });
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(10).fillColor('#212529');
    contentCallback();
    doc.moveDown(0.6);
  };

  const addMultiLineText = (text, label) => {
    if (text) {
      doc.font('Helvetica-Bold').fontSize(11).text(`- ${label}:`);
      bulletLines(text).forEach((item) => {
        doc.font('Helvetica').fontSize(10).text(`  • ${item}`);
      });
    } else {
      doc.font('Helvetica').fontSize(11).text(`- ${label}: N/A`);
    }
    doc.moveDown(0.15);
  };

  drawPdfOfficialHeader(doc, 'KDSP II Inception Report');
  doc.font('Helvetica-Bold').fontSize(12).text(project.projectName || 'Untitled project', { align: 'center' });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(9).fillColor('#666666')
    .text(`Generated: ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}`, { align: 'center' });
  doc.moveDown(1);

  addSection('Project Overview', () => {
    doc.text(`Project ID: ${project.id}`);
    doc.text(`Project Category: ${project.categoryName || 'N/A'}`);
    doc.text(`Sector: ${project.sector || 'N/A'}`);
    doc.text(`Status: ${project.status || 'N/A'}`);
    doc.text(`Financial Year: ${project.financialYear || 'N/A'}`);
    doc.text(`Registry Budget: ${formatMoney(project.allocatedBudget)}`);
    doc.text(`BQ Items / Total: ${data.bqSummary.itemCount || 0} / ${formatMoney(data.bqSummary.budgetTotal)}`);
    doc.text(`Dates: ${project.startDate || 'N/A'} to ${project.endDate || 'N/A'}`);
    doc.text(`Directorate: ${project.directorate || 'N/A'}`);
    doc.moveDown(0.3);
    addMultiLineText(project.projectDescription, 'Description');
    addMultiLineText(project.objective, 'Objective');
    addMultiLineText(project.expectedOutput, 'Expected Output');
    addMultiLineText(project.expectedOutcome, 'Expected Outcome');
  });

  addSection('1. Concept Note', () => {
    const cn = data.conceptNote;
    if (!cn) {
      doc.text('No Concept Note data available.');
      return;
    }
    addMultiLineText(cn.situationAnalysis, 'Situation Analysis');
    addMultiLineText(cn.problemStatement, 'Problem Statement');
    addMultiLineText(cn.relevanceProjectIdea, 'Relevance of Project Idea');
    addMultiLineText(cn.scopeOfProject, 'Scope of the Project');
    doc.text(`Project Goal: ${cn.projectGoal || 'N/A'}`);
    doc.text(`Goal Indicator: ${cn.goalIndicator || 'N/A'}`);
    doc.text(`Goal Means of Verification: ${cn.goalMeansVerification || 'N/A'}`);
    doc.text(`Goal Assumptions: ${cn.goalAssumptions || 'N/A'}`);
  });

  addSection('2. Needs Assessment', () => {
    const na = data.needsAssessment;
    if (!na) {
      doc.text('No Needs Assessment data available.');
      return;
    }
    addMultiLineText(na.targetBeneficiaries, 'Target Beneficiaries');
    doc.text(`Estimate End Users: ${na.estimateEndUsers || 'N/A'}`);
    doc.text(`Proposed Physical Capacity: ${na.proposedPhysicalCapacity || 'N/A'}`);
    addMultiLineText(na.mainBenefitsAsset, 'Main Benefits');
    addMultiLineText(na.significantExternalBenefitsNegativeEffects, 'Significant External Effects');
  });

  addSection('3. Financials', () => {
    const fin = data.financials;
    if (!fin) {
      doc.text('No Financials data available.');
      return;
    }
    doc.text(`Consultancy: ${formatMoney(fin.capitalCostConsultancy)}`);
    doc.text(`Construction: ${formatMoney(fin.capitalCostConstruction)}`);
    doc.text(`Recurrent Labor: ${formatMoney(fin.recurrentCostLabor)}`);
    doc.text(`Recurrent Maintenance: ${formatMoney(fin.recurrentCostMaintenance)}`);
    doc.text(`Proposed Source of Financing: ${fin.proposedSourceFinancing || 'N/A'}`);
    doc.text(`Land Expropriation Required: ${asBool(fin.landExpropriationRequired) ? 'Yes' : 'No'}`);
  });

  addSection('4. Financial Year Breakdown', () => {
    if (!data.fyBreakdown.length) {
      doc.text('No Financial Year Breakdown data available.');
      return;
    }
    data.fyBreakdown.forEach((fy) => {
      doc.text(`FY ${fy.financialYear}: ${formatMoney(fy.totalCost)}`);
    });
  });

  addSection('5. Implementation Plan', () => {
    const plan = data.implementationPlan;
    if (!plan) {
      doc.text('No Implementation Plan data available.');
      return;
    }
    addMultiLineText(plan.description, 'Description');
    addMultiLineText(plan.keyPerformanceIndicators, 'KPIs');
    addMultiLineText(plan.responsiblePersons, 'Responsible Persons');
  });

  addSection('6. Monitoring & Evaluation', () => {
    const me = data.mAndE;
    if (!me) {
      doc.text('No M&E data available.');
      return;
    }
    addMultiLineText(me.description, 'Description');
    addMultiLineText(me.mechanismsInPlace, 'Mechanisms in Place');
    addMultiLineText(me.resourcesBudgetary, 'Budgetary Resources');
    addMultiLineText(me.resourcesHuman, 'Human Resources');
    addMultiLineText(me.dataGatheringMethod, 'Data Gathering Method');
    addMultiLineText(me.reportingChannels, 'Reporting Channels');
    addMultiLineText(me.lessonsLearnedProcess, 'Lessons Learned Process');
  });

  addSection('7. Operational Sustainability', () => {
    const sus = data.sustainability;
    if (!sus) {
      doc.text('No Sustainability data available.');
      return;
    }
    addMultiLineText(sus.description, 'Description');
    doc.text(`Owning Organization: ${sus.owningOrganization || 'N/A'}`);
    doc.text(`Annual O&M Cost: ${formatMoney(sus.annualOperationMaintenanceCost)}`);
    addMultiLineText(sus.revenueSources, 'Revenue Sources');
  });

  addSection('8. Risks', () => {
    if (!data.risks.length) {
      doc.text('No Risks data available.');
      return;
    }
    data.risks.forEach((risk) => {
      doc.text(`- ${risk.riskDescription || 'N/A'}`);
      doc.fontSize(9).text(`  Likelihood: ${risk.likelihood || 'N/A'} | Impact: ${risk.impact || 'N/A'}`);
      doc.fontSize(9).text(`  Mitigation: ${risk.mitigationStrategy || 'N/A'}`);
      doc.fontSize(10).moveDown(0.3);
    });
  });

  addSection('9. Stakeholders', () => {
    if (!data.stakeholders.length) {
      doc.text('No Stakeholders data available.');
      return;
    }
    data.stakeholders.forEach((st) => {
      doc.text(`- ${st.stakeholderName || 'N/A'} (${st.levelInfluence || 'N/A'})`);
      doc.fontSize(9).text(`  ${st.engagementStrategy || 'N/A'}`);
      doc.fontSize(10).moveDown(0.2);
    });
  });

  addSection('10. Project Readiness', () => {
    const rd = data.readiness;
    if (!rd) {
      doc.text('No Project Readiness data available.');
      return;
    }
    doc.text(`Designs Prepared: ${asBool(rd.designsPreparedApproved) ? 'Yes' : 'No'}`);
    doc.text(`Land Acquired: ${asBool(rd.landAcquiredSiteReady) ? 'Yes' : 'No'}`);
    doc.text(`Regulatory Approvals: ${asBool(rd.regulatoryApprovalsObtained) ? 'Yes' : 'No'}`);
    addMultiLineText(rd.governmentAgenciesInvolved, 'Government Agencies Involved');
  });

  addSection('11. Hazard Assessment', () => {
    if (!data.hazardAssessment.length) {
      doc.text('No Hazard Assessment data available.');
      return;
    }
    data.hazardAssessment.forEach((ha) => {
      doc.text(`- ${ha.hazardName || 'N/A'}: ${asBool(ha.answerYesNo) ? 'Yes' : 'No'}`);
      doc.fontSize(9).text(`  ${ha.remarks || 'N/A'}`);
      doc.fontSize(10).moveDown(0.2);
    });
  });

  addSection('12. Climate and Disaster Risk', () => {
    if (!data.climateRisk.length) {
      doc.text('No Climate Risk data available.');
      return;
    }
    data.climateRisk.forEach((cr) => {
      doc.text(`- ${cr.hazardName || 'N/A'} (${cr.riskLevel || 'N/A'})`);
      doc.fontSize(9).text(`  Strategies: ${cr.riskReductionStrategies || 'N/A'}`);
      doc.fontSize(10).moveDown(0.2);
    });
  });

  addSection('13. ESOHSG Screening', () => {
    const es = data.esohsgScreening;
    if (!es) {
      doc.text('No ESOHSG Screening data available.');
      return;
    }
    doc.text(`EMCA Triggers: ${asBool(es.emcaTriggers) ? 'Yes' : 'No'}`);
    doc.text(`Screening Result: ${es.screeningResultOutcome || 'N/A'}`);
    doc.text(`Special Conditions: ${es.specialConditions || 'N/A'}`);
  });

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function docxHeading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { after: 120, before: level === HeadingLevel.HEADING_1 ? 160 : 80 },
    children: [new TextRun({ text, bold: true, color: '1F4E79' })],
  });
}

function docxBody(text) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: text || 'N/A' })],
  });
}

function docxBullets(label, text) {
  const lines = bulletLines(text);
  if (!lines.length) return [docxBody(`${label}: N/A`)];
  return [
    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `${label}:`, bold: true })] }),
    ...lines.map((line) => new Paragraph({
      spacing: { after: 40 },
      bullet: { level: 0 },
      children: [new TextRun({ text: line })],
    })),
  ];
}

async function buildDocxReport(data) {
  const { project } = data;
  const children = buildDocxOfficialHeaderParagraphs(
    'KDSP II Inception Report',
    [project.projectName || 'Untitled project']
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({
        text: `Generated: ${new Date().toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}`,
        size: 20,
      })],
    })
  );

  children.push(docxHeading('Project Overview'));
  children.push(
    docxBody(`Project ID: ${project.id}`),
    docxBody(`Project Category: ${project.categoryName || 'N/A'}`),
    docxBody(`Sector: ${project.sector || 'N/A'}`),
    docxBody(`Registry Budget: ${formatMoney(project.allocatedBudget)}`),
    docxBody(`Bill of Quantities: ${data.bqSummary.itemCount || 0} line(s), ${formatMoney(data.bqSummary.budgetTotal)}`),
    docxBody(`Directorate: ${project.directorate || 'N/A'}`)
  );

  if (data.conceptNote) {
    children.push(docxHeading('1. Concept Note'));
    children.push(...docxBullets('Situation Analysis', data.conceptNote.situationAnalysis));
    children.push(...docxBullets('Problem Statement', data.conceptNote.problemStatement));
    children.push(docxBody(`Project Goal: ${data.conceptNote.projectGoal || 'N/A'}`));
  }

  if (data.needsAssessment) {
    children.push(docxHeading('2. Needs Assessment'));
    children.push(...docxBullets('Target Beneficiaries', data.needsAssessment.targetBeneficiaries));
    children.push(docxBody(`Estimate End Users: ${data.needsAssessment.estimateEndUsers || 'N/A'}`));
  }

  if (data.financials) {
    children.push(docxHeading('3. Financials'));
    children.push(docxBody(`Construction: ${formatMoney(data.financials.capitalCostConstruction)}`));
    children.push(docxBody(`Proposed Source of Financing: ${data.financials.proposedSourceFinancing || 'N/A'}`));
  }

  if (data.implementationPlan) {
    children.push(docxHeading('5. Implementation Plan'));
    children.push(...docxBullets('Description', data.implementationPlan.description));
    children.push(...docxBullets('KPIs', data.implementationPlan.keyPerformanceIndicators));
  }

  if (data.mAndE) {
    children.push(docxHeading('6. Monitoring & Evaluation'));
    children.push(...docxBullets('Description', data.mAndE.description));
    children.push(...docxBullets('Mechanisms in Place', data.mAndE.mechanismsInPlace));
    children.push(...docxBullets('Reporting Channels', data.mAndE.reportingChannels));
  }

  if (data.sustainability) {
    children.push(docxHeading('7. Operational Sustainability'));
    children.push(...docxBullets('Description', data.sustainability.description));
    children.push(docxBody(`Owning Organization: ${data.sustainability.owningOrganization || 'N/A'}`));
  }

  if (data.risks.length) {
    children.push(docxHeading('8. Risks'));
    data.risks.forEach((risk) => {
      children.push(docxBody(`${risk.riskDescription || 'N/A'} — ${risk.likelihood || 'N/A'} / ${risk.impact || 'N/A'}`));
    });
  }

  const doc = new Document({
    creator: 'Machakos County Monitoring and Evaluation System',
    title: `${project.projectName || 'Project'} — Inception Report`,
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

function buildFilename(project, projectId, ext) {
  const safeName = (project.projectName || 'Project').replace(/\s/g, '_');
  return `Inception_Report_${safeName}_${projectId}.${ext}`;
}

async function exportInceptionPdf(projectId) {
  const data = await loadInceptionExportData(projectId);
  if (!data) return null;
  const buffer = await buildPdfReport(data);
  return { buffer, filename: buildFilename(data.project, projectId, 'pdf') };
}

async function exportInceptionDocx(projectId) {
  const data = await loadInceptionExportData(projectId);
  if (!data) return null;
  const buffer = await buildDocxReport(data);
  return { buffer, filename: buildFilename(data.project, projectId, 'docx') };
}

module.exports = {
  loadInceptionExportData,
  exportInceptionPdf,
  exportInceptionDocx,
};
