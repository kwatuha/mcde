const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

// Database connection configuration
const dbConfig = {
  host: process.env.DB_HOST || 'db',
  user: process.env.DB_USER || 'impesUser',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'imbesdb',
  port: process.env.DB_PORT || 3306
};

// Helper function to get database connection
const getConnection = async () => {
  try {
    return await mysql.createConnection(dbConfig);
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
};

// GET /api/dashboard/config/role/{roleName}
router.get('/config/role/:roleName', async (req, res) => {
  try {
    const { roleName } = req.params;
    const connection = await getConnection();
    
    const query = `
      SELECT 
        dt.tab_key,
        dt.tab_name,
        dt.tab_icon,
        dt.tab_order,
        rdc.component_key,
        dc.component_name,
        dc.component_type,
        dc.component_file,
        rdc.component_order,
        rdc.is_required,
        rdc.permissions
      FROM role_dashboard_config rdc
      JOIN dashboard_tabs dt ON rdc.tab_key = dt.tab_key
      JOIN dashboard_components dc ON rdc.component_key = dc.component_key
      WHERE rdc.role_name = ? 
        AND dt.is_active = true 
        AND dc.is_active = true
      ORDER BY dt.tab_order, rdc.component_order
    `;
    
    const [rows] = await connection.execute(query, [roleName]);
    await connection.end();
    
    // Group by tabs
    const tabs = {};
    rows.forEach(row => {
      if (!tabs[row.tab_key]) {
        tabs[row.tab_key] = {
          tab_key: row.tab_key,
          tab_name: row.tab_name,
          tab_icon: row.tab_icon,
          tab_order: row.tab_order,
          components: []
        };
      }
      
      tabs[row.tab_key].components.push({
        component_key: row.component_key,
        component_name: row.component_name,
        component_type: row.component_type,
        component_file: row.component_file,
        component_order: row.component_order,
        is_required: row.is_required,
        permissions: row.permissions && row.permissions !== 'NULL' && row.permissions !== null ? (typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions) : null
      });
    });
    
    res.json({
      role: roleName,
      tabs: Object.values(tabs)
    });
  } catch (error) {
    console.error('Error fetching role dashboard config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/config/user/{userId}
router.get('/config/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const connection = await getConnection();
    
    // Get user role
    const userQuery = 'SELECT r.roleName FROM users u JOIN roles r ON u.roleId = r.roleId WHERE u.userId = ?';
    const [userRows] = await connection.execute(userQuery, [userId]);
    
    if (userRows.length === 0) {
      await connection.end();
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userRole = userRows[0].roleName;
    
    // Get role-based configuration
    const roleConfigQuery = `
      SELECT 
        dt.tab_key,
        dt.tab_name,
        dt.tab_icon,
        dt.tab_order,
        rdc.component_key,
        dc.component_name,
        dc.component_type,
        dc.component_file,
        rdc.component_order,
        rdc.is_required,
        rdc.permissions
      FROM role_dashboard_config rdc
      JOIN dashboard_tabs dt ON rdc.tab_key = dt.tab_key
      JOIN dashboard_components dc ON rdc.component_key = dc.component_key
      WHERE rdc.role_name = ? 
        AND dt.is_active = true 
        AND dc.is_active = true
      ORDER BY dt.tab_order, rdc.component_order
    `;
    
    const [roleRows] = await connection.execute(roleConfigQuery, [userRole]);
    
    // Get user preferences
    const preferencesQuery = `
      SELECT 
        tab_key,
        component_key,
        is_enabled,
        component_order,
        custom_settings
      FROM user_dashboard_preferences
      WHERE user_id = ?
    `;
    
    const [preferencesRows] = await connection.execute(preferencesQuery, [userId]);
    
    // Merge role config with user preferences
    const tabs = {};
    roleRows.forEach(row => {
      if (!tabs[row.tab_key]) {
        tabs[row.tab_key] = {
          tab_key: row.tab_key,
          tab_name: row.tab_name,
          tab_icon: row.tab_icon,
          tab_order: row.tab_order,
          components: []
        };
      }
      
      // Check if user has overridden this component
      const userPreference = preferencesRows.find(
        pref => pref.tab_key === row.tab_key && pref.component_key === row.component_key
      );
      
      if (!userPreference || userPreference.is_enabled) {
        tabs[row.tab_key].components.push({
          component_key: row.component_key,
          component_name: row.component_name,
          component_type: row.component_type,
          component_file: row.component_file,
          component_order: userPreference?.component_order || row.component_order,
          is_required: row.is_required,
          permissions: row.permissions && row.permissions !== 'NULL' && row.permissions !== null ? (typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions) : null,
          custom_settings: userPreference?.custom_settings ? JSON.parse(userPreference.custom_settings) : null
        });
      }
    });
    
    await connection.end();
    
    res.json({
      user_id: parseInt(userId),
      role: userRole,
      tabs: Object.values(tabs)
    });
  } catch (error) {
    console.error('Error fetching user dashboard config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/layout/{userId}
router.get('/layout/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const connection = await getConnection();
    
    const layoutQuery = `
      SELECT 
        dt.tab_key,
        dt.tab_name,
        dt.tab_icon,
        dt.tab_order,
        rdc.component_key,
        dc.component_name,
        dc.component_type,
        dc.component_file,
        rdc.component_order,
        rdc.is_required,
        COALESCE(udp.is_enabled, rdc.is_required) as is_enabled
      FROM users u
      JOIN roles r ON u.roleId = r.roleId
      JOIN role_dashboard_config rdc ON r.roleName = rdc.role_name
      JOIN dashboard_tabs dt ON rdc.tab_key = dt.tab_key
      JOIN dashboard_components dc ON rdc.component_key = dc.component_key
      LEFT JOIN user_dashboard_preferences udp ON u.userId = udp.user_id 
        AND rdc.tab_key = udp.tab_key 
        AND rdc.component_key = udp.component_key
      WHERE u.userId = ? 
        AND dt.is_active = true 
        AND dc.is_active = true
        AND COALESCE(udp.is_enabled, rdc.is_required) = 1
      ORDER BY dt.tab_order, rdc.component_order
    `;
    
    const [rows] = await connection.execute(layoutQuery, [userId]);
    await connection.end();
    
    // Group by tabs
    const tabs = {};
    const components = {};
    
    rows.forEach(row => {
      if (!tabs[row.tab_key]) {
        tabs[row.tab_key] = {
          tab_key: row.tab_key,
          tab_name: row.tab_name,
          tab_icon: row.tab_icon,
          tab_order: row.tab_order
        };
      }
      
      if (!components[row.tab_key]) {
        components[row.tab_key] = [];
      }
      
      components[row.tab_key].push({
        component_key: row.component_key,
        component_name: row.component_name,
        component_type: row.component_type,
        component_file: row.component_file,
        component_order: row.component_order,
        is_required: row.is_required
      });
    });
    
    res.json({
      user_id: parseInt(userId),
      tabs: Object.values(tabs),
      components: components
    });
  } catch (error) {
    console.error('Error fetching dashboard layout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/permissions/user/{userId}
router.get('/permissions/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const connection = await getConnection();
    
    const query = `
      SELECT 
        dp.permission_key,
        dp.permission_name,
        dp.description,
        rdp.granted
      FROM users u
      JOIN roles r ON u.roleId = r.roleId
      JOIN role_dashboard_permissions rdp ON r.roleName = rdp.role_name
      JOIN dashboard_permissions dp ON rdp.permission_key = dp.permission_key
      WHERE u.userId = ? AND dp.is_active = true
    `;
    
    const [rows] = await connection.execute(query, [userId]);
    await connection.end();
    
    const permissions = {};
    rows.forEach(row => {
      permissions[row.permission_key] = {
        permission_name: row.permission_name,
        description: row.description,
        granted: row.granted
      };
    });
    
    res.json(permissions);
  } catch (error) {
    console.error('Error fetching user permissions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/permissions/component/{userId}/{componentKey}
router.get('/permissions/component/:userId/:componentKey', async (req, res) => {
  try {
    const { userId, componentKey } = req.params;
    const connection = await getConnection();
    
    const query = `
      SELECT 
        dc.component_key,
        dc.component_name,
        rdp.granted
      FROM users u
      JOIN roles r ON u.roleId = r.roleId
      JOIN role_dashboard_config rdc ON r.roleName = rdc.role_name
      JOIN dashboard_components dc ON rdc.component_key = dc.component_key
      JOIN role_dashboard_permissions rdp ON r.roleName = rdp.role_name
      JOIN dashboard_permissions dp ON rdp.permission_key = dp.permission_key
      WHERE u.userId = ? 
        AND rdc.component_key = ?
        AND dp.component_key = ?
        AND dc.is_active = true
    `;
    
    const [rows] = await connection.execute(query, [userId, componentKey, componentKey]);
    await connection.end();
    
    const canAccess = rows.length > 0 && rows.every(row => row.granted);
    
    res.json({
      component_key: componentKey,
      canAccess: canAccess,
      permissions: rows
    });
  } catch (error) {
    console.error('Error checking component access:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/permissions/tab/{userId}/{tabKey}
router.get('/permissions/tab/:userId/:tabKey', async (req, res) => {
  try {
    const { userId, tabKey } = req.params;
    const connection = await getConnection();
    
    const query = `
      SELECT 
        dt.tab_key,
        dt.tab_name,
        COUNT(rdc.component_key) as component_count
      FROM users u
      JOIN roles r ON u.roleId = r.roleId
      JOIN role_dashboard_config rdc ON r.roleName = rdc.role_name
      JOIN dashboard_tabs dt ON rdc.tab_key = dt.tab_key
      WHERE u.userId = ? 
        AND rdc.tab_key = ?
        AND dt.is_active = true
      GROUP BY dt.tab_key, dt.tab_name
    `;
    
    const [rows] = await connection.execute(query, [userId, tabKey]);
    await connection.end();
    
    const canAccess = rows.length > 0 && rows[0].component_count > 0;
    
    res.json({
      tab_key: tabKey,
      canAccess: canAccess,
      component_count: rows[0]?.component_count || 0
    });
  } catch (error) {
    console.error('Error checking tab access:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/dashboard/preferences/user/{userId}
router.put('/preferences/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { preferences } = req.body;
    const connection = await getConnection();
    
    const updateQuery = `
      INSERT INTO user_dashboard_preferences 
      (user_id, tab_key, component_key, is_enabled, component_order, custom_settings)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        is_enabled = VALUES(is_enabled),
        component_order = VALUES(component_order),
        custom_settings = VALUES(custom_settings),
        updated_at = CURRENT_TIMESTAMP
    `;
    
    for (const preference of preferences) {
      await connection.execute(updateQuery, [
        userId,
        preference.tab_key,
        preference.component_key,
        preference.is_enabled,
        preference.component_order,
        JSON.stringify(preference.custom_settings)
      ]);
    }
    
    await connection.end();
    
    res.json({ success: true, message: 'Preferences updated successfully' });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin endpoints for managing dashboard configuration
// GET /api/dashboard/admin/components
router.get('/admin/components', async (req, res) => {
  try {
    const connection = await getConnection();
    
    const query = `
      SELECT 
        component_key,
        component_name,
        component_type,
        component_file,
        description,
        is_active,
        created_at,
        updated_at
      FROM dashboard_components
      ORDER BY component_name
    `;
    
    const [rows] = await connection.execute(query);
    await connection.end();
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching components:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/dashboard/admin/components
router.post('/admin/components', async (req, res) => {
  try {
    const { component_key, component_name, component_type, component_file, description } = req.body;
    const connection = await getConnection();
    
    const query = `
      INSERT INTO dashboard_components 
      (component_key, component_name, component_type, component_file, description)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const [result] = await connection.execute(query, [component_key, component_name, component_type, component_file, description]);
    await connection.end();
    
    res.json({ id: result.insertId, component_key, component_name, component_type, component_file, description });
  } catch (error) {
    console.error('Error creating component:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/dashboard/admin/components/{componentKey}
router.put('/admin/components/:componentKey', async (req, res) => {
  try {
    const { componentKey } = req.params;
    const { component_name, component_type, component_file, description, is_active } = req.body;
    const connection = await getConnection();
    
    const query = `
      UPDATE dashboard_components 
      SET 
        component_name = ?,
        component_type = ?,
        component_file = ?,
        description = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE component_key = ?
    `;
    
    const [result] = await connection.execute(query, [component_name, component_type, component_file, description, is_active, componentKey]);
    await connection.end();
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Component not found' });
    }
    
    res.json({ success: true, message: 'Component updated successfully' });
  } catch (error) {
    console.error('Error updating component:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/dashboard/admin/components/{componentKey}
router.delete('/admin/components/:componentKey', async (req, res) => {
  try {
    const { componentKey } = req.params;
    const connection = await getConnection();
    
    const query = 'DELETE FROM dashboard_components WHERE component_key = ?';
    const [result] = await connection.execute(query, [componentKey]);
    await connection.end();
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Component not found' });
    }
    
    res.json({ success: true, message: 'Component deleted successfully' });
  } catch (error) {
    console.error('Error deleting component:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/admin/tabs
router.get('/admin/tabs', async (req, res) => {
  try {
    const connection = await getConnection();
    
    const query = `
      SELECT 
        tab_key,
        tab_name,
        tab_icon,
        tab_order,
        is_active,
        created_at,
        updated_at
      FROM dashboard_tabs
      ORDER BY tab_order, tab_name
    `;
    
    const [rows] = await connection.execute(query);
    await connection.end();
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching tabs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/dashboard/admin/tabs
router.post('/admin/tabs', async (req, res) => {
  try {
    const { tab_key, tab_name, tab_icon, tab_order, is_active } = req.body;
    const connection = await getConnection();
    
    const query = `
      INSERT INTO dashboard_tabs 
      (tab_key, tab_name, tab_icon, tab_order, is_active)
      VALUES (?, ?, ?, ?, ?)
    `;
    
    const [result] = await connection.execute(query, [tab_key, tab_name, tab_icon, tab_order, is_active]);
    await connection.end();
    
    res.json({ id: result.insertId, tab_key, tab_name, tab_icon, tab_order, is_active });
  } catch (error) {
    console.error('Error creating tab:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/admin/permissions
router.get('/admin/permissions', async (req, res) => {
  try {
    const connection = await getConnection();
    
    const query = `
      SELECT 
        permission_key,
        permission_name,
        description,
        component_key,
        is_active,
        created_at,
        updated_at
      FROM dashboard_permissions
      ORDER BY permission_name
    `;
    
    const [rows] = await connection.execute(query);
    await connection.end();
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/dashboard/admin/roles/{roleName}
router.put('/admin/roles/:roleName', async (req, res) => {
  try {
    const { roleName } = req.params;
    const { tabs, components } = req.body;
    const connection = await getConnection();
    
    // Start transaction
    await connection.beginTransaction();
    
    try {
      // Delete existing role configuration
      await connection.execute('DELETE FROM role_dashboard_config WHERE role_name = ?', [roleName]);
      
      // Insert new configuration
      for (const tab of tabs) {
        for (const component of tab.components) {
          await connection.execute(
            'INSERT INTO role_dashboard_config (role_name, tab_key, component_key, component_order, is_required, permissions) VALUES (?, ?, ?, ?, ?, ?)',
            [roleName, tab.tab_key, component.component_key, component.component_order, component.is_required, JSON.stringify(component.permissions)]
          );
        }
      }
      
      await connection.commit();
      await connection.end();
      
      res.json({ success: true, message: 'Role dashboard configuration updated successfully' });
    } catch (error) {
      await connection.rollback();
      await connection.end();
      throw error;
    }
  } catch (error) {
    console.error('Error updating role dashboard config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Statistics and Metrics Endpoints (Moved from dashboardRoutes) ---

/**
 * @route GET /api/dashboard/statistics/:userId
 * @description Get user statistics including project counts and activity
 */
router.get('/statistics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const connection = await getConnection();
    
    // Query project statistics
    const [projectStats] = await connection.query(`
      SELECT 
        COUNT(*) as totalProjects,
        SUM(CASE WHEN LOWER(status) LIKE '%active%' OR LOWER(status) LIKE '%ongoing%' THEN 1 ELSE 0 END) as activeProjects,
        SUM(CASE WHEN LOWER(status) LIKE '%complete%' THEN 1 ELSE 0 END) as completedProjects,
        SUM(CASE WHEN LOWER(status) LIKE '%pending%' OR LOWER(status) LIKE '%proposed%' THEN 1 ELSE 0 END) as pendingProjects
      FROM projects
      WHERE voided = 0
    `);
    
    // Query user statistics
    const [userStats] = await connection.query(`
      SELECT 
        COUNT(*) as totalUsers,
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeUsers,
        SUM(CASE WHEN isActive = 0 THEN 1 ELSE 0 END) as inactiveUsers
      FROM users
    `);
    
    await connection.end();
    
    const statistics = {
      projects: projectStats[0] || { totalProjects: 0, activeProjects: 0, completedProjects: 0, pendingProjects: 0 },
      users: userStats[0] || { totalUsers: 0, activeUsers: 0, inactiveUsers: 0 },
      lastUpdated: new Date().toISOString()
    };
    
    res.status(200).json(statistics);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ message: 'Error fetching statistics', error: error.message });
  }
});

/**
 * @route GET /api/dashboard/metrics/:userId
 * @description Get metrics and KPIs for a user
 */
router.get('/metrics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const connection = await getConnection();
    
    // Query project metrics
    const [metrics] = await connection.query(`
      SELECT 
        COUNT(*) as totalProjects,
        SUM(CASE WHEN LOWER(status) LIKE '%active%' OR LOWER(status) LIKE '%ongoing%' THEN 1 ELSE 0 END) as activeProjects,
        SUM(CASE WHEN LOWER(status) LIKE '%complete%' THEN 1 ELSE 0 END) as completedProjects,
        SUM(costOfProject) as totalBudget,
        SUM(paidOut) as utilizedBudget,
        COUNT(DISTINCT principalInvestigatorStaffId) as teamMembers
      FROM projects
      WHERE voided = 0
    `);
    
    await connection.end();
    
    const metricsData = metrics[0] || {};
    metricsData.pendingApprovals = 0; // Placeholder for approvals
    metricsData.budgetUtilization = metricsData.totalBudget > 0 
      ? Math.round((metricsData.utilizedBudget / metricsData.totalBudget) * 100) 
      : 0;
    
    res.status(200).json(metricsData);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ message: 'Error fetching metrics', error: error.message });
  }
});

/**
 * @route GET /api/dashboard/activity/:userId
 * @description Get recent activity for a user
 */
router.get('/activity/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const connection = await getConnection();
    
    // Query recent project updates
    const [activities] = await connection.query(`
      SELECT 
        projectName as action,
        updatedAt as time,
        'project' as type
      FROM projects
      ORDER BY updatedAt DESC
      LIMIT 10
    `);
    
    await connection.end();
    
    // Format activities
    const recentActivity = activities.map((activity, index) => ({
      id: index + 1,
      action: `Project "${activity.action}" updated`,
      time: activity.time,
      type: activity.type
    }));
    
    res.status(200).json(recentActivity);
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ message: 'Error fetching recent activity', error: error.message });
  }
});

/**
 * @route GET /api/dashboard/notifications/:userId
 * @description Get notifications for a user
 */
router.get('/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Return mock notifications for now
    const notifications = [
      { id: 1, type: 'timeline', title: 'New Timeline Notifications', count: 0, priority: 'low', icon: 'schedule' },
      { id: 2, type: 'project', title: 'New Project Updates', count: 1, priority: 'medium', icon: 'assignment' },
      { id: 3, type: 'task', title: "Today's Pending Tasks", count: 0, priority: 'high', icon: 'warning' },
      { id: 4, type: 'message', title: 'New Messages & Chats', count: 0, priority: 'low', icon: 'email' },
    ];
    
    res.status(200).json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
});

module.exports = router;
