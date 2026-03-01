# Kubernetes Learning Project

A comprehensive hands-on project to learn Kubernetes, GitOps, and CI/CD.

## Project Overview

This project guides you through:
1. Building a full-stack application (React frontend + Node.js backend)
2. Containerizing with Docker
3. Deploying to Kubernetes (Local & AWS EKS)
4. Implementing GitOps with ArgoCD
5. Setting up CI/CD pipelines
6. Learning advanced concepts (Istio, HPA, Service Mesh)

---

## Project Structure

```
K8S/
├── README.md                    # This file - Overview & Learning Path
├── docs/
│   ├── 01-APPLICATION.md        # Application setup & Dockerfiles
│   ├── 02-KUBERNETES-LOCAL.md   # Local Minikube setup
│   ├── 03-KUBERNETES-AWS-EKS.md # AWS EKS setup
│   ├── 04-ARGOCD-SETUP.md       # ArgoCD & GitOps
│   ├── 05-CICD-PIPELINE.md      # CI/CD with GitHub Actions
│   └── 06-ADVANCED-CONCEPTS.md  # Istio, HPA, Service Mesh
├── app/
│   ├── frontend/                # React application
│   └── backend/                 # Node.js API
└── k8s/
    ├── base/                    # Base Kubernetes manifests
    ├── overlays/
    │   ├── local/               # Local environment configs
    │   └── aws/                 # AWS environment configs
    └── argocd/                  # ArgoCD application manifests
```

---

## Learning Path

### Phase 1: Foundations (Local - Free)
**Goal**: Understand core Kubernetes concepts

| Step | Topic | Documentation |
|------|-------|---------------|
| 1.1 | Build the application | [01-APPLICATION.md](docs/01-APPLICATION.md) |
| 1.2 | Create Docker images | [01-APPLICATION.md](docs/01-APPLICATION.md) |
| 1.3 | Set up Minikube | [02-KUBERNETES-LOCAL.md](docs/02-KUBERNETES-LOCAL.md) |
| 1.4 | Deploy to local K8s | [02-KUBERNETES-LOCAL.md](docs/02-KUBERNETES-LOCAL.md) |

**Concepts covered**: Pods, Deployments, Services, ConfigMaps, Secrets, Ingress

---

### Phase 2: GitOps (Local - Free)
**Goal**: Implement GitOps workflow with ArgoCD

| Step | Topic | Documentation |
|------|-------|---------------|
| 2.1 | Install ArgoCD locally | [04-ARGOCD-SETUP.md](docs/04-ARGOCD-SETUP.md) |
| 2.2 | Connect GitHub repo | [04-ARGOCD-SETUP.md](docs/04-ARGOCD-SETUP.md) |
| 2.3 | Automatic deployments | [04-ARGOCD-SETUP.md](docs/04-ARGOCD-SETUP.md) |

**Concepts covered**: GitOps principles, Declarative configuration, Sync strategies

---

### Phase 3: Production Environment (AWS - Paid)
**Goal**: Deploy to production-like environment

| Step | Topic | Documentation |
|------|-------|---------------|
| 3.1 | Set up AWS EKS | [03-KUBERNETES-AWS-EKS.md](docs/03-KUBERNETES-AWS-EKS.md) |
| 3.2 | Configure ALB Ingress | [03-KUBERNETES-AWS-EKS.md](docs/03-KUBERNETES-AWS-EKS.md) |
| 3.3 | Deploy application | [03-KUBERNETES-AWS-EKS.md](docs/03-KUBERNETES-AWS-EKS.md) |
| 3.4 | Set up ArgoCD on EKS | [04-ARGOCD-SETUP.md](docs/04-ARGOCD-SETUP.md) |

**Concepts covered**: EKS, IAM roles, ALB, EBS, AWS integrations

---

### Phase 4: CI/CD Pipeline
**Goal**: Automate build, test, and deployment

| Step | Topic | Documentation |
|------|-------|---------------|
| 4.1 | GitHub Actions setup | [05-CICD-PIPELINE.md](docs/05-CICD-PIPELINE.md) |
| 4.2 | Image scanning (Trivy) | [05-CICD-PIPELINE.md](docs/05-CICD-PIPELINE.md) |
| 4.3 | Automated deployments | [05-CICD-PIPELINE.md](docs/05-CICD-PIPELINE.md) |

**Concepts covered**: CI/CD, Container security, GitOps integration

---

### Phase 5: Advanced Concepts
**Goal**: Production-grade Kubernetes

| Step | Topic | Documentation |
|------|-------|---------------|
| 5.1 | Horizontal Pod Autoscaler | [06-ADVANCED-CONCEPTS.md](docs/06-ADVANCED-CONCEPTS.md) |
| 5.2 | Istio Service Mesh | [06-ADVANCED-CONCEPTS.md](docs/06-ADVANCED-CONCEPTS.md) |
| 5.3 | Network Policies | [06-ADVANCED-CONCEPTS.md](docs/06-ADVANCED-CONCEPTS.md) |
| 5.4 | Monitoring & Logging | [06-ADVANCED-CONCEPTS.md](docs/06-ADVANCED-CONCEPTS.md) |

**Concepts covered**: HPA, VPA, Istio, Kiali, Prometheus, Grafana

---

## Cost Management (AWS)

### Estimated Costs
| Resource | Cost |
|----------|------|
| EKS Cluster | $0.10/hour (~$73/month) |
| EC2 Nodes (2x t3.medium) | ~$0.08/hour (~$60/month) |
| ALB | ~$0.025/hour (~$18/month) |
| **Total** | **~$150/month if running 24/7** |

### Cost Saving Tips
1. **Delete when not using**: `eksctl delete cluster --name my-cluster`
2. **Use spot instances**: 70-90% savings on EC2
3. **Scale down nodes**: Reduce to 1 node when learning
4. **Set billing alerts**: AWS Budgets to alert at $20, $50, etc.

---

## Prerequisites Checklist

- [ ] Docker installed and running
- [ ] Git installed
- [ ] GitHub account
- [ ] Node.js 18+ (for local development)
- [ ] AWS CLI (for EKS phase)
- [ ] AWS Account (for EKS phase)

---

## Quick Start

```bash
# 1. Install tools
brew install minikube kubectl docker

# 2. Start local cluster
minikube start --driver=docker

# 3. Build application
cd app/backend && docker build -t demo-backend:latest .
cd ../frontend && docker build -t demo-frontend:latest .

# 4. Load images into Minikube
minikube image load demo-backend:latest
minikube image load demo-frontend:latest

# 5. Deploy
kubectl apply -f k8s/base/

# 6. Access application
minikube service frontend-service
```

---

## Getting Help

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Minikube Documentation](https://minikube.sigs.k8s.io/docs/)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [AWS EKS Documentation](https://docs.aws.amazon.com/eks/)
