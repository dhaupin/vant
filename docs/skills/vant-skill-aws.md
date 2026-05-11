---
version: 0.8.11
permalink: /skills/vant-skill-aws.md
layout: default
title: Skill Aws
nav_order: 81
---

# AWS

> Amazon cloud services.

---

## When To Use

- Cloud hosting
- Serverless
- Storage

---

## What To Do

### 1. Services

| Service | What |
|---------|------|
| EC2 | Virtual servers |
| Lambda | Serverless |
| S3 | Storage |
| RDS | Database |
| CloudFront | CDN |
| IAM | Auth |

### 2. CLI

```bash
aws s3 ls
aws lambda invoke
aws ec2 describe-instances
```

### 3. SDK

```javascript
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3'
const client = new S3Client({})
const res = await client.send(new ListBucketsCommand())
```

### 4. Architecture

| Pattern | Use |
|----------|-----|
| EC2 + RDS | Traditional |
| Lambda + API | Serverless |
| S3 + CloudFront | Static |

---

**Role**: AWS Developer  
**Input**: Service  
**Output**: Cloud resource

> Cloud.