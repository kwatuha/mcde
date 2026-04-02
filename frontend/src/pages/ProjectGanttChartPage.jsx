import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, CircularProgress, Alert, Button, Paper, Slider,
  IconButton,
  Stack // Corrected: Stack component is now imported
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon, Download as DownloadIcon,
  ZoomIn as ZoomInIcon, ZoomOut as ZoomOutIcon
} from '@mui/icons-material';
import apiService from '../api';
import { useAuth } from '../context/AuthContext';
import { getProjectStatusBackgroundColor, getProjectStatusTextColor } from '../utils/projectStatusColors'; // getProjectStatusTextColor added

// --- Helper to convert snake_case to camelCase for frontend use ---
const snakeToCamelCase = (obj) => {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  if (Array.isArray(obj)) return obj.map(v => snakeToCamelCase(v));
  const newObj = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      newObj[camelKey] = snakeToCamelCase(obj[key]);
    }
  }
  return newObj;
};

function ProjectGanttChartPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const canvasRef = useRef(null);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const lastMouseX = useRef(0);

  const fetchProjectAndTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const projectData = await apiService.projects.getProjectById(projectId);
      setProject(projectData);

      // Fetch milestones
      const milestonesData = await apiService.milestones.getMilestonesForProject(projectId);
      const milestonesArray = Array.isArray(milestonesData) ? milestonesData : [];
      setMilestones(milestonesArray);

      // Fetch activities for each milestone (only if there are milestones)
      let milestoneActivitiesResults = [];
      if (milestonesArray.length > 0) {
        try {
          const milestoneActivitiesPromises = milestonesArray.map(m =>
            apiService.strategy.milestoneActivities.getActivitiesByMilestoneId(m.milestoneId).catch(err => {
              console.warn(`Error fetching activities for milestone ${m.milestoneId}:`, err);
              return []; // Return empty array on error
            })
          );
          milestoneActivitiesResults = (await Promise.all(milestoneActivitiesPromises)).flat();
        } catch (err) {
          console.warn('Error fetching milestone activities:', err);
          milestoneActivitiesResults = [];
        }
      }
      setActivities(milestoneActivitiesResults);

      // Convert activities to tasks format for Gantt chart
      const tasksFromActivities = milestoneActivitiesResults
        .filter(activity => activity.startDate && activity.endDate) // Only include activities with dates
        .map(activity => ({
          taskId: activity.activityId,
          taskName: activity.activityName || 'Unnamed Activity',
          startDate: activity.startDate,
          endDate: activity.endDate,
          status: activity.activityStatus || 'not_started',
          progress: activity.percentageComplete || 0,
          dependencies: []
        }));
      setTasks(tasksFromActivities);
    } catch (err) {
      console.error('ProjectGanttChartPage: Error fetching data:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load Gantt chart data.');
      if (err.response && err.response.status === 401) {
        logout();
      }
      setTasks([]);
      setMilestones([]);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, logout]);

  useEffect(() => {
    fetchProjectAndTasks();
  }, [fetchProjectAndTasks]);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tasks || !milestones || (tasks.length === 0 && milestones.length === 0)) {
        return;
    }

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;

    canvas.width = parent.clientWidth;
    const rowHeight = 40;
    const headerHeight = 60;
    canvas.height = Math.max(300, (tasks.length + milestones.length) * rowHeight + headerHeight + 50);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sortedTasks = [...tasks].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const sortedMilestones = [...milestones].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    let allDates = [];
    sortedTasks.forEach(task => { allDates.push(new Date(task.startDate)); allDates.push(new Date(task.endDate)); });
    sortedMilestones.forEach(milestone => { allDates.push(new Date(milestone.dueDate)); });

    const minDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : new Date();
    const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : new Date();
    minDate.setDate(minDate.getDate() - 7);
    maxDate.setDate(maxDate.getDate() + 14);

    const labelAreaWidth = 180;
    const paddingRight = 30;
    const baseChartWidth = Math.max(canvas.width - labelAreaWidth - paddingRight, 1);
    const totalDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);
    const pixelsPerDay = (baseChartWidth / totalDays) * zoomLevel;
    const startX = labelAreaWidth;
    const barHeight = 25;
    const barPadding = 10;
    const initialY = headerHeight;

    const taskPositions = {};

    // Drawing functions
    const drawGrid = () => {
        ctx.fillStyle = '#333';
        ctx.font = '12px Montserrat, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        ctx.strokeStyle = '#eee';
        let currentAxisDate = new Date(minDate);
        currentAxisDate.setDate(currentAxisDate.getDate() - (currentAxisDate.getDate() - 1));
        let currentMonth = -1;

        while (currentAxisDate <= maxDate) {
            const x = startX + ((currentAxisDate - minDate) / (1000 * 60 * 60 * 24)) * pixelsPerDay - offsetX;
            if (x > startX) {
                ctx.beginPath();
                ctx.moveTo(x, initialY - 10);
                ctx.lineTo(x, canvas.height);
                ctx.stroke();
            }

            if (x > startX - 50 && x < canvas.width + 50) {
                if (currentAxisDate.getMonth() !== currentMonth) {
                    currentMonth = currentAxisDate.getMonth();
                    ctx.fillText(currentAxisDate.toLocaleString('default', { month: 'short', year: 'numeric' }), x, 20);
                }
                if (pixelsPerDay > 15) {
                    ctx.fillText(currentAxisDate.getDate().toString(), x, 40);
                }
            }
            currentAxisDate.setDate(currentAxisDate.getDate() + 1);
        }
        ctx.strokeStyle = '#999';
        ctx.beginPath();
        ctx.moveTo(startX, initialY - 10);
        ctx.lineTo(canvas.width - paddingRight, initialY - 10);
        ctx.stroke();
    };

    const drawTasks = () => {
      sortedTasks.forEach((task, index) => {
        const startDate = new Date(task.startDate);
        const endDate = new Date(task.endDate);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return;

        const barY = initialY + index * rowHeight + barPadding / 2;
        const barX = startX + ((startDate - minDate) / (1000 * 60 * 60 * 24)) * pixelsPerDay - offsetX;
        const barWidth = ((endDate - startDate) / (1000 * 60 * 60 * 24)) * pixelsPerDay;

        if (barX + barWidth > startX && barX < canvas.width - paddingRight) {
          taskPositions[task.taskId] = { x: barX, y: barY, width: barWidth, height: barHeight, endDateX: barX + barWidth };
          ctx.fillStyle = getProjectStatusBackgroundColor(task.status) || '#4CAF50';
          ctx.fillRect(barX, barY, barWidth, barHeight);
          ctx.fillStyle = getProjectStatusTextColor(task.status) || '#fff';
          ctx.font = 'bold 11px Montserrat, sans-serif';
          ctx.textAlign = 'center';
          const dateText = `${startDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}`;
          if (barWidth > 80) ctx.fillText(dateText, barX + barWidth / 2, barY + barHeight / 2 + 1);
        }

        ctx.fillStyle = '#333';
        ctx.font = '14px Montserrat, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(task.taskName, 10, barY + barHeight / 2);
      });
    };

    const drawMilestones = () => {
      sortedMilestones.forEach((milestone, index) => {
        const milestoneDate = new Date(milestone.dueDate);
        if (isNaN(milestoneDate.getTime())) return;
        
        const milestoneX = startX + ((milestoneDate - minDate) / (1000 * 60 * 60 * 24)) * pixelsPerDay - offsetX;
        const milestoneY = initialY + (sortedTasks.length + index) * rowHeight + barPadding / 2;
        
        if (milestoneX + barHeight > startX && milestoneX < canvas.width - paddingRight) {
            ctx.fillStyle = milestone.completed ? '#22c55e' : '#f97316';
            ctx.beginPath();
            ctx.moveTo(milestoneX, milestoneY + barHeight / 2);
            ctx.lineTo(milestoneX + barHeight / 2, milestoneY);
            ctx.lineTo(milestoneX + barHeight, milestoneY + barHeight / 2);
            ctx.lineTo(milestoneX + barHeight / 2, milestoneY + barHeight);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#666';
            ctx.font = '10px Montserrat, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(milestoneDate.toLocaleDateString(), milestoneX + barHeight / 2, milestoneY + barHeight + 10);
        }

        ctx.fillStyle = '#333';
        ctx.font = '14px Montserrat, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(milestone.milestoneName, 10, milestoneY + barHeight / 2);
      });
    };

    const drawDependencies = () => {
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);

      sortedTasks.forEach(task => {
        if (task.dependencies && task.dependencies.length > 0) {
          const currentTaskPos = taskPositions[task.taskId];
          if (!currentTaskPos) return;

          task.dependencies.forEach(dep => {
            const dependentTaskPos = taskPositions[dep.dependsOnTaskId];
            if (dependentTaskPos) {
              ctx.beginPath();
              ctx.moveTo(dependentTaskPos.endDateX, dependentTaskPos.y + dependentTaskPos.height / 2);
              ctx.lineTo(currentTaskPos.x, dependentTaskPos.y + dependentTaskPos.height / 2);
              ctx.lineTo(currentTaskPos.x, currentTaskPos.y + currentTaskPos.height / 2);
              ctx.stroke();

              const arrowSize = 5;
              ctx.beginPath();
              ctx.moveTo(currentTaskPos.x, currentTaskPos.y + currentTaskPos.height / 2);
              ctx.lineTo(currentTaskPos.x - arrowSize, currentTaskPos.y + currentTaskPos.height / 2 - arrowSize);
              ctx.lineTo(currentTaskPos.x - arrowSize, currentTaskPos.y + currentTaskPos.height / 2 + arrowSize);
              ctx.closePath();
              ctx.fillStyle = '#666';
              ctx.fill();
            }
          });
        }
      });
      ctx.setLineDash([]);
    };

    const drawTodayLine = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayX = startX + ((today - minDate) / (1000 * 60 * 60 * 24)) * pixelsPerDay - offsetX;

        if (todayX > startX && todayX < canvas.width - paddingRight) {
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(todayX, initialY - 10);
            ctx.lineTo(todayX, canvas.height - 10);
            ctx.stroke();
            ctx.setLineDash([]);
            
            ctx.fillStyle = '#dc2626';
            ctx.font = '12px Montserrat, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Today', todayX, initialY - 25);
        }
    };

    drawGrid();
    drawTasks();
    drawMilestones();
    drawDependencies();
    drawTodayLine();
  }, [tasks, milestones, zoomLevel, offsetX]);

  const handleMouseDown = useCallback((event) => {
    setIsDragging(true);
    lastMouseX.current = event.clientX;
  }, []);

  const handleMouseMove = useCallback((event) => {
    if (isDragging) {
      const deltaX = event.clientX - lastMouseX.current;
      setOffsetX(prev => prev - deltaX);
      lastMouseX.current = event.clientX;
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((event) => {
    event.preventDefault();
    const scaleAmount = 0.1;
    let newZoomLevel = event.deltaY < 0 ? Math.min(zoomLevel + scaleAmount, 5) : Math.max(zoomLevel - scaleAmount, 0.5);
    setZoomLevel(newZoomLevel);
  }, [zoomLevel]);

  useEffect(() => {
    if (!loading && !error) {
      drawChart();
    }
  }, [loading, error, drawChart]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const handleResize = () => drawChart();

    window.addEventListener('resize', handleResize);
    if (canvas) {
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseLeave);
        canvas.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
        window.removeEventListener('resize', handleResize);
        if (canvas) {
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('mouseleave', handleMouseLeave);
            canvas.removeEventListener('wheel', handleWheel);
        }
    };
  }, [drawChart, handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave, handleWheel]);

  const handleExportChart = () => {
    const canvas = canvasRef.current;
    if (!canvas || (tasks.length === 0 && milestones.length === 0)) {
      alert("No data to export.");
      return;
    }
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `GanttChart_${project?.projectName || 'Project'}.png`;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading Gantt chart data...</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
        <Button variant="contained" startIcon={<ArrowBackIcon />} onClick={() => navigate(`/projects/${projectId}`)} sx={{ mt: 2 }}>
          Back to Project Details
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(`/projects/${projectId}`)}>
          Back to Project Details
        </Button>
        <Stack direction="row" spacing={1} alignItems="center">
            <IconButton onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.5))} size="small" aria-label="Zoom Out">
                <ZoomOutIcon />
            </IconButton>
            <Slider
                value={zoomLevel}
                min={0.5} max={5} step={0.1}
                onChange={(e, newValue) => setZoomLevel(newValue)}
                sx={{ width: 100 }}
                aria-label="Zoom Level"
            />
            <IconButton onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 5))} size="small" aria-label="Zoom In">
                <ZoomInIcon />
            </IconButton>

            <Button
              variant="contained" startIcon={<DownloadIcon />} onClick={handleExportChart}
              sx={{ backgroundColor: '#0A2342', '&:hover': { backgroundColor: '#1A4A8A' }, color: 'white', fontWeight: 'bold', borderRadius: '8px' }}
            >
              Export Chart (PNG)
            </Button>
        </Stack>
      </Box>
      <Typography variant="h4" component="h1" gutterBottom sx={{ color: '#0A2342', fontWeight: 'bold' }}>
        Gantt Chart for Project: "{project?.projectName || 'Loading...'}"
      </Typography>
      <Paper elevation={3} sx={{ p: 2, borderRadius: '8px', overflowX: 'hidden', minWidth: 'fit-content' }}>
        <canvas ref={canvasRef} style={{ display: 'block', minWidth: '800px', cursor: isDragging ? 'grabbing' : 'grab' }}></canvas>
        {(tasks.length === 0 && milestones.length === 0) && (
            <Box sx={{ p: 3, textAlign: 'center', color: '#666' }}>
                <Typography>No tasks or milestones available to display in the Gantt Chart.</Typography>
            </Box>
        )}
      </Paper>
    </Box>
  );
}

export default ProjectGanttChartPage;