import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Grid,
    Card,
    CardContent,
    CardHeader,
    CircularProgress,
    Alert,
    Tabs,
    Tab,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    useTheme,
    Fade,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip
} from '@mui/material';
import {
    TrendingUp,
    Assessment,
    Business,
    AttachMoney,
    CheckCircle,
    Schedule,
    Analytics as AnalyticsIcon,
    BarChart as BarChartIcon,
    PieChart as PieChartIcon,
    ShowChart,
    Warning,
    Error,
    Info,
    TrendingDown,
    Speed,
    AccountBalance,
    Timeline,
    CompareArrows,
    Lightbulb,
    CheckCircleOutline,
    Cancel
} from '@mui/icons-material';
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import projectService from '../api/projectService';
import reportsService from '../api/reportsService';
import { getProjectStatusBackgroundColor } from '../utils/projectStatusColors';
import { groupStatusesByNormalized } from '../utils/projectStatusNormalizer';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#FF6B6B', '#6B66FF'];

export default function ProjectAnalyticsPage() {
    const theme = useTheme();
    const [loading, setLoading] = useState(true);
    const [months, setMonths] = useState(12);
    const [activeTab, setActiveTab] = useState(0);
    
    // Data states
    const [summary, setSummary] = useState(null);
    const [projectTrends, setProjectTrends] = useState([]);
    const [financialTrends, setFinancialTrends] = useState([]);
    const [departmentData, setDepartmentData] = useState([]);
    const [statusDistribution, setStatusDistribution] = useState([]);
    const [budgetByStatus, setBudgetByStatus] = useState([]);
    const [completionTrends, setCompletionTrends] = useState([]);
    const [departmentPerformance, setDepartmentPerformance] = useState([]);
    
    // Enhanced analytics states
    const [keyInsights, setKeyInsights] = useState(null);
    const [riskIndicators, setRiskIndicators] = useState([]);
    const [topPerformers, setTopPerformers] = useState([]);
    const [underPerformers, setUnderPerformers] = useState([]);
    const [budgetEfficiency, setBudgetEfficiency] = useState([]);

    useEffect(() => {
        loadAnalytics();
    }, [months]);

    const loadAnalytics = async () => {
        try {
            setLoading(true);
            
            // Fetch all analytics data in parallel
            const [
                statusCounts,
                departmentSummary,
                yearlyTrends,
                financialStatus,
                projectStatusSummary
            ] = await Promise.all([
                projectService.analytics.getProjectStatusCounts().catch((err) => { console.error('Error fetching status counts:', err); return []; }),
                reportsService.getDepartmentSummaryReport({}).catch((err) => { console.error('Error fetching department summary:', err); return []; }),
                reportsService.getYearlyTrendsReport({}).catch((err) => { console.error('Error fetching yearly trends:', err); return []; }),
                reportsService.getFinancialStatusByProjectStatus({}).catch((err) => { console.error('Error fetching financial status:', err); return []; }),
                reportsService.getProjectStatusSummary({}).catch((err) => { console.error('Error fetching project status summary:', err); return []; })
            ]);

            // Debug: Log received data
            console.log('Analytics data received:', {
                statusCounts: statusCounts?.length || 0,
                departmentSummary: departmentSummary?.length || 0,
                yearlyTrends: yearlyTrends?.length || 0,
                financialStatus: financialStatus?.length || 0,
                projectStatusSummary: projectStatusSummary?.length || 0
            });

            // Process and set summary data
            const totalProjects = departmentSummary.reduce((sum, dept) => sum + (dept.numProjects || 0), 0);
            const completedProjects = statusCounts.find(item => {
                const normalized = item.status?.toLowerCase();
                return normalized === 'completed' || normalized === 'done' || normalized === 'finished';
            })?.count || 0;
            
            const totalBudget = departmentSummary.reduce((sum, dept) => sum + (parseFloat(dept.allocatedBudget) || 0), 0);
            const totalUsers = departmentSummary.reduce((sum, dept) => sum + (parseInt(dept.userRegistration || dept.totalUsers || 0) || 0), 0);
            const monthlyUsers = totalUsers / (months || 1);

            setSummary({
                totalProjects,
                completedProjects,
                totalBudget,
                monthlyBudget: monthlyUsers,
                totalUsers,
                totalDepartments: departmentSummary.length
            });

            // Process project trends
            // Backend /yearly-trends returns array with { name, projectCount, totalBudget, totalPaid }
            // Transform to expected format for project trends
            const trendsData = Array.isArray(yearlyTrends) ? yearlyTrends : (yearlyTrends?.projectPerformance || []);
            setProjectTrends(trendsData.map(item => ({
                name: item.name || item.year || 'Unknown',
                totalProjects: item.projectCount || item.totalProjects || 0,
                completedProjects: item.completedProjects || 0,
                completionRate: parseFloat(item.completionRate) || 0
            })));

            // Process user registration trends
            // Backend /yearly-trends returns array with { name, projectCount, totalBudget, userRegistration }
            // Transform to expected format for user registration trends
            const financialData = Array.isArray(yearlyTrends) ? yearlyTrends : (yearlyTrends?.financialTrends || []);
            setFinancialTrends(financialData.map(item => {
                const totalUsers = parseInt(item.totalUsers || item.userRegistration || 0) || 0;
                const registeredUsers = parseInt(item.registeredUsers || item.userRegistration || 0) || 0;
                const registrationRate = totalUsers > 0 ? (registeredUsers / totalUsers) * 100 : 0;
                return {
                    name: item.name || item.year || 'Unknown',
                    totalBudget: totalUsers,
                    totalExpenditure: registeredUsers,
                    absorptionRate: parseFloat(registrationRate.toFixed(2))
                };
            }));

            // Process department data
            setDepartmentData(departmentSummary.map(dept => ({
                name: dept.departmentAlias || dept.departmentName || 'Unknown',
                projects: dept.numProjects || 0,
                budget: parseFloat(dept.allocatedBudget) || 0,
                userRegistration: parseInt(dept.userRegistration || dept.registeredUsers || 0) || 0,
                progress: parseFloat(dept.percentCompleted) || 0
            })));

            // Process status distribution
            const groupedStatuses = groupStatusesByNormalized(statusCounts, 'status', 'count');
            setStatusDistribution(groupedStatuses.map(item => ({
                name: item.name,
                value: item.value,
                color: getProjectStatusBackgroundColor(item.name)
            })));

            // Process budget by status
            const groupedBudget = groupStatusesByNormalized(financialStatus, 'status', 'totalBudget');
            setBudgetByStatus(groupedBudget.map(item => ({
                name: item.name,
                budget: parseFloat(item.value) || 0,
                color: getProjectStatusBackgroundColor(item.name)
            })));

            // Process completion trends
            const completionData = trendsData.map(item => ({
                name: item.name || item.year || 'Unknown',
                completionRate: parseFloat(item.completionRate) || 0,
                avgDuration: parseFloat(item.avgDuration) || 0
            }));
            setCompletionTrends(completionData);

            // Process department performance
            const deptPerf = departmentSummary.map(dept => ({
                name: dept.departmentAlias || dept.departmentName || 'Unknown',
                projects: dept.numProjects || 0,
                progress: parseFloat(dept.percentCompleted) || 0,
                budgetUtilization: parseFloat(dept.percentAbsorptionRate) || 0,
                budget: parseFloat(dept.allocatedBudget) || 0,
                userRegistration: parseInt(dept.userRegistration || dept.registeredUsers || 0) || 0,
                healthScore: dept.healthScore || 0
            }));
            setDepartmentPerformance(deptPerf);

            // Calculate Key Insights
            const userRegistrationRate = totalUsers > 0 ? (totalUsers / totalUsers) * 100 : 0;
            const budgetAbsorptionRate = totalBudget > 0 ? (totalUsers / totalBudget) * 100 : 0;
            const completionRate = totalProjects > 0 ? (completedProjects / totalProjects) * 100 : 0;
            const avgProgress = deptPerf.length > 0 
                ? deptPerf.reduce((sum, d) => sum + d.progress, 0) / deptPerf.length 
                : 0;
            const avgBudgetUtilization = deptPerf.length > 0
                ? deptPerf.reduce((sum, d) => sum + d.budgetUtilization, 0) / deptPerf.length
                : 0;
            
            // Calculate user registration variance
            const budgetVariance = totalUsers > 0 ? ((totalUsers - totalUsers) / totalUsers) * 100 : 0;
            
            // Identify at-risk projects (low progress but high budget utilization)
            const atRiskProjects = deptPerf.filter(d => 
                d.progress < 50 && d.budgetUtilization > 70
            ).length;
            
            // Identify delayed projects (low progress relative to time elapsed)
            const delayedProjects = deptPerf.filter(d => 
                d.progress < 30 && d.budgetUtilization > 50
            ).length;

            setKeyInsights({
                budgetAbsorptionRate: parseFloat(budgetAbsorptionRate.toFixed(1)),
                completionRate: parseFloat(completionRate.toFixed(1)),
                avgProgress: parseFloat(avgProgress.toFixed(1)),
                avgBudgetUtilization: parseFloat(avgBudgetUtilization.toFixed(1)),
                budgetVariance: parseFloat(budgetVariance.toFixed(1)),
                atRiskProjects,
                delayedProjects,
                totalBudget,
                totalUsers,
                remainingBudget: totalUsers
            });

            // Calculate Risk Indicators
            const risks = [];
            if (budgetAbsorptionRate > 90 && avgProgress < 50) {
                risks.push({
                    type: 'high',
                    title: 'High Budget Disbursement with Low Progress',
                    message: `${budgetAbsorptionRate.toFixed(1)}% budget disbursed but only ${avgProgress.toFixed(1)}% progress. Risk of budget overrun.`,
                    iconType: 'warning',
                    color: 'error'
                });
            }
            if (atRiskProjects > 0) {
                risks.push({
                    type: 'medium',
                    title: 'Projects at Risk',
                    message: `${atRiskProjects} department(s) have low progress (<50%) but high budget utilization (>70%).`,
                    iconType: 'alert',
                    color: 'warning'
                });
            }
            if (delayedProjects > 0) {
                risks.push({
                    type: 'medium',
                    title: 'Delayed Projects',
                    message: `${delayedProjects} department(s) show significant delays with progress <30% despite budget utilization >50%.`,
                    iconType: 'schedule',
                    color: 'warning'
                });
            }
            if (completionRate < 30) {
                risks.push({
                    type: 'low',
                    title: 'Low Completion Rate',
                    message: `Only ${completionRate.toFixed(1)}% of projects are completed. Consider reviewing project timelines.`,
                    iconType: 'info',
                    color: 'info'
                });
            }
            if (budgetVariance > 10) {
                risks.push({
                    type: 'high',
                    title: 'Budget Overrun',
                    message: `Budget variance is ${budgetVariance.toFixed(1)}%. Spending exceeds allocated budget.`,
                    iconType: 'error',
                    color: 'error'
                });
            }
            setRiskIndicators(risks);

            // Top Performers (high progress and good budget utilization)
            const topPerf = [...deptPerf]
                .filter(d => d.projects > 0)
                .sort((a, b) => {
                    const scoreA = (a.progress * 0.6) + (a.budgetUtilization <= 100 ? (100 - a.budgetUtilization) * 0.4 : 0);
                    const scoreB = (b.progress * 0.6) + (b.budgetUtilization <= 100 ? (100 - b.budgetUtilization) * 0.4 : 0);
                    return scoreB - scoreA;
                })
                .slice(0, 5)
                .map(d => ({
                    ...d,
                    efficiencyScore: parseFloat(((d.progress * 0.6) + (d.budgetUtilization <= 100 ? (100 - d.budgetUtilization) * 0.4 : 0)).toFixed(1))
                }));
            setTopPerformers(topPerf);

            // Under Performers (low progress or poor budget management)
            const underPerf = [...deptPerf]
                .filter(d => d.projects > 0)
                .sort((a, b) => {
                    const scoreA = (a.progress * 0.6) + (a.budgetUtilization <= 100 ? (100 - a.budgetUtilization) * 0.4 : 0);
                    const scoreB = (b.progress * 0.6) + (b.budgetUtilization <= 100 ? (100 - b.budgetUtilization) * 0.4 : 0);
                    return scoreA - scoreB;
                })
                .slice(0, 5)
                .map(d => ({
                    ...d,
                    efficiencyScore: parseFloat(((d.progress * 0.6) + (d.budgetUtilization <= 100 ? (100 - d.budgetUtilization) * 0.4 : 0)).toFixed(1))
                }));
            setUnderPerformers(underPerf);

            // Budget Efficiency Analysis
            const efficiency = deptPerf.map(d => {
                const efficiencyRatio = d.budget > 0 ? (d.progress / d.budgetUtilization) : 0;
                return {
                    name: d.name,
                    progress: d.progress,
                    budgetUtilization: d.budgetUtilization,
                    efficiencyRatio: parseFloat(efficiencyRatio.toFixed(2)),
                    budget: d.budget,
                    userRegistration: d.userRegistration,
                    status: efficiencyRatio > 1.2 ? 'excellent' : efficiencyRatio > 0.8 ? 'good' : efficiencyRatio > 0.5 ? 'fair' : 'poor'
                };
            }).sort((a, b) => b.efficiencyRatio - a.efficiencyRatio);
            setBudgetEfficiency(efficiency);

        } catch (error) {
            console.error('Error loading analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value) => {
        if (value >= 1000000) {
            return `KSh ${(value / 1000000).toFixed(1)}M`;
        } else if (value >= 1000) {
            return `KSh ${(value / 1000).toFixed(0)}K`;
        } else {
            return `KSh ${value.toLocaleString()}`;
        }
    };

    const formatNumber = (value) => {
        if (value >= 1000000) {
            return `${(value / 1000000).toFixed(1)}M`;
        } else if (value >= 1000) {
            return `${(value / 1000).toFixed(0)}K`;
        } else {
            return value.toLocaleString();
        }
    };

    if (loading) {
        return (
            <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                minHeight: '60vh',
                gap: 3,
                background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)'
            }}>
                <CircularProgress 
                    size={64} 
                    sx={{ 
                        color: 'primary.main',
                        '& .MuiCircularProgress-circle': {
                            strokeLinecap: 'round'
                        }
                    }} 
                />
                <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Loading analytics...
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ 
            p: { xs: 1, sm: 1.5, md: 2 }, 
            maxWidth: '100%',
            background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
            minHeight: '100vh'
        }}>
            {/* Header */}
            <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                mb: 2,
                flexWrap: 'wrap',
                gap: 2,
                pb: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider'
            }}>
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                        <Box sx={{
                            p: 1,
                            borderRadius: 1.5,
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
                        }}>
                            <AnalyticsIcon sx={{ color: 'white', fontSize: '1.5rem' }} />
                        </Box>
                        <Box>
                            <Typography variant="h5" sx={{ 
                                fontWeight: 700, 
                                mb: 0.25,
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                backgroundClip: 'text',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                fontSize: { xs: '1.5rem', md: '1.75rem' }
                            }}>
                                Project Analytics
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.85rem' }}>
                                Comprehensive project performance metrics and statistics
                            </Typography>
                        </Box>
                    </Box>
                </Box>
                <FormControl 
                    size="small" 
                    sx={{ 
                        minWidth: 200,
                        '& .MuiOutlinedInput-root': {
                            borderRadius: 2,
                            backgroundColor: 'white',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                            '&:hover': {
                                boxShadow: '0 4px 12px rgba(0,0,0,0.12)'
                            }
                        }
                    }}
                >
                    <InputLabel>Time Period</InputLabel>
                    <Select
                        value={months}
                        label="Time Period"
                        onChange={(e) => setMonths(e.target.value)}
                    >
                        <MenuItem value={6}>Last 6 months</MenuItem>
                        <MenuItem value={12}>Last 12 months</MenuItem>
                        <MenuItem value={24}>Last 24 months</MenuItem>
                        <MenuItem value={36}>Last 36 months</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            {/* Key Insights Section */}
            {keyInsights && (
                <Card sx={{ 
                    mb: 2,
                    background: 'linear-gradient(135deg, #667eea15 0%, #764ba215 100%)',
                    border: '1px solid',
                    borderColor: 'primary.light',
                    borderRadius: 2,
                    boxShadow: '0 2px 12px rgba(102, 126, 234, 0.15)'
                }}>
                    <CardHeader
                        title={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Lightbulb sx={{ color: 'primary.main', fontSize: '1.25rem' }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                    Key Insights & Recommendations
                                </Typography>
                            </Box>
                        }
                        sx={{ pb: 0.5, pt: 1.5, px: 2 }}
                    />
                    <CardContent sx={{ pt: 1, px: 2, pb: 1.5 }}>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} md={3}>
                                <Box sx={{ 
                                    p: 1.5, 
                                    borderRadius: 1.5, 
                                    background: 'white',
                                    border: '1px solid',
                                    borderColor: keyInsights.budgetAbsorptionRate > 90 ? 'error.light' : 'success.light',
                                    height: '100%'
                                }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                                        <AccountBalance sx={{ color: 'primary.main', fontSize: '1rem' }} />
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.85rem' }}>
                                            Budget Disbursement
                                        </Typography>
                                    </Box>
                                    <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.25 }}>
                                        {keyInsights.budgetAbsorptionRate}%
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {formatNumber(keyInsights.totalUsers)} registered users
                                    </Typography>
                                    {keyInsights.budgetAbsorptionRate > 90 && (
                                        <Chip 
                                            icon={<Warning />} 
                                            label="High Disbursement" 
                                            size="small" 
                                            color="error" 
                                            sx={{ mt: 1 }}
                                        />
                                    )}
                                </Box>
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <Box sx={{ 
                                    p: 2, 
                                    borderRadius: 2, 
                                    background: 'white',
                                    border: '1px solid',
                                    borderColor: keyInsights.completionRate > 70 ? 'success.light' : keyInsights.completionRate > 40 ? 'warning.light' : 'error.light',
                                    height: '100%'
                                }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <CheckCircle sx={{ color: 'success.main', fontSize: '1.2rem' }} />
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                            Completion Rate
                                        </Typography>
                                    </Box>
                                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                                        {keyInsights.completionRate}%
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {summary.completedProjects} of {summary.totalProjects} projects
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <Box sx={{ 
                                    p: 2, 
                                    borderRadius: 2, 
                                    background: 'white',
                                    border: '1px solid',
                                    borderColor: keyInsights.avgProgress > 70 ? 'success.light' : keyInsights.avgProgress > 40 ? 'warning.light' : 'error.light',
                                    height: '100%'
                                }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <Timeline sx={{ color: 'info.main', fontSize: '1.2rem' }} />
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                            Average Progress
                                        </Typography>
                                    </Box>
                                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                                        {keyInsights.avgProgress}%
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Across all departments
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={12} md={3}>
                                <Box sx={{ 
                                    p: 2, 
                                    borderRadius: 2, 
                                    background: 'white',
                                    border: '1px solid',
                                    borderColor: keyInsights.budgetVariance > 0 ? 'error.light' : 'success.light',
                                    height: '100%'
                                }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                        <CompareArrows sx={{ color: keyInsights.budgetVariance > 0 ? 'error.main' : 'success.main', fontSize: '1.2rem' }} />
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                            Budget Variance
                                        </Typography>
                                    </Box>
                                    <Typography variant="h4" sx={{ 
                                        fontWeight: 700, 
                                        mb: 0.5,
                                        color: keyInsights.budgetVariance > 0 ? 'error.main' : 'success.main'
                                    }}>
                                        {keyInsights.budgetVariance > 0 ? '+' : ''}{keyInsights.budgetVariance}%
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {keyInsights.budgetVariance > 0 ? 'Over budget' : 'Under budget'}
                                    </Typography>
                                </Box>
                            </Grid>
                        </Grid>
                    </CardContent>
                </Card>
            )}

            {/* Risk Indicators */}
            {riskIndicators.length > 0 && (
                <Card sx={{ mb: 2, borderRadius: 2, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
                    <CardHeader
                        title={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Warning sx={{ color: 'warning.main', fontSize: '1.25rem' }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
                                    Risk Indicators & Alerts
                                </Typography>
                            </Box>
                        }
                        sx={{ pb: 0.5, pt: 1.5, px: 2 }}
                    />
                    <CardContent sx={{ pt: 1, px: 2, pb: 1.5 }}>
                        <Grid container spacing={1.5}>
                            {riskIndicators.map((risk, index) => {
                                const getIcon = () => {
                                    switch (risk.iconType) {
                                        case 'warning': return <Warning />;
                                        case 'alert': return <Warning />;
                                        case 'schedule': return <Schedule />;
                                        case 'info': return <Info />;
                                        case 'error': return <Error />;
                                        default: return <Info />;
                                    }
                                };
                                return (
                                    <Grid item xs={12} md={6} key={index}>
                                        <Alert 
                                            severity={risk.color} 
                                            icon={getIcon()}
                                            sx={{ 
                                                borderRadius: 2,
                                                '& .MuiAlert-message': {
                                                    width: '100%'
                                                }
                                            }}
                                        >
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                                                {risk.title}
                                            </Typography>
                                            <Typography variant="body2">
                                                {risk.message}
                                            </Typography>
                                        </Alert>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    </CardContent>
                </Card>
            )}

            {/* Summary Cards */}
            {summary && (
                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={12} sm={6} md={3}>
                        <Fade in timeout={800}>
                            <Card sx={{ 
                                height: '100%',
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: 'white',
                                borderRadius: 3,
                                boxShadow: '0 8px 24px rgba(102, 126, 234, 0.25)',
                                border: 'none',
                                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                position: 'relative',
                                overflow: 'hidden',
                                '&::before': {
                                    content: '""',
                                    position: 'absolute',
                                    top: 0,
                                    right: 0,
                                    width: '100px',
                                    height: '100px',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    borderRadius: '50%',
                                    transform: 'translate(30px, -30px)'
                                },
                                '&:hover': {
                                    boxShadow: '0 12px 32px rgba(102, 126, 234, 0.35)',
                                    transform: 'translateY(-4px) scale(1.02)'
                                }
                            }}>
                                <CardContent sx={{ p: 2, position: 'relative', zIndex: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                        <Box sx={{
                                            p: 1,
                                            borderRadius: 1.5,
                                            backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                            backdropFilter: 'blur(10px)'
                                        }}>
                                            <Business sx={{ fontSize: '1.5rem' }} />
                                        </Box>
                                    </Box>
                                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.25, fontSize: { xs: '1.5rem', md: '1.75rem' } }}>
                                        {summary.totalProjects || 0}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.8rem' }}>
                                        Total Projects
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Fade>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                        <Fade in timeout={1000}>
                            <Card sx={{ 
                                height: '100%',
                                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                                color: 'white',
                                borderRadius: 3,
                                boxShadow: '0 8px 24px rgba(245, 87, 108, 0.25)',
                                border: 'none',
                                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                position: 'relative',
                                overflow: 'hidden',
                                '&::before': {
                                    content: '""',
                                    position: 'absolute',
                                    top: 0,
                                    right: 0,
                                    width: '100px',
                                    height: '100px',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    borderRadius: '50%',
                                    transform: 'translate(30px, -30px)'
                                },
                                '&:hover': {
                                    boxShadow: '0 12px 32px rgba(245, 87, 108, 0.35)',
                                    transform: 'translateY(-4px) scale(1.02)'
                                }
                            }}>
                                <CardContent sx={{ p: 2, position: 'relative', zIndex: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                        <Box sx={{
                                            p: 1,
                                            borderRadius: 1.5,
                                            backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                            backdropFilter: 'blur(10px)'
                                        }}>
                                            <AttachMoney sx={{ fontSize: '1.5rem' }} />
                                        </Box>
                                    </Box>
                                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.25, fontSize: { xs: '1.5rem', md: '1.75rem' } }}>
                                        {formatCurrency(summary.totalBudget || 0)}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.8rem' }}>
                                        Total Budget
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Fade>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                        <Fade in timeout={1200}>
                            <Card sx={{ 
                                height: '100%',
                                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                                color: 'white',
                                borderRadius: 3,
                                boxShadow: '0 8px 24px rgba(79, 172, 254, 0.25)',
                                border: 'none',
                                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                position: 'relative',
                                overflow: 'hidden',
                                '&::before': {
                                    content: '""',
                                    position: 'absolute',
                                    top: 0,
                                    right: 0,
                                    width: '100px',
                                    height: '100px',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    borderRadius: '50%',
                                    transform: 'translate(30px, -30px)'
                                },
                                '&:hover': {
                                    boxShadow: '0 12px 32px rgba(79, 172, 254, 0.35)',
                                    transform: 'translateY(-4px) scale(1.02)'
                                }
                            }}>
                                <CardContent sx={{ p: 2, position: 'relative', zIndex: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                        <Box sx={{
                                            p: 1,
                                            borderRadius: 1.5,
                                            backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                            backdropFilter: 'blur(10px)'
                                        }}>
                                            <TrendingUp sx={{ fontSize: '1.5rem' }} />
                                        </Box>
                                    </Box>
                                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.25, fontSize: { xs: '1.5rem', md: '1.75rem' } }}>
                                        {formatCurrency(summary.monthlyBudget || 0)}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.8rem' }}>
                                        Monthly Budget
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Fade>
                    </Grid>

                    <Grid item xs={12} sm={6} md={3}>
                        <Fade in timeout={1400}>
                            <Card sx={{ 
                                height: '100%',
                                background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                                color: 'white',
                                borderRadius: 3,
                                boxShadow: '0 8px 24px rgba(67, 233, 123, 0.25)',
                                border: 'none',
                                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                position: 'relative',
                                overflow: 'hidden',
                                '&::before': {
                                    content: '""',
                                    position: 'absolute',
                                    top: 0,
                                    right: 0,
                                    width: '100px',
                                    height: '100px',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    borderRadius: '50%',
                                    transform: 'translate(30px, -30px)'
                                },
                                '&:hover': {
                                    boxShadow: '0 12px 32px rgba(67, 233, 123, 0.35)',
                                    transform: 'translateY(-4px) scale(1.02)'
                                }
                            }}>
                                <CardContent sx={{ p: 2, position: 'relative', zIndex: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                        <Box sx={{
                                            p: 1,
                                            borderRadius: 1.5,
                                            backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                            backdropFilter: 'blur(10px)'
                                        }}>
                                            <CheckCircle sx={{ fontSize: '1.5rem' }} />
                                        </Box>
                                    </Box>
                                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.25, fontSize: { xs: '1.5rem', md: '1.75rem' } }}>
                                        {summary.completedProjects || 0}
                                    </Typography>
                                    <Typography variant="body2" sx={{ opacity: 0.9, fontSize: '0.8rem' }}>
                                        {summary.totalProjects > 0 
                                            ? `${Math.round((summary.completedProjects / summary.totalProjects) * 100)}% Completion Rate`
                                            : 'No Projects'
                                        }
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Fade>
                    </Grid>
                </Grid>
            )}

            {/* Tabbed Analytics Sections */}
            <Card sx={{ 
                background: 'white',
                boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
                borderRadius: 4,
                overflow: 'hidden',
                border: '1px solid rgba(0,0,0,0.06)'
            }}>
                <Tabs 
                    value={activeTab} 
                    onChange={(e, newValue) => setActiveTab(newValue)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{
                        background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
                        px: 2,
                        pt: 1,
                        // Remove bottom border to eliminate line clutter
                        borderBottom: 'none',
                        position: 'relative',
                        '&::after': {
                            content: '""',
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: '1px',
                            background: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.08) 50%, transparent 100%)'
                        },
                        '& .MuiTab-root': {
                            textTransform: 'none',
                            fontWeight: 600,
                            minHeight: 48,
                            fontSize: '0.85rem',
                            color: 'text.secondary',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            borderRadius: '8px 8px 0 0',
                            mx: 0.5,
                            mb: -1, // Overlap with content area to create seamless connection
                            position: 'relative',
                            zIndex: 1,
                            py: 1,
                            '&:hover': {
                                backgroundColor: 'rgba(102, 126, 234, 0.06)',
                                color: 'primary.main',
                                transform: 'translateY(-2px)'
                            },
                            '&.Mui-selected': {
                                color: 'primary.main',
                                backgroundColor: 'white',
                                fontWeight: 700,
                                boxShadow: '0 -4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
                                // Create seamless connection with content
                                borderTop: '2px solid',
                                borderLeft: '2px solid',
                                borderRight: '2px solid',
                                borderColor: 'rgba(0,0,0,0.06)',
                                borderBottom: 'none',
                                // Add subtle gradient accent at top
                                '&::before': {
                                    content: '""',
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: '3px',
                                    background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
                                    borderRadius: '12px 12px 0 0'
                                }
                            }
                        },
                        // Hide the default indicator since we're using custom styling
                        '& .MuiTabs-indicator': {
                            display: 'none'
                        }
                    }}
                >
                    <Tab icon={<BarChartIcon />} iconPosition="start" label="Project Trends" />
                    <Tab icon={<AttachMoney />} iconPosition="start" label="Financial Trends" />
                    <Tab icon={<PieChartIcon />} iconPosition="start" label="Status Distribution" />
                    <Tab icon={<Business />} iconPosition="start" label="Department Analytics" />
                    <Tab icon={<ShowChart />} iconPosition="start" label="Performance Metrics" />
                    <Tab icon={<Speed />} iconPosition="start" label="Efficiency Analysis" />
                    <Tab icon={<Assessment />} iconPosition="start" label="Top & Bottom Performers" />
                </Tabs>

                <Box sx={{ p: { xs: 1.5, sm: 2, md: 2.5 } }}>
                    {/* Project Trends Tab */}
                    {activeTab === 0 && (
                        <Fade in timeout={600}>
                            <Box>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} md={8}>
                                        <Card sx={{ 
                                            mb: 2,
                                            borderRadius: 2,
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 16px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.95rem' }}>
                                                        Project Completion Trends
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                                        Yearly project completion statistics
                                                    </Typography>
                                                }
                                                sx={{ pb: 0.5, pt: 1.5, px: 2 }}
                                            />
                                            <CardContent sx={{ pt: 0, px: 2, pb: 1.5 }}>
                                                {projectTrends.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 400, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <BarChartIcon sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No project trend data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height={250}>
                                                        <BarChart data={projectTrends}>
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis dataKey="name" />
                                                            <YAxis />
                                                            <Tooltip />
                                                            <Legend />
                                                            <Bar dataKey="totalProjects" fill="#3b82f6" name="Total Projects" radius={[4, 4, 0, 0]} />
                                                            <Bar dataKey="completedProjects" fill="#10b981" name="Completed" radius={[4, 4, 0, 0]} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>

                                    <Grid item xs={12} md={4}>
                                        <Card sx={{ 
                                            borderRadius: 2,
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 16px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.95rem' }}>
                                                        Completion Rate Trend
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                                        Percentage completion over time
                                                    </Typography>
                                                }
                                                sx={{ pb: 0.5, pt: 1.5, px: 2 }}
                                            />
                                            <CardContent sx={{ pt: 0, px: 2, pb: 1.5 }}>
                                                {completionTrends.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 400, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <ShowChart sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No completion data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height={250}>
                                                        <LineChart data={completionTrends}>
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis dataKey="name" />
                                                            <YAxis />
                                                            <Tooltip formatter={(value) => `${value}%`} />
                                                            <Legend />
                                                            <Line 
                                                                type="monotone" 
                                                                dataKey="completionRate" 
                                                                stroke="#3b82f6" 
                                                                strokeWidth={2}
                                                                dot={{ r: 4 }}
                                                                name="Completion Rate %"
                                                            />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>

                                    <Grid item xs={12}>
                                        <Card sx={{ 
                                            borderRadius: 2,
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 16px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.95rem' }}>
                                                        Project Trends Summary
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                                                        Detailed yearly breakdown
                                                    </Typography>
                                                }
                                                sx={{ pb: 0.5, pt: 1.5, px: 2 }}
                                            />
                                            <CardContent sx={{ pt: 0, px: 2, pb: 1.5 }}>
                                                <TableContainer sx={{ borderRadius: 2, overflow: 'hidden' }}>
                                                    <Table size="small">
                                                        <TableHead>
                                                            <TableRow sx={{ backgroundColor: 'rgba(102, 126, 234, 0.08)' }}>
                                                                <TableCell sx={{ fontWeight: 700, color: 'text.primary' }}>Year</TableCell>
                                                                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>Total Projects</TableCell>
                                                                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>Completed</TableCell>
                                                                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>Completion Rate</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {projectTrends.map((row, index) => (
                                                                <TableRow 
                                                                    key={index} 
                                                                    hover
                                                                    sx={{ 
                                                                        '&:nth-of-type(even)': { backgroundColor: 'rgba(0,0,0,0.02)' },
                                                                        transition: 'background-color 0.2s ease',
                                                                        '&:hover': { backgroundColor: 'rgba(102, 126, 234, 0.05)' }
                                                                    }}
                                                                >
                                                                    <TableCell>{row.name}</TableCell>
                                                                    <TableCell align="right">{row.totalProjects}</TableCell>
                                                                    <TableCell align="right">{row.completedProjects}</TableCell>
                                                                    <TableCell align="right">
                                                                        <Chip 
                                                                            label={`${row.completionRate.toFixed(1)}%`}
                                                                            size="small"
                                                                            color={row.completionRate >= 80 ? 'success' : row.completionRate >= 60 ? 'warning' : 'error'}
                                                                        />
                                                                    </TableCell>
                                                                </TableRow>
                                                            ))}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                </Grid>
                            </Box>
                        </Fade>
                    )}

                    {/* Financial Trends Tab */}
                    {activeTab === 1 && (
                        <Fade in timeout={600}>
                            <Box>
                                <Grid container spacing={3}>
                                    <Grid item xs={12}>
                                        <Card sx={{ 
                                            mb: 3,
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                        Financial Performance Trends
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Budget vs expenditure over time
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                {financialTrends.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 400, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <AttachMoney sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No financial trend data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height={250}>
                                                        <LineChart data={financialTrends}>
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis dataKey="name" />
                                                            <YAxis tickFormatter={(value) => formatCurrency(value)} />
                                                            <Tooltip formatter={(value) => formatCurrency(value)} />
                                                            <Legend />
                                                            <Line 
                                                                type="monotone" 
                                                                dataKey="totalBudget" 
                                                                stroke="#3b82f6" 
                                                                strokeWidth={2}
                                                                dot={{ r: 4 }}
                                                                name="Total Budget"
                                                            />
                                                            <Line 
                                                                type="monotone" 
                                                                dataKey="totalExpenditure" 
                                                                stroke="#ef4444" 
                                                                strokeWidth={2}
                                                                dot={{ r: 4 }}
                                                                name="Total Expenditure"
                                                            />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>

                                    <Grid item xs={12} md={6}>
                                        <Card sx={{ 
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                        Disbursement Rate Trend
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Budget disbursement percentage
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                {financialTrends.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 300, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <BarChartIcon sx={{ fontSize: 40, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height={250}>
                                                        <BarChart data={financialTrends}>
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis dataKey="name" />
                                                            <YAxis tickFormatter={(value) => `${value}%`} />
                                                            <Tooltip formatter={(value) => `${value.toFixed(2)}%`} />
                                                            <Bar dataKey="absorptionRate" fill="#10b981" radius={[4, 4, 0, 0]} name="Disbursement Rate %" />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>

                                    <Grid item xs={12} md={6}>
                                        <Card sx={{ 
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                        Budget Allocation by Status
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Financial distribution across project statuses
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                {budgetByStatus.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 300, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <PieChartIcon sx={{ fontSize: 40, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No budget data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height={250}>
                                                        <PieChart>
                                                            <Pie
                                                                data={budgetByStatus}
                                                                cx="50%"
                                                                cy="50%"
                                                                labelLine={false}
                                                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                                outerRadius={100}
                                                                fill="#8884d8"
                                                                dataKey="budget"
                                                            >
                                                                {budgetByStatus.map((entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip formatter={(value) => formatCurrency(value)} />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                </Grid>
                            </Box>
                        </Fade>
                    )}

                    {/* Status Distribution Tab */}
                    {activeTab === 2 && (
                        <Fade in timeout={600}>
                            <Box>
                                <Grid container spacing={3}>
                                    <Grid item xs={12} md={6}>
                                        <Card sx={{ 
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                        Project Status Distribution
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Projects categorized by status
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                {statusDistribution.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 400, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <PieChartIcon sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No status data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height={250}>
                                                        <PieChart>
                                                            <Pie
                                                                data={statusDistribution}
                                                                cx="50%"
                                                                cy="50%"
                                                                labelLine={false}
                                                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                                outerRadius={120}
                                                                fill="#8884d8"
                                                                dataKey="value"
                                                            >
                                                                {statusDistribution.map((entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>

                                    <Grid item xs={12} md={6}>
                                        <Card sx={{ 
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                        Status Breakdown
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Detailed status statistics
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                <TableContainer sx={{ borderRadius: 2, overflow: 'hidden' }}>
                                                    <Table size="small">
                                                        <TableHead>
                                                            <TableRow sx={{ backgroundColor: 'rgba(102, 126, 234, 0.08)' }}>
                                                                <TableCell sx={{ fontWeight: 700, color: 'text.primary' }}>Status</TableCell>
                                                                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>Count</TableCell>
                                                                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>Percentage</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {statusDistribution
                                                                .sort((a, b) => b.value - a.value)
                                                                .map((row, index) => {
                                                                    const total = statusDistribution.reduce((sum, item) => sum + item.value, 0);
                                                                    const percentage = total > 0 ? (row.value / total * 100).toFixed(1) : 0;
                                                                    return (
                                                                        <TableRow 
                                                                            key={index} 
                                                                            hover
                                                                            sx={{ 
                                                                                '&:nth-of-type(even)': { backgroundColor: 'rgba(0,0,0,0.02)' },
                                                                                transition: 'background-color 0.2s ease',
                                                                                '&:hover': { backgroundColor: 'rgba(102, 126, 234, 0.05)' }
                                                                            }}
                                                                        >
                                                                            <TableCell>
                                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                                    <Box 
                                                                                        sx={{ 
                                                                                            width: 12, 
                                                                                            height: 12, 
                                                                                            borderRadius: '50%', 
                                                                                            bgcolor: row.color 
                                                                                        }} 
                                                                                    />
                                                                                    {row.name}
                                                                                </Box>
                                                                            </TableCell>
                                                                            <TableCell align="right">{row.value}</TableCell>
                                                                            <TableCell align="right">
                                                                                <Chip 
                                                                                    label={`${percentage}%`}
                                                                                    size="small"
                                                                                    sx={{ bgcolor: row.color, color: 'white' }}
                                                                                />
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    );
                                                                })}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                </Grid>
                            </Box>
                        </Fade>
                    )}

                    {/* Department Analytics Tab */}
                    {activeTab === 3 && (
                        <Fade in timeout={600}>
                            <Box>
                                <Grid container spacing={3}>
                                    <Grid item xs={12}>
                                        <Card sx={{ 
                                            mb: 3,
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                        Department Project Distribution
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Projects and budget by department
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                {departmentData.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 400, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <Business sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No department data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height={250}>
                                                        <BarChart data={departmentData.slice(0, 10)}>
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                                            <YAxis />
                                                            <Tooltip />
                                                            <Legend />
                                                            <Bar dataKey="projects" fill="#3b82f6" name="Projects" radius={[4, 4, 0, 0]} />
                                                            <Bar dataKey="budget" fill="#10b981" name="Budget (KSh)" radius={[4, 4, 0, 0]} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>

                                    <Grid item xs={12}>
                                        <Card sx={{ 
                                            borderRadius: 2,
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 16px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                        Ministry Performance Details
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Comprehensive department statistics
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                <TableContainer sx={{ borderRadius: 2, overflow: 'hidden' }}>
                                                    <Table size="small">
                                                        <TableHead>
                                                            <TableRow sx={{ backgroundColor: 'rgba(102, 126, 234, 0.08)' }}>
                                                                <TableCell sx={{ fontWeight: 700, color: 'text.primary' }}>Department</TableCell>
                                                                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>Projects</TableCell>
                                                                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>Budget</TableCell>
                                                                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>User Registration</TableCell>
                                                                <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>Progress</TableCell>
                                                            </TableRow>
                                                        </TableHead>
                                                        <TableBody>
                                                            {departmentData
                                                                .sort((a, b) => b.projects - a.projects)
                                                                .map((row, index) => (
                                                                    <TableRow 
                                                                        key={index} 
                                                                        hover
                                                                        sx={{ 
                                                                            '&:nth-of-type(even)': { backgroundColor: 'rgba(0,0,0,0.02)' },
                                                                            transition: 'background-color 0.2s ease',
                                                                            '&:hover': { backgroundColor: 'rgba(102, 126, 234, 0.05)' }
                                                                        }}
                                                                    >
                                                                        <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                                                                        <TableCell align="right">{row.projects}</TableCell>
                                                                        <TableCell align="right">{formatCurrency(row.budget)}</TableCell>
                                                                        <TableCell align="right">{formatNumber(row.userRegistration)}</TableCell>
                                                                        <TableCell align="right">
                                                                            <Chip 
                                                                                label={`${row.progress.toFixed(1)}%`}
                                                                                size="small"
                                                                                color={row.progress >= 80 ? 'success' : row.progress >= 50 ? 'warning' : 'error'}
                                                                            />
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                        </TableBody>
                                                    </Table>
                                                </TableContainer>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                </Grid>
                            </Box>
                        </Fade>
                    )}

                    {/* Efficiency Analysis Tab */}
                    {activeTab === 5 && (
                        <Fade in timeout={600}>
                            <Box>
                                <Grid container spacing={3}>
                                    <Grid item xs={12}>
                                        <Card sx={{ 
                                            mb: 3,
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                        Budget Efficiency Analysis
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Progress vs Budget Utilization Ratio (Higher is better)
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                {budgetEfficiency.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 400, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <Speed sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No efficiency data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <TableContainer sx={{ borderRadius: 2, overflow: 'hidden' }}>
                                                        <Table size="small">
                                                            <TableHead>
                                                                <TableRow sx={{ backgroundColor: 'rgba(102, 126, 234, 0.08)' }}>
                                                                    <TableCell sx={{ fontWeight: 700, color: 'text.primary' }}>Department</TableCell>
                                                                    <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>Progress %</TableCell>
                                                                    <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>Budget Util. %</TableCell>
                                                                    <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>Efficiency Ratio</TableCell>
                                                                    <TableCell align="right" sx={{ fontWeight: 700, color: 'text.primary' }}>Status</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {budgetEfficiency.map((row, index) => (
                                                                    <TableRow 
                                                                        key={index} 
                                                                        hover
                                                                        sx={{ 
                                                                            '&:nth-of-type(even)': { backgroundColor: 'rgba(0,0,0,0.02)' },
                                                                            transition: 'background-color 0.2s ease',
                                                                            '&:hover': { backgroundColor: 'rgba(102, 126, 234, 0.05)' }
                                                                        }}
                                                                    >
                                                                        <TableCell sx={{ fontWeight: 600 }}>{row.name}</TableCell>
                                                                        <TableCell align="right">
                                                                            <Chip 
                                                                                label={`${row.progress.toFixed(1)}%`}
                                                                                size="small"
                                                                                color={row.progress >= 80 ? 'success' : row.progress >= 50 ? 'warning' : 'error'}
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell align="right">
                                                                            <Chip 
                                                                                label={`${row.budgetUtilization.toFixed(1)}%`}
                                                                                size="small"
                                                                                color={row.budgetUtilization <= 70 ? 'success' : row.budgetUtilization <= 90 ? 'warning' : 'error'}
                                                                            />
                                                                        </TableCell>
                                                                        <TableCell align="right">
                                                                            <Typography variant="body2" sx={{ 
                                                                                fontWeight: 700,
                                                                                color: row.efficiencyRatio > 1.2 ? 'success.main' : row.efficiencyRatio > 0.8 ? 'info.main' : row.efficiencyRatio > 0.5 ? 'warning.main' : 'error.main'
                                                                            }}>
                                                                                {row.efficiencyRatio.toFixed(2)}x
                                                                            </Typography>
                                                                        </TableCell>
                                                                        <TableCell align="right">
                                                                            <Chip 
                                                                                label={row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                                                                                size="small"
                                                                                color={row.status === 'excellent' ? 'success' : row.status === 'good' ? 'info' : row.status === 'fair' ? 'warning' : 'error'}
                                                                                icon={row.status === 'excellent' ? <CheckCircleOutline /> : row.status === 'poor' ? <Cancel /> : <Info />}
                                                                            />
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </TableContainer>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                        <Card sx={{ 
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                        Efficiency Distribution
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Departments by efficiency status
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                {budgetEfficiency.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 300, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <PieChartIcon sx={{ fontSize: 40, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height={250}>
                                                        <PieChart>
                                                            <Pie
                                                                data={[
                                                                    { name: 'Excellent', value: budgetEfficiency.filter(e => e.status === 'excellent').length, color: '#10b981' },
                                                                    { name: 'Good', value: budgetEfficiency.filter(e => e.status === 'good').length, color: '#3b82f6' },
                                                                    { name: 'Fair', value: budgetEfficiency.filter(e => e.status === 'fair').length, color: '#f59e0b' },
                                                                    { name: 'Poor', value: budgetEfficiency.filter(e => e.status === 'poor').length, color: '#ef4444' }
                                                                ]}
                                                                cx="50%"
                                                                cy="50%"
                                                                labelLine={false}
                                                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                                                outerRadius={100}
                                                                fill="#8884d8"
                                                                dataKey="value"
                                                            >
                                                                {[
                                                                    { name: 'Excellent', value: budgetEfficiency.filter(e => e.status === 'excellent').length, color: '#10b981' },
                                                                    { name: 'Good', value: budgetEfficiency.filter(e => e.status === 'good').length, color: '#3b82f6' },
                                                                    { name: 'Fair', value: budgetEfficiency.filter(e => e.status === 'fair').length, color: '#f59e0b' },
                                                                    { name: 'Poor', value: budgetEfficiency.filter(e => e.status === 'poor').length, color: '#ef4444' }
                                                                ].map((entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                        <Card sx={{ 
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                        Efficiency vs Budget
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Scatter analysis of efficiency
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                {budgetEfficiency.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 300, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <BarChartIcon sx={{ fontSize: 40, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height={250}>
                                                        <BarChart data={budgetEfficiency.slice(0, 10)}>
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                                                            <YAxis />
                                                            <Tooltip />
                                                            <Legend />
                                                            <Bar dataKey="efficiencyRatio" fill="#3b82f6" name="Efficiency Ratio" radius={[4, 4, 0, 0]} />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                </Grid>
                            </Box>
                        </Fade>
                    )}

                    {/* Top & Bottom Performers Tab */}
                    {activeTab === 6 && (
                        <Fade in timeout={600}>
                            <Box>
                                <Grid container spacing={3}>
                                    <Grid item xs={12} md={6}>
                                        <Card sx={{ 
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <TrendingUp sx={{ color: 'success.main' }} />
                                                        <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                            Top Performers
                                                        </Typography>
                                                    </Box>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Departments with best progress and budget management
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                {topPerformers.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 400, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <CheckCircle sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No performance data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <Box sx={{ space: 2 }}>
                                                        {topPerformers.map((dept, index) => (
                                                            <Box key={index} sx={{ 
                                                                mb: 2, 
                                                                p: 2, 
                                                                borderRadius: 2, 
                                                                background: 'linear-gradient(135deg, #10b98115 0%, #3b82f615 100%)',
                                                                border: '1px solid',
                                                                borderColor: 'success.light'
                                                            }}>
                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                        <Box sx={{
                                                                            width: 32,
                                                                            height: 32,
                                                                            borderRadius: '50%',
                                                                            background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
                                                                            color: 'white',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            fontWeight: 700,
                                                                            fontSize: '0.875rem'
                                                                        }}>
                                                                            {index + 1}
                                                                        </Box>
                                                                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                                                            {dept.name}
                                                                        </Typography>
                                                                    </Box>
                                                                    <Chip 
                                                                        label={`Score: ${dept.efficiencyScore}`}
                                                                        size="small"
                                                                        color="success"
                                                                    />
                                                                </Box>
                                                                <Grid container spacing={2} sx={{ mt: 1 }}>
                                                                    <Grid item xs={6}>
                                                                        <Typography variant="caption" color="text.secondary">Progress</Typography>
                                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                            {dept.progress.toFixed(1)}%
                                                                        </Typography>
                                                                    </Grid>
                                                                    <Grid item xs={6}>
                                                                        <Typography variant="caption" color="text.secondary">Budget Util.</Typography>
                                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                            {dept.budgetUtilization.toFixed(1)}%
                                                                        </Typography>
                                                                    </Grid>
                                                                    <Grid item xs={6}>
                                                                        <Typography variant="caption" color="text.secondary">Projects</Typography>
                                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                            {dept.projects}
                                                                        </Typography>
                                                                    </Grid>
                                                                    <Grid item xs={6}>
                                                                        <Typography variant="caption" color="text.secondary">Budget</Typography>
                                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                            {formatCurrency(dept.budget)}
                                                                        </Typography>
                                                                    </Grid>
                                                                </Grid>
                                                            </Box>
                                                        ))}
                                                    </Box>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                    <Grid item xs={12} md={6}>
                                        <Card sx={{ 
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <TrendingDown sx={{ color: 'error.main' }} />
                                                        <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                            Under Performers
                                                        </Typography>
                                                    </Box>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Departments requiring attention
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                {underPerformers.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 400, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <Warning sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No performance data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <Box sx={{ space: 2 }}>
                                                        {underPerformers.map((dept, index) => (
                                                            <Box key={index} sx={{ 
                                                                mb: 2, 
                                                                p: 2, 
                                                                borderRadius: 2, 
                                                                background: 'linear-gradient(135deg, #ef444415 0%, #f59e0b15 100%)',
                                                                border: '1px solid',
                                                                borderColor: 'error.light'
                                                            }}>
                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                        <Box sx={{
                                                                            width: 32,
                                                                            height: 32,
                                                                            borderRadius: '50%',
                                                                            background: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)',
                                                                            color: 'white',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            fontWeight: 700,
                                                                            fontSize: '0.875rem'
                                                                        }}>
                                                                            {index + 1}
                                                                        </Box>
                                                                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                                                                            {dept.name}
                                                                        </Typography>
                                                                    </Box>
                                                                    <Chip 
                                                                        label={`Score: ${dept.efficiencyScore}`}
                                                                        size="small"
                                                                        color="error"
                                                                    />
                                                                </Box>
                                                                <Grid container spacing={2} sx={{ mt: 1 }}>
                                                                    <Grid item xs={6}>
                                                                        <Typography variant="caption" color="text.secondary">Progress</Typography>
                                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                            {dept.progress.toFixed(1)}%
                                                                        </Typography>
                                                                    </Grid>
                                                                    <Grid item xs={6}>
                                                                        <Typography variant="caption" color="text.secondary">Budget Util.</Typography>
                                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                            {dept.budgetUtilization.toFixed(1)}%
                                                                        </Typography>
                                                                    </Grid>
                                                                    <Grid item xs={6}>
                                                                        <Typography variant="caption" color="text.secondary">Projects</Typography>
                                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                            {dept.projects}
                                                                        </Typography>
                                                                    </Grid>
                                                                    <Grid item xs={6}>
                                                                        <Typography variant="caption" color="text.secondary">Budget</Typography>
                                                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                                            {formatCurrency(dept.budget)}
                                                                        </Typography>
                                                                    </Grid>
                                                                </Grid>
                                                            </Box>
                                                        ))}
                                                    </Box>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                </Grid>
                            </Box>
                        </Fade>
                    )}

                    {/* Performance Metrics Tab */}
                    {activeTab === 4 && (
                        <Fade in timeout={600}>
                            <Box>
                                <Grid container spacing={3}>
                                    <Grid item xs={12} md={6}>
                                        <Card sx={{ 
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                        Department Progress
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Completion progress by department
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                {departmentPerformance.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 400, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <Assessment sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No performance data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height={250}>
                                                        <BarChart 
                                                            data={departmentPerformance.slice(0, 10)}
                                                            layout="vertical"
                                                        >
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis type="number" domain={[0, 100]} />
                                                            <YAxis type="category" dataKey="name" width={120} />
                                                            <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                                                            <Bar dataKey="progress" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Progress %" />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>

                                    <Grid item xs={12} md={6}>
                                        <Card sx={{ 
                                            borderRadius: 3,
                                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid rgba(0,0,0,0.06)',
                                            transition: 'all 0.3s ease',
                                            '&:hover': {
                                                boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
                                            }
                                        }}>
                                            <CardHeader
                                                title={
                                                    <Typography variant="h6" sx={{ fontWeight: 700, color: 'text.primary' }}>
                                                        Budget Utilization
                                                    </Typography>
                                                }
                                                subheader={
                                                    <Typography variant="body2" color="text.secondary">
                                                        Budget disbursement by department
                                                    </Typography>
                                                }
                                                sx={{ pb: 1 }}
                                            />
                                            <CardContent sx={{ pt: 0 }}>
                                                {departmentPerformance.length === 0 ? (
                                                    <Box sx={{ 
                                                        height: 400, 
                                                        display: 'flex', 
                                                        flexDirection: 'column',
                                                        alignItems: 'center', 
                                                        justifyContent: 'center',
                                                        gap: 2
                                                    }}>
                                                        <TrendingUp sx={{ fontSize: 48, color: 'text.disabled', opacity: 0.5 }} />
                                                        <Typography color="text.secondary" sx={{ fontWeight: 500 }}>
                                                            No utilization data available
                                                        </Typography>
                                                    </Box>
                                                ) : (
                                                    <ResponsiveContainer width="100%" height={250}>
                                                        <BarChart 
                                                            data={departmentPerformance.slice(0, 10)}
                                                            layout="vertical"
                                                        >
                                                            <CartesianGrid strokeDasharray="3 3" />
                                                            <XAxis type="number" domain={[0, 100]} />
                                                            <YAxis type="category" dataKey="name" width={120} />
                                                            <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                                                            <Bar dataKey="budgetUtilization" fill="#10b981" radius={[0, 4, 4, 0]} name="Budget Utilization %" />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                </Grid>
                            </Box>
                        </Fade>
                    )}
                </Box>
            </Card>
        </Box>
    );
}

