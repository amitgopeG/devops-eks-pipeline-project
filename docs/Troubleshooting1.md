# Troubleshooting Guide - Local Kubernetes Setup

This document captures the issues encountered during the initial local Kubernetes setup and their solutions.

---

## Issue 1: Docker Daemon Not Running

**Error:**
```
Cannot connect to the Docker daemon at unix:///Users/amitgope/.docker/run/docker.sock. 
Is the docker daemon running?
```

**Cause:** Docker Desktop was not started.

**Solution:**
1. Open Docker Desktop from Applications or Spotlight (`Cmd + Space`, type "Docker")
2. Wait for the whale icon in the menu bar to show "Docker Desktop is running"
3. Verify with: `docker ps`

---

## Issue 2: Minikube Stale State After Docker Restart

**Error:**
```
E0301 status error: host: state: unknown state "minikube"
The connection to the server 127.0.0.1:49524 was refused
```

**Cause:** Minikube cluster was created months ago. After Docker restarts, the API server ports change and kubectl context becomes stale.

**Solution:**
```bash
# Stop and restart Minikube
minikube stop
minikube start --driver=docker

# Verify
minikube status
kubectl get nodes
```

---

## Issue 3: npm ci Requires package-lock.json

**Error:**
```
npm error The `npm ci` command can only install with an existing package-lock.json or
npm-shrinkwrap.json with lockfileVersion >= 1.
```

**Cause:** Dockerfile used `npm ci` but the project didn't have a `package-lock.json` file.

**Solution:** Changed Dockerfile from `npm ci` to `npm install`:

```dockerfile
# Before (fails without package-lock.json)
RUN npm ci --only=production

# After (works without package-lock.json)
RUN npm install --omit=dev
```

Updated both `app/backend/Dockerfile` and `app/frontend/Dockerfile`.

---

## Issue 4: Frontend Shows "Connection Failed" to Backend

**Symptom:**
```
Backend Status: Connection Failed
Backend Info: Failed to load
Learning Progress: Failed to load
```

**Cause:** Multiple issues combined:
1. Frontend JavaScript runs in the browser, not inside Kubernetes
2. Browser can't access internal Kubernetes service names
3. Frontend was checking for `localhost` but Minikube opens `127.0.0.1`

**Solution:**

1. **Update frontend to detect both localhost and 127.0.0.1:**
```javascript
// Before
const BACKEND_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:5000' 
    : window.location.origin;

// After
const isLocal = window.location.origin.includes('localhost') || 
                window.location.origin.includes('127.0.0.1');
const BACKEND_URL = isLocal ? 'http://localhost:8080' : window.location.origin;
```

2. **Port-forward the backend service:**
```bash
kubectl port-forward -n demo-app svc/backend-service 8080:5000
```

---

## Issue 5: Port 5000 Already in Use

**Error:**
```
Unable to listen on port 5000: Listeners failed to create with the following errors: 
[unable to create listener: Error listen tcp4 127.0.0.1:5000: bind: address already in use]
```

**Cause:** macOS Control Center (AirPlay Receiver) uses port 5000 by default.

**Diagnosis:**
```bash
lsof -i :5000
# Output shows: ControlCe (macOS Control Center)
```

**Solutions:**

**Option A:** Disable AirPlay Receiver
- System Settings → General → AirDrop & Handoff → AirPlay Receiver → OFF

**Option B:** Use a different port (we chose this)
- Updated frontend to use port 8080 for backend
- Port-forward: `kubectl port-forward -n demo-app svc/backend-service 8080:5000`

---

## Issue 6: Frontend Image Not Updating in Minikube

**Symptom:** After updating frontend code, browser console still showed:
```
Access to fetch at 'http://localhost:5000/health' from origin 'http://localhost:3000' 
has been blocked by CORS policy
```

Frontend was still using old port (5000) instead of new port (8080).

**Cause:** 
- Docker built the new image locally
- But Minikube has its own Docker daemon with cached old image
- Pods were using the old cached image

**Solution:**

```bash
# Build with new tag to avoid cache issues
docker build --no-cache -t demo-frontend:v2 .

# Load into Minikube
minikube image load demo-frontend:v2

# Update deployment to use new tag
kubectl set image deployment/frontend -n demo-app frontend=demo-frontend:v2

# Wait for rollout
kubectl rollout status deployment/frontend -n demo-app
```

---

## Issue 7: Cannot Remove Old Image from Minikube

**Error:**
```
Error response from daemon: conflict: unable to remove repository reference 
"demo-frontend:latest" (must force) - container 23b80537531f is using its referenced image
```

**Cause:** Running containers are using the image.

**Solution:** Instead of removing the old image, use a new tag:
```bash
# Use new tag instead of :latest
docker build -t demo-frontend:v2 .
minikube image load demo-frontend:v2
kubectl set image deployment/frontend -n demo-app frontend=demo-frontend:v2
```

---

## Issue 8: Port-Forward Stops When Terminal Closes

**Symptom:** `localhost refused to connect` after some time.

**Cause:** Port-forward commands run in foreground and stop when:
- Terminal is closed
- Shell session ends
- Computer sleeps

**Solutions:**

**Option A:** Run in background
```bash
kubectl port-forward -n demo-app svc/backend-service 8080:5000 &
kubectl port-forward -n demo-app svc/frontend-service 3000:3000 &
```

**Option B:** Use multiple terminals (keep them open)
- Terminal 1: Backend port-forward
- Terminal 2: Frontend port-forward

**Option C:** Check and restart if needed
```bash
# Check if running
ps aux | grep port-forward

# Kill all and restart
pkill -f "kubectl port-forward"
kubectl port-forward -n demo-app svc/backend-service 8080:5000 &
kubectl port-forward -n demo-app svc/frontend-service 3000:3000 &
```

---

## Issue 9: Port Already in Use When Restarting Port-Forward

**Error:**
```
Unable to listen on port 3000: bind: address already in use
```

**Cause:** Previous port-forward process is still running.

**Solution:**
```bash
# Find and kill existing port-forward processes
pkill -f "kubectl port-forward"

# Or find specific process
lsof -i :3000
kill -9 <PID>

# Then restart
kubectl port-forward -n demo-app svc/frontend-service 3000:3000
```

---

## Quick Diagnostic Commands

```bash
# Check if Docker is running
docker ps

# Check Minikube status
minikube status

# Check all pods
kubectl get pods -n demo-app

# Check pod logs
kubectl logs -n demo-app -l app=backend
kubectl logs -n demo-app -l app=frontend

# Check what's using a port
lsof -i :5000

# Check running port-forwards
ps aux | grep port-forward

# Test backend directly
curl http://localhost:8080/health

# Kill all port-forwards
pkill -f "kubectl port-forward"
```

---

## Final Working Configuration

| Component | Port | Access Method |
|-----------|------|---------------|
| Frontend | 3000 | `kubectl port-forward -n demo-app svc/frontend-service 3000:3000` |
| Backend | 8080 (forwards to 5000) | `kubectl port-forward -n demo-app svc/backend-service 8080:5000` |
| App URL | http://localhost:3000 | Browser |
| Backend API | http://localhost:8080 | Frontend JavaScript calls |

---

## Lessons Learned

1. **Always verify Docker is running** before starting Minikube
2. **Minikube caches images** - use versioned tags (`:v1`, `:v2`) instead of `:latest`
3. **Port 5000 on macOS** is used by AirPlay Receiver - use different port
4. **Port-forwards need to stay running** - keep terminals open or use background processes
5. **Browser caching** - use hard refresh (`Cmd + Shift + R`) after deploying new frontend
6. **Frontend runs in browser** - it can't access Kubernetes internal service names, needs port-forward
