# Health Check Logging Test Plan

This document outlines tests to verify the optimized health check logging changes implemented in v1.2.2 of the LiveKit proxy server.

## Changes Summary

1. Health check requests now log at DEBUG level instead of INFO level
2. "Not a Shopify Proxy Request" message no longer appears for health checks
3. Added substantive health checks with proper status codes (503 for failures)
4. Health check failures now properly log at ERROR level with details
5. Added configuration validation to health checks

## Testing Environment Setup

1. Set the `NODE_ENV` environment variable appropriately:
   - For production-like testing: `NODE_ENV=production`
   - For development testing with DEBUG logs: `NODE_ENV=development` or `DEBUG_PROXY=true`

2. Configure other environment variables for testing different scenarios:
   - `REPLICATE_API_TOKEN`: Set or unset to test configuration validation
   - `ULTRAVOX_MODEL_VERSION`: Set or unset to test configuration validation

## Test Cases

### 1. Basic Health Check (Production Mode)

**Setup:**
```
NODE_ENV=production
REPLICATE_API_TOKEN=valid_token
ULTRAVOX_MODEL_VERSION=valid_version
```

**Test:**
```bash
curl -v http://localhost:7880/health
```

**Expected Results:**
- Response: HTTP 200 OK with JSON status
- Logs: NO INFO level logs for "Incoming request" or "Not a Shopify Proxy Request"
- Logs: NO DEBUG logs (since DEBUG is disabled in production)

### 2. Basic Health Check (Debug Mode)

**Setup:**
```
NODE_ENV=development
REPLICATE_API_TOKEN=valid_token
ULTRAVOX_MODEL_VERSION=valid_version
```

**Test:**
```bash
curl -v http://localhost:7880/health
```

**Expected Results:**
- Response: HTTP 200 OK with JSON status
- Logs: NO INFO level logs for "Incoming request" or "Not a Shopify Proxy Request"
- Logs: DEBUG logs showing "Incoming health check request" and "Health check successful"

### 3. Health Check Failure

**Setup:**
```
NODE_ENV=production
REPLICATE_API_TOKEN="" # Empty or unset
ULTRAVOX_MODEL_VERSION="" # Empty or unset
```

**Test:**
```bash
curl -v http://localhost:7880/health
```

**Expected Results:**
- Response: HTTP 503 Service Unavailable with error details in JSON
- Logs: ERROR level log with message "Health check failed with X errors: [error1, error2, ...]"
- Logs: NO INFO level logs for "Incoming request" or "Not a Shopify Proxy Request"

### 4. Health Check via Proxy Path

**Test:**
```bash
curl -v http://localhost:7880/apps/voice/health
```

**Expected Results:**
- Response: HTTP 200 OK (or 503 if configuration issues exist)
- Logs: Same pattern as tests 1-3 depending on configuration
- Path should be properly normalized and detected as a health check

### 5. Normal Request Logging

**Test:**
```bash
curl -v http://localhost:7880/ # or any non-health check path
```

**Expected Results:**
- Logs: INFO level log for "Incoming request"
- Logs: INFO level log for "Not a Shopify Proxy Request" (since no Shopify headers)

### 6. Docker Container Test

**Setup:**
- Build and run the Docker container using `Dockerfile.livekit-proxy`
- Set appropriate environment variables

**Test:**
```bash
# Test health check from outside container
curl -v http://localhost:7880/health

# Check container logs
docker logs container_name
```

**Expected Results:**
- Health check should work (200 OK with valid config or 503 with invalid config)
- Logs should follow the same patterns as tests 1-3

## Log Volume Measurement

To verify log volume reduction:

1. Before changes:
   - Run a load test with 100 health check requests
   - Count the INFO level log entries: `grep "INFO:" logs.txt | wc -l`

2. After changes:
   - Run the same load test with 100 health check requests
   - Count the INFO level log entries: `grep "INFO:" logs.txt | wc -l`
   - The INFO level count should be significantly reduced
   - In production mode, DEBUG logs won't appear
   - In development mode, verify DEBUG logs appear: `grep "DEBUG:" logs.txt | wc -l`

## Kubernetes Integration Test

If deploying to Kubernetes:

1. Update the deployment with the new version
2. Verify that liveness/readiness probes still function correctly
3. Check logs to ensure health check requests don't generate excessive log entries
4. Validate that health check failures (if simulated) are properly logged at ERROR level

## Conclusion

After running all tests, document the results, especially the log volume reduction achieved and any issues discovered during testing. 