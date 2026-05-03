const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const authenticate = require('./middleware/authenticate');

// Import all your route groups
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const orgRoutes = require('./routes/orgRoutes');
const strategyRoutes = require('./routes/strategic.routes');
const participantRoutes = require('./routes/participantRoutes');
const generalRoutes = require('./routes/generalRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const metaDataRoutes = require('./routes/metaDataRoutes');
const taskRoutes = require('./routes/taskRoutes');
const milestoneRoutes = require('./routes/milestoneRoutes');
const taskAssigneesRoutes = require('./routes/taskAssigneesRoutes');
const taskDependenciesRoutes = require('./routes/taskDependenciesRoutes');
/* SCOPE_DOWN: contractors/contractor_users tables removed. Re-enable when restoring for wider market. */
const contractorRoutes = require('./routes/contractorRoutes');
// const paymentRequestRoutes = require('./routes/paymentRequestRoutes');
const contractorPhotoRoutes = require('./routes/contractorPhotoRoutes');
const hrRoutes = require('./routes/humanResourceRoutes');
const projectDocumentsRoutes = require('./routes/projectDocumentsRoutes');
const workflowRoutes = require('./routes/projectWorkflowRoutes');
const approvalLevelsRoutes = require('./routes/approvalLevelsRoutes');
const approvalWorkflowRoutes = require('./routes/approvalWorkflowRoutes');
const paymentStatusRoutes = require('./routes/paymentStatusRoutes');
const dashboardConfigRoutes = require('./routes/dashboardConfigRoutes');
const dataAccessRoutes = require('./routes/dataAccessRoutes');
const chatRoutes = require('./routes/chatRoutes');

// NEW: Consolidated reporting routes under a single router
const reportsRouter = require('./routes/reportsRouter')
const projectRouter = require('./routes/projectRouter')
const publicRoutes = require('./routes/publicRoutes')
const moderationRoutes = require('./routes/moderationRoutes')
const countyProposedProjectsRoutes = require('./routes/countyProposedProjectsRoutes')
const jobCategoriesRoutes = require('./routes/jobCategoriesRoutes')
const kenyaWardsRoutes = require('./routes/kenyaWardsRoutes')
const agenciesRoutes = require('./routes/agenciesRoutes')
const projectAnnouncementsRoutes = require('./routes/projectAnnouncementsRoutes')
const citizenProposalsRoutes = require('./routes/citizenProposalsRoutes')
const comprehensiveProjectRoutes = require('./routes/comprehensiveProjectRoutes')
const budgetRoutes = require('./routes/budgetRoutes')
const budgetContainerRoutes = require('./routes/budgetContainerRoutes')
const planningIndicatorsRoutes = require('./routes/planningIndicatorsRoutes')

const port = Number(process.env.PORT) || 3001;
const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: '*',
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

// Initialize Socket.IO with CORS
const io = new Server(server, {
  cors: corsOptions
});

// Handle preflight requests
app.options('*', cors(corsOptions));

// Increase JSON payload limit for large imports (metadata mapping checks).
// strict: false allows any JSON value as root (some proxies/clients send odd payloads; avoids spurious 400 from body-parser).
app.use(express.json({ limit: '50mb', strict: false }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Serve templates publicly (before authentication middleware)
app.use('/api/templates', express.static(path.join(__dirname, 'templates')));

app.get('/', (req, res) => {
    res.send('Welcome to the Government Projects Reporting Platform API!');
});

app.use('/api/auth', authRoutes);

// Public health check (no auth) - use for deployment verification e.g. GET /api/health
app.get('/api/health', (req, res) => {
  res.status(200).json({ ok: true, message: 'API is running' });
});

// PUBLIC ROUTES - No authentication required (must be before authenticate middleware)
app.use('/api/public', publicRoutes);

// IMPORTANT: Mount the new dedicated routers
// The reports router is mounted first to prevent conflicts with project routes.
app.use('/api/reports', reportsRouter);

// Dashboard configuration routes (public for testing)
app.use('/api/dashboard', dashboardConfigRoutes);

// Data access control routes (public for testing)
app.use('/api/data-access', dataAccessRoutes);

app.use('/api', authenticate);
app.use('/api/projects', projectRouter);

// Mount other top-level routers
app.use('/api/users', userRoutes);
app.use('/api/organization', orgRoutes);
app.use('/api/strategy', strategyRoutes);
app.use('/api/planning', planningIndicatorsRoutes);
app.use('/api/participants', participantRoutes);
app.use('/api/general', generalRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/metadata', metaDataRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/task_assignees', taskAssigneesRoutes);
app.use('/api/task_dependencies', taskDependenciesRoutes);
/* SCOPE_DOWN: contractors table removed. Re-enable when restoring for wider market. */
// app.use('/api/contractors', contractorRoutes);
// app.use('/api/contractor-photos', contractorPhotoRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/projects/documents', projectDocumentsRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/approval-levels', approvalLevelsRoutes);
app.use('/api/approval-workflow', approvalWorkflowRoutes);
app.use('/api/payment-status', paymentStatusRoutes);
app.use('/api/job-categories', jobCategoriesRoutes);
app.use('/api/kenya-wards', kenyaWardsRoutes);
app.use('/api/sectors', require('./routes/sectorsRoutes'));
app.use('/api/ministries', require('./routes/ministriesRoutes'));
app.use('/api/agencies', agenciesRoutes);
app.use('/api/chat', chatRoutes(io));
app.use('/api/moderate', moderationRoutes);
app.use('/api/county-proposed-projects', countyProposedProjectsRoutes);
app.use('/api/project-announcements', projectAnnouncementsRoutes);
app.use('/api/citizen-proposals', citizenProposalsRoutes);
app.use('/api/comprehensive-projects', comprehensiveProjectRoutes);
app.use('/api/budgets', budgetContainerRoutes); // New budget container system routes (register first to avoid conflicts)
app.use('/api/budgets', budgetRoutes);

// Mount photo router for photo approval endpoints
const { photoRouter } = require('./routes/projectPhotoRoutes');
app.use('/api/project_photos', photoRouter);

app.use((err, req, res, next) => {
    console.error(err.stack);
    const statusCode = err.statusCode || 500;
    const errorMessage = err.message || 'An unexpected error occurred.';
    res.status(statusCode).json({
        message: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
});

// Socket.IO connection handling
require('./socket/chatSocket')(io);

server.listen(port, () => {
    // Use local/container host in logs; avoid hard-coding any production IPs here.
    const host = process.env.API_HOST || 'localhost';
    console.log(`Government Projects Reporting Platform API listening at http://${host}:${port}`);
    console.log(`Socket.IO server initialized`);
    console.log(`CORS enabled for all origins during development.`);
});

module.exports = { app, server, io };