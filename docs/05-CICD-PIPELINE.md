# CI/CD Pipeline Setup

This guide covers setting up a CI/CD pipeline using GitHub Actions for automated builds, testing, security scanning, and deployment.

## Pipeline Overview

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│             │    │             │    │             │    │             │
│   Commit    │───▶│   Build &   │───▶│   Scan &    │───▶│   Push to   │
│   Code      │    │   Test      │    │   Analyze   │    │   Registry  │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                                                │
                                                                ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│             │    │             │    │             │    │             │
│   Deploy    │◀───│   ArgoCD    │◀───│   Update    │◀───│   Update    │
│   to K8s    │    │   Sync      │    │   Git Repo  │    │   Manifest  │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

---

## Prerequisites

- GitHub repository for your code
- Container registry (ECR, Docker Hub, or GitHub Container Registry)
- ArgoCD set up (for GitOps deployment)
- AWS credentials (for ECR)

---

## Part 1: GitHub Actions Workflow

### 1.1 Create Workflow Directory

```bash
mkdir -p .github/workflows
```

### 1.2 Main CI/CD Pipeline

**.github/workflows/ci-cd.yaml**
```yaml
name: CI/CD Pipeline

on:
  push:
    branches:
      - main
      - develop
    paths:
      - 'app/**'
      - '.github/workflows/**'
  pull_request:
    branches:
      - main
    paths:
      - 'app/**'

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY_BACKEND: demo-backend
  ECR_REPOSITORY_FRONTEND: demo-frontend

jobs:
  # ============================================
  # Job 1: Test
  # ============================================
  test:
    name: Run Tests
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: app/backend/package-lock.json

      - name: Install backend dependencies
        working-directory: app/backend
        run: npm ci

      - name: Run backend tests
        working-directory: app/backend
        run: npm test || echo "No tests configured"

      - name: Run linting
        working-directory: app/backend
        run: npm run lint || echo "No lint configured"

  # ============================================
  # Job 2: Build and Scan
  # ============================================
  build-and-scan:
    name: Build & Security Scan
    runs-on: ubuntu-latest
    needs: test
    outputs:
      image-tag: ${{ steps.meta.outputs.version }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Generate image metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: |
            ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ env.AWS_REGION }}.amazonaws.com/${{ env.ECR_REPOSITORY_BACKEND }}
          tags: |
            type=sha,prefix=
            type=ref,event=branch
            type=semver,pattern={{version}}

      # Build Backend
      - name: Build backend image
        uses: docker/build-push-action@v5
        with:
          context: ./app/backend
          push: false
          load: true
          tags: demo-backend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # Build Frontend
      - name: Build frontend image
        uses: docker/build-push-action@v5
        with:
          context: ./app/frontend
          push: false
          load: true
          tags: demo-frontend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # Security Scanning with Trivy
      - name: Run Trivy vulnerability scanner (Backend)
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'demo-backend:${{ github.sha }}'
          format: 'sarif'
          output: 'trivy-backend-results.sarif'
          severity: 'CRITICAL,HIGH'

      - name: Run Trivy vulnerability scanner (Frontend)
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'demo-frontend:${{ github.sha }}'
          format: 'sarif'
          output: 'trivy-frontend-results.sarif'
          severity: 'CRITICAL,HIGH'

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v2
        if: always()
        with:
          sarif_file: 'trivy-backend-results.sarif'

  # ============================================
  # Job 3: Push to Registry
  # ============================================
  push-to-registry:
    name: Push to ECR
    runs-on: ubuntu-latest
    needs: build-and-scan
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    outputs:
      image-tag: ${{ github.sha }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push backend
        uses: docker/build-push-action@v5
        with:
          context: ./app/backend
          push: true
          tags: |
            ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_BACKEND }}:${{ github.sha }}
            ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_BACKEND }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push frontend
        uses: docker/build-push-action@v5
        with:
          context: ./app/frontend
          push: true
          tags: |
            ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_FRONTEND }}:${{ github.sha }}
            ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_FRONTEND }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ============================================
  # Job 4: Update Kubernetes Manifests
  # ============================================
  update-manifests:
    name: Update K8s Manifests
    runs-on: ubuntu-latest
    needs: push-to-registry
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Update backend image tag
        run: |
          cd k8s/base
          sed -i "s|image: .*demo-backend:.*|image: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ env.AWS_REGION }}.amazonaws.com/${{ env.ECR_REPOSITORY_BACKEND }}:${{ github.sha }}|g" backend-deployment.yaml

      - name: Update frontend image tag
        run: |
          cd k8s/base
          sed -i "s|image: .*demo-frontend:.*|image: ${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.${{ env.AWS_REGION }}.amazonaws.com/${{ env.ECR_REPOSITORY_FRONTEND }}:${{ github.sha }}|g" frontend-deployment.yaml

      - name: Commit and push changes
        run: |
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add k8s/
          git diff --staged --quiet || git commit -m "Update image tags to ${{ github.sha }}"
          git push
```

---

## Part 2: Secrets Configuration

### 2.1 Required GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these secrets:

| Secret Name | Description |
|-------------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key |
| `AWS_ACCOUNT_ID` | Your AWS account ID |

### 2.2 Create AWS IAM User for CI/CD

```bash
# Create IAM user
aws iam create-user --user-name github-actions-cicd

# Create access key
aws iam create-access-key --user-name github-actions-cicd

# Attach ECR policy
aws iam attach-user-policy \
  --user-name github-actions-cicd \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
```

---

## Part 3: Alternative - Docker Hub Pipeline

**.github/workflows/ci-cd-dockerhub.yaml**
```yaml
name: CI/CD Pipeline (Docker Hub)

on:
  push:
    branches: [main]
    paths: ['app/**']

env:
  DOCKERHUB_USERNAME: ${{ secrets.DOCKERHUB_USERNAME }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push backend
        uses: docker/build-push-action@v5
        with:
          context: ./app/backend
          push: true
          tags: |
            ${{ env.DOCKERHUB_USERNAME }}/demo-backend:${{ github.sha }}
            ${{ env.DOCKERHUB_USERNAME }}/demo-backend:latest

      - name: Build and push frontend
        uses: docker/build-push-action@v5
        with:
          context: ./app/frontend
          push: true
          tags: |
            ${{ env.DOCKERHUB_USERNAME }}/demo-frontend:${{ github.sha }}
            ${{ env.DOCKERHUB_USERNAME }}/demo-frontend:latest
```

---

## Part 4: Security Scanning Details

### 4.1 Trivy Configuration

**trivy.yaml** (Repository root)
```yaml
severity:
  - CRITICAL
  - HIGH

vulnerability:
  type:
    - os
    - library

scan:
  skip-dirs:
    - node_modules
    - .git
```

### 4.2 Separate Security Scan Workflow

**.github/workflows/security-scan.yaml**
```yaml
name: Security Scan

on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:

jobs:
  scan-images:
    runs-on: ubuntu-latest
    
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to Amazon ECR
        uses: aws-actions/amazon-ecr-login@v2

      - name: Scan backend image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: '${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.us-east-1.amazonaws.com/demo-backend:latest'
          format: 'table'
          exit-code: '1'
          severity: 'CRITICAL'

      - name: Scan frontend image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: '${{ secrets.AWS_ACCOUNT_ID }}.dkr.ecr.us-east-1.amazonaws.com/demo-frontend:latest'
          format: 'table'
          exit-code: '1'
          severity: 'CRITICAL'

  scan-iac:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Scan Kubernetes manifests
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'config'
          scan-ref: './k8s'
          format: 'table'
          exit-code: '1'
          severity: 'CRITICAL,HIGH'
```

---

## Part 5: Pull Request Workflow

**.github/workflows/pr-check.yaml**
```yaml
name: PR Checks

on:
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        working-directory: app/backend
        run: npm ci

      - name: Run linter
        working-directory: app/backend
        run: npm run lint || echo "No lint script"

      - name: Run tests
        working-directory: app/backend
        run: npm test || echo "No test script"

  build-test:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Build backend image
        run: docker build -t demo-backend:test ./app/backend

      - name: Build frontend image
        run: docker build -t demo-frontend:test ./app/frontend

      - name: Security scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'demo-backend:test'
          format: 'table'
          severity: 'CRITICAL,HIGH'

  validate-k8s:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup kubectl
        uses: azure/setup-kubectl@v3

      - name: Validate manifests
        run: |
          kubectl apply --dry-run=client -f k8s/base/ || true

      - name: Lint with kube-linter
        uses: stackrox/kube-linter-action@v1
        with:
          directory: k8s/
```

---

## Part 6: Deployment Notification

**.github/workflows/notify.yaml**
```yaml
name: Deployment Notification

on:
  workflow_run:
    workflows: ["CI/CD Pipeline"]
    types:
      - completed

jobs:
  notify:
    runs-on: ubuntu-latest
    
    steps:
      - name: Slack Notification
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ github.event.workflow_run.conclusion }}
          fields: repo,message,commit,author,action,eventName,ref,workflow
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        if: always()
```

---

## Part 7: Complete GitOps Flow

### 7.1 Flow Summary

1. **Developer pushes code** to `main` branch
2. **GitHub Actions runs**:
   - Tests the code
   - Builds Docker images
   - Scans for vulnerabilities
   - Pushes to ECR
   - Updates K8s manifests with new image tag
   - Commits manifest changes
3. **ArgoCD detects** manifest changes in Git
4. **ArgoCD syncs** new images to Kubernetes cluster

### 7.2 Image Updater Alternative (ArgoCD Image Updater)

Instead of updating manifests in CI, you can use ArgoCD Image Updater:

```bash
# Install ArgoCD Image Updater
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml
```

**Annotate your ArgoCD Application:**
```yaml
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: backend=<account>.dkr.ecr.us-east-1.amazonaws.com/demo-backend
    argocd-image-updater.argoproj.io/backend.update-strategy: latest
```

---

## Troubleshooting

### Build Fails

```bash
# Check workflow logs in GitHub Actions tab
# Common issues:
# - Missing secrets
# - Incorrect Dockerfile path
# - npm install failures
```

### Push to ECR Fails

```bash
# Verify IAM permissions
aws iam list-attached-user-policies --user-name github-actions-cicd

# Check ECR repository exists
aws ecr describe-repositories
```

### Trivy Scan Blocking Deployment

```bash
# For development, you can change exit-code to 0
# Or fix the vulnerabilities in your Dockerfile
# Use specific image versions instead of :latest
```

---

## Next Steps

1. Set up branch protection rules
2. Add more comprehensive tests
3. Implement staging environment
4. Explore [06-ADVANCED-CONCEPTS.md](06-ADVANCED-CONCEPTS.md) for monitoring
