# ZUSKO Customer Backend & Architecture Documentation

High-performance, fault-tolerant customer-facing backend powering the **ZUSKO Laundry Platform** (customer website & web app).

---

## 🏛️ System Architecture Overview

```mermaid
flowchart TD
    Client["🌐 Zusko Customer Web Client\n(Browser / Mobile Web)"]
    
    subgraph ReverseProxy["🛡️ Edge & Reverse Proxy Layer (AWS EC2)"]
        Nginx["Nginx Reverse Proxy (Ports 80/443)\n- Terminates TLS/SSL\n- Appends Client IP: X-Forwarded-For\n- Gzip / Security Headers"]
    end

    subgraph NodeLayer["⚡ Application Runtime (PM2 Process Manager)"]
        API["zusko-user-api (server.js :5000)\n- Express 5.x REST API\n- Trust Proxy: loopback\n- Rate Limiters (Redis + In-Memory Fallback)\n- HTTP Compression (Level 6)"]
        Worker["zusko-user-worker (worker.js)\n- BullMQ Worker Process\n- Concurrency Control\n- Graceful Shutdown (SIGTERM/SIGINT)"]
    end

    subgraph CacheAndQueues["🚀 In-Memory & Caching Layer (Localhost)"]
        Redis["Redis Server (:6379)\n- Caching (Tracking, Coupons, Prices, Geo)\n- BullMQ Job Persistence\n- Atomic Rate Limiting (INCR + EXPIRE)"]
    end

    subgraph PrimaryDB["💾 Primary Data Store"]
        MongoDB[("MongoDB Atlas Cluster\n- Connection Pooling (maxPoolSize: 50)\n- Compound Indexes\n- Single Source of Truth")]
    end

    subgraph ExternalServices["🔌 External Integrations"]
        Razorpay["💳 Razorpay API\n(Orders & HMAC Verification)"]
        Brevo["📧 Brevo / SMTP\n(Transactional Emails)"]
        Telegram["🤖 Telegram Bot API\n(Instant Staff Order Alerts)"]
        Cloudinary["🖼️ Cloudinary\n(User Avatars & Assets)"]
        OSRM["🗺️ OSRM / OpenStreetMap\n(Road Distance & Geocoding)"]
    end

    Client -->|HTTPS| Nginx
    Nginx -->|HTTP 127.0.0.1:5000| API
    
    API <-->|ioredis (Cache Hits/Misses)| Redis
    API -->|dispatchJob (BullMQ)| Redis
    Redis -->|Job Event Dispatch| Worker
    
    API <-->|Mongoose Pool| MongoDB
    Worker <-->|Order Updates / Status| MongoDB

    API --> Razorpay
    API --> OSRM
    API --> Cloudinary
    Worker --> Brevo
    Worker --> Telegram
```

---

## 🏗️ Architectural Core Principles

### 1. Reverse Proxy & Secure IP Resolution
- **Topology:** Nginx terminates SSL and forwards requests to `http://127.0.0.1:5000`.
- **Nginx Headers:**
  - `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`
  - `proxy_set_header X-Real-IP $remote_addr;`
- **Express Configuration:**
  - `app.set("trust proxy", process.env.TRUST_PROXY || "loopback");`
  - **Security Guarantee:** Express strictly trusts the loopback hop (`127.0.0.1` / `::1`) and inspects `X-Forwarded-For` from right to left, picking the authoritative untrusted IP added by Nginx. Forged preceding IPs sent by clients are rejected, preventing rate-limit spoofing.

### 2. Multi-Tier High-Availability Caching
The application uses Redis via `ioredis` with non-blocking scans (`scanStream`) and silent fallback:
- **Order Tracking:** `20s` TTL (near real-time responsiveness). Invalidated immediately (`delCache`) when an order status is updated or paid.
- **Available Coupons:** `45s` TTL. Invalidated per user (`delCachePattern("coupons:available:${userId}:*")`) upon order placement.
- **Public Pricing Catalog:** `1 hour` (`3600s`) TTL.
- **Road Distance & Geocoding:** `24 hours` (`86400s`) TTL for lat/lng road calculations.
- **Auth OTP:** `5 minutes` (`300s`) TTL for rapid lookup (MongoDB `EmailOTP` remains authoritative TTL store).
- **Graceful Degradation:** If Redis restarts or is offline, all cache lookups seamlessly fallback to MongoDB Atlas without crashing the user request.

### 3. Asynchronous Background Queues (BullMQ)
Heavy, non-blocking tasks are decoupled from HTTP request cycles using BullMQ:
- **Queues:**
  - `zusko-user-email`: Order confirmation emails, user notifications (Concurrency: 5).
  - `zusko-user-notification`: Telegram staff alerts for incoming orders (Concurrency: 3).
  - `zusko-user-invoice`: Invoice generation (stub / ready for PDF generation) (Concurrency: 2).
- **Retry & Backoff:** 3 attempts with exponential backoff (`delay: 2000ms`).
- **Job Idempotency:** Jobs are dispatched with deterministic IDs (e.g. `jobId: "email-${orderId}"`, `jobId: "tg-${orderId}"`), preventing duplicate emails/alerts on client retries.
- **Zero Silent Job Loss:** If Redis is offline during an order write, `dispatchJob` automatically triggers an asynchronous background in-process fallback (`fallbackFn`).

### 4. Database Layer & Indexing Strategy
MongoDB Atlas serves as the single source of truth:
- **Connection Pooling:** Initialized via `maxPoolSize: 50` and `serverSelectionTimeoutMS: 5000`.
- **Compound Indexes:**
  - `orders`: `{ customerId: 1, createdAt: -1 }`, `{ customerId: 1, status: 1, createdAt: -1 }`
  - `addresses`: `{ userId: 1, isDefault: -1, createdAt: -1 }`
  - `email_otps`: `{ email: 1, createdAt: -1 }`
  - `sessions`: `{ userId: 1, isRevoked: 1 }`
- **Read Optimization:** Frequent non-mutating customer reads use `.lean()` for high throughput and reduced memory allocations.

### 5. Multi-Layer Rate Limiting
- **Global API Protection:** `express-rate-limit` (100 requests / 15 mins).
- **Authentication Protection:** `authLoginLimiter` (10 attempts / 10 mins).
- **OTP Send Limiting:** `otpSendLimiter` (5 requests / 10 mins).
- **Payment Creation Protection:** `paymentLimiter` (20 requests / 1 min).
- **Atomic Operation:** Uses an atomic Redis pipeline (`INCR` + `EXPIRE`). Automatically falls back to an in-memory sliding Map with automatic cleanup if Redis is unavailable.

### 6. Process Management (PM2)
Configured via `ecosystem.config.cjs`:
- **`zusko-user-api`**: Runs `server.js` (Port 5000, 1GB memory restart limit).
- **`zusko-user-worker`**: Runs `worker.js` (Standalone queue consumer, 512MB memory restart limit).
- **Graceful Shutdown**: Worker handles `SIGTERM` and `SIGINT` by closing all queues before exiting.

---

## 🛠️ Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Runtime & Framework** | Node.js (v18+ LTS / v22), Express 5.x (ES Modules) |
| **Primary Database** | MongoDB Atlas, Mongoose 9.x |
| **Cache & Message Broker**| Redis 6/7, ioredis 6.x |
| **Queue Management** | BullMQ 6.x |
| **Reverse Proxy** | Nginx (AWS EC2) |
| **Process Manager** | PM2 |
| **Security & Headers** | Helmet, HPP, CORS, bcryptjs, jsonwebtoken |
| **Performance** | Compression (gzip), `.lean()` MongoDB queries, Redis caching |
| **Payments** | Razorpay SDK (Server-Side Verification & HMAC-SHA256) |
| **Geo & Distance** | OpenStreetMap Nominatim, OSRM (Road Distance) |
| **Email Service** | Brevo SMTP via Nodemailer |

---

## ⚙️ Environment Variables

Create or configure `.env` in the root directory:

```env
# Application
PORT=5000
NODE_ENV=production
TRUST_PROXY=loopback

# Databases
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/<dbname>
REDIS_URL=redis://127.0.0.1:6379

# Authentication
JWT_SECRET=your_jwt_secret_key

# Payment Gateway (Razorpay)
RAZORPAY_KEY_ID=rzp_live_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Email Service (Brevo / SMTP)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
MAIL_FROM="Zusko Support <support@zusko.in>"
ORDER_MAIL="Zusko Orders <orders@zusko.in>"
CAREERS_MAIL_FROM="Zusko Careers <careers@zusko.in>"

# Alerts & Logging
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Media Storage
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_key
CLOUDINARY_API_SECRET=your_cloudinary_secret
```

---

# Base URLs

### Development
```bash
http://localhost:5000/api
```

### Production
```bash
https://zusko.in/api
```

---

# Authentication

Protected APIs require JWT Bearer Token.

Header format:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

---

# Auth APIs

## Login / Register User

Phone-based authentication.

### Endpoint

```http
POST /auth/login
```

### Request Body

```json
{
  "name": "Aaveg Kaushik",
  "phone": "6396864741",
  "email": "aaveg@gmail.com"
}
```

### Success Response

```json
{
  "success": true,
  "user": {
    "_id": "6824abc123",
    "name": "Aaveg Kaushik",
    "phone": "6396864741",
    "email": "aaveg@gmail.com"
  },
  "token": "JWT_TOKEN"
}
```

---

# User APIs

## Get Profile

```http
GET /users/me
```

Auth Required: ✅

---

## Update Profile

```http
PUT /users/me
```

Auth Required: ✅

### Request Body

```json
{
  "name": "Aaveg Kaushik Updated",
  "email": "newmail@gmail.com"
}
```

---

## Update Avatar

```http
PATCH /users/avatar
```

Auth Required: ✅

### Request Body

```json
{
  "avatar": "https://cdn.example.com/avatar.jpg"
}
```

---

## Dashboard Summary

Returns:

- Active orders
- Completed orders
- Total spent

```http
GET /users/dashboard-summary
```

Auth Required: ✅

---

# Address APIs

## Get All Addresses

```http
GET /addresses
```

Auth Required: ✅

---

## Add Address

```http
POST /addresses
```

Auth Required: ✅

### Request Body

```json
{
  "fullName": "Aaveg Kaushik",
  "phone": "6396864741",
  "line1": "Hostel Block A Room 212",
  "line2": "2nd Floor",
  "landmark": "Near Main Gate",
  "city": "Jhansi",
  "state": "Uttar Pradesh",
  "pincode": "284001",
  "label": "Hostel",
  "isDefault": true
}
```

---

## Update Address

```http
PUT /addresses/:id
```

Auth Required: ✅

---

## Delete Address

```http
DELETE /addresses/:id
```

Auth Required: ✅

---

## Set Default Address

```http
PATCH /addresses/:id/default
```

Auth Required: ✅

---

# Order APIs

## Create Order

Creates laundry order.

```http
POST /orders/create
```

Auth Required: ✅

### Request Body

```json
{
  "customerName": "Aaveg Kaushik",
  "customerPhone": "6396864741",
  "address": {
    "fullAddress": "MAHARSHI DAYANAND COLONY PITAL NAGRI MORADABAD UTTAR PRADESH",
    "city": "Jhansi",
    "pincode": "284128"
  },
  "items": [
    {
      "name": "Blazer",
      "qty": 1,
      "price": 80,
      "service": "Wash & Iron"
    },
    {
      "name": "Shirt",
      "qty": 2,
      "price": 20,
      "service": "Dry Clean"
    }
  ],
  "total": 499,
  "discount": 50,
  "deliveryFee": 20,
  "payment": {
    "method": "COD"
  }
}
```

---

## Get Active Orders

Returns ongoing orders.

```http
GET /orders/active
```

Auth Required: ✅

---

## Get Order History

Returns completed/cancelled orders.

```http
GET /orders/history
```

Auth Required: ✅

---

## Track Single Order

```http
GET /orders/:id
```

Auth Required: ✅

---

## Cancel Order

```http
PATCH /orders/:id/cancel
```

Auth Required: ✅

---

## Rate Completed Order

```http
POST /orders/:id/rate
```

Auth Required: ✅

### Request Body

```json
{
  "stars": 5,
  "review": "Amazing service"
}
```

---

## Get Orders By Phone (Legacy)

```http
GET /orders/phone/:phone
```

Auth Required: ❌

---

## Get All Orders (Admin)

```http
GET /orders
```

Auth Required: Admin Only

---

# Payment APIs

## Create Razorpay Order

Creates Razorpay payment order.

```http
POST /payments/create-order
```

Auth Required: ✅

### Request Body

```json
{
  "amount": 499
}
```

### Success Response

```json
{
  "success": true,
  "data": {
    "id": "order_xxxxx",
    "amount": 49900,
    "currency": "INR"
  }
}
```

---

## Verify Payment

Verifies successful Razorpay payment.

```http
POST /payments/verify
```

Auth Required: ✅

### Request Body

```json
{
  "razorpay_order_id": "order_xxxxx",
  "razorpay_payment_id": "pay_xxxxx",
  "razorpay_signature": "signature_xxxxx",
  "orderId": "mongodb_order_id"
}
```

---

## Get Saved Payment Methods

```http
GET /payments
```

Auth Required: ✅

---

## Add Payment Method

```http
POST /payments
```

Auth Required: ✅

### Request Body

```json
{
  "type": "UPI",
  "provider": "Google Pay",
  "maskedDetails": "aaveg@okaxis",
  "isDefault": true
}
```

---

## Delete Payment Method

```http
DELETE /payments/:id
```

Auth Required: ✅

---

## Set Default Payment Method

```http
PATCH /payments/:id/default
```

Auth Required: ✅

---

# Security APIs

## Get Active Sessions

```http
GET /security/sessions
```

Auth Required: ✅

---

## Logout Current Device

```http
DELETE /security/logout-current
```

Auth Required: ✅

---

## Logout All Devices

```http
DELETE /security/logout-all
```

Auth Required: ✅

---

## Delete Account

```http
DELETE /security/delete-account
```

Auth Required: ✅

---

# API Module Summary

### Authentication
- Login/Register

### User Management
- Profile
- Update Profile
- Avatar
- Dashboard Summary

### Address Management
- Add Address
- Update Address
- Delete Address
- Default Address

### Orders
- Create Order
- Active Orders
- History
- Tracking
- Cancel
- Ratings

### Payments
- Razorpay Payment Order
- Verify Payment
- Saved Payment Methods

### Security
- Sessions
- Logout Current
- Logout All
- Delete Account

---

# Future Roadmap

Planned backend modules:

- Notification APIs
- WhatsApp automation
- Email notifications
- Refund management
- Admin analytics dashboard
- Business/B2B APIs
- Delivery partner APIs
- Live order tracking
- Coupon management

---

# Maintained By

**Tech Team Zusko**