// GPRS Logo Component - Government Projects Reporting Platform
import React from 'react';
import { Box } from '@mui/material';

/**
 * GPRS Logo Component
 * A scalable SVG logo for Government Projects Reporting Platform
 * Can be used with different sizes via the size prop
 */
const GPRSLogo = ({ size = 120, color = '#1976d2', showText = true, variant = 'full' }) => {
  // Variant: 'full' (with text), 'icon' (just the icon), 'compact' (small icon + text)
  const iconSize = variant === 'icon' ? size : (variant === 'compact' ? size * 0.4 : size * 0.6);
  const textSize = variant === 'compact' ? size * 0.3 : size * 0.25;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: variant === 'compact' ? 1 : (variant === 'icon' ? 0 : 2),
        flexDirection: variant === 'compact' || variant === 'icon' ? 'row' : 'column',
      }}
    >
      {/* Icon - Building/Government structure representing projects */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        {/* Background circle */}
        <circle cx="60" cy="60" r="58" fill={color} opacity="0.1" />
        
        {/* Main building structure */}
        <rect x="30" y="40" width="60" height="50" rx="4" fill={color} />
        
        {/* Building windows - representing projects/reporting */}
        <rect x="40" y="50" width="12" height="12" rx="1" fill="white" opacity="0.9" />
        <rect x="58" y="50" width="12" height="12" rx="1" fill="white" opacity="0.9" />
        <rect x="76" y="50" width="12" height="12" rx="1" fill="white" opacity="0.9" />
        <rect x="40" y="68" width="12" height="12" rx="1" fill="white" opacity="0.9" />
        <rect x="58" y="68" width="12" height="12" rx="1" fill="white" opacity="0.9" />
        <rect x="76" y="68" width="12" height="12" rx="1" fill="white" opacity="0.9" />
        
        {/* Door */}
        <rect x="52" y="75" width="16" height="15" rx="2" fill="white" opacity="0.9" />
        
        {/* Roof/Chart line representing reporting */}
        <path
          d="M 30 40 L 60 20 L 90 40"
          stroke={color}
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
        />
        
        {/* Chart bars on top representing reporting/analytics */}
        <rect x="35" y="25" width="6" height="8" fill={color} />
        <rect x="45" y="20" width="6" height="13" fill={color} />
        <rect x="55" y="18" width="6" height="15" fill={color} />
        <rect x="65" y="22" width="6" height="11" fill={color} />
        <rect x="75" y="27" width="6" height="6" fill={color} />
      </svg>

      {/* Text - GPRS */}
      {showText && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: variant === 'compact' ? 'flex-start' : 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            component="span"
            sx={{
              fontSize: textSize,
              fontWeight: 'bold',
              color: color,
              letterSpacing: '0.1em',
              lineHeight: 1.2,
            }}
          >
            GPRS
          </Box>
          {variant === 'full' && (
            <Box
              component="span"
              sx={{
                fontSize: textSize * 0.4,
                fontWeight: 500,
                color: '#666',
                mt: 0.5,
                textAlign: 'center',
              }}
            >
              Government Projects
              <br />
              Reporting Platform
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

export default GPRSLogo;
