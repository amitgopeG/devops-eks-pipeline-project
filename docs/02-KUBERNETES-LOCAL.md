# Kubernetes Local Setup (Minikube)

This guide covers deploying the demo application to a local Kubernetes cluster using Minikube.

## Prerequisites

- Docker installed and running
- Minikube installed ([see SETUP.md](../SETUP.md))
- kubectl installed
- Application Docker images built ([see 01-APPLICATION.md](01-APPLICATION.md))

---

## Step 1: Start Minikube

```bash
# Start cluster with sufficient resources
minikube start --driver=docker --cpus=4 --memory=4096

# Verify cluster is running
minikube status
kubectl get nodes
```

---

## Step 2: Load Docker Images into Minikube

Since we built images locally, we need to load them into Minikube:

```bash
# Load images
minikube image load demo-backend:latest
minikube image load demo-frontend:latest

# Verify images are loaded
minikube image list | grep demo
```

**Alternative: Build directly in Minikube's Docker**

```bash
# Point to Minikube's Docker daemon
eval $(minikube docker-env)

# Build images (they'll be available in Minikube)
cd app/backend && docker build -t demo-backend:latest .
cd ../frontend && docker build -t demo-frontend:latest .

# Reset to local Docker
eval $(minikube docker-env -u)
```

---

## Step 3: Create Kubernetes Manifests

### 3.1 Create Directory Structure

```bash
mkdir -p k8s/base
```

### 3.2 Namespace

**k8s/base/namespace.yaml**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: demo-app
  labels:
    app: demo
    environment: local
```

### 3.3 ConfigMap

**k8s/base/configmap.yaml**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: demo-app
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  BACKEND_URL: "http://backend-service:5000"
```

### 3.4 Backend Deployment

**k8s/base/backend-deployment.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: demo-app
  labels:
    app: backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
        - name: backend
          image: demo-backend:latest
          imagePullPolicy: Never  # Use local image
          ports:
            - containerPort: 5000
          envFrom:
            - configMapRef:
                name: app-config
          resources:
            requests:
              memory: "64Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 5000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 5000
            initialDelaySeconds: 5
            periodSeconds: 5
```

### 3.5 Backend Service

**k8s/base/backend-service.yaml**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend-service
  namespace: demo-app
  labels:
    app: backend
spec:
  selector:
    app: backend
  ports:
    - protocol: TCP
      port: 5000
      targetPort: 5000
  type: ClusterIP
```

### 3.6 Frontend Deployment

**k8s/base/frontend-deployment.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: demo-app
  labels:
    app: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: frontend
          image: demo-frontend:latest
          imagePullPolicy: Never  # Use local image
          ports:
            - containerPort: 3000
          resources:
            requests:
              memory: "64Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
```

### 3.7 Frontend Service

**k8s/base/frontend-service.yaml**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend-service
  namespace: demo-app
  labels:
    app: frontend
spec:
  selector:
    app: frontend
  ports:
    - protocol: TCP
      port: 3000
      targetPort: 3000
  type: NodePort
```

### 3.8 Ingress

**k8s/base/ingress.yaml**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: demo-ingress
  namespace: demo-app
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: demo.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-service
                port:
                  number: 3000
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: backend-service
                port:
                  number: 5000
          - path: /health
            pathType: Prefix
            backend:
              service:
                name: backend-service
                port:
                  number: 5000
```

### 3.9 Kustomization File

**k8s/base/kustomization.yaml**
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: demo-app

resources:
  - namespace.yaml
  - configmap.yaml
  - backend-deployment.yaml
  - backend-service.yaml
  - frontend-deployment.yaml
  - frontend-service.yaml
  - ingress.yaml

commonLabels:
  project: demo-app
```

---

## Step 4: Enable Ingress Add-on

```bash
# Enable NGINX Ingress Controller
minikube addons enable ingress

# Verify ingress controller is running
kubectl get pods -n ingress-nginx
```

Wait until the ingress controller pod is `Running`.

---

## Step 5: Deploy the Application

### 5.1 Apply with Kustomize

```bash
kubectl apply -k k8s/base/
```

### 5.2 Or Apply Individual Files

```bash
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/backend-deployment.yaml
kubectl apply -f k8s/base/backend-service.yaml
kubectl apply -f k8s/base/frontend-deployment.yaml
kubectl apply -f k8s/base/frontend-service.yaml
kubectl apply -f k8s/base/ingress.yaml
```

---

## Step 6: Verify Deployment

```bash
# Check all resources in namespace
kubectl get all -n demo-app

# Check pods are running
kubectl get pods -n demo-app -w

# Check services
kubectl get svc -n demo-app

# Check ingress
kubectl get ingress -n demo-app

# Check pod logs
kubectl logs -n demo-app -l app=backend
kubectl logs -n demo-app -l app=frontend
```

Expected output:
```
NAME                           READY   STATUS    RESTARTS   AGE
pod/backend-xxxxx-xxxxx        1/1     Running   0          1m
pod/backend-xxxxx-xxxxx        1/1     Running   0          1m
pod/frontend-xxxxx-xxxxx       1/1     Running   0          1m
pod/frontend-xxxxx-xxxxx       1/1     Running   0          1m

NAME                       TYPE        CLUSTER-IP       PORT(S)
service/backend-service    ClusterIP   10.96.xxx.xxx    5000/TCP
service/frontend-service   NodePort    10.96.xxx.xxx    3000:3xxxx/TCP
```

---

## Step 7: Access the Application

### Method 1: Minikube Service (Easiest)

```bash
minikube service frontend-service -n demo-app
```

### Method 2: Port Forwarding

```bash
# Forward frontend
kubectl port-forward -n demo-app svc/frontend-service 3000:3000

# In another terminal, forward backend
kubectl port-forward -n demo-app svc/backend-service 5000:5000
```

Access at http://localhost:3000

### Method 3: Ingress (Requires hosts file update)

```bash
# Get Minikube IP
minikube ip

# Add to /etc/hosts
echo "$(minikube ip) demo.local" | sudo tee -a /etc/hosts
```

Access at http://demo.local

---

## Step 8: Testing and Debugging

### Check Pod Details

```bash
kubectl describe pod -n demo-app -l app=backend
```

### View Logs

```bash
# Follow logs
kubectl logs -n demo-app -l app=backend -f

# All containers
kubectl logs -n demo-app -l app=backend --all-containers
```

### Exec into Pod

```bash
kubectl exec -it -n demo-app deployment/backend -- /bin/sh
```

### Test Internal Connectivity

```bash
# Exec into a pod and test backend service
kubectl exec -it -n demo-app deployment/frontend -- /bin/sh
wget -qO- http://backend-service:5000/health
```

---

## Step 9: Scaling

### Manual Scaling

```bash
# Scale backend to 3 replicas
kubectl scale deployment backend -n demo-app --replicas=3

# Scale frontend to 1 replica
kubectl scale deployment frontend -n demo-app --replicas=1

# Check scaling
kubectl get pods -n demo-app
```

---

## Step 10: Cleanup

### Delete Application

```bash
kubectl delete -k k8s/base/
# or
kubectl delete namespace demo-app
```

### Stop Minikube

```bash
minikube stop
```

### Delete Cluster

```bash
minikube delete
```

---

## Common Issues & Solutions

### Issue: ImagePullBackOff

**Cause**: Image not found in Minikube

**Solution**:
```bash
minikube image load demo-backend:latest
minikube image load demo-frontend:latest
```

### Issue: Pods in CrashLoopBackOff

**Cause**: Application error

**Solution**:
```bash
kubectl logs -n demo-app <pod-name>
kubectl describe pod -n demo-app <pod-name>
```

### Issue: Ingress Not Working

**Cause**: Ingress controller not ready

**Solution**:
```bash
# Check ingress controller
kubectl get pods -n ingress-nginx

# Restart if needed
minikube addons disable ingress
minikube addons enable ingress
```

---

## Next Steps

1. Proceed to [04-ARGOCD-SETUP.md](04-ARGOCD-SETUP.md) to set up GitOps
2. Or continue to [03-KUBERNETES-AWS-EKS.md](03-KUBERNETES-AWS-EKS.md) for AWS deployment
