import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import { formatCurrency, formatNumber } from '../utils/formatters';

const StatCard = ({ title, count, budget, color, icon: Icon, onClick }) => {
  return (
    <Card 
      onClick={onClick}
      elevation={0}
      sx={{ 
        height: '100%',
        borderTop: `3px solid ${color}`,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: onClick ? 'pointer' : 'default',
        background: (theme) =>
          theme.palette.mode === 'dark'
            ? `linear-gradient(160deg, ${theme.palette.grey[900]} 0%, ${theme.palette.grey[800]} 100%)`
            : 'linear-gradient(165deg, #ffffff 0%, #f8fafc 100%)',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 8px 20px rgba(15, 23, 42, 0.1), 0 0 0 1px ${color}33`,
          borderColor: 'divider',
          ...(onClick && {
            '& .view-details': {
              opacity: 1
            },
            '& .icon-container': {
              transform: 'scale(1.05)',
              background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`
            }
          })
        }
      }}
      className="fade-in"
    >
      <CardContent sx={{ p: 1.25, pt: 1.35, '&:last-child': { pb: 1.25 } }}>
        <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={0.75} mb={0.75}>
          <Typography
            variant="body2"
            color="text.secondary"
            fontWeight={600}
            sx={{
              fontSize: '0.72rem',
              letterSpacing: '0.01em',
              lineHeight: 1.25,
              pr: 0.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </Typography>
          {Icon && (
            <Box
              className="icon-container"
              sx={{
                flexShrink: 0,
                background: `linear-gradient(135deg, ${color}18 0%, ${color}0d 100%)`,
                borderRadius: 1.25,
                p: 0.65,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: 'none',
              }}
            >
              <Icon sx={{ fontSize: 18, color }} />
            </Box>
          )}
        </Box>
        
        <Typography 
          variant="h4" 
          fontWeight="bold" 
          gutterBottom
          sx={{ 
            color: color, 
            fontSize: '1.35rem', 
            mb: 0.35,
            lineHeight: 1.15,
            letterSpacing: '-0.02em'
          }}
        >
          {formatNumber(count)}
        </Typography>
        
        <Typography variant="caption" color="text.secondary" fontWeight={500} sx={{ fontSize: '0.68rem', opacity: 0.85, display: 'block', lineHeight: 1.3 }}>
          {formatCurrency(budget)}
        </Typography>
        
        {onClick && (
          <Typography 
            variant="caption" 
            className="view-details"
            sx={{ 
              mt: 0.35,
              display: 'block',
              color: color,
              fontWeight: 600,
              opacity: 0,
              transition: 'opacity 0.22s ease',
              fontSize: '0.62rem'
            }}
          >
            View projects →
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default StatCard;

