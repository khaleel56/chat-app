# Multi-Environment Kubernetes Setup for Chat App

## Folder Structure
```
k8s/
├── 00-namespaces.yaml        # Create 3 namespaces (run once)
├── dev/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml
├── pre-prod/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml
├── prod/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── ingress.yaml
└── README.md
```

## Feature Flag Configuration by Environment

| Environment | Replicas | Service Type | FEAT_TYPING | FEAT_MSG_TS | FEAT_EMOJI |
|---|---|---|---|---|---|
| **dev** | 1 | NodePort :30080 | true | true | true |
| **pre-prod** | 2 | ClusterIP (Ingress) | true | true | false |
| **prod** | 3 | ClusterIP (Ingress) | false | true | false |

## Quick Setup

### Step 1: Create Namespaces (one-time setup)
```bash
kubectl apply -f k8s/00-namespaces.yaml
```

### Step 2a: Deploy DEV Environment
```bash
kubectl apply -f k8s/dev/deployment.yaml
kubectl apply -f k8s/dev/service.yaml
kubectl apply -f k8s/dev/ingress.yaml
```

### Step 2b: Deploy PRE-PROD Environment
```bash
kubectl apply -f k8s/pre-prod/deployment.yaml
kubectl apply -f k8s/pre-prod/service.yaml
kubectl apply -f k8s/pre-prod/ingress.yaml
```

### Step 2c: Deploy PROD Environment
```bash
kubectl apply -f k8s/prod/deployment.yaml
kubectl apply -f k8s/prod/service.yaml
kubectl apply -f k8s/prod/ingress.yaml
```

### Step 3: Enable Ingress (for pre-prod & prod)
```bash
minikube addons enable ingress
```

### Verify All Environments Running

### Check Namespaces
```bash
kubectl get namespaces
```

### Check All Deployments
```bash
kubectl get deployments -n chat-dev
kubectl get deployments -n chat-pre-prod
kubectl get deployments -n chat-prod
```

### Check All Pods
```bash
kubectl get pods -n chat-dev -o wide
kubectl get pods -n chat-pre-prod -o wide
kubectl get pods -n chat-prod -o wide
```

### Check All Services
```bash
kubectl get svc -n chat-dev
kubectl get svc -n chat-pre-prod
kubectl get svc -n chat-prod
```

### Check All Ingress
```bash
kubectl get ingress -A
```

## Accessing Each Environment

### Option A: NodePort (Dev Only)
Dev uses NodePort on port 30080:
```bash
# Get minikube IP
minikube ip
# e.g., 192.168.49.2

# Access dev: http://192.168.49.2:30080
```

### Option B: Ingress with Hostnames (Pre-prod & Prod)

1. Get your minikube IP:
```bash
minikube ip
# e.g., 192.168.49.2
```

2. Add to your local `/etc/hosts` (Windows: `C:\Windows\System32\drivers\etc\hosts`):
```
192.168.49.2  chat-dev.local chat-pre-prod.local chat-prod.local
```

3. Access via browser:
- Dev (NodePort): http://192.168.49.2:30080
- Pre-prod (Ingress): http://chat-pre-prod.local
- Prod (Ingress): http://chat-prod.local

### Option C: Port Forwarding
```bash
# Dev
kubectl port-forward -n chat-dev svc/chat-app-service 8080:80

# Pre-prod (in another terminal)
kubectl port-forward -n chat-pre-prod svc/chat-app-service 8081:80

# Prod (in another terminal)
kubectl port-forward -n chat-prod svc/chat-app-service 8082:80
```

Then access:
- Dev: http://localhost:8080
- Pre-prod: http://localhost:8081
- Prod: http://localhost:8082


## Scaling & Replica Management

Each environment has a different replica count for testing:
- **Dev**: 1 replica (lightweight development)
- **Pre-prod**: 2 replicas (mimic prod setup)
- **Prod**: 3 replicas (high availability)

To scale manually:
```bash
kubectl scale deployment chat-app-deployment -n chat-dev --replicas=2
kubectl scale deployment chat-app-deployment -n chat-pre-prod --replicas=3
kubectl scale deployment chat-app-deployment -n chat-prod --replicas=5
```

## Port Sharing Explanation

All three environments run on **port 3000** internally because:
1. Each is in a **separate namespace** (chat-dev, chat-pre-prod, chat-prod)
2. Namespaces provide network isolation
3. Each has its own Service with unique cluster DNS:
   - `chat-app-service.chat-dev.svc.cluster.local:3000`
   - `chat-app-service.chat-pre-prod.svc.cluster.local:3000`
   - `chat-app-service.chat-prod.svc.cluster.local:3000`
4. Routing is by namespace + ingress hostname, **not by port**

## Scaling Replicas

Adjust replica count for any environment:
```bash
# Scale dev to 2 replicas
kubectl scale deployment chat-app-deployment -n chat-dev --replicas=2

# Scale pre-prod to 3 replicas
kubectl scale deployment chat-app-deployment -n chat-pre-prod --replicas=3

# Scale prod to 5 replicas
kubectl scale deployment chat-app-deployment -n chat-prod --replicas=5
```

## Cleanup

### Delete Single Environment
```bash
# Delete dev
kubectl delete namespace chat-dev
```

### Delete All Environments
```bash
# Delete all namespaces (cascades delete resources inside)
kubectl delete namespace chat-dev chat-pre-prod chat-prod
```

Or manually delete manifests:
```bash
kubectl delete -f k8s/prod/
kubectl delete -f k8s/pre-prod/
kubectl delete -f k8s/dev/
kubectl delete -f k8s/00-namespaces.yaml
```

## Troubleshooting

### View Pod Logs
```bash
kubectl logs -n chat-dev deployment/chat-app-deployment
kubectl logs -n chat-pre-prod deployment/chat-app-deployment -f  # follow logs
kubectl logs -n chat-prod deployment/chat-app-deployment
```

### Describe a Pod
```bash
kubectl describe pod <pod-name> -n chat-dev
```

### Check Service Endpoints
```bash
kubectl get endpoints -n chat-dev
kubectl get endpoints -n chat-pre-prod
kubectl get endpoints -n chat-prod
```

### Check Ingress Details
```bash
kubectl describe ingress chat-app-ingress -n chat-pre-prod
kubectl describe ingress chat-app-ingress -n chat-prod
```

### Test /flags Endpoint
```bash
# Port-forward to dev
kubectl port-forward -n chat-dev deployment/chat-app-deployment 3000:3000

# In another terminal, check flags
curl http://localhost:3000/flags
# {"typingIndicator":true,"messageTimestamps":true,"emojiSupport":true}
```
