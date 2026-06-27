import { 
  Box, 
  IconButton, 
  useTheme, 
  useMediaQuery,
  Typography, 
  Avatar, 
  Menu, 
  MenuItem, 
  ListItemIcon, 
  ListItemText,
  Divider,
  Tooltip,
} from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import MenuIcon from "@mui/icons-material/Menu";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import LockIcon from "@mui/icons-material/Lock";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../context/PageTitleContext';
import { useProfileModal } from '../context/ProfileModalContext';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { ROUTES } from '../configs/appConfig';
import { useNavigationLayout } from '../context/NavigationLayoutContext.jsx';
import { useSidebar } from '../context/SidebarContext.jsx';
import ViewQuiltIcon from '@mui/icons-material/ViewQuilt';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';

const Topbar = () => {
  const theme = useTheme();
  const isDesktopUp = useMediaQuery(theme.breakpoints.up('sm'));
  const navigate = useNavigate();
  const { user } = useAuth();
  const { layoutMode, toggleLayoutMode } = useNavigationLayout();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { pageTitle, pageSubtitle } = usePageTitle();
  const { openModal: openProfileModal } = useProfileModal();
  const [anchorEl, setAnchorEl] = useState(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const open = Boolean(anchorEl);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleProfileClick = () => {
    openProfileModal();
    handleClose();
  };

  const handleChangePasswordClick = () => {
    setChangePasswordOpen(true);
    handleClose();
  };

  const handleHelpSupportClick = () => {
    navigate(ROUTES.HELP_SUPPORT);
    handleClose();
  };

  /** Best-effort “hard” reload: clears same-origin Cache Storage (e.g. service worker caches), then reloads. Browsers do not allow invoking Ctrl+Shift+R from script. */
  const handleReloadApp = () => {
    const reload = () => window.location.reload();
    if (typeof window !== "undefined" && window.caches?.keys) {
      window.caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => window.caches.delete(k))))
        .then(reload, reload);
    } else {
      reload();
    }
  };

  return (
    <Box 
      display="flex" 
      justifyContent="space-between" 
      alignItems="center"
      flex={1}
      sx={{ 
        color: 'white',
        px: { xs: 0.75, sm: 2 },
        py: 0.5,
        minWidth: 0,
      }}
    >
      {/* PAGE TITLE SECTION */}
      <Box display="flex" alignItems="center" flexGrow={1} minWidth={0}>
        {isDesktopUp && (
          <Tooltip title={isCollapsed ? 'Show sidebar menu' : 'Hide sidebar menu'} enterTouchDelay={0}>
            <IconButton
              size="small"
              onClick={toggleSidebar}
              aria-label={isCollapsed ? 'Show sidebar menu' : 'Hide sidebar menu'}
              aria-expanded={!isCollapsed}
              sx={{
                color: 'white',
                mr: 1,
                flexShrink: 0,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
              }}
            >
              <MenuIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Typography 
          variant="h6" 
          fontWeight="bold" 
          noWrap
          sx={{ 
            color: 'white',
            mr: 1.5,
            fontSize: '1rem',
            minWidth: 0,
          }}
        >
          {pageTitle}
        </Typography>
        {pageSubtitle && (
          <Typography
            component="span"
            variant="body2"
            noWrap
            sx={{
              color: 'rgba(255, 255, 255, 0.94)',
              ml: 0.75,
              fontSize: '0.8125rem',
              fontWeight: 500,
              lineHeight: 1.35,
              letterSpacing: '0.01em',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.22)',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: { xs: 'none', md: 'inline' },
            }}
          >
            {pageSubtitle}
          </Typography>
        )}
      </Box>

      {/* RIGHT SECTION */}
      <Box display="flex" alignItems="center" gap={1}>
        <Tooltip
          title={
            layoutMode === 'tree'
              ? 'Switch to ribbon tabs (category bar) + sidebar section'
              : 'Switch to full sidebar tree (all modules expanded-style, like CIMES)'
          }
        >
          <IconButton
            size="small"
            onClick={toggleLayoutMode}
            sx={{
              color: 'white',
              opacity: 0.92,
              '&:hover': { opacity: 1, bgcolor: 'rgba(255,255,255,0.12)' },
            }}
            aria-label={layoutMode === 'tree' ? 'Use ribbon navigation layout' : 'Use full sidebar tree layout'}
          >
            {layoutMode === 'tree' ? <ViewQuiltIcon fontSize="small" /> : <AccountTreeIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip
          title={
            <>
              Reload the application from the server and clear in-app caches (same as a strong refresh).
              <br />
              If something still looks outdated, use your browser’s hard refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac).
            </>
          }
          enterTouchDelay={0}
          slotProps={{ tooltip: { sx: { maxWidth: 320 } } }}
        >
          <IconButton
            onClick={handleReloadApp}
            aria-label="Reload application"
            sx={{
              color: "white",
              "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.1)" },
            }}
          >
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        
        {/* USER AVATAR */}
        <IconButton 
          sx={{ 
            color: 'white',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            }
          }}
        >
          <Avatar 
            sx={{ 
              width: 32, 
              height: 32,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              fontSize: '0.875rem'
            }}
          >
            {user?.username?.charAt(0)?.toUpperCase()}
          </Avatar>
        </IconButton>

        {/* THREE-DOT MENU */}
        <IconButton
          onClick={handleClick}
          sx={{ 
            color: 'white',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            }
          }}
        >
          <MoreVertIcon />
        </IconButton>
        
        <Menu
          anchorEl={anchorEl}
          open={open}
          onClose={handleClose}
          onClick={handleClose}
          PaperProps={{
            elevation: 3,
            sx: {
              overflow: 'visible',
              filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
              mt: 1.5,
              minWidth: 200,
              '& .MuiAvatar-root': {
                width: 32,
                height: 32,
                ml: -0.5,
                mr: 1,
              },
              '&:before': {
                content: '""',
                display: 'block',
                position: 'absolute',
                top: 0,
                right: 14,
                width: 10,
                height: 10,
                bgcolor: 'background.paper',
                transform: 'translateY(-50%) rotate(45deg)',
                zIndex: 0,
              },
            },
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          {/* HELP */}
          <MenuItem onClick={handleHelpSupportClick}>
            <ListItemIcon>
              <HelpOutlineIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Help & Support</ListItemText>
          </MenuItem>

          <MenuItem
            onClick={() => {
              handleClose();
              navigate(ROUTES.MOBILE_APP_DOWNLOAD);
            }}
          >
            <ListItemIcon>
              <PhoneAndroidIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Mobile app (Android)</ListItemText>
          </MenuItem>

          <MenuItem
            onClick={() => {
              handleClose();
              handleReloadApp();
            }}
          >
            <ListItemIcon>
              <RefreshIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Reload application</ListItemText>
          </MenuItem>
          
          <Divider />
          
          {/* PROFILE */}
          <MenuItem onClick={handleProfileClick}>
            <ListItemIcon>
              <PersonOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>My Profile</ListItemText>
          </MenuItem>
          
          {/* CHANGE PASSWORD */}
          <MenuItem onClick={handleChangePasswordClick}>
            <ListItemIcon>
              <LockIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Change Password</ListItemText>
          </MenuItem>
        </Menu>
        
        {/* Change Password Modal */}
        <ChangePasswordModal
          open={changePasswordOpen}
          onClose={() => setChangePasswordOpen(false)}
        />
      </Box>
    </Box>
  );
};

// Clean topbar with three-dot menu
export default Topbar;
