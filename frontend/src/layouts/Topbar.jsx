import { 
  Box, 
  IconButton, 
  useTheme, 
  Typography, 
  Badge, 
  Avatar, 
  Menu, 
  MenuItem, 
  ListItemIcon, 
  ListItemText,
  Divider
} from "@mui/material";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import LockIcon from "@mui/icons-material/Lock";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../context/PageTitleContext';
import { useProfileModal } from '../context/ProfileModalContext';
import ChangePasswordModal from '../components/ChangePasswordModal';
import { ROUTES } from '../configs/appConfig';

const Topbar = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();
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

  return (
    <Box 
      display="flex" 
      justifyContent="space-between" 
      alignItems="center"
      flex={1}
      sx={{ 
        color: 'white',
        px: 2,
        py: 0.5,
      }}
    >
      {/* PAGE TITLE SECTION */}
      <Box display="flex" alignItems="center" flexGrow={1}>
        <Typography 
          variant="h6" 
          fontWeight="bold" 
          sx={{ 
            color: 'white',
            mr: 1.5,
            fontSize: '1rem'
          }}
        >
          {pageTitle}
        </Typography>
        {pageSubtitle && (
          <Typography 
            variant="caption" 
            sx={{ 
              color: 'rgba(255, 255, 255, 0.8)',
              ml: 0.75,
              fontSize: '0.75rem'
            }}
          >
            {pageSubtitle}
          </Typography>
        )}
      </Box>

      {/* RIGHT SECTION */}
      <Box display="flex" alignItems="center" gap={1}>
        {/* NOTIFICATIONS */}
        <IconButton 
          sx={{ 
            color: 'white',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)'
            }
          }}
        >
          <Badge badgeContent={3} color="error">
            <NotificationsOutlinedIcon />
          </Badge>
        </IconButton>
        
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
