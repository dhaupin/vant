---
version: 0.8.11
permalink: /essential/vant-skill-kubernetes.md
layout: default
title: Skill Kubernetes
nav_order: 132
---

# Kubernetes

> K8s local clusters.

---

## When To Use

- Local K8s testing
- Cloud-native dev
- Container orchestration

---

## What To Do

### 1. Install KIND

```bash
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.22.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/
```

### 2. Create Cluster

```bash
kind create cluster
kubectl get pods
```

### 3. Common Commands

| Command | What |
|---------|------|
| kind create cluster | Create K8s cluster |
| kind delete cluster | Delete cluster |
| kubectl apply -f | Apply manifest |
| kubectl get pods | List pods |
| kubectl logs | View logs |
| kubectl exec | Execute in pod |

### 4. Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    spec:
      containers:
      - name: app
        image: myapp:latest
```

---

## Output

```
## Kubernetes

| Cluster | Nodes | Status |
|---------|-------|--------|
| [name] | [n] | [READY] |

### Deployments
- [list]
```

---

**Role**: K8s Operator  
**Input**: Manifests  
**Output**: Running services

> K8s locally.