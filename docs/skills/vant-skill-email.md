---
version: 0.8.11
permalink: /skills/vant-skill-email.md
layout: default
title: Skill Email
nav_order: 121
---

# Email

> Email operations.

---

## When To Use

- Transactional email
- Notifications
- Marketing
- SMTP integration

---

## What To Do

### 1. Send Email

```javascript
// nodemailer
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  auth: {
    user: 'user@example.com',
    pass: 'password'
  }
})

await transporter.sendMail({
  from: 'From <from@example.com>',
  to: 'to@example.com',
  subject: 'Subject',
  text: 'Body text',
  html: '<p>Body HTML</p>'
})
```

### 2. Providers

| Provider | Use |
|-----------|-----|
| SendGrid | Transactional |
| Mailgun | Transactional |
| SES | AWS |
| Postmark | Transactional |
| Resend | Modern |

### 3. Templates

```javascript
// Dynamic templates
{
  template: 'welcome',
  dynamic_template_data: {
    name: 'User'
  }
}
```

### 4. Patterns

| Type | Use |
|------|-----|
| Welcome | Account creation |
| Reset | Password reset |
| Receipt | Purchase confirmation |
| Notification | Alerts |

---

## Output

```
## Email

| Email | Sent | Status |
|-------|------|--------|
| [type] | [YES] | [SENT] |

### Failed
- [list if any]
```

---

**Role**: Email Operator  
**Input**: Template, recipient  
**Output**: Email sent

> Inbox delivery.