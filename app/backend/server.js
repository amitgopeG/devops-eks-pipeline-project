const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString() 
  });
});

app.get('/api/info', (req, res) => {
  res.json({
    message: 'Hello from Backend!',
    environment: process.env.NODE_ENV || 'development',
    hostname: process.env.HOSTNAME || 'unknown',
    version: '1.0.0'
  });
});

app.get('/api/items', (req, res) => {
  res.json({
    items: [
      { id: 1, name: 'Learn Kubernetes', completed: true },
      { id: 2, name: 'Deploy to EKS', completed: false },
      { id: 3, name: 'Setup ArgoCD', completed: false },
      { id: 4, name: 'Configure HPA', completed: false },
      { id: 5, name: 'Install Istio', completed: false }
    ]
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on port ${PORT}`);
});
