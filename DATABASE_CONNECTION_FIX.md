# Database Connection Stability Fix

## Problem
The remote database connection on `102.210.149.119:8081/iimpes` was unstable, refusing to connect after working for a while. The app worked perfectly locally but had connection issues on the remote server.

## Root Causes Identified

1. **Very short connection timeout**: `connectionTimeoutMillis: 2000` (2 seconds) - too short for remote connections with network latency
2. **Short idle timeout**: `idleTimeoutMillis: 30000` (30 seconds) - connections were closed too quickly
3. **No keepalive settings**: Connections could be dropped by the database server without detection
4. **No error handling**: Pool errors and connection failures weren't properly handled
5. **No retry logic**: Failed connections and queries weren't automatically retried
6. **No connection validation**: Stale connections weren't detected before use

## Solutions Implemented

### 1. Enhanced Pool Configuration (`api/config/db.js`)

**Increased Timeouts:**
- `connectionTimeoutMillis`: 2000ms → 10000ms (10 seconds)
- `idleTimeoutMillis`: 30000ms → 300000ms (5 minutes)
- `max`: 10 → 20 (increased pool size)

**Added Keepalive Settings:**
- `keepAlive: true` - Prevents connection drops
- `keepAliveInitialDelayMillis: 10000` - Starts keepalive after 10 seconds

**Added Query Timeouts:**
- `statement_timeout: 30000` - Prevents long-running queries
- `query_timeout: 30000` - Query timeout protection

### 2. Error Handling

Added event handlers for:
- `pool.on('error')` - Handles unexpected errors on idle clients
- `pool.on('connect')` - Logs new connections
- `pool.on('remove')` - Logs client removals

### 3. Automatic Retry Logic

**Connection Retry:**
- Initial connection test with 5 retries (5 second intervals)
- Automatic retry on connection failures

**Query Retry:**
- Automatic retry for connection errors (ECONNREFUSED, ETIMEDOUT, ECONNRESET, etc.)
- Up to 3 retries with exponential backoff
- Detects and handles stale connections

### 4. Connection Validation

- Validates connections before use in `getConnection()`
- Detects stale connections and automatically replaces them
- Retries connection acquisition on failure

### 5. Health Check Function

Added `pool.healthCheck()` function to verify database connectivity:
```javascript
const health = await pool.healthCheck();
// Returns: { healthy: true/false, timestamp, version, error }
```

## Testing the Fix

### 1. Check Application Logs

After deploying, check the logs for:
```
PostgreSQL connection pool created and tested successfully from db.js!
New database client connected
```

### 2. Monitor Connection Health

You can add a health check endpoint to your API:
```javascript
// In your routes
router.get('/health/db', async (req, res) => {
    const health = await pool.healthCheck();
    res.json(health);
});
```

### 3. SSH to Server and Check Logs

```bash
ssh -i ~/.ssh/id_gprs_server fortress@102.210.149.119
cd /home/fortress/gprs
docker-compose logs -f api
```

Look for:
- Connection errors
- Retry attempts
- Successful reconnections

### 4. Test Database Connectivity

```bash
# From the server
docker exec -it gov_postgres psql -U postgres -d government_projects -c "SELECT NOW();"

# Check active connections
docker exec -it gov_postgres psql -U postgres -d government_projects -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'government_projects';"
```

## Additional Troubleshooting

### If Connections Still Fail

1. **Check PostgreSQL Configuration:**
   ```bash
   # On the remote server
   docker exec -it gov_postgres psql -U postgres -c "SHOW max_connections;"
   docker exec -it gov_postgres psql -U postgres -c "SHOW tcp_keepalives_idle;"
   docker exec -it gov_postgres psql -U postgres -c "SHOW tcp_keepalives_interval;"
   ```

2. **Check Network Connectivity:**
   ```bash
   # From API container to database
   docker exec -it gov_node_api ping -c 3 postgres_db
   docker exec -it gov_node_api nc -zv postgres_db 5432
   ```

3. **Check Container Health:**
   ```bash
   docker-compose ps
   docker-compose logs postgres_db
   ```

4. **Check Resource Usage:**
   ```bash
   docker stats
   ```

### PostgreSQL Server-Side Configuration (if needed)

If issues persist, you may need to configure PostgreSQL keepalive settings. Create a custom `postgresql.conf` or set environment variables:

```yaml
# In docker-compose.yml, add to postgres_db service:
environment:
  POSTGRES_INITDB_ARGS: "-c tcp_keepalives_idle=600 -c tcp_keepalives_interval=30 -c tcp_keepalives_count=3"
```

Or mount a custom postgresql.conf:
```yaml
volumes:
  - ./postgresql.conf:/etc/postgresql/postgresql.conf
command: postgres -c config_file=/etc/postgresql/postgresql.conf
```

## Deployment

After making these changes:

1. **Deploy to remote server:**
   ```bash
   ./deploy-gprs-server.sh
   ```

2. **Or manually update on server:**
   ```bash
   ssh -i ~/.ssh/id_gprs_server fortress@102.210.149.119
   cd /home/fortress/gprs
   docker-compose restart api
   docker-compose logs -f api
   ```

## Monitoring

Watch for these indicators of healthy connections:
- ✅ "PostgreSQL connection pool created and tested successfully"
- ✅ "New database client connected" (periodic, not excessive)
- ❌ Frequent "Database connection error" messages
- ❌ "Connection validation failed" messages
- ❌ "Failed to get database connection after retries"

## Expected Behavior

- Connections should remain stable for extended periods
- Automatic reconnection on transient failures
- No manual intervention needed for connection issues
- Graceful handling of network interruptions

## Notes

- The connection pool now handles up to 20 concurrent connections
- Idle connections are kept alive for 5 minutes
- Failed queries automatically retry up to 3 times
- Connection validation ensures stale connections are replaced
