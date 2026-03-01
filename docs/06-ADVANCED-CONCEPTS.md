# Advanced Kubernetes Concepts

This guide covers advanced Kubernetes topics including HPA, Istio Service Mesh, Network Policies, and Monitoring.

---

## Part 1: Horizontal Pod Autoscaler (HPA)

HPA automatically scales pods based on CPU/memory utilization or custom metrics.

### 1.1 Prerequisites

```bash
# Enable metrics-server (Minikube)
minikube addons enable metrics-server

# For EKS, metrics-server is usually pre-installed
kubectl get deployment metrics-server -n kube-system
```

### 1.2 Basic HPA

**k8s/base/backend-hpa.yaml**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: demo-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
        - type: Pods
          value: 4
          periodSeconds: 15
      selectPolicy: Max
```

### 1.3 Apply HPA

```bash
kubectl apply -f k8s/base/backend-hpa.yaml

# Check HPA status
kubectl get hpa -n demo-app

# Watch scaling
kubectl get hpa -n demo-app -w
```

### 1.4 Load Test to Trigger Scaling

```bash
# Install hey (HTTP load generator)
brew install hey

# Generate load
hey -z 2m -c 50 http://<your-app-url>/api/info

# Watch pods scale
kubectl get pods -n demo-app -w
```

### 1.5 HPA with Custom Metrics

For custom metrics, you need Prometheus Adapter:

```bash
# Install Prometheus Adapter
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus-adapter prometheus-community/prometheus-adapter
```

**Custom metrics HPA example:**
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa-custom
  namespace: demo-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: 100
```

---

## Part 2: Vertical Pod Autoscaler (VPA)

VPA automatically adjusts CPU and memory requests.

### 2.1 Install VPA

```bash
# Clone VPA repo
git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler

# Install
./hack/vpa-up.sh
```

### 2.2 VPA Configuration

**k8s/base/backend-vpa.yaml**
```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: backend-vpa
  namespace: demo-app
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  updatePolicy:
    updateMode: "Auto"  # Off, Initial, Recreate, Auto
  resourcePolicy:
    containerPolicies:
      - containerName: backend
        minAllowed:
          cpu: 100m
          memory: 64Mi
        maxAllowed:
          cpu: 2
          memory: 2Gi
        controlledResources: ["cpu", "memory"]
```

### 2.3 Check VPA Recommendations

```bash
kubectl get vpa -n demo-app
kubectl describe vpa backend-vpa -n demo-app
```

---

## Part 3: Istio Service Mesh

Istio provides traffic management, security, and observability.

### 3.1 Install Istio

```bash
# Download Istio
curl -L https://istio.io/downloadIstio | sh -
cd istio-*

# Add to PATH
export PATH=$PWD/bin:$PATH

# Install Istio (demo profile for learning)
istioctl install --set profile=demo -y

# Enable sidecar injection for namespace
kubectl label namespace demo-app istio-injection=enabled

# Verify
kubectl get pods -n istio-system
```

### 3.2 Restart Pods for Sidecar Injection

```bash
kubectl rollout restart deployment -n demo-app
kubectl get pods -n demo-app
# You should see 2/2 containers (app + istio-proxy)
```

### 3.3 Install Addons (Kiali, Grafana, Jaeger)

```bash
kubectl apply -f samples/addons/

# Wait for pods
kubectl get pods -n istio-system

# Access Kiali dashboard
istioctl dashboard kiali

# Access Grafana
istioctl dashboard grafana

# Access Jaeger (tracing)
istioctl dashboard jaeger
```

### 3.4 Traffic Management - Virtual Service

**k8s/istio/virtual-service.yaml**
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: backend-vs
  namespace: demo-app
spec:
  hosts:
    - backend-service
  http:
    - match:
        - headers:
            x-version:
              exact: "v2"
      route:
        - destination:
            host: backend-service
            subset: v2
    - route:
        - destination:
            host: backend-service
            subset: v1
          weight: 90
        - destination:
            host: backend-service
            subset: v2
          weight: 10
```

### 3.5 Destination Rule

**k8s/istio/destination-rule.yaml**
```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: backend-dr
  namespace: demo-app
spec:
  host: backend-service
  trafficPolicy:
    connectionPool:
      tcp:
        maxConnections: 100
      http:
        h2UpgradePolicy: UPGRADE
        http1MaxPendingRequests: 100
        http2MaxRequests: 1000
    outlierDetection:
      consecutive5xxErrors: 5
      interval: 30s
      baseEjectionTime: 30s
  subsets:
    - name: v1
      labels:
        version: v1
    - name: v2
      labels:
        version: v2
```

### 3.6 Circuit Breaker

```yaml
apiVersion: networking.istio.io/v1beta1
kind: DestinationRule
metadata:
  name: backend-circuit-breaker
  namespace: demo-app
spec:
  host: backend-service
  trafficPolicy:
    outlierDetection:
      consecutive5xxErrors: 3
      interval: 10s
      baseEjectionTime: 30s
      maxEjectionPercent: 100
    connectionPool:
      tcp:
        maxConnections: 50
      http:
        http1MaxPendingRequests: 50
        http2MaxRequests: 100
        maxRequestsPerConnection: 10
```

### 3.7 Fault Injection (Testing)

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: backend-fault
  namespace: demo-app
spec:
  hosts:
    - backend-service
  http:
    - fault:
        delay:
          percentage:
            value: 10
          fixedDelay: 5s
        abort:
          percentage:
            value: 5
          httpStatus: 500
      route:
        - destination:
            host: backend-service
```

---

## Part 4: Network Policies

Control traffic flow between pods.

### 4.1 Default Deny All

**k8s/base/network-policy-default.yaml**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: demo-app
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
```

### 4.2 Allow Frontend to Backend

**k8s/base/network-policy-frontend.yaml**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: demo-app
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - protocol: TCP
          port: 5000
```

### 4.3 Allow Ingress Controller

**k8s/base/network-policy-ingress.yaml**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-ingress
  namespace: demo-app
spec:
  podSelector:
    matchLabels:
      app: frontend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
      ports:
        - protocol: TCP
          port: 3000
```

### 4.4 Allow DNS Egress

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: demo-app
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    - to:
        - namespaceSelector: {}
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
```

---

## Part 5: Pod Disruption Budget (PDB)

Ensure availability during voluntary disruptions.

**k8s/base/backend-pdb.yaml**
```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: backend-pdb
  namespace: demo-app
spec:
  minAvailable: 1
  # Or use: maxUnavailable: 1
  selector:
    matchLabels:
      app: backend
```

---

## Part 6: Resource Quotas and Limits

### 6.1 Resource Quota

**k8s/base/resource-quota.yaml**
```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: demo-app-quota
  namespace: demo-app
spec:
  hard:
    requests.cpu: "4"
    requests.memory: 4Gi
    limits.cpu: "8"
    limits.memory: 8Gi
    pods: "20"
    services: "10"
    secrets: "20"
    configmaps: "20"
    persistentvolumeclaims: "10"
```

### 6.2 Limit Range

**k8s/base/limit-range.yaml**
```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: demo-app-limits
  namespace: demo-app
spec:
  limits:
    - default:
        cpu: 500m
        memory: 256Mi
      defaultRequest:
        cpu: 100m
        memory: 64Mi
      max:
        cpu: 2
        memory: 1Gi
      min:
        cpu: 50m
        memory: 32Mi
      type: Container
```

---

## Part 7: Monitoring with Prometheus & Grafana

### 7.1 Install Prometheus Stack

```bash
# Add Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install kube-prometheus-stack
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --set grafana.adminPassword=admin
```

### 7.2 Access Dashboards

```bash
# Port forward Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80

# Port forward Prometheus
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-prometheus 9090:9090

# Port forward Alertmanager
kubectl port-forward -n monitoring svc/prometheus-kube-prometheus-alertmanager 9093:9093
```

### 7.3 ServiceMonitor for Custom Metrics

**k8s/monitoring/servicemonitor.yaml**
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: backend-monitor
  namespace: monitoring
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: backend
  namespaceSelector:
    matchNames:
      - demo-app
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
```

### 7.4 Custom Alerts

**k8s/monitoring/prometheus-rules.yaml**
```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: demo-app-rules
  namespace: monitoring
  labels:
    release: prometheus
spec:
  groups:
    - name: demo-app
      rules:
        - alert: HighErrorRate
          expr: |
            sum(rate(http_requests_total{status=~"5.."}[5m])) 
            / sum(rate(http_requests_total[5m])) > 0.05
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: High error rate detected
            description: Error rate is above 5%
        
        - alert: PodCrashLooping
          expr: |
            rate(kube_pod_container_status_restarts_total{namespace="demo-app"}[15m]) > 0
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: Pod is crash looping
```

---

## Part 8: Logging with EFK Stack

### 8.1 Install Elasticsearch

```bash
helm repo add elastic https://helm.elastic.co

helm install elasticsearch elastic/elasticsearch \
  --namespace logging \
  --create-namespace \
  --set replicas=1 \
  --set minimumMasterNodes=1 \
  --set resources.requests.memory=1Gi
```

### 8.2 Install Fluentd

```bash
helm install fluentd bitnami/fluentd \
  --namespace logging \
  --set aggregator.enabled=false \
  --set forwarder.enabled=true
```

### 8.3 Install Kibana

```bash
helm install kibana elastic/kibana \
  --namespace logging

# Port forward
kubectl port-forward -n logging svc/kibana-kibana 5601:5601
```

---

## Part 9: Secrets Management

### 9.1 Sealed Secrets

```bash
# Install controller
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# Install kubeseal CLI
brew install kubeseal

# Create sealed secret
kubectl create secret generic my-secret --dry-run=client -o yaml \
  | kubeseal --format yaml > sealed-secret.yaml

kubectl apply -f sealed-secret.yaml
```

### 9.2 External Secrets Operator

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace
```

**AWS Secrets Manager integration:**
```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets
  namespace: demo-app
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: database-credentials
  namespace: demo-app
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets
    kind: SecretStore
  target:
    name: database-secret
  data:
    - secretKey: username
      remoteRef:
        key: prod/database
        property: username
    - secretKey: password
      remoteRef:
        key: prod/database
        property: password
```

---

## Part 10: Pod Security Standards

### 10.1 Pod Security Admission

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: demo-app
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### 10.2 Security Context

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  template:
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: backend
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL
```

---

## Learning Checklist

### HPA & VPA
- [ ] Set up metrics-server
- [ ] Create HPA for backend
- [ ] Load test and observe scaling
- [ ] Configure VPA

### Istio
- [ ] Install Istio
- [ ] Enable sidecar injection
- [ ] Access Kiali dashboard
- [ ] Create traffic splitting
- [ ] Test circuit breaker

### Network Policies
- [ ] Create default deny
- [ ] Allow specific pod-to-pod traffic
- [ ] Test connectivity

### Monitoring
- [ ] Install Prometheus stack
- [ ] Access Grafana
- [ ] Create custom alerts
- [ ] Set up ServiceMonitor

### Security
- [ ] Implement Pod Security Standards
- [ ] Set up Sealed Secrets
- [ ] Configure security contexts

---

## Next Steps

1. Practice each concept in your local cluster first
2. Gradually implement in AWS EKS
3. Build a comprehensive observability stack
4. Implement GitOps for all infrastructure changes
