import React, { useMemo, useState } from 'react';
import { Box, Breadcrumbs, Link, Typography, Paper } from '@mui/material';
import { Home, NavigateNext } from '@mui/icons-material';
import SubCountySummaryTable from './SubCountySummaryTable';
import WardSummaryTable from './WardSummaryTable';
import SublocationSummaryTable from './SublocationSummaryTable';
import VillageSummaryTable from './VillageSummaryTable';

const emptyGeo = { subcounty: '', ward: '', sublocation: '' };

const RegionalBreakdownPanel = ({ finYearId, filters = {} }) => {
  const [geo, setGeo] = useState(emptyGeo);

  const scopedFilters = useMemo(
    () => ({
      ...filters,
      ...(geo.subcounty ? { subcounty: geo.subcounty } : {}),
      ...(geo.ward ? { ward: geo.ward } : {}),
      ...(geo.sublocation ? { sublocation: geo.sublocation } : {}),
    }),
    [filters, geo],
  );

  const level = !geo.subcounty
    ? 'subcounty'
    : !geo.ward
      ? 'ward'
      : !geo.sublocation
        ? 'sublocation'
        : 'village';

  const finYear = finYearId === null ? null : finYearId;

  const levelHint = {
    subcounty: 'Select a sub-county to explore wards, sublocations, and villages.',
    ward: `Wards in ${geo.subcounty} — select a ward to go deeper.`,
    sublocation: `${geo.ward} ward — select a sublocation to see villages.`,
    village: `${geo.sublocation} — village-level project distribution.`,
  };

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{
          p: 1.25,
          mb: 1.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Breadcrumbs
          separator={<NavigateNext fontSize="small" />}
          sx={{ mb: 0.75, '& .MuiBreadcrumbs-li': { display: 'flex', alignItems: 'center' } }}
        >
          <Link
            component="button"
            type="button"
            underline="hover"
            color={level === 'subcounty' ? 'text.primary' : 'primary'}
            fontWeight={level === 'subcounty' ? 700 : 500}
            onClick={() => setGeo(emptyGeo)}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.85rem', border: 0, background: 'none', cursor: 'pointer' }}
          >
            <Home sx={{ fontSize: 16 }} />
            All regions
          </Link>
          {geo.subcounty && (
            <Link
              component="button"
              type="button"
              underline="hover"
              color={level === 'ward' ? 'text.primary' : 'primary'}
              fontWeight={level === 'ward' ? 700 : 500}
              onClick={() => setGeo({ subcounty: geo.subcounty, ward: '', sublocation: '' })}
              sx={{ fontSize: '0.85rem', border: 0, background: 'none', cursor: 'pointer' }}
            >
              {geo.subcounty}
            </Link>
          )}
          {geo.ward && (
            <Link
              component="button"
              type="button"
              underline="hover"
              color={level === 'sublocation' ? 'text.primary' : 'primary'}
              fontWeight={level === 'sublocation' ? 700 : 500}
              onClick={() => setGeo({ subcounty: geo.subcounty, ward: geo.ward, sublocation: '' })}
              sx={{ fontSize: '0.85rem', border: 0, background: 'none', cursor: 'pointer' }}
            >
              {geo.ward}
            </Link>
          )}
          {geo.sublocation && (
            <Typography color="text.primary" fontWeight={700} sx={{ fontSize: '0.85rem' }}>
              {geo.sublocation}
            </Typography>
          )}
        </Breadcrumbs>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
          {levelHint[level]}
        </Typography>
      </Paper>

      {level === 'subcounty' && (
        <SubCountySummaryTable
          finYearId={finYear}
          filters={scopedFilters}
          onDrillDown={(row) =>
            setGeo({
              subcounty: row.subcounty_name || row.subcounty_id || '',
              ward: '',
              sublocation: '',
            })
          }
        />
      )}
      {level === 'ward' && (
        <WardSummaryTable
          finYearId={finYear}
          filters={scopedFilters}
          onDrillDown={(row) =>
            setGeo({
              subcounty: geo.subcounty,
              ward: row.ward_name || row.ward_id || '',
              sublocation: '',
            })
          }
        />
      )}
      {level === 'sublocation' && (
        <SublocationSummaryTable
          finYearId={finYear}
          filters={scopedFilters}
          onDrillDown={(row) =>
            setGeo({
              subcounty: geo.subcounty,
              ward: geo.ward,
              sublocation: row.sublocation_name || row.sublocation_id || '',
            })
          }
        />
      )}
      {level === 'village' && (
        <VillageSummaryTable finYearId={finYear} filters={scopedFilters} />
      )}
    </Box>
  );
};

export default RegionalBreakdownPanel;
