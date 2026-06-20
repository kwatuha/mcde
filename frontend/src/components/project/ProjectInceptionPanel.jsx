// Inception / KDSP assessment panel — embedded on Project Details or standalone via redirect.
import React, { useState } from 'react';
import {
  Box, Typography, CircularProgress, Alert, Button,
  Grid, Snackbar, Tabs, Tab, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Paper,
  List, ListItem, ListItemText, IconButton, Stack,
} from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowBack as ArrowBackIcon, FileDownload as FileDownloadIcon,
  Edit as EditIcon, Delete as DeleteIcon, Description as DescriptionIcon,
} from '@mui/icons-material';

// Hooks
import useProjectDetails from '../../hooks/useProjectDetails';
import useFormManagement from '../../hooks/useFormManagement';
import useCrudOperations from '../../hooks/useCrudOperations';
import { useAuth } from '../../context/AuthContext.jsx';

import DataDisplayCard from '../common/DataDisplayCard';
import MultiLineTextAsList from '../common/MultiLineTextAsList.jsx';
import KdspConceptNoteForm from '../kdsp/KdspConceptNoteForm';
import KdspNeedsAssessmentForm from '../kdsp/KdspNeedsAssessmentForm';
import KdspFinancialsForm from '../kdsp/KdspFinancialsForm';
import KdspFyBreakdownForm from '../kdsp/KdspFyBreakdownForm';
import KdspSustainabilityForm from '../kdsp/KdspSustainabilityForm';
import KdspImplementationPlanForm from '../kdsp/KdspImplementationPlanForm';
import KdspMAndEForm from '../kdsp/KdspMAndEForm';
import KdspRisksForm from '../kdsp/KdspRisksForm';
import KdspStakeholdersForm from '../kdsp/KdspStakeholdersForm';
import KdspReadinessForm from '../kdsp/KdspReadinessForm';
import KdspHazardAssessmentForm from '../kdsp/KdspHazardAssessmentForm';
import KdspClimateRiskForm from '../kdsp/KdspClimateRiskForm';
import KdspEsohsgScreeningForm from '../kdsp/KdspEsohsgScreeningForm';

import InceptionProjectContext from './InceptionProjectContext';
import InceptionConceptNoteAttachments from './InceptionConceptNoteAttachments';
import {
  formatCurrency,
  getStatusChipColor,
  getRiskChipColor,
  checkUserPrivilege,
  checkKdpsSectionPrivilege,
  formatBooleanForDisplay,
} from '../../utils/helpers';

export default function ProjectInceptionPanel({ projectId: projectIdProp, embedded = false }) {
  const params = useParams();
  const projectId = projectIdProp || params.projectId;
  const navigate = useNavigate();
  const { user } = useAuth();

  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Use custom hooks
  const {
    project, conceptNote, needsAssessment, financials, fyBreakdown,
    sustainability, implementationPlan, mAndE, risks, stakeholders,
    readiness, hazardAssessment, climateRisk, esohsgScreening,
    loading: dataLoading, error, fetchProjectData
  } = useProjectDetails(projectId);

  const {
    openDialog, dialogType, currentRecord, formData, handleFormChange,
    handleOpenCreateDialog, handleOpenEditDialog, handleCloseDialog, setFormData
  } = useFormManagement();

  // Corrected the call to useCrudOperations.
  // The first argument is the serviceType ('kdsp'), and the last is the parentId (projectId).
  const {
    loading: crudLoading, handleSubmit, handleDelete, handleDownloadInceptionReport
  } = useCrudOperations('kdsp', fetchProjectData, setSnackbar, projectId);

  const loading = dataLoading || crudLoading;

  const fyBreakdownList = Array.isArray(fyBreakdown) ? fyBreakdown : [];
  const risksList = Array.isArray(risks) ? risks : [];
  const stakeholdersList = Array.isArray(stakeholders) ? stakeholders : [];
  const hazardAssessmentList = Array.isArray(hazardAssessment) ? hazardAssessment : [];
  const climateRiskList = Array.isArray(climateRisk) ? climateRisk : [];

  const [activeTab, setActiveTab] = useState(0);

  const handleCloseSnackbar = (event, reason) => {
    if (reason === 'clickaway') return;
    setSnackbar({ ...snackbar, open: false });
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const TabPanel = (props) => {
    const { children, value, index, ...other } = props;
    return (
      <div
        role="tabpanel"
        hidden={value !== index}
        id={`simple-tabpanel-${index}`}
        aria-controls={`simple-tabpanel-${index}`}
        {...other}
      >
        {value === index && (
          <Box sx={{ p: 0, pt: 3 }}>
            {children}
          </Box>
        )}
      </div>
    );
  };

  const a11yProps = (index) => {
    return {
      id: `simple-tab-${index}`,
      'aria-controls': `simple-tabpanel-${index}`,
    };
  };

  const totalProjectCost = financials ?
    (financials.capitalCostConsultancy || 0) +
    (financials.capitalCostLandAcquisition || 0) +
    (financials.capitalCostSitePrep || 0) +
    (financials.capitalCostConstruction || 0) +
    (financials.capitalCostPlantEquipment || 0) +
    (financials.capitalCostFixturesFittings || 0) +
    (financials.capitalCostOther || 0) +
    (financials.recurrentCostLabor || 0) +
    (financials.recurrentCostOperating || 0) +
    (financials.recurrentCostMaintenance || 0) +
    (financials.recurrentCostOther || 0) : null;

  const getOverallRiskStatus = () => {
    if (!risksList || risksList.length === 0) return 'N/A';
    if (risksList.some(risk => risk.riskLevel === 'High')) return 'High';
    if (risksList.some(risk => risk.riskLevel === 'Medium')) return 'Medium';
    return 'Low';
  };
  const overallRiskStatus = getOverallRiskStatus();

  const renderExportButtons = (size = 'medium') => (
    <Stack direction="row" spacing={1}>
      <Button
        size={size}
        variant="contained"
        startIcon={<FileDownloadIcon />}
        onClick={() => handleDownloadInceptionReport('pdf', project.projectName, projectId)}
      >
        Download PDF
      </Button>
      <Button
        size={size}
        variant="outlined"
        startIcon={<DescriptionIcon />}
        onClick={() => handleDownloadInceptionReport('docx', project.projectName, projectId)}
      >
        Download Word
      </Button>
    </Stack>
  );

  const renderDialogForm = () => {
    const commonProps = { formData, handleFormChange };
    const jsonInputListProps = { ...commonProps, setFormData };

    switch (dialogType) {
      case 'conceptNote': return <KdspConceptNoteForm {...commonProps} />;
      case 'needsAssessment': return <KdspNeedsAssessmentForm {...commonProps} />;
      case 'financials': return <KdspFinancialsForm {...commonProps} />;
      case 'fyBreakdown': return <KdspFyBreakdownForm {...commonProps} />;
      case 'sustainability': return <KdspSustainabilityForm {...commonProps} />;
      case 'implementationPlan': return <KdspImplementationPlanForm {...jsonInputListProps} />;
      case 'mAndE': return <KdspMAndEForm {...commonProps} />;
      case 'risks': return <KdspRisksForm {...commonProps} />;
      case 'stakeholders': return <KdspStakeholdersForm {...commonProps} />;
      case 'readiness': return <KdspReadinessForm {...jsonInputListProps} />;
      case 'hazardAssessment': return <KdspHazardAssessmentForm {...commonProps} />;
      case 'climateRisk': return <KdspClimateRiskForm {...commonProps} />;
      case 'esohsgScreening': return <KdspEsohsgScreeningForm {...jsonInputListProps} />;
      default: return <Typography>No form available for this type.</Typography>;
    }
  };


  if (loading && !project) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={embedded ? 240 : '80vh'}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading inception data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: embedded ? 0 : 3 }}>
        <Alert severity="error">{error}</Alert>
        {!embedded && (
          <Button variant="contained" startIcon={<ArrowBackIcon />} onClick={() => navigate('/projects')} sx={{ mt: 2 }}>
            Back to Projects
          </Button>
        )}
      </Box>
    );
  }

  if (!project) {
    return (
      <Box sx={{ p: embedded ? 0 : 3 }}>
        <Alert severity="warning">Project not found.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: embedded ? 0 : 3 }}>
      {!embedded && (
        <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate('/projects')}>
            Back to All Projects
          </Button>
          {checkUserPrivilege(user, 'kdsp_project_pdf.download') && renderExportButtons()}
        </Box>
      )}
      {!embedded && (
        <Typography variant="h4" gutterBottom sx={{ mb: 2 }}>KDSP II Project: {project.projectName}</Typography>
      )}
      {embedded && checkUserPrivilege(user, 'kdsp_project_pdf.download') && (
        <Box display="flex" justifyContent="flex-end" sx={{ mb: 2 }}>
          {renderExportButtons('small')}
        </Box>
      )}

      <InceptionProjectContext project={project} projectId={projectId} financials={financials} />

      <Alert severity="info" sx={{ mb: 2 }}>
        Complete the inception report section by section. Use <strong>Add …</strong> on each card to enter data,
        then download as <strong>PDF</strong> or <strong>Word</strong> when ready. Work through the tabs in order:
        Core Details → Financials → Planning &amp; M&amp;E → Risk &amp; Compliance.
        {!checkKdpsSectionPrivilege(user, 'conceptNote', 'create') && !checkUserPrivilege(user, 'project.update') && (
          <> You need <em>kdsp_*</em> or <em>project.update</em> privileges to edit these sections — ask an administrator if Add buttons are missing.</>
        )}
      </Alert>

      <Box component={Paper} elevation={2} sx={{ p: 2.5, mb: 4, borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="subtitle1" color="inherit">Project ID:</Typography>
            <Typography variant="h6" color="inherit" sx={{ wordBreak: 'break-word' }}>{projectId || 'N/A'}</Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="subtitle1" color="inherit">Overall Status:</Typography>
            <Chip
              label={project.status || 'Draft'}
              color={getStatusChipColor(project.status || 'Draft')}
              sx={{ fontWeight: 'bold', mt: 0.5, color: 'inherit', '& .MuiChip-label': { color: 'inherit' } }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="subtitle1" color="inherit">Estimated Cost:</Typography>
            <Typography variant="h6" color="inherit">{formatCurrency(totalProjectCost)}</Typography>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Typography variant="subtitle1" color="inherit">Overall Risk:</Typography>
            <Chip
              label={overallRiskStatus}
              color={getRiskChipColor(overallRiskStatus)}
              sx={{ fontWeight: 'bold', mt: 0.5, color: 'inherit', '& .MuiChip-label': { color: 'inherit' } }}
            />
          </Grid>
        </Grid>
      </Box>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange} aria-label="project details tabs" variant="scrollable" scrollButtons="auto">
          <Tab label="Core Details" {...a11yProps(0)} />
          <Tab label="Financials" {...a11yProps(1)} />
          <Tab label="Planning & M&E" {...a11yProps(2)} />
          <Tab label="Risk & Compliance" {...a11yProps(3)} />
        </Tabs>
      </Box>

      <TabPanel value={activeTab} index={0}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="Concept Note"
              data={conceptNote}
              type="conceptNote"
              onAdd={handleOpenCreateDialog}
              onEdit={handleOpenEditDialog}
              onDelete={handleDelete}
            >
              <MultiLineTextAsList text={conceptNote?.situationAnalysis} label="Situation Analysis" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={conceptNote?.problemStatement} label="Problem Statement" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={conceptNote?.relevanceProjectIdea} label="Relevance of the Project Idea" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={conceptNote?.scopeOfProject} label="Scope of the Project" sx={{ mb: 1.5 }} />
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Project Goal:</strong> {conceptNote?.projectGoal || 'N/A'}</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Goal Indicator:</strong> {conceptNote?.goalIndicator || 'N/A'}</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Goal Means of Verification:</strong> {conceptNote?.goalMeansVerification || 'N/A'}</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Goal Assumptions:</strong> {conceptNote?.goalAssumptions || 'N/A'}</Typography>
              <InceptionConceptNoteAttachments projectId={projectId} />
            </DataDisplayCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="Needs Assessment"
              data={needsAssessment}
              type="needsAssessment"
              onAdd={handleOpenCreateDialog}
              onEdit={handleOpenEditDialog}
              onDelete={handleDelete}
            >
              <MultiLineTextAsList text={needsAssessment?.targetBeneficiaries} label="Target Beneficiaries" sx={{ mb: 1.5 }} />
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Estimate of End Users:</strong> {needsAssessment?.estimateEndUsers || 'N/A'}</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Physical Demand on Completion:</strong> {needsAssessment?.physicalDemandCompletion || 'N/A'}</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Proposed Physical Capacity:</strong> {needsAssessment?.proposedPhysicalCapacity || 'N/A'}</Typography>
              <MultiLineTextAsList text={needsAssessment?.mainBenefitsAsset} label="Main Benefits of the Asset" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={needsAssessment?.significantExternalBenefitsNegativeEffects} label="Significant External Effects" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={needsAssessment?.significantDifferencesBenefitsAlternatives} label="Differences in Benefits" sx={{ mb: 1.5 }} />
            </DataDisplayCard>
          </Grid>
        </Grid>
      </TabPanel>

      <TabPanel value={activeTab} index={1}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="Financials"
              data={financials}
              type="financials"
              onAdd={handleOpenCreateDialog}
              onEdit={handleOpenEditDialog}
              onDelete={handleDelete}
            >
              <Typography variant="h6" sx={{ mt: 1, mb: 1, fontWeight: 'bold' }}>Capital Costs:</Typography>
              <Grid container spacing={1}>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Consultancy:</strong> {formatCurrency(financials?.capitalCostConsultancy)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Land Acquired:</strong> {formatCurrency(financials?.capitalCostLandAcquisition)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Site Prep:</strong> {formatCurrency(financials?.capitalCostSitePrep)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Construction:</strong> {formatCurrency(financials?.capitalCostConstruction)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Plant & Equipment:</strong> {formatCurrency(financials?.capitalCostPlantEquipment)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Fixtures & Fittings:</strong> {formatCurrency(financials?.capitalCostFixturesFittings)}</Typography></Grid>
                <Grid item xs={12}><Typography variant="body2"><strong>Other Capital:</strong> {formatCurrency(financials?.capitalCostOther)}</Typography></Grid>
                <Grid item xs={12}>
                  <Typography variant="body1" sx={{ mt: 1.5, fontWeight: 'bold' }}>
                    Total Capital Cost: {formatCurrency(
                      (financials?.capitalCostConsultancy || 0) +
                      (financials?.capitalCostLandAcquisition || 0) +
                      (financials?.capitalCostSitePrep || 0) +
                      (financials?.capitalCostConstruction || 0) +
                      (financials?.capitalCostPlantEquipment || 0) +
                      (financials?.capitalCostFixturesFittings || 0) +
                      (financials?.capitalCostOther || 0)
                    )}
                  </Typography>
                </Grid>
              </Grid>

              <br />

              <Typography variant="h6" sx={{ mb: 1, fontWeight: 'bold' }}>Recurrent Costs:</Typography>
              <Grid container spacing={1}>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Labor:</strong> {formatCurrency(financials?.recurrentCostLabor)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Operating:</strong> {formatCurrency(financials?.recurrentCostOperating)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Maintenance:</strong> {formatCurrency(financials?.recurrentCostMaintenance)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Other Recurrent:</strong> {formatCurrency(financials?.recurrentCostOther)}</Typography></Grid>
                <Grid item xs={12}>
                  <Typography variant="body1" sx={{ mt: 1.5, fontWeight: 'bold' }}>
                    Total Recurrent Cost: {formatCurrency(
                      (financials?.recurrentCostLabor || 0) +
                      (financials?.recurrentCostOperating || 0) +
                      (financials?.recurrentCostMaintenance || 0) +
                      (financials?.recurrentCostOther || 0)
                    )}
                  </Typography>
                </Grid>
              </Grid>

              <br />

              <Grid container spacing={1} alignItems="center">
                <Grid item xs={12}><Typography variant="body2" sx={{ mb: 1 }}><strong>Proposed Source of Financing:</strong> {financials?.proposedSourceFinancing || 'N/A'}</Typography></Grid>
                <Grid item xs={12}><MultiLineTextAsList text={financials?.costImplicationsRelatedProjects} label="Cost Implications to Related Projects" sx={{ mb: 1.5 }}/></Grid>
                <Grid item xs={12} sm={6}>
                  <Box display="flex" alignItems="center">
                    <Typography variant="body2" component="span" sx={{ mr: 1 }}><strong>Land Expropriation Required:</strong></Typography>
                    <Chip
                      label={formatBooleanForDisplay(financials?.landExpropriationRequired)}
                      color={financials?.landExpropriationRequired === true ? 'warning' : financials?.landExpropriationRequired === false ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Land Expropriation Expenses:</strong> {formatCurrency(financials?.landExpropriationExpenses)}</Typography></Grid>
                <Grid item xs={12} sm={6}>
                  <Box display="flex" alignItems="center">
                    <Typography variant="body2" component="span" sx={{ mr: 1 }}><strong>Compensation Required:</strong></Typography>
                    <Chip
                      label={formatBooleanForDisplay(financials?.compensationRequired)}
                      color={financials?.compensationRequired === true ? 'warning' : financials?.compensationRequired === false ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                </Grid>
                <Grid item xs={12}><MultiLineTextAsList text={financials?.otherAttendantCosts} label="Other Attendant Costs" sx={{ mb: 1.5 }}/></Grid>
              </Grid>
            </DataDisplayCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="FY Breakdown"
              data={fyBreakdownList}
              type="fyBreakdown"
              onAdd={handleOpenCreateDialog}
            >
              {fyBreakdownList.length > 0 ? (
                <List dense>
                  {fyBreakdownList.map(item => (
                    <ListItem
                      key={item.fyBreakdownId}
                      secondaryAction={
                        <Box>
                          {checkUserPrivilege(user, 'kdsp_fyBreakdown.update') && (
                            <IconButton edge="end" aria-label="edit" onClick={() => handleOpenEditDialog('fyBreakdown', item)} size="small"><EditIcon fontSize="small" /></IconButton>
                          )}
                          {checkUserPrivilege(user, 'kdsp_fyBreakdown.delete') && (
                            <IconButton edge="end" aria-label="delete" onClick={() => handleDelete('fyBreakdown', item.fyBreakdownId)} size="small"><DeleteIcon fontSize="small" /></IconButton>
                          )}
                        </Box>
                      }
                      sx={{ mb: 1, borderBottom: '1px solid #eee', pb: 1 }}
                    >
                      <ListItemText
                        primary={<Typography variant="body1"><strong>Financial Year:</strong> {item.financialYear || 'N/A'}</Typography>}
                        secondary={<Typography variant="body2" color="text.secondary"><strong>Total Cost:</strong> {formatCurrency(item.totalCost)}</Typography>}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : null}
            </DataDisplayCard>
          </Grid>
        </Grid>
      </TabPanel>

      <TabPanel value={activeTab} index={2}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="Implementation Plan"
              data={implementationPlan}
              type="implementationPlan"
              onAdd={handleOpenCreateDialog}
              onEdit={handleOpenEditDialog}
              onDelete={handleDelete}
            >
              <MultiLineTextAsList text={implementationPlan?.description} label="Description" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={implementationPlan?.keyPerformanceIndicators} label="KPIs" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={implementationPlan?.responsiblePersons} label="Responsible Persons" sx={{ mb: 1.5 }} />
            </DataDisplayCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="Monitoring & Evaluation"
              data={mAndE}
              type="mAndE"
              onAdd={handleOpenCreateDialog}
              onEdit={handleOpenEditDialog}
              onDelete={handleDelete}
            >
              <MultiLineTextAsList text={mAndE?.description} label="Description" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={mAndE?.mechanismsInPlace} label="Mechanisms in Place" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={mAndE?.resourcesBudgetary} label="Budgetary Resources" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={mAndE?.resourcesHuman} label="Human Resources" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={mAndE?.dataGatheringMethod} label="Data Gathering Method" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={mAndE?.reportingChannels} label="Reporting Channels" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={mAndE?.lessonsLearnedProcess} label="Lessons Learned Process" sx={{ mb: 1.5 }} />
            </DataDisplayCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="Operational Sustainability"
              data={sustainability}
              type="sustainability"
              onAdd={handleOpenCreateDialog}
              onEdit={handleOpenEditDialog}
              onDelete={handleDelete}
            >
              <MultiLineTextAsList text={sustainability?.description} label="Description" sx={{ mb: 1.5 }} />
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Owning Organization:</strong> {sustainability?.owningOrganization || 'N/A'}</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Has Asset Register:</strong> {formatBooleanForDisplay(sustainability?.hasAssetRegister)}</Typography>
              <MultiLineTextAsList text={sustainability?.technicalCapacityAdequacy} label="Technical Capacity Adequacy" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={sustainability?.managerialCapacityAdequacy} label="Managerial Capacity Adequacy" sx={{ mb: 1.5 }} />
              <MultiLineTextAsList text={sustainability?.financialCapacityAdequacy} label="Financial Capacity Adequacy" sx={{ mb: 1.5 }} />
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Average Annual Personnel Cost:</strong> {formatCurrency(sustainability?.avgAnnualPersonnelCost)}</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Annual Operation & Maintenance Cost:</strong> {formatCurrency(sustainability?.annualOperationMaintenanceCost)}</Typography>
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Other Operating Costs:</strong> {formatCurrency(sustainability?.otherOperatingCosts)}</Typography>
              <MultiLineTextAsList text={sustainability?.revenueSources} label="Revenue Sources" sx={{ mb: 1.5 }} />
              <Typography variant="body1" sx={{ mb: 1 }}><strong>Operational costs covered by revenue:</strong> {formatBooleanForDisplay(sustainability?.operationalCostsCoveredByRevenue)}</Typography>
            </DataDisplayCard>
          </Grid>
        </Grid>
      </TabPanel>

      <TabPanel value={activeTab} index={3}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="Risks"
              data={risksList}
              type="risks"
              onAdd={handleOpenCreateDialog}
            >
              {risksList.length > 0 ? (
                <List dense>
                  {risksList.map(item => (
                    <ListItem
                      key={item.riskId}
                      secondaryAction={
                        <Box>
                          {checkUserPrivilege(user, 'kdsp_risks.update') && (
                            <IconButton edge="end" aria-label="edit" onClick={() => handleOpenEditDialog('risks', item)} size="small"><EditIcon fontSize="small" /></IconButton>
                          )}
                          {checkUserPrivilege(user, 'kdsp_risks.delete') && (
                            <IconButton edge="end" aria-label="delete" onClick={() => handleDelete('risks', item.riskId)} size="small"><DeleteIcon fontSize="small" /></IconButton>
                          )}
                        </Box>
                      }
                      sx={{ mb: 1, borderBottom: '1px solid #eee', pb: 1 }}
                    >
                      <ListItemText
                        primary={<Typography variant="body1"><strong>Description:</strong> {item.riskDescription || 'N/A'}</Typography>}
                        secondary={<>
                          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                            <strong>Likelihood:</strong> {item.likelihood || 'N/A'} | <strong>Impact:</strong> {item.impact || 'N/A'}
                          </Typography>
                          <MultiLineTextAsList text={item.mitigationStrategy} label="Mitigation Strategy" />
                        </>}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : null}
            </DataDisplayCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="Stakeholders"
              data={stakeholdersList}
              type="stakeholders"
              onAdd={handleOpenCreateDialog}
            >
              {stakeholdersList.length > 0 ? (
                <List dense>
                  {stakeholdersList.map(item => (
                    <ListItem
                      key={item.stakeholderId}
                      secondaryAction={
                        <Box>
                          {checkUserPrivilege(user, 'kdsp_stakeholders.update') && (
                            <IconButton edge="end" aria-label="edit" onClick={() => handleOpenEditDialog('stakeholders', item)} size="small"><EditIcon fontSize="small" /></IconButton>
                          )}
                          {checkUserPrivilege(user, 'kdsp_stakeholders.delete') && (
                            <IconButton edge="end" aria-label="delete" onClick={() => handleDelete('stakeholders', item.stakeholderId)} size="small"><DeleteIcon fontSize="small" /></IconButton>
                          )}
                        </Box>
                      }
                      sx={{ mb: 1, borderBottom: '1px solid #eee', pb: 1 }}
                    >
                      <ListItemText
                        primary={<Typography variant="body1"><strong>Name:</strong> {item.stakeholderName || 'N/A'}</Typography>}
                        secondary={<>
                          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                            <strong>Influence:</strong> {item.levelInfluence || 'N/A'}
                          </Typography>
                          <MultiLineTextAsList text={item.engagementStrategy} label="Engagement Strategy" />
                        </>}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : null}
            </DataDisplayCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="Project Readiness"
              data={readiness}
              type="readiness"
              onAdd={handleOpenCreateDialog}
              onEdit={handleOpenEditDialog}
              onDelete={handleDelete}
            >
              <Grid container spacing={1}>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Designs Approved:</strong> {formatBooleanForDisplay(readiness?.designsPreparedApproved)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Land Acquired:</strong> {formatBooleanForDisplay(readiness?.landAcquiredSiteReady)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Regulatory Approvals Obtained:</strong> {formatBooleanForDisplay(readiness?.regulatoryApprovalsObtained)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Consultations Undertaken:</strong> {formatBooleanForDisplay(readiness?.consultationsUndertaken)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Can be Phased:</strong> {formatBooleanForDisplay(readiness?.canBePhasedScaledDown)}</Typography></Grid>
                <Grid item xs={12}>
                  <MultiLineTextAsList
                    text={Array.isArray(readiness?.governmentAgenciesInvolved) ? readiness.governmentAgenciesInvolved.join('\n') : 'N/A'}
                    label="Government Agencies Involved"
                    sx={{ mb: 1.5 }}
                  />
                </Grid>
              </Grid>
            </DataDisplayCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="Hazard Assessment"
              data={hazardAssessmentList}
              type="hazardAssessment"
              onAdd={handleOpenCreateDialog}
            >
              {hazardAssessmentList.length > 0 ? (
                <List dense>
                  {hazardAssessmentList.map(item => (
                    <ListItem
                      key={item.hazardId}
                      secondaryAction={
                        <Box>
                          {checkUserPrivilege(user, 'kdsp_hazardAssessment.update') && (
                            <IconButton edge="end" aria-label="edit" onClick={() => handleOpenEditDialog('hazardAssessment', item)} size="small"><EditIcon fontSize="small" /></IconButton>
                          )}
                          {checkUserPrivilege(user, 'kdsp_hazardAssessment.delete') && (
                            <IconButton edge="end" aria-label="delete" onClick={() => handleDelete('hazardAssessment', item.hazardId)} size="small"><DeleteIcon fontSize="small" /></IconButton>
                          )}
                        </Box>
                      }
                      sx={{ mb: 1, borderBottom: '1px solid #eee', pb: 1 }}
                    >
                      <ListItemText
                        primary={<Typography variant="body1"><strong>Hazard:</strong> {item.hazardName || 'N/A'}</Typography>}
                        secondary={<>
                          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                            <strong>Question:</strong> {item.question || 'N/A'} | <strong>Answer:</strong> {formatBooleanForDisplay(item.answerYesNo)}
                          </Typography>
                          <Typography component="span" variant="body2" color="text.secondary">
                            <strong>Remarks:</strong> {item.remarks || 'N/A'}
                          </Typography>
                        </>}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : null}
            </DataDisplayCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="Climate and Disaster Risk"
              data={climateRiskList}
              type="climateRisk"
              onAdd={handleOpenCreateDialog}
            >
              {climateRiskList.length > 0 ? (
                <List dense>
                  {climateRiskList.map(item => (
                    <ListItem
                      key={item.climateRiskId}
                      secondaryAction={
                        <Box>
                          {checkUserPrivilege(user, 'kdsp_climateRisk.update') && (
                            <IconButton edge="end" aria-label="edit" onClick={() => handleOpenEditDialog('climateRisk', item)} size="small"><EditIcon fontSize="small" /></IconButton>
                          )}
                          {checkUserPrivilege(user, 'kdsp_climateRisk.delete') && (
                            <IconButton edge="end" aria-label="delete" onClick={() => handleDelete('climateRisk', item.climateRiskId)} size="small"><DeleteIcon fontSize="small" /></IconButton>
                          )}
                        </Box>
                      }
                      sx={{ mb: 1, borderBottom: '1px solid #eee', pb: 1 }}
                    >
                      <ListItemText
                        primary={<Typography variant="body1"><strong>Hazard:</strong> {item.hazardName || 'N/A'}</Typography>}
                        secondary={<>
                          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                            <strong>Exposure:</strong> {item.hazardExposure || 'N/A'} | <strong>Vulnerability:</strong> {item.vulnerability || 'N/A'} | <strong>Risk:</strong> {item.riskLevel || 'N/A'}
                          </Typography>
                          <MultiLineTextAsList text={item.riskReductionStrategies} label="Risk Reduction Strategies" />
                          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: 'block' }}>
                            <strong>Risk Reduction Costs:</strong> {formatCurrency(item.riskReductionCosts)}
                          </Typography>
                          <MultiLineTextAsList text={item.resourcesRequired} label="Resources Required" />
                        </>}
                      />
                    </ListItem>
                  ))}
                </List>
              ) : null}
            </DataDisplayCard>
          </Grid>

          <Grid item xs={12} md={6}>
            <DataDisplayCard
              title="ESOHSG Screening"
              data={esohsgScreening}
              type="esohsgScreening"
              onAdd={handleOpenCreateDialog}
              onEdit={handleOpenEditDialog}
              onDelete={handleDelete}
            >
              <Grid container spacing={1}>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Name of the Project:</strong> {esohsgScreening?.nameOfTheProject || 'N/A'}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Location of the Project:</strong> {esohsgScreening?.locationOfTheProject || 'N/A'}</Typography></Grid>
                <Grid item xs={12}><MultiLineTextAsList text={esohsgScreening?.briefProjectDescription} label="Brief Project Description" sx={{ mb: 1.5 }} /></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>EMCA Triggers:</strong> {formatBooleanForDisplay(esohsgScreening?.emcaTriggers)}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>EMCA Description:</strong> {esohsgScreening?.emcaDescription || 'N/A'}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>World Bank Safeguards Applicable:</strong> {formatBooleanForDisplay(esohsgScreening?.worldBankSafeguardApplicable)}</Typography></Grid>
                <Grid item xs={12}>
                  <MultiLineTextAsList
                    text={Array.isArray(esohsgScreening?.worldBankStandards) ? esohsgScreening.worldBankStandards.join('\n') : 'N/A'}
                    label="World Bank Standards"
                    sx={{ mb: 1.5 }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>GoK Policies Applicable:</strong> {formatBooleanForDisplay(esohsgScreening?.goKPoliciesApplicable)}</Typography></Grid>
                <Grid item xs={12}>
                  <MultiLineTextAsList
                    text={Array.isArray(esohsgScreening?.goKPoliciesLaws) ? esohsgScreening.goKPoliciesLaws.join('\n') : 'N/A'}
                    label="GoK Policies/Laws"
                    sx={{ mb: 1.5 }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Screening Result:</strong> {esohsgScreening?.screeningResultOutcome || 'N/A'}</Typography></Grid>
                <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Screening Undertaken By:</strong> {esohsgScreening?.screeningUndertakenBy || 'N/A'}</Typography></Grid>
              </Grid>
            </DataDisplayCard>
          </Grid>
        </Grid>
      </TabPanel>

      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md">
        <DialogTitle>{currentRecord ? `Edit ${dialogType.replace(/([A-Z])/g, ' $1').trim()}` : `Add ${dialogType.replace(/([A-Z])/g, ' $1').trim()}`}</DialogTitle>
        <DialogContent dividers>
          {renderDialogForm()}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={loading}>Cancel</Button>
          <Button onClick={() => handleSubmit(dialogType, currentRecord, formData, handleCloseDialog)} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : (currentRecord ? 'Update' : 'Create')}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
