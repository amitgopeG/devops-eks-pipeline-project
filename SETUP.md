# Kubernetes Quick Setup Guide

A quick reference for setting up Kubernetes locally with Minikube.

> **Note**: For the complete learning path and detailed guides, see [README.md](README.md) and the [docs/](docs/) folder.

## Prerequisites

- macOS, Linux, or Windows
- Docker installed and running
- Terminal access
- At least 2GB of free memory

---

## Step 1: Install Minikube

Minikube runs a local Kubernetes cluster with built-in add-ons and a dashboard UI.

### macOS (Homebrew)

```bash
brew install minikube
```

### macOS (Binary Download)

```bash
# For Intel Mac
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-darwin-amd64
sudo install minikube-darwin-amd64 /usr/local/bin/minikube

# For Apple Silicon (M1/M2/M3)
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-darwin-arm64
sudo install minikube-darwin-arm64 /usr/local/bin/minikube
```

### Linux (Binary Download)

```bash
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube
```

### Verify Installation

```bash
minikube version
```

---

## Step 2: Install kubectl

kubectl is the command-line tool to interact with Kubernetes clusters.

### macOS (Homebrew)

```bash
brew install kubectl
```

### macOS/Linux (Binary Download)

```bash
# For macOS (Intel)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/darwin/amd64/kubectl"

# For macOS (Apple Silicon)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/darwin/arm64/kubectl"

# For Linux
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"

# Make executable and move to PATH
chmod +x ./kubectl
sudo mv ./kubectl /usr/local/bin/kubectl
```

### Verify Installation

```bash
kubectl version --client
```

---

## Step 3: Start Your First Cluster

### Start Minikube with Docker Driver

```bash
minikube start --driver=docker
```

This will:
- Download the Kubernetes components
- Create a local cluster
- Configure kubectl to use the cluster

### Verify Cluster is Running

```bash
# Check cluster status
minikube status

# Check cluster info
kubectl cluster-info

# List nodes
kubectl get nodes
```

Expected output:
```
NAME       STATUS   ROLES           AGE   VERSION
minikube   Ready    control-plane   1m    v1.28.0
```

---

## Step 4: Enable Useful Add-ons

Minikube comes with built-in add-ons. Enable the most useful ones:

```bash
# Enable Kubernetes Dashboard (Web UI)
minikube addons enable dashboard

# Enable metrics server (for kubectl top commands)
minikube addons enable metrics-server

# Enable ingress controller (for routing)
minikube addons enable ingress

# List all available add-ons
minikube addons list
```

---

## Step 5: Open the Dashboard

The Kubernetes Dashboard provides a visual UI for your cluster:

```bash
minikube dashboard
```

This opens a browser window with the dashboard. Press `Ctrl+C` to stop it.

---

## Step 6: Deploy Your First Application

### Apply the Sample Application

```bash
kubectl apply -f first-app.yaml
```

### Verify Deployment

```bash
# Check all resources
kubectl get all

# Check pods are running
kubectl get pods

# Check deployment status
kubectl get deployments

# Check services
kubectl get services
```

---

## Common kubectl Commands

### Viewing Resources

| Command | Description |
|---------|-------------|
| `kubectl get pods` | List all pods |
| `kubectl get deployments` | List all deployments |
| `kubectl get services` | List all services |
| `kubectl get all` | List all resources |
| `kubectl get nodes` | List cluster nodes |

### Detailed Information

| Command | Description |
|---------|-------------|
| `kubectl describe pod <name>` | Detailed pod info |
| `kubectl describe deployment <name>` | Detailed deployment info |
| `kubectl logs <pod-name>` | View pod logs |
| `kubectl logs -f <pod-name>` | Stream pod logs |

### Managing Resources

| Command | Description |
|---------|-------------|
| `kubectl apply -f <file.yaml>` | Create/update resources |
| `kubectl delete -f <file.yaml>` | Delete resources from file |
| `kubectl delete pod <name>` | Delete specific pod |
| `kubectl scale deployment <name> --replicas=5` | Scale deployment |

### Debugging

| Command | Description |
|---------|-------------|
| `kubectl exec -it <pod-name> -- /bin/sh` | Shell into pod |
| `kubectl port-forward <pod-name> 8080:80` | Forward port to localhost |
| `kubectl top pods` | Show pod resource usage |
| `kubectl top nodes` | Show node resource usage |

---

## Cluster Management

### Check Cluster Status

```bash
minikube status
```

### Stop Cluster (Preserves State)

```bash
minikube stop
```

### Start Again

```bash
minikube start
```

### Delete Cluster Completely

```bash
minikube delete
```

### Pause/Unpause (Save Resources)

```bash
# Pause cluster to free CPU/memory
minikube pause

# Resume cluster
minikube unpause
```

### SSH into Minikube Node

```bash
minikube ssh
```

---

## Accessing Your Application

### Method 1: minikube service (Easiest)

```bash
# Open service directly in browser
minikube service hello-service

# Just get the URL without opening browser
minikube service hello-service --url
```

### Method 2: Port Forwarding

```bash
# Forward service port to localhost
kubectl port-forward service/hello-service 8080:8080

# Access at http://localhost:8080
```

### Method 3: minikube tunnel (For LoadBalancer Services)

```bash
# In a separate terminal, run:
minikube tunnel

# This allows LoadBalancer services to get external IPs
```

---

## Working with Local Docker Images

To use your local Docker images in Minikube:

### Option 1: Use Minikube's Docker Daemon

```bash
# Point your terminal to Minikube's Docker
eval $(minikube docker-env)

# Now build your image (it will be available in Minikube)
docker build -t my-app:latest .

# In your YAML, set imagePullPolicy: Never
```

### Option 2: Load Image into Minikube

```bash
minikube image load my-app:latest
```

---

## Resource Configuration

### Start with Custom Resources

```bash
# Allocate more CPU and memory
minikube start --cpus=4 --memory=4096

# Specify Kubernetes version
minikube start --kubernetes-version=v1.28.0
```

### Check Current Configuration

```bash
minikube config view
```

---

## Troubleshooting

### Cluster Won't Start

```bash
# Check Docker is running
docker ps

# Delete and recreate cluster
minikube delete
minikube start --driver=docker
```

### Pods Stuck in Pending

```bash
# Check events
kubectl describe pod <pod-name>

# Check node resources
kubectl describe nodes

# Check if resources are available
kubectl top nodes
```

### Image Pull Errors

```bash
# Load local image into minikube
minikube image load my-image:tag

# Or use Minikube's Docker daemon
eval $(minikube docker-env)
docker build -t my-image:tag .
```

### Dashboard Won't Open

```bash
# Try running with URL output
minikube dashboard --url

# Copy the URL and open in browser manually
```

### Reset Everything

```bash
# Delete cluster
minikube delete --all

# Clear all Minikube data
minikube delete --purge

# Start fresh
minikube start --driver=docker
```

### Check Logs

```bash
# View Minikube logs
minikube logs

# View specific component logs
minikube logs --file=kubelet
```

---

## Useful Minikube Commands Reference

| Command | Description |
|---------|-------------|
| `minikube start` | Start cluster |
| `minikube stop` | Stop cluster |
| `minikube delete` | Delete cluster |
| `minikube status` | Check cluster status |
| `minikube dashboard` | Open web dashboard |
| `minikube service <name>` | Access a service |
| `minikube tunnel` | Enable LoadBalancer access |
| `minikube addons list` | List available add-ons |
| `minikube addons enable <name>` | Enable an add-on |
| `minikube ssh` | SSH into the node |
| `minikube ip` | Get cluster IP |
| `minikube logs` | View cluster logs |
| `minikube image load <image>` | Load Docker image |

---

## Next Steps

1. Explore the **Dashboard** (`minikube dashboard`)
2. Learn about [ConfigMaps and Secrets](https://kubernetes.io/docs/concepts/configuration/)
3. Explore [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)
4. Set up [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/) for routing
5. Try [Helm](https://helm.sh/) for package management

---

## Quick Start Checklist

- [ ] Docker installed and running
- [ ] Minikube installed (`minikube version`)
- [ ] kubectl installed (`kubectl version --client`)
- [ ] Cluster started (`minikube start --driver=docker`)
- [ ] Dashboard enabled (`minikube addons enable dashboard`)
- [ ] Sample app deployed (`kubectl apply -f first-app.yaml`)
- [ ] Verified pods are running (`kubectl get pods`)
- [ ] Accessed the dashboard (`minikube dashboard`)
