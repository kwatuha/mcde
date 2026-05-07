// src/components/tables/ReportDataTable.jsx

import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { tokens } from '../../pages/dashboard/theme';

const ReportDataTable = ({ data, columns, getRowId }) => {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  // Define dataGridColumns here, at the top level of the function
  const dataGridColumns = columns.map(col => ({
    field: col.id,
    headerName: col.label,
    minWidth: col.minWidth,
    flex: 1,
    valueFormatter: col.format
      ? (paramsOrValue) => {
          const value =
            paramsOrValue && typeof paramsOrValue === 'object' && 'value' in paramsOrValue
              ? paramsOrValue.value
              : paramsOrValue;
          return col.format(value);
        }
      : undefined,
  }));

  if (!data || data.length === 0) {
    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="h6" color="text.secondary" align="center">
          No data available to display.
        </Typography>
      </Box>
    );
  }

  return (
    <Box 
      sx={{ 
        height: 400, 
        width: '100%', 
        mt: 2,
        "& .MuiDataGrid-root": {
          border: "none",
        },
        "& .MuiDataGrid-cell": {
          borderBottom: "none",
        },
        "& .MuiDataGrid-columnHeaders": {
          backgroundColor: `${colors.blueAccent[700]} !important`,
          borderBottom: "none",
        },
        "& .MuiDataGrid-virtualScroller": {
          backgroundColor: colors.primary[400],
        },
        "& .MuiDataGrid-footerContainer": {
          borderTop: "none",
          backgroundColor: `${colors.blueAccent[700]} !important`,
        },
      }}
    >
      <DataGrid
        rows={data}
        columns={dataGridColumns}
        pageSize={5}
        rowsPerPageOptions={[5, 10, 20]}
        disableSelectionOnClick
        getRowId={getRowId}
        autoHeight
      />
    </Box>
  );
};

export default ReportDataTable;