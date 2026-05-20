# ZUSKO Backend API Documentation

Backend API documentation for the ZUSKO Laundry Platform.

---

# Base URLs

### Development
```bash
http://localhost:5000/api
```

### Production
```bash
https://api.zusko.in/api
```

---

# Authentication

Protected APIs require JWT Bearer Token.

Header format:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

---

# Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication
- Razorpay
- bcryptjs
- ua-parser-js

---

# Environment Variables

Create `.env` file:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret

RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
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

**Aaveg (CEO of ZUSKO)**