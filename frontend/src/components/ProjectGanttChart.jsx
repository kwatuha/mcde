import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, IconButton, Slider, Stack, Button
} from '@mui/material';
import {
  ZoomIn as ZoomInIcon, ZoomOut as ZoomOutIcon, Download as DownloadIcon
} from '@mui/icons-material';
import { getProjectStatusBackgroundColor, getProjectStatusTextColor } from '../utils/projectStatusColors';

const ProjectGanttChart = ({ milestones = [], activities = [], projectName = 'Project' }) => {
  const canvasRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const lastMouseX = useRef(0);

  // Convert activities to tasks format for Gantt chart
  const tasks = activities.map(activity => ({
    taskId: activity.activityId,
    taskName: activity.activityName || 'Unnamed Activity',
    startDate: activity.startDate,
    endDate: activity.endDate,
    status: activity.activityStatus || 'not_started',
    progress: activity.percentageComplete || 0
  }));

  // Convert milestones to Gantt format
  const ganttMilestones = milestones.map(milestone => ({
    milestoneId: milestone.milestoneId,
    milestoneName: milestone.milestoneName || 'Unnamed Milestone',
    dueDate: milestone.dueDate,
    completed: milestone.status === 'completed' || milestone.progress === 100
  }));

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || (tasks.length === 0 && ganttMilestones.length === 0)) {
      return;
    }

    const ctx = canvas.getContext('2d');
    const parent = canvas.parentElement;

    canvas.width = parent.clientWidth;
    const rowHeight = 40;
    const headerHeight = 60;
    canvas.height = Math.max(300, (tasks.length + ganttMilestones.length) * rowHeight + headerHeight + 50);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const sortedTasks = [...tasks].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const sortedMilestones = [...ganttMilestones].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    let allDates = [];
    sortedTasks.forEach(task => {
      if (task.startDate) allDates.push(new Date(task.startDate));
      if (task.endDate) allDates.push(new Date(task.endDate));
    });
    sortedMilestones.forEach(milestone => {
      if (milestone.dueDate) allDates.push(new Date(milestone.dueDate));
    });

    if (allDates.length === 0) {
      // Use project dates or default to current date range
      const today = new Date();
      allDates = [new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 3, 0)];
    }

    const minDate = new Date(Math.min(...allDates));
    const maxDate = new Date(Math.max(...allDates));
    minDate.setDate(minDate.getDate() - 7);
    maxDate.setDate(maxDate.getDate() + 14);

    const labelAreaWidth = 200;
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
        if (!task.startDate || !task.endDate) return;
        
        const startDate = new Date(task.startDate);
        const endDate = new Date(task.endDate);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return;

        const barY = initialY + index * rowHeight + barPadding / 2;
        const barX = startX + ((startDate - minDate) / (1000 * 60 * 60 * 24)) * pixelsPerDay - offsetX;
        const barWidth = ((endDate - startDate) / (1000 * 60 * 60 * 24)) * pixelsPerDay;

        if (barX + barWidth > startX && barX < canvas.width - paddingRight) {
          taskPositions[task.taskId] = { x: barX, y: barY, width: barWidth, height: barHeight, endDateX: barX + barWidth };
          
          // Draw progress bar
          const progress = task.progress || 0;
          const progressWidth = (barWidth * progress) / 100;
          
          ctx.fillStyle = getProjectStatusBackgroundColor(task.status) || '#4CAF50';
          ctx.fillRect(barX, barY, barWidth, barHeight);
          
          // Draw progress indicator
          if (progress > 0) {
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(barX, barY, progressWidth, barHeight);
          }
          
          ctx.fillStyle = getProjectStatusTextColor(task.status) || '#fff';
          ctx.font = 'bold 11px Montserrat, sans-serif';
          ctx.textAlign = 'center';
          const dateText = `${startDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}`;
          if (barWidth > 80) ctx.fillText(dateText, barX + barWidth / 2, barY + barHeight / 2 + 1);
        }

        ctx.fillStyle = '#333';
        ctx.font = '13px Montserrat, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const taskLabel = task.taskName.length > 25 ? task.taskName.substring(0, 22) + '...' : task.taskName;
        ctx.fillText(taskLabel, 10, barY + barHeight / 2);
      });
    };

    const drawMilestones = () => {
      sortedMilestones.forEach((milestone, index) => {
        if (!milestone.dueDate) return;
        
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
        ctx.font = '13px Montserrat, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const milestoneLabel = milestone.milestoneName.length > 25 ? milestone.milestoneName.substring(0, 22) + '...' : milestone.milestoneName;
        ctx.fillText(milestoneLabel, 10, milestoneY + barHeight / 2);
      });
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
    drawTodayLine();
  }, [tasks, ganttMilestones, zoomLevel, offsetX]);

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
    drawChart();
  }, [drawChart]);

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
    if (!canvas || (tasks.length === 0 && ganttMilestones.length === 0)) {
      return;
    }
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `GanttChart_${projectName || 'Project'}.png`;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
          Project Timeline
        </Typography>
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
            variant="outlined"
            size="small"
            startIcon={<DownloadIcon />}
            onClick={handleExportChart}
            disabled={tasks.length === 0 && ganttMilestones.length === 0}
          >
            Export
          </Button>
        </Stack>
      </Box>
      <Paper elevation={3} sx={{ p: 2, borderRadius: '12px', overflowX: 'auto', backgroundColor: '#fff' }}>
        <canvas 
          ref={canvasRef} 
          style={{ 
            display: 'block', 
            minWidth: '800px', 
            cursor: isDragging ? 'grabbing' : 'grab',
            backgroundColor: '#fafafa'
          }}
        />
        {(tasks.length === 0 && ganttMilestones.length === 0) && (
          <Box sx={{ p: 3, textAlign: 'center', color: '#666' }}>
            <Typography>No milestones or activities available to display in the Gantt Chart.</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Add milestones and activities to see the project timeline.
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default ProjectGanttChart;



