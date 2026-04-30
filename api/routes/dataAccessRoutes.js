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

// GET /api/data-access/user/{userId}/component/{componentKey}
router.get('/user/:userId/component/:componentKey', async (req, res) => {
  try {
    const { userId, componentKey } = req.params;
    const connection = await getConnection();
    
    // Get user's data access configuration
    const accessQuery = `
      SELECT 
        -- User departments
        GROUP_CONCAT(DISTINCT uda.department_id) as user_departments,
        -- User wards  
        GROUP_CONCAT(DISTINCT uwa.ward_id) as user_wards,
        -- User projects
        GROUP_CONCAT(DISTINCT upa.project_id) as user_projects,
        -- Component access rules
        car.rule_config,
        -- User data filters (we'll fetch these separately)
        COUNT(DISTINCT udf.id) as filter_count
      FROM users u
      LEFT JOIN user_department_assignments uda ON u.userId = uda.user_id
      LEFT JOIN user_ward_assignments uwa ON u.userId = uwa.user_id  
      LEFT JOIN user_project_assignments upa ON u.userId = upa.user_id
      LEFT JOIN component_data_access_rules car ON car.component_key = ?
      LEFT JOIN user_data_filters udf ON u.userId = udf.user_id AND udf.is_active = 1
      WHERE u.userId = ?
      GROUP BY u.userId, car.rule_config
    `;
    
    const [rows] = await connection.execute(accessQuery, [componentKey, userId]);
    
    // Fetch user filters separately
    const filtersQuery = `
      SELECT filter_type, filter_value 
      FROM user_data_filters 
      WHERE user_id = ? AND is_active = 1
    `;
    const [filterRows] = await connection.execute(filtersQuery, [userId]);
    
    await connection.end();
    
    if (rows.length === 0) {
      return res.json({
        userDepartments: [],
        userWards: [],
        userProjects: [],
        departmentFilter: false,
        wardFilter: false,
        projectFilter: false,
        budgetFilter: false,
        statusFilter: false,
        customFilters: []
      });
    }
    
    const row = rows[0];
    const ruleConfig = row.rule_config ? (typeof row.rule_config === 'string' ? JSON.parse(row.rule_config) : row.rule_config) : {};
    
    // Parse user filters from separate query
    const userFilters = {};
    filterRows.forEach(filterRow => {
      try {
        userFilters[filterRow.filter_type] = typeof filterRow.filter_value === 'string' 
          ? JSON.parse(filterRow.filter_value) 
          : filterRow.filter_value;
      } catch (e) {
        userFilters[filterRow.filter_type] = filterRow.filter_value;
      }
    });
    
    const response = {
      userDepartments: row.user_departments ? row.user_departments.split(',').map(id => parseInt(id)) : [],
      userWards: row.user_wards ? row.user_wards.split(',').map(id => parseInt(id)) : [],
      userProjects: row.user_projects ? row.user_projects.split(',').map(id => parseInt(id)) : [],
      departmentFilter: ruleConfig.apply_department_filter || false,
      wardFilter: ruleConfig.apply_ward_filter || false,
      projectFilter: ruleConfig.apply_project_assignment || false,
      budgetFilter: ruleConfig.apply_budget_filter || false,
      statusFilter: ruleConfig.apply_status_filter || false,
      budgetRange: userFilters.budget_range || null,
      allowedStatuses: userFilters.progress_status || null,
      customFilters: userFilters.custom || []
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching user data access:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/data-access/user/{userId}/departments
router.get('/user/:userId/departments', async (req, res) => {
  try {
    const { userId } = req.params;
    const connection = await getConnection();
    
    const query = `
      SELECT 
        d.departmentId,
        d.name as departmentName,
        uda.is_primary
      FROM user_department_assignments uda
      JOIN departments d ON uda.department_id = d.departmentId
      WHERE uda.user_id = ?
      ORDER BY uda.is_primary DESC, d.name
    `;
    
    const [rows] = await connection.execute(query, [userId]);
    await connection.end();
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching user departments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/data-access/user/{userId}/wards
router.get('/user/:userId/wards', async (req, res) => {
  try {
    const { userId } = req.params;
    const connection = await getConnection();
    
    const query = `
      SELECT 
        w.wardId,
        w.name as wardName,
        uwa.access_level
      FROM user_ward_assignments uwa
      JOIN wards w ON uwa.ward_id = w.wardId
      WHERE uwa.user_id = ?
      ORDER BY w.name
    `;
    
    const [rows] = await connection.execute(query, [userId]);
    await connection.end();
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching user wards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/data-access/user/{userId}/projects
router.get('/user/:userId/projects', async (req, res) => {
  try {
    const { userId } = req.params;
    const connection = await getConnection();
    
    const query = `
      SELECT 
        p.id as projectId,
        p.projectName,
        upa.access_level
      FROM user_project_assignments upa
      JOIN projects p ON upa.project_id = p.id
      WHERE upa.user_id = ?
      ORDER BY p.projectName
    `;
    
    const [rows] = await connection.execute(query, [userId]);
    await connection.end();
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/data-access/user/{userId}/filtered-projects
router.get('/user/:userId/filtered-projects', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, minBudget, maxBudget, department } = req.query;
    const connection = await getConnection();
    
    // Build dynamic query based on user access
    let query = `
      SELECT DISTINCT
        p.id,
        p.projectName,
        p.allocatedBudget,
        p.contractSum,
        p.amountPaid,
        p.status,
        d.name as departmentName,
        w.wardName
      FROM projects p
      LEFT JOIN departments d ON p.departmentId = d.departmentId
      LEFT JOIN project_wards pw ON p.id = pw.projectId
      LEFT JOIN wards w ON pw.wardId = w.wardId
      WHERE p.voided = 0
    `;
    
    const params = [];
    
    // Apply user-specific filters
    const userAccessQuery = `
      SELECT 
        GROUP_CONCAT(DISTINCT uda.department_id) as departments,
        GROUP_CONCAT(DISTINCT uwa.ward_id) as wards,
        GROUP_CONCAT(DISTINCT upa.project_id) as projects
      FROM users u
      LEFT JOIN user_department_assignments uda ON u.userId = uda.user_id
      LEFT JOIN user_ward_assignments uwa ON u.userId = uwa.user_id
      LEFT JOIN user_project_assignments upa ON u.userId = upa.user_id
      WHERE u.userId = ?
    `;
    
    const [accessRows] = await connection.execute(userAccessQuery, [userId]);
    const userAccess = accessRows[0];
    
    // Apply access filters
    const accessConditions = [];
    
    if (userAccess.departments) {
      accessConditions.push(`p.departmentId IN (${userAccess.departments})`);
    }
    
    if (userAccess.wards) {
      accessConditions.push(`pw.wardId IN (${userAccess.wards})`);
    }
    
    if (userAccess.projects) {
      accessConditions.push(`p.id IN (${userAccess.projects})`);
    }
    
    if (accessConditions.length > 0) {
      query += ` AND (${accessConditions.join(' OR ')})`;
    }
    
    // Apply additional filters
    if (status) {
      query += ` AND p.status = ?`;
      params.push(status);
    }
    
    if (minBudget) {
      query += ` AND p.allocatedBudget >= ?`;
      params.push(parseFloat(minBudget));
    }
    
    if (maxBudget) {
      query += ` AND p.allocatedBudget <= ?`;
      params.push(parseFloat(maxBudget));
    }
    
    if (department) {
      query += ` AND d.name LIKE ?`;
      params.push(`%${department}%`);
    }
    
    query += ` ORDER BY p.projectName`;
    
    const [rows] = await connection.execute(query, params);
    await connection.end();
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching filtered projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/data-access/user/{userId}/departments
router.post('/user/:userId/departments', async (req, res) => {
  try {
    const { userId } = req.params;
    const { departmentIds, isPrimary } = req.body;
    const connection = await getConnection();
    
    await connection.beginTransaction();
    
    try {
      // Clear existing assignments if setting primary
      if (isPrimary) {
        await connection.execute(
          'UPDATE user_department_assignments SET is_primary = 0 WHERE user_id = ?',
          [userId]
        );
      }
      
      // Insert new assignments
      for (const deptId of departmentIds) {
        await connection.execute(
          'INSERT INTO user_department_assignments (user_id, department_id, is_primary) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE is_primary = VALUES(is_primary)',
          [userId, deptId, isPrimary ? 1 : 0]
        );
      }
      
      await connection.commit();
      await connection.end();
      
      res.json({ success: true, message: 'Department assignments updated successfully' });
    } catch (error) {
      await connection.rollback();
      await connection.end();
      throw error;
    }
  } catch (error) {
    console.error('Error assigning user to departments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/data-access/user/{userId}/wards
router.post('/user/:userId/wards', async (req, res) => {
  try {
    const { userId } = req.params;
    const { wardAssignments } = req.body; // [{ wardId, accessLevel }]
    const connection = await getConnection();
    
    await connection.beginTransaction();
    
    try {
      // Clear existing assignments
      await connection.execute('DELETE FROM user_ward_assignments WHERE user_id = ?', [userId]);
      
      // Insert new assignments
      for (const assignment of wardAssignments) {
        await connection.execute(
          'INSERT INTO user_ward_assignments (user_id, ward_id, access_level) VALUES (?, ?, ?)',
          [userId, assignment.wardId, assignment.accessLevel || 'read']
        );
      }
      
      await connection.commit();
      await connection.end();
      
      res.json({ success: true, message: 'Ward assignments updated successfully' });
    } catch (error) {
      await connection.rollback();
      await connection.end();
      throw error;
    }
  } catch (error) {
    console.error('Error assigning user to wards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/data-access/user/{userId}/projects
router.post('/user/:userId/projects', async (req, res) => {
  try {
    const { userId } = req.params;
    const { projectAssignments } = req.body; // [{ projectId, accessLevel }]
    const connection = await getConnection();
    
    await connection.beginTransaction();
    
    try {
      // Clear existing assignments
      await connection.execute('DELETE FROM user_project_assignments WHERE user_id = ?', [userId]);
      
      // Insert new assignments
      for (const assignment of projectAssignments) {
        await connection.execute(
          'INSERT INTO user_project_assignments (user_id, project_id, access_level) VALUES (?, ?, ?)',
          [userId, assignment.projectId, assignment.accessLevel || 'view']
        );
      }
      
      await connection.commit();
      await connection.end();
      
      res.json({ success: true, message: 'Project assignments updated successfully' });
    } catch (error) {
      await connection.rollback();
      await connection.end();
      throw error;
    }
  } catch (error) {
    console.error('Error assigning user to projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/data-access/user/{userId}/filters
router.get('/user/:userId/filters', async (req, res) => {
  try {
    const { userId } = req.params;
    const connection = await getConnection();
    
    const query = `
      SELECT filter_type, filter_key, filter_value, is_active
      FROM user_data_filters 
      WHERE user_id = ?
      ORDER BY filter_type
    `;
    
    const [rows] = await connection.execute(query, [userId]);
    await connection.end();
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching user data filters:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/data-access/user/{userId}/filters
router.put('/user/:userId/filters', async (req, res) => {
  try {
    const { userId } = req.params;
    const { filters } = req.body;
    const connection = await getConnection();
    
    await connection.beginTransaction();
    
    try {
      // Clear existing filters
      await connection.execute('DELETE FROM user_data_filters WHERE user_id = ?', [userId]);
      
      // Insert new filters
      for (const filter of filters) {
        await connection.execute(
          'INSERT INTO user_data_filters (user_id, filter_type, filter_key, filter_value, is_active) VALUES (?, ?, ?, ?, ?)',
          [userId, filter.filter_type, filter.filter_key, JSON.stringify(filter.filter_value), 1]
        );
      }
      
      await connection.commit();
      await connection.end();
      
      res.json({ success: true, message: 'Data filters updated successfully' });
    } catch (error) {
      await connection.rollback();
      await connection.end();
      throw error;
    }
  } catch (error) {
    console.error('Error updating user data filters:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
