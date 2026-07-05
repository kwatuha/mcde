import React from 'react';
import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { flattenMonitoringChanges, flattenWardChangesFromVillage } from '../utils/monitoringChangeFormat';

export default function MonitoringChangeList({
  changedFields,
  wardChangesFromVillage,
  compact = false,
  title,
}) {
  const lines = wardChangesFromVillage?.length
    ? flattenWardChangesFromVillage(wardChangesFromVillage)
    : flattenMonitoringChanges(changedFields);

  if (!lines.length) {
    return compact ? null : (
      <Typography variant="body2" color="text.secondary">No field-level changes recorded.</Typography>
    );
  }

  if (compact) {
    return (
      <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
        {lines.map((line) => (
          <Typography component="li" variant="body2" key={line.label} sx={{ mb: 0.5 }}>
            <strong>{line.label}:</strong> {line.from} → {line.to}
          </Typography>
        ))}
      </Box>
    );
  }

  return (
    <Box>
      {title ? (
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>{title}</Typography>
      ) : null}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Field</TableCell>
            <TableCell>Village / before</TableCell>
            <TableCell>Ward / after</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.label}>
              <TableCell sx={{ fontWeight: 600, verticalAlign: 'top' }}>{line.label}</TableCell>
              <TableCell sx={{ verticalAlign: 'top', color: 'text.secondary' }}>{line.from}</TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>{line.to}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
