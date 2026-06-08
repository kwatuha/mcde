import React, { useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Container,
  Divider,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import HubIcon from '@mui/icons-material/Hub';
import InsightsIcon from '@mui/icons-material/Insights';
import MapIcon from '@mui/icons-material/Map';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import { Link as RouterLink } from 'react-router-dom';
import { ROUTES } from '../configs/appConfig';

const SECTIONS = [
  {
    id: 'finance',
    title: 'Financial & registry',
    description: 'Downloads, statements, and finance-oriented outputs.',
    icon: AttachMoneyIcon,
    links: [
      {
        title: 'Report library',
        description: 'Curated report documents and references.',
        to: ROUTES.REPORT_LIBRARY,
        tags: ['library', 'documents', 'uploads'],
        icon: MenuBookIcon,
      },
      {
        title: 'County operations report',
        description: 'Department, region, KPI, evaluation, and attention summaries.',
        to: ROUTES.COUNTY_OPERATIONS_REPORT,
        tags: ['operations', 'departments', 'regions', 'kpi', 'evaluation'],
        featured: true,
        icon: InsightsIcon,
      },
      {
        title: 'APR reports',
        description: 'Annual performance Word reports by financial year using APR template columns.',
        to: ROUTES.APR_REPORTS,
        tags: ['apr', 'annual', 'performance', 'word'],
        featured: true,
        icon: AssessmentIcon,
      },
      {
        title: 'Reporting template',
        description: 'Filtered Word reporting template for departments, sectors, periods, and financial years.',
        to: ROUTES.REPORTING_TEMPLATE,
        tags: ['template', 'word', 'departments', 'period'],
        icon: MenuBookIcon,
      },
      {
        title: 'Pending bills report',
        description: 'Outstanding project bill balances and exports.',
        to: ROUTES.PENDING_BILLS_REPORT,
        tags: ['pending bills', 'finance', 'balances'],
        icon: AttachMoneyIcon,
      },
      {
        title: 'Budget justification',
        description: 'Filter projects and download justification templates.',
        to: ROUTES.BUDGET_JUSTIFICATION_REPORT,
        tags: ['budget', 'justification', 'template'],
        icon: AssessmentIcon,
      },
      {
        title: 'Project finance overview',
        description: 'Financing mix, partner contributions, and statements.',
        to: ROUTES.PROJECT_FINANCE_OVERVIEW_REPORT,
        tags: ['finance', 'partners', 'statements'],
        icon: AttachMoneyIcon,
      },
      {
        title: 'Absorption report',
        description: 'Budget absorption and financial analytics.',
        to: ROUTES.ABSORPTION_REPORT,
        tags: ['absorption', 'budget', 'payments'],
        featured: true,
        icon: AssessmentIcon,
      },
      {
        title: 'Scheduled reports',
        description: 'Automated or recurring report configuration.',
        to: ROUTES.SCHEDULED_REPORTS,
        tags: ['scheduled', 'recurring', 'automation'],
        icon: TuneIcon,
      },
    ],
  },
  {
    id: 'geography',
    title: 'Dashboards & geography',
    description: 'Consolidated views also reachable from the Dashboard ribbon.',
    icon: MapIcon,
    links: [
      {
        title: 'Regional breakdown',
        description: 'Sub-county and ward dashboards.',
        to: ROUTES.REGIONAL_REPORTING,
        tags: ['sub-county', 'ward', 'regional'],
        featured: true,
        icon: MapIcon,
      },
      {
        title: 'Departmental reports',
        description: 'Executive department and implementation unit performance.',
        to: ROUTES.DEPARTMENTAL_REPORTING,
        tags: ['department', 'unit', 'performance'],
        featured: true,
        icon: AssessmentIcon,
      },
      {
        title: 'GIS dashboard',
        description: 'Map-based indicators and geographic summaries.',
        to: ROUTES.GIS_DASHBOARD,
        tags: ['gis', 'map', 'location'],
        icon: MapIcon,
      },
    ],
  },
  {
    id: 'monitoring',
    title: 'Projects & monitoring',
    description: 'Charts, evaluation exports, field tools, and raw tables.',
    icon: AssessmentIcon,
    links: [
      {
        title: 'Project evaluation',
        description: 'M&E evaluation grid and structured export.',
        to: ROUTES.PROJECT_EVALUATION,
        tags: ['evaluation', 'm&e', 'export'],
        icon: FactCheckIcon,
      },
      {
        title: 'Checklists & visits',
        description: 'Inspection templates and visit records.',
        to: ROUTES.DATA_COLLECTION_TOOLS,
        tags: ['checklists', 'visits', 'inspection'],
        icon: FactCheckIcon,
      },
    ],
  },
  {
    id: 'planning',
    title: 'Planning',
    description: 'Planning catalog links to reporting cadence.',
    icon: TuneIcon,
    links: [
      {
        title: 'Reporting frequency',
        description: 'How often indicators and milestones are reported.',
        to: ROUTES.PLANNING_REPORTING_FREQUENCY,
        tags: ['frequency', 'cadence', 'periods'],
        icon: TuneIcon,
      },
    ],
  },
];

const ALL_CATEGORY = 'all';

const flattenedReports = SECTIONS.flatMap((section) =>
  section.links.map((report) => ({
    ...report,
    sectionId: section.id,
    sectionTitle: section.title,
    sectionIcon: section.icon,
  }))
);

function ReportCard({ report, compact = false }) {
  const Icon = report.icon || AssessmentIcon;
  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderColor: report.featured ? 'primary.light' : 'divider',
        bgcolor: report.featured ? 'primary.50' : 'background.paper',
        transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
          borderColor: 'primary.main',
        },
      }}
    >
      <CardActionArea component={RouterLink} to={report.to} sx={{ height: '100%', alignItems: 'stretch' }}>
        <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                color: 'primary.main',
                bgcolor: 'primary.50',
                border: '1px solid',
                borderColor: 'primary.100',
              }}
            >
              <Icon fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {report.title}
              </Typography>
              {!compact && (
                <Typography variant="caption" color="text.secondary">
                  {report.sectionTitle}
                </Typography>
              )}
            </Box>
            <ArrowForwardIcon fontSize="small" color="action" />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
            {report.description}
          </Typography>
          {!compact && (
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
              {(report.tags || []).slice(0, 3).map((tag) => (
                <Chip key={tag} label={tag} size="small" variant="outlined" />
              ))}
            </Stack>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function ReportsHubPage() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORY);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    return SECTIONS.map((section) => {
      const links = section.links
        .map((report) => ({ ...report, sectionId: section.id, sectionTitle: section.title }))
        .filter((report) => {
          const categoryMatch = activeCategory === ALL_CATEGORY || report.sectionId === activeCategory;
          if (!categoryMatch) return false;
          if (!normalizedQuery) return true;
          const haystack = [
            report.title,
            report.description,
            report.sectionTitle,
            ...(report.tags || []),
          ]
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        });
      return { ...section, links };
    }).filter((section) => section.links.length > 0);
  }, [activeCategory, normalizedQuery]);

  const featuredReports = flattenedReports.filter((report) => report.featured).slice(0, 5);
  const totalMatches = filteredSections.reduce((sum, section) => sum + section.links.length, 0);

  return (
    <Container maxWidth="xl" sx={{ py: 2 }}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, md: 2.5 },
          mb: 2,
          borderRadius: 3,
          color: 'white',
          overflow: 'hidden',
          position: 'relative',
          background: 'linear-gradient(135deg, #0f4c81 0%, #1c7c54 100%)',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            right: -45,
            top: -70,
            width: 170,
            height: 170,
            borderRadius: '50%',
            bgcolor: 'rgba(255,255,255,0.1)',
          }}
        />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <Box sx={{ flex: 1, position: 'relative' }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
              <HubIcon sx={{ fontSize: 18 }} />
              <Typography variant="caption" sx={{ letterSpacing: 1.1, color: 'rgba(255,255,255,0.82)', textTransform: 'uppercase', fontWeight: 700 }}>
                County reporting centre
              </Typography>
            </Stack>
            <Typography variant="h5" sx={{ fontWeight: 900, lineHeight: 1.15, mb: 0.5 }}>
              Find the right report faster
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.88)', maxWidth: 720 }}>
              Search across finance, operations, dashboards, monitoring, and planning reports.
            </Typography>
          </Box>
          <Paper sx={{ p: 1.25, borderRadius: 2.5, minWidth: { xs: '100%', md: 320 }, position: 'relative' }}>
            <TextField
              fullWidth
              autoFocus
              size="small"
              placeholder="Search reports, e.g. regional, pending bills, evaluation..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
              Showing {totalMatches} of {flattenedReports.length} reports
            </Typography>
          </Paper>
        </Stack>
      </Paper>

      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
        <Chip
          label="All reports"
          color={activeCategory === ALL_CATEGORY ? 'primary' : 'default'}
          onClick={() => setActiveCategory(ALL_CATEGORY)}
        />
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Chip
              key={section.id}
              icon={<Icon />}
              label={section.title}
              color={activeCategory === section.id ? 'primary' : 'default'}
              variant={activeCategory === section.id ? 'filled' : 'outlined'}
              onClick={() => setActiveCategory(section.id)}
            />
          );
        })}
      </Stack>

      {!normalizedQuery && activeCategory === ALL_CATEGORY && (
        <Box sx={{ mb: 4 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
            <InsightsIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Recommended reports
            </Typography>
          </Stack>
          <Grid container spacing={2}>
            {featuredReports.map((report) => (
              <Grid item xs={12} sm={6} lg={2.4} key={report.to}>
                <ReportCard report={report} compact />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {filteredSections.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <SearchIcon color="disabled" sx={{ fontSize: 44, mb: 1 }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            No reports found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Try a different keyword or choose another report category.
          </Typography>
        </Paper>
      )}

      {filteredSections.map((section) => {
        const SectionIcon = section.icon;
        return (
        <Box key={section.title} sx={{ mb: 4 }}>
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 0.5 }}>
            <Box
              sx={{
                width: 34,
                height: 34,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                color: 'primary.main',
                bgcolor: 'primary.50',
              }}
            >
              <SectionIcon fontSize="small" />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                {section.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {section.description}
              </Typography>
            </Box>
            <Chip label={`${section.links.length} report${section.links.length === 1 ? '' : 's'}`} size="small" />
          </Stack>
          <Divider sx={{ mb: 2 }} />
          <Grid container spacing={2}>
            {section.links.map((report) => (
              <Grid item xs={12} sm={6} md={4} key={report.to}>
                <ReportCard report={report} />
              </Grid>
            ))}
          </Grid>
        </Box>
        );
      })}
    </Container>
  );
}
