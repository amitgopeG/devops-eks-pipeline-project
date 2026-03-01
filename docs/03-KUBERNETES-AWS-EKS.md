# Kubernetes AWS EKS Setup

This guide covers deploying the demo application to AWS EKS (Elastic Kubernetes Service).

## Prerequisites

- AWS Account
- AWS CLI installed and configured
- eksctl installed
- kubectl installed
- Docker images pushed to ECR or Docker Hub

---

## Step 1: Install Required Tools

### 1.1 Install AWS CLI

```bash
# macOS
brew install awscli

# Verify
aws --version
```

### 1.2 Configure AWS CLI

```bash
aws configure
```

Enter:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (e.g., us-east-1)
- Default output format (json)

### 1.3 Install eksctl

```bash
# macOS
brew tap weaveworks/tap
brew install weaveworks/tap/eksctl

# Verify
eksctl version
```

### 1.4 Install kubectl (if not already)

```bash
brew install kubectl
```

---

## Step 2: Create ECR Repositories

```bash
# Set variables
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Create repositories
aws ecr create-repository --repository-name demo-backend --region $AWS_REGION
aws ecr create-repository --repository-name demo-frontend --region $AWS_REGION
```

---

## Step 3: Push Docker Images to ECR

```bash
# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Tag images
docker tag demo-backend:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/demo-backend:latest
docker tag demo-frontend:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/demo-frontend:latest

# Push images
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/demo-backend:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/demo-frontend:latest
```

---

## Step 4: Create EKS Cluster

### 4.1 Create Cluster Configuration

**eks-cluster.yaml**
```yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: demo-cluster
  region: us-east-1
  version: "1.28"

managedNodeGroups:
  - name: demo-nodes
    instanceType: t3.medium
    desiredCapacity: 2
    minSize: 1
    maxSize: 4
    volumeSize: 20
    ssh:
      allow: false
    labels:
      role: worker
    tags:
      environment: demo
    iam:
      withAddonPolicies:
        albIngress: true
        cloudWatch: true

iam:
  withOIDC: true

cloudWatch:
  clusterLogging:
    enableTypes:
      - api
      - audit
      - authenticator
```

### 4.2 Create the Cluster

```bash
# Create cluster (takes 15-20 minutes)
eksctl create cluster -f eks-cluster.yaml

# Verify cluster
kubectl get nodes
kubectl cluster-info
```

### 4.3 Alternative: Quick Cluster Creation

```bash
eksctl create cluster \
  --name demo-cluster \
  --region us-east-1 \
  --nodegroup-name demo-nodes \
  --node-type t3.medium \
  --nodes 2 \
  --nodes-min 1 \
  --nodes-max 4 \
  --managed
```

---

## Step 5: Install AWS Load Balancer Controller

The AWS Load Balancer Controller manages ALB/NLB for Kubernetes services.

### 5.1 Create IAM Policy

```bash
# Download policy
curl -o iam_policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.6.0/docs/install/iam_policy.json

# Create IAM policy
aws iam create-policy \
    --policy-name AWSLoadBalancerControllerIAMPolicy \
    --policy-document file://iam_policy.json
```

### 5.2 Create Service Account

```bash
eksctl create iamserviceaccount \
  --cluster=demo-cluster \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=arn:aws:iam::$AWS_ACCOUNT_ID:policy/AWSLoadBalancerControllerIAMPolicy \
  --override-existing-serviceaccounts \
  --approve
```

### 5.3 Install Controller with Helm

```bash
# Add Helm repo
helm repo add eks https://aws.github.io/eks-charts
helm repo update

# Install controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=demo-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller

# Verify
kubectl get deployment -n kube-system aws-load-balancer-controller
```

---

## Step 6: Create AWS-Specific Kubernetes Manifests

### 6.1 Create Overlays Directory

```bash
mkdir -p k8s/overlays/aws
```

### 6.2 AWS ConfigMap Patch

**k8s/overlays/aws/configmap-patch.yaml**
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
  ENVIRONMENT: "aws"
```

### 6.3 Backend Deployment Patch

**k8s/overlays/aws/backend-deployment-patch.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: demo-app
spec:
  template:
    spec:
      containers:
        - name: backend
          image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/demo-backend:latest
          imagePullPolicy: Always
          resources:
            requests:
              memory: "128Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "1000m"
```

### 6.4 Frontend Deployment Patch

**k8s/overlays/aws/frontend-deployment-patch.yaml**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: demo-app
spec:
  template:
    spec:
      containers:
        - name: frontend
          image: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/demo-frontend:latest
          imagePullPolicy: Always
          resources:
            requests:
              memory: "128Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "1000m"
```

### 6.5 AWS Ingress (ALB)

**k8s/overlays/aws/ingress.yaml**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: demo-ingress
  namespace: demo-app
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /health
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: "30"
    alb.ingress.kubernetes.io/healthcheck-timeout-seconds: "5"
    alb.ingress.kubernetes.io/healthy-threshold-count: "2"
    alb.ingress.kubernetes.io/unhealthy-threshold-count: "2"
spec:
  ingressClassName: alb
  rules:
    - http:
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

### 6.6 AWS Kustomization

**k8s/overlays/aws/kustomization.yaml**
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: demo-app

resources:
  - ../../base/namespace.yaml
  - ../../base/backend-service.yaml
  - ../../base/frontend-service.yaml
  - ingress.yaml

configMapGenerator:
  - name: app-config
    behavior: replace
    files: []
    literals:
      - NODE_ENV=production
      - LOG_LEVEL=info
      - BACKEND_URL=http://backend-service:5000
      - ENVIRONMENT=aws

patches:
  - path: backend-deployment-patch.yaml
  - path: frontend-deployment-patch.yaml

images:
  - name: demo-backend
    newName: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/demo-backend
    newTag: latest
  - name: demo-frontend
    newName: <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/demo-frontend
    newTag: latest

commonLabels:
  project: demo-app
  environment: aws
```

---

## Step 7: Deploy to EKS

### 7.1 Update Image References

Replace `<ACCOUNT_ID>` with your actual AWS account ID in the kustomization files.

```bash
# Get your account ID
aws sts get-caller-identity --query Account --output text
```

### 7.2 Deploy

```bash
# Apply base resources first
kubectl apply -f k8s/base/namespace.yaml
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/backend-deployment.yaml
kubectl apply -f k8s/base/backend-service.yaml
kubectl apply -f k8s/base/frontend-deployment.yaml
kubectl apply -f k8s/base/frontend-service.yaml

# Apply AWS-specific ingress
kubectl apply -f k8s/overlays/aws/ingress.yaml
```

Or use Kustomize:

```bash
kubectl apply -k k8s/overlays/aws/
```

---

## Step 8: Verify Deployment

```bash
# Check all resources
kubectl get all -n demo-app

# Check pods
kubectl get pods -n demo-app -w

# Check ingress (wait for ADDRESS)
kubectl get ingress -n demo-app

# Get ALB URL
kubectl get ingress -n demo-app -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}'
```

The ALB provisioning takes 2-3 minutes. Once the ADDRESS appears, you can access your application.

---

## Step 9: Access the Application

```bash
# Get the ALB URL
export ALB_URL=$(kubectl get ingress -n demo-app -o jsonpath='{.items[0].status.loadBalancer.ingress[0].hostname}')

# Test
curl http://$ALB_URL/health
curl http://$ALB_URL/api/info

# Open in browser
echo "http://$ALB_URL"
```

---

## Step 10: Enable Cluster Autoscaler (Optional)

### 10.1 Create IAM Policy

```bash
cat > cluster-autoscaler-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "autoscaling:DescribeAutoScalingGroups",
                "autoscaling:DescribeAutoScalingInstances",
                "autoscaling:DescribeLaunchConfigurations",
                "autoscaling:DescribeTags",
                "autoscaling:SetDesiredCapacity",
                "autoscaling:TerminateInstanceInAutoScalingGroup",
                "ec2:DescribeLaunchTemplateVersions"
            ],
            "Resource": "*"
        }
    ]
}
EOF

aws iam create-policy \
    --policy-name ClusterAutoscalerPolicy \
    --policy-document file://cluster-autoscaler-policy.json
```

### 10.2 Deploy Cluster Autoscaler

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml

# Edit deployment to add cluster name
kubectl -n kube-system edit deployment cluster-autoscaler
# Add: --node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/demo-cluster
```

---

## Cost Management

### Check Current Costs

```bash
# View running resources
kubectl get nodes
kubectl get pods --all-namespaces
```

### Scale Down to Save Costs

```bash
# Scale deployments to 0
kubectl scale deployment backend frontend -n demo-app --replicas=0

# Scale node group to minimum
eksctl scale nodegroup --cluster demo-cluster --name demo-nodes --nodes 1 --nodes-min 1
```

### Delete Cluster When Not Using

```bash
# Delete cluster (stops all costs)
eksctl delete cluster --name demo-cluster

# Recreate when needed
eksctl create cluster -f eks-cluster.yaml
```

### Cost Saving Tips

1. **Use Spot Instances**: Add `spot: true` to nodegroup config (70-90% savings)
2. **Delete when not using**: ~$0.10/hr for EKS + EC2 costs
3. **Set billing alerts**: AWS Budgets to alert at thresholds
4. **Use smaller instances**: t3.small instead of t3.medium for learning

---

## Cleanup

### Delete Application

```bash
kubectl delete namespace demo-app
```

### Delete Load Balancer Controller

```bash
helm uninstall aws-load-balancer-controller -n kube-system
```

### Delete Cluster

```bash
eksctl delete cluster --name demo-cluster
```

### Delete ECR Images

```bash
aws ecr delete-repository --repository-name demo-backend --force
aws ecr delete-repository --repository-name demo-frontend --force
```

---

## Troubleshooting

### Pods in ImagePullBackOff

**Cause**: Can't pull image from ECR

**Solution**:
```bash
# Check ECR permissions
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Verify image exists
aws ecr describe-images --repository-name demo-backend
```

### ALB Not Creating

**Cause**: Load balancer controller issues

**Solution**:
```bash
# Check controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller

# Check subnet tags
# Subnets need: kubernetes.io/role/elb=1 (public) or kubernetes.io/role/internal-elb=1 (private)
```

### Nodes Not Joining

**Cause**: IAM or networking issues

**Solution**:
```bash
# Check node group status
eksctl get nodegroup --cluster demo-cluster

# Check node logs
kubectl describe nodes
```

---

## Next Steps

1. Proceed to [04-ARGOCD-SETUP.md](04-ARGOCD-SETUP.md) to set up GitOps on EKS
2. Or explore [06-ADVANCED-CONCEPTS.md](06-ADVANCED-CONCEPTS.md) for HPA, Istio, etc.
