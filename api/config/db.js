// backend/config/db.js
require('dotenv').config(); // Load environment variables (like DB_HOST, DB_USER, etc.)

// PostgreSQL connection using pg (node-postgres)
const { Pool } = require('pg');

// Enhanced pool configuration for stable remote connections
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    max: 20, // Increased maximum number of clients in the pool
    idleTimeoutMillis: 300000, // 5 minutes - increased from 30 seconds
    connectionTimeoutMillis: 10000, // 10 seconds - increased from 2 seconds for remote connections
    // Keepalive settings to prevent connection drops
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000, // Start keepalive after 10 seconds
    // Statement timeout (optional, prevents long-running queries)
    statement_timeout: 30000, // 30 seconds
    // Query timeout
    query_timeout: 30000, // 30 seconds
    // Allow exit on idle to prevent hanging connections
    allowExitOnIdle: false,
});

// Handle pool errors (connection errors, client errors, etc.)
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle database client:', err);
    console.error('Client info:', {
        host: client?.host,
        port: client?.port,
        database: client?.database,
    });
    // The pool will automatically remove the client and create a new one
});

pool.on('connect', (client) => {
    console.log('New database client connected');
});

pool.on('remove', (client) => {
    console.log('Database client removed from pool');
});

// Store original query method before overriding (moved up for testConnection)
const originalQueryForTest = pool.query.bind(pool);

// Test the connection with retry logic
let connectionRetries = 0;
const maxRetries = 5;
const retryDelay = 5000; // 5 seconds

async function testConnection() {
    try {
        await originalQueryForTest('SELECT NOW()');
        console.log('PostgreSQL connection pool created and tested successfully from db.js!');
        connectionRetries = 0; // Reset retry counter on success
    } catch (err) {
        connectionRetries++;
        console.error(`Warning: Initial PostgreSQL connection test failed (attempt ${connectionRetries}/${maxRetries}):`, err.message);
        
        if (connectionRetries < maxRetries) {
            console.log(`Retrying connection in ${retryDelay / 1000} seconds...`);
            setTimeout(testConnection, retryDelay);
        } else {
            console.error('Max retries reached. The application will continue to run. Database connections will be retried when needed.');
        }
    }
}

// Start connection test
testConnection();

// Helper to convert MySQL-style ? placeholders to PostgreSQL $1, $2, etc.
const convertPlaceholders = (sql, params) => {
    if (params && params.length > 0) {
        let paramIndex = 1;
        const convertedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
        return { sql: convertedSql, params };
    }
    return { sql, params };
};

// Store original query method before overriding (use the one from testConnection)
const originalQuery = originalQueryForTest;

// Wrapper function to handle connection errors and retry queries
async function queryWithRetry(sql, params, retries = 3) {
    const { sql: convertedSql, params: convertedParams } = convertPlaceholders(sql, params);
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Use originalQuery to avoid infinite recursion
            const result = await originalQuery(convertedSql, convertedParams);
            return result;
        } catch (error) {
            const isConnectionError = 
                error.code === 'ECONNREFUSED' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ENOTFOUND' ||
                error.code === 'ECONNRESET' ||
                error.message?.includes('Connection terminated') ||
                error.message?.includes('Connection closed') ||
                error.message?.includes('server closed the connection') ||
                error.message?.includes('Connection lost') ||
                // Authentication errors from stale connections (common during long transactions)
                (error.code === '28P01' && error.message?.includes('password authentication failed')) ||
                (error.message?.includes('password authentication failed') && error.message?.includes('Connection'));
            
            if (isConnectionError && attempt < retries) {
                console.warn(`Database connection error (attempt ${attempt}/${retries}):`, error.message);
                console.log(`Retrying query in ${attempt * 1000}ms...`);
                await new Promise(resolve => setTimeout(resolve, attempt * 1000));
                continue;
            }
            
            // If it's not a connection error or we've exhausted retries, throw the error
            throw error;
        }
    }
}

// Override pool.query to use retry logic
pool.query = async function(sql, params) {
    return queryWithRetry(sql, params);
};

// Add execute method for compatibility (converts ? placeholders to PostgreSQL format)
pool.execute = async (sql, params) => {
    return queryWithRetry(sql, params);
};

// Wrap pool to provide connection interface with transaction support
pool.getConnection = async () => {
    let client;
    let retries = 3;
    
    // Retry connection if it fails
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            client = await pool.connect();
            
            // Validate connection by running a simple query
            try {
                await client.query('SELECT 1');
            } catch (validationError) {
                // Connection is stale, release it and try again
                client.release();
                if (attempt < retries) {
                    console.warn(`Connection validation failed (attempt ${attempt}/${retries}), retrying...`);
                    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
                    continue;
                }
                throw validationError;
            }
            
            break; // Connection successful
        } catch (error) {
            if (attempt === retries) {
                console.error('Failed to get database connection after retries:', error.message);
                throw error;
            }
            console.warn(`Failed to get database connection (attempt ${attempt}/${retries}), retrying...`);
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
    }
    
    // Return a connection object with transaction support
    return {
        query: async (sql, params) => {
            try {
                const { sql: convertedSql, params: convertedParams } = convertPlaceholders(sql, params);
                return await client.query(convertedSql, convertedParams);
            } catch (error) {
                // If connection error, try to reconnect
                const isConnectionError = 
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.code === 'ECONNRESET' ||
                    error.message?.includes('Connection terminated') ||
                    error.message?.includes('Connection closed') ||
                    // Authentication errors from stale connections during transactions
                    (error.code === '28P01' && error.message?.includes('password authentication failed'));
                
                if (isConnectionError) {
                    console.warn('Connection error during query, releasing client:', error.message);
                    client.release();
                    throw error;
                }
                throw error;
            }
        },
        execute: async (sql, params) => {
            const { sql: convertedSql, params: convertedParams } = convertPlaceholders(sql, params);
            return await client.query(convertedSql, convertedParams);
        },
        beginTransaction: async () => {
            await client.query('BEGIN');
        },
        commit: async () => {
            await client.query('COMMIT');
        },
        rollback: async () => {
            await client.query('ROLLBACK');
        },
        release: () => {
            if (client) {
                client.release();
            }
        },
        end: () => {
            if (client) {
                client.release();
            }
        },
        // Add PostgreSQL-specific methods
        client: client,
    };
};

// Health check function to verify database connectivity
pool.healthCheck = async () => {
    try {
        const result = await originalQuery('SELECT NOW() as current_time, version() as pg_version');
        return {
            healthy: true,
            timestamp: result.rows[0].current_time,
            version: result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1],
        };
    } catch (error) {
        return {
            healthy: false,
            error: error.message,
        };
    }
};

// Export helper function to convert queries
pool.convertQuery = convertPlaceholders;

// Export the pool
module.exports = pool;
