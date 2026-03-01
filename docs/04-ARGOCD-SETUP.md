# ArgoCD Setup (GitOps)

This guide covers setting up ArgoCD for GitOps-based continuous deployment.

## What is GitOps?

GitOps is a way of implementing continuous deployment for cloud-native applications. It works by:
1. Using Git as the single source of truth for declarative infrastructure
2. Automatically syncing the cluster state with the desired state in Git
3. Using pull-based deployment (ArgoCD pulls changes, not CI pushing)

---

## Prerequisites

- Kubernetes cluster running (Minikube or EKS)
- kubectl configured
- Git repository for your manifests

---

## Part 1: Install ArgoCD

### 1.1 Create ArgoCD Namespace

```bash
kubectl create namespace argocd
```

### 1.2 Install ArgoCD

```bash
# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for pods to be ready
kubectl wait --for=condition=Ready pods --all -n argocd --timeout=300s

# Check installation
kubectl get pods -n argocd
```

### 1.3 Install ArgoCD CLI

```bash
# macOS
brew install argocd

# Linux
curl -sSL -o argocd-linux-amd64 https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
sudo install -m 555 argocd-linux-amd64 /usr/local/bin/argocd
rm argocd-linux-amd64

# Verify
argocd version --client
```

---

## Part 2: Access ArgoCD UI

### 2.1 Port Forward (Local Development)

```bash
# Port forward to access UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Access at: https://localhost:8080

### 2.2 Get Initial Admin Password

```bash
# Get password
argocd admin initial-password -n argocd

# Or using kubectl
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

**Login credentials:**
- Username: `admin`
- Password: (from command above)

### 2.3 Login via CLI

```bash
# Login (when port-forwarding)
argocd login localhost:8080 --username admin --password <password> --insecure
```

### 2.4 Change Admin Password

```bash
argocd account update-password
```

---

## Part 3: Expose ArgoCD (AWS/Production)

### 3.1 Create Ingress for ArgoCD (AWS)

**k8s/argocd/argocd-ingress.yaml**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-server-ingress
  namespace: argocd
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/backend-protocol: HTTPS
    alb.ingress.kubernetes.io/healthcheck-path: /healthz
    alb.ingress.kubernetes.io/healthcheck-protocol: HTTPS
spec:
  ingressClassName: alb
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  number: 443
```

### 3.2 Or Use LoadBalancer Service

```bash
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "LoadBalancer"}}'
```

---

## Part 4: Prepare Git Repository

### 4.1 Repository Structure

Your Git repository should look like:
```
k8s-demo-app/
├── k8s/
│   ├── base/
│   │   ├── namespace.yaml
│   │   ├── configmap.yaml
│   │   ├── backend-deployment.yaml
│   │   ├── backend-service.yaml
│   │   ├── frontend-deployment.yaml
│   │   ├── frontend-service.yaml
│   │   ├── ingress.yaml
│   │   └── kustomization.yaml
│   └── overlays/
│       ├── local/
│       │   └── kustomization.yaml
│       └── aws/
│           └── kustomization.yaml
└── argocd/
    └── application.yaml
```

### 4.2 Push to GitHub

```bash
cd /path/to/your/project

# Initialize git
git init
git add .
git commit -m "Initial commit - K8s manifests"

# Create repo on GitHub, then:
git remote add origin https://github.com/<your-username>/k8s-demo-app.git
git branch -M main
git push -u origin main
```

---

## Part 5: Connect Repository to ArgoCD

### 5.1 Add Repository (Public Repo)

```bash
argocd repo add https://github.com/<your-username>/k8s-demo-app.git
```

### 5.2 Add Repository (Private Repo with SSH)

```bash
# Add SSH key
argocd repo add git@github.com:<your-username>/k8s-demo-app.git \
  --ssh-private-key-path ~/.ssh/id_rsa
```

### 5.3 Add Repository (Private Repo with HTTPS)

```bash
argocd repo add https://github.com/<your-username>/k8s-demo-app.git \
  --username <github-username> \
  --password <github-token>
```

### 5.4 Verify Repository

```bash
argocd repo list
```

---

## Part 6: Create ArgoCD Application

### 6.1 Application Manifest

**k8s/argocd/application.yaml**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: demo-app
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  
  source:
    repoURL: https://github.com/<your-username>/k8s-demo-app.git
    targetRevision: main
    path: k8s/base
    
  destination:
    server: https://kubernetes.default.svc
    namespace: demo-app
    
  syncPolicy:
    automated:
      prune: true        # Delete resources not in Git
      selfHeal: true     # Revert manual changes
      allowEmpty: false
    syncOptions:
      - CreateNamespace=true
      - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

### 6.2 Apply Application

```bash
kubectl apply -f k8s/argocd/application.yaml
```

### 6.3 Or Create via CLI

```bash
argocd app create demo-app \
  --repo https://github.com/<your-username>/k8s-demo-app.git \
  --path k8s/base \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace demo-app \
  --sync-policy automated \
  --auto-prune \
  --self-heal
```

---

## Part 7: Managing Applications

### 7.1 Check Application Status

```bash
# List applications
argocd app list

# Get app details
argocd app get demo-app

# Get app resources
argocd app resources demo-app
```

### 7.2 Sync Application

```bash
# Manual sync
argocd app sync demo-app

# Sync with prune
argocd app sync demo-app --prune
```

### 7.3 View Sync History

```bash
argocd app history demo-app
```

### 7.4 Rollback

```bash
# Rollback to previous version
argocd app rollback demo-app <history-id>

# Get history IDs
argocd app history demo-app
```

---

## Part 8: Multiple Environments

### 8.1 Application per Environment

**k8s/argocd/app-local.yaml**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: demo-app-local
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/<your-username>/k8s-demo-app.git
    targetRevision: main
    path: k8s/overlays/local
  destination:
    server: https://kubernetes.default.svc
    namespace: demo-app-local
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

**k8s/argocd/app-aws.yaml**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: demo-app-aws
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/<your-username>/k8s-demo-app.git
    targetRevision: main
    path: k8s/overlays/aws
  destination:
    server: https://kubernetes.default.svc
    namespace: demo-app-aws
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

### 8.2 Using ApplicationSet (Advanced)

**k8s/argocd/applicationset.yaml**
```yaml
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: demo-app-set
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - env: local
            namespace: demo-app-local
          - env: aws
            namespace: demo-app-aws
  template:
    metadata:
      name: 'demo-app-{{env}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/<your-username>/k8s-demo-app.git
        targetRevision: main
        path: 'k8s/overlays/{{env}}'
      destination:
        server: https://kubernetes.default.svc
        namespace: '{{namespace}}'
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
        syncOptions:
          - CreateNamespace=true
```

---

## Part 9: GitOps Workflow

### 9.1 Development Workflow

1. **Make code changes** in your application
2. **Build new Docker image** with new tag
3. **Update image tag** in Kubernetes manifests
4. **Commit and push** to Git
5. **ArgoCD detects changes** and syncs automatically

### 9.2 Example: Update Image Version

```bash
# 1. Build new image
docker build -t demo-backend:1.0.1 .

# 2. Push to registry
docker tag demo-backend:1.0.1 <registry>/demo-backend:1.0.1
docker push <registry>/demo-backend:1.0.1

# 3. Update manifest
# Edit k8s/base/backend-deployment.yaml
# Change image: demo-backend:1.0.0 -> demo-backend:1.0.1

# 4. Commit and push
git add .
git commit -m "Update backend to 1.0.1"
git push

# 5. ArgoCD syncs automatically (or manually)
argocd app sync demo-app
```

---

## Part 10: Notifications (Optional)

### 10.1 Install Notifications Controller

```bash
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj-labs/argocd-notifications/release-1.0/manifests/install.yaml
```

### 10.2 Configure Slack Notifications

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  service.slack: |
    token: $slack-token
  template.app-deployed: |
    message: |
      Application {{.app.metadata.name}} is now {{.app.status.sync.status}}.
  trigger.on-deployed: |
    - when: app.status.sync.status == 'Synced'
      send: [app-deployed]
```

---

## Troubleshooting

### Application Out of Sync

```bash
# Check diff
argocd app diff demo-app

# Force sync
argocd app sync demo-app --force
```

### Sync Failed

```bash
# Check app status
argocd app get demo-app

# Check events
kubectl get events -n demo-app

# Check ArgoCD logs
kubectl logs -n argocd deployment/argocd-application-controller
```

### Repository Connection Issues

```bash
# Test repository
argocd repo list

# Check credentials
argocd repo get https://github.com/<your-username>/k8s-demo-app.git
```

### Reset ArgoCD

```bash
# Delete and reinstall
kubectl delete -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

---

## Cleanup

```bash
# Delete application
argocd app delete demo-app

# Delete ArgoCD
kubectl delete namespace argocd
```

---

## Best Practices

1. **Use Kustomize or Helm** for managing environment differences
2. **Enable auto-sync with self-heal** for production
3. **Use ApplicationSets** for multi-cluster/multi-env deployments
4. **Implement proper RBAC** for ArgoCD users
5. **Set up notifications** for sync status changes
6. **Use sealed-secrets or external-secrets** for secret management

---

## Next Steps

1. Proceed to [05-CICD-PIPELINE.md](05-CICD-PIPELINE.md) for CI/CD setup
2. Or explore [06-ADVANCED-CONCEPTS.md](06-ADVANCED-CONCEPTS.md) for advanced topics
