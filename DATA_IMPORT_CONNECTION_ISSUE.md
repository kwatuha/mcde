# Data Import Connection Issue Analysis

## Problem Description

User reported:
1. ✅ Initially could connect and create projects successfully
2. ❌ After trying to upload projects using data-import, got authentication errors
3. ❌ Error: "password authentication failed for user postgres"

## Root Cause Analysis

### The Issue

The data import process (`/api/projects/confirm-import-data`) uses a **single database connection** for the entire import transaction:

```javascript
connection = await pool.getConnection();
await connection.beginTransaction();

// Process potentially hundreds/thousands of rows in a loop
for (let i = 0; i < dataToImport.length; i++) {
    // Many queries here...
}

await connection.commit();
connection.release();
```

### Why Authentication Errors Occur

1. **Long-Running Transaction**: Large imports can take minutes to process
2. **Connection Timeout**: During the long transaction, the connection can become stale/timeout
3. **PostgreSQL Behavior**: When a connection times out or becomes stale, PostgreSQL may reject subsequent queries with "password authentication failed" errors, even though the password is correct
4. **Connection Pool Exhaustion**: If multiple imports happen concurrently, the pool (20 connections) can be exhausted
5. **No Connection Refresh**: The connection is validated only at the start, not during the long transaction

### The Connection Lifecycle

```
1. getConnection() → Validates connection ✅
2. beginTransaction() → Starts transaction
3. Process row 1... ✅
4. Process row 2... ✅
5. ... (connection becomes stale during long processing)
6. Process row N... ❌ "password authentication failed"
```

## Solution

### 1. Add Authentication Error Detection to Retry Logic

The retry logic should also handle authentication errors that occur due to stale connections:

```javascript
// In queryWithRetry function
const isConnectionError = 
    error.code === 'ECONNREFUSED' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ENOTFOUND' ||
    error.code === 'ECONNRESET' ||
    error.message?.includes('Connection terminated') ||
    error.message?.includes('Connection closed') ||
    error.message?.includes('server closed the connection') ||
    error.message?.includes('Connection lost') ||
    // ADD THIS: Authentication errors from stale connections
    (error.message?.includes('password authentication failed') && 
     error.code === '28P01'); // PostgreSQL authentication failure code
```

### 2. Improve Import Transaction Handling

For long-running imports, we should:
- Add periodic connection health checks
- Use smaller batches or chunked processing
- Add better error recovery

### 3. Increase Statement Timeout for Imports

The current `statement_timeout: 30000` (30 seconds) might be too short for large imports. We should either:
- Increase it for import operations
- Or remove it for transaction-based imports

## Immediate Fix

The connection improvements already made should help, but we need to specifically handle authentication errors that occur during long transactions.
