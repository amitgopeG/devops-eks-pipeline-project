# Application Setup

This guide covers building a simple full-stack application and containerizing it with Docker.

## Application Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│    Frontend     │────▶│    Backend      │────▶│    Database     │
│    (React)      │     │   (Node.js)     │     │   (Optional)    │
│    Port: 3000   │     │   Port: 5000    │     │   Port: 5432    │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Step 1: Create the Backend

### 1.1 Initialize Backend Project

```bash
mkdir -p app/backend
cd app/backend
```

### 1.2 Create package.json

```json
{
  "name": "demo-backend",
  "version": "1.0.0",
  "description": "Demo backend API",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

### 1.3 Create server.js

```javascript
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API endpoint
app.get('/api/info', (req, res) => {
  res.json({
    message: 'Hello from Backend!',
    environment: process.env.NODE_ENV || 'development',
    hostname: process.env.HOSTNAME || 'unknown',
    version: '1.0.0'
  });
});

// Items endpoint (mock data)
app.get('/api/items', (req, res) => {
  res.json({
    items: [
      { id: 1, name: 'Learn Kubernetes', completed: true },
      { id: 2, name: 'Deploy to EKS', completed: false },
      { id: 3, name: 'Setup ArgoCD', completed: false }
    ]
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
});
```

### 1.4 Create Backend Dockerfile

```dockerfile
# app/backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Start application
CMD ["npm", "start"]
```

### 1.5 Create .dockerignore for Backend

```
node_modules
npm-debug.log
.git
.gitignore
README.md
.env
```

---

## Step 2: Create the Frontend

### 2.1 Initialize Frontend Project

```bash
mkdir -p app/frontend
cd app/frontend
```

### 2.2 Create package.json

```json
{
  "name": "demo-frontend",
  "version": "1.0.0",
  "description": "Demo frontend application",
  "scripts": {
    "start": "serve -s build -l 3000",
    "build": "echo 'Build step - copy static files'"
  },
  "dependencies": {
    "serve": "^14.2.1"
  }
}
```

### 2.3 Create Static Frontend

For simplicity, we'll use a static HTML/JS frontend:

**Create build/index.html:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>K8s Demo App</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2rem;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
        }
        .card {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .card h3 {
            color: #333;
            margin-bottom: 10px;
            font-size: 1rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .info-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e9ecef;
        }
        .info-item:last-child {
            border-bottom: none;
        }
        .info-label {
            color: #666;
        }
        .info-value {
            color: #333;
            font-weight: 500;
        }
        .status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 500;
        }
        .status.healthy {
            background: #d4edda;
            color: #155724;
        }
        .status.error {
            background: #f8d7da;
            color: #721c24;
        }
        .items-list {
            list-style: none;
        }
        .items-list li {
            padding: 10px 0;
            border-bottom: 1px solid #e9ecef;
            display: flex;
            align-items: center;
        }
        .items-list li:last-child {
            border-bottom: none;
        }
        .checkbox {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            margin-right: 12px;
            border: 2px solid #ddd;
        }
        .checkbox.checked {
            background: #667eea;
            border-color: #667eea;
        }
        .loading {
            text-align: center;
            color: #666;
            padding: 20px;
        }
        button {
            background: #667eea;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
            margin-top: 10px;
        }
        button:hover {
            background: #5a6fd6;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 K8s Demo Application</h1>
        <p class="subtitle">Frontend + Backend running on Kubernetes</p>
        
        <div class="card">
            <h3>Backend Status</h3>
            <div id="backend-status">
                <p class="loading">Checking connection...</p>
            </div>
        </div>
        
        <div class="card">
            <h3>Backend Info</h3>
            <div id="backend-info">
                <p class="loading">Loading...</p>
            </div>
        </div>
        
        <div class="card">
            <h3>Todo Items</h3>
            <div id="items-list">
                <p class="loading">Loading...</p>
            </div>
        </div>
        
        <button onclick="refreshData()">Refresh Data</button>
    </div>

    <script>
        const BACKEND_URL = window.BACKEND_URL || 'http://localhost:5000';
        
        async function checkHealth() {
            const container = document.getElementById('backend-status');
            try {
                const response = await fetch(`${BACKEND_URL}/health`);
                const data = await response.json();
                container.innerHTML = `
                    <div class="info-item">
                        <span class="info-label">Status</span>
                        <span class="status healthy">${data.status}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Timestamp</span>
                        <span class="info-value">${new Date(data.timestamp).toLocaleString()}</span>
                    </div>
                `;
            } catch (error) {
                container.innerHTML = `
                    <div class="info-item">
                        <span class="info-label">Status</span>
                        <span class="status error">Connection Failed</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Error</span>
                        <span class="info-value">${error.message}</span>
                    </div>
                `;
            }
        }
        
        async function fetchInfo() {
            const container = document.getElementById('backend-info');
            try {
                const response = await fetch(`${BACKEND_URL}/api/info`);
                const data = await response.json();
                container.innerHTML = `
                    <div class="info-item">
                        <span class="info-label">Message</span>
                        <span class="info-value">${data.message}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Environment</span>
                        <span class="info-value">${data.environment}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Hostname (Pod)</span>
                        <span class="info-value">${data.hostname}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Version</span>
                        <span class="info-value">${data.version}</span>
                    </div>
                `;
            } catch (error) {
                container.innerHTML = `<p class="loading">Failed to load: ${error.message}</p>`;
            }
        }
        
        async function fetchItems() {
            const container = document.getElementById('items-list');
            try {
                const response = await fetch(`${BACKEND_URL}/api/items`);
                const data = await response.json();
                container.innerHTML = `
                    <ul class="items-list">
                        ${data.items.map(item => `
                            <li>
                                <div class="checkbox ${item.completed ? 'checked' : ''}"></div>
                                ${item.name}
                            </li>
                        `).join('')}
                    </ul>
                `;
            } catch (error) {
                container.innerHTML = `<p class="loading">Failed to load: ${error.message}</p>`;
            }
        }
        
        function refreshData() {
            checkHealth();
            fetchInfo();
            fetchItems();
        }
        
        // Initial load
        refreshData();
        
        // Auto-refresh every 30 seconds
        setInterval(refreshData, 30000);
    </script>
</body>
</html>
```

### 2.4 Create Frontend Dockerfile

```dockerfile
# app/frontend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy build files
COPY build/ ./build/

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start server
CMD ["npm", "start"]
```

### 2.5 Create .dockerignore for Frontend

```
node_modules
npm-debug.log
.git
.gitignore
README.md
```

---

## Step 3: Build Docker Images

### 3.1 Build Backend Image

```bash
cd app/backend
docker build -t demo-backend:1.0.0 .
docker tag demo-backend:1.0.0 demo-backend:latest
```

### 3.2 Build Frontend Image

```bash
cd app/frontend
docker build -t demo-frontend:1.0.0 .
docker tag demo-frontend:1.0.0 demo-frontend:latest
```

### 3.3 Verify Images

```bash
docker images | grep demo
```

Expected output:
```
demo-frontend   1.0.0    abc123   1 minute ago   180MB
demo-frontend   latest   abc123   1 minute ago   180MB
demo-backend    1.0.0    def456   2 minutes ago  150MB
demo-backend    latest   def456   2 minutes ago  150MB
```

---

## Step 4: Test Locally with Docker

### 4.1 Run Backend

```bash
docker run -d --name backend -p 5000:5000 demo-backend:latest
```

### 4.2 Test Backend

```bash
# Health check
curl http://localhost:5000/health

# API info
curl http://localhost:5000/api/info

# Items
curl http://localhost:5000/api/items
```

### 4.3 Run Frontend

```bash
docker run -d --name frontend -p 3000:3000 demo-frontend:latest
```

### 4.4 Access Frontend

Open http://localhost:3000 in your browser.

### 4.5 Cleanup

```bash
docker stop frontend backend
docker rm frontend backend
```

---

## Step 5: Push to Container Registry (Optional)

For AWS ECR:

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Create repositories
aws ecr create-repository --repository-name demo-backend
aws ecr create-repository --repository-name demo-frontend

# Tag images
docker tag demo-backend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo-backend:latest
docker tag demo-frontend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo-frontend:latest

# Push images
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo-backend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/demo-frontend:latest
```

For Docker Hub:

```bash
# Login
docker login

# Tag images
docker tag demo-backend:latest <your-username>/demo-backend:latest
docker tag demo-frontend:latest <your-username>/demo-frontend:latest

# Push images
docker push <your-username>/demo-backend:latest
docker push <your-username>/demo-frontend:latest
```

---

## Next Steps

1. Proceed to [02-KUBERNETES-LOCAL.md](02-KUBERNETES-LOCAL.md) to deploy to local Kubernetes
2. Or jump to [03-KUBERNETES-AWS-EKS.md](03-KUBERNETES-AWS-EKS.md) for AWS deployment
