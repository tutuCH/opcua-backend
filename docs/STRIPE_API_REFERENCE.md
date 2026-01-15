# Stripe API Reference

Complete API reference for Stripe subscription and billing endpoints in the OPC UA Dashboard backend.

## Base URL

```
http://localhost:3000/api/subscription
```

## Authentication

All endpoints (except webhooks) require JWT authentication:

```bash
Authorization: Bearer <jwt_token>
```

To obtain a JWT token, use the login endpoint:

```bash
curl --location 'http://localhost:3000/auth/login' \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "email": "user@example.com",
    "password": "password123"
  }'
```

---

## Endpoints

### 1. Create Checkout Session

Creates a Stripe Checkout session for subscription purchase.

**Endpoint:** `POST /api/subscription/create-checkout-session`

**Rate Limit:** 5 requests per minute per user

**Request Body:**

```bash
curl -X POST 'http://localhost:3000/api/subscription/create-checkout-session' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "lookupKey": "basic_monthly",
    "successUrl": "https://yourdomain.com/success?session_id={CHECKOUT_SESSION_ID}",
    "cancelUrl": "https://yourdomain.com/cancel"
  }'
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `lookupKey` | string | Yes | Stripe price lookup_key, price ID (starts with `price_`), or product ID (starts with `prod_`) |
| `successUrl` | string | Yes | URL to redirect after successful payment. Use `{CHECKOUT_SESSION_ID}` placeholder to include session ID |
| `cancelUrl` | string | Yes | URL to redirect if user cancels |

**Success Response (200 OK):**

```json
{
  "status": "success",
  "data": {
    "url": "https://checkout.stripe.com/c/pay/cs_test_...",
    "sessionId": "cs_test_abc123xyz789"
  }
}
```

**Error Responses:**

- **400 Bad Request** - Invalid lookup key or Stripe not configured
  ```json
  {
    "statusCode": 400,
    "message": "No price found for lookup key: invalid_key",
    "error": "Bad Request"
  }
  ```

- **401 Unauthorized** - Invalid or missing JWT token
  ```json
  {
    "statusCode": 401,
    "message": "Unauthorized"
  }
  ```

- **404 Not Found** - User not found
  ```json
  {
    "statusCode": 404,
    "message": "User not found",
    "error": "Not Found"
  }
  ```

---

### 2. Create Portal Session

Creates a Stripe Customer Portal session for managing subscriptions.

**Endpoint:** `POST /api/subscription/create-portal-session`

**Rate Limit:** 10 requests per minute per user

**Request Body:**

```bash
curl -X POST 'http://localhost:3000/api/subscription/create-portal-session' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "returnUrl": "https://yourdomain.com/account"
  }'
```

**Request Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `returnUrl` | string | Yes | URL to redirect after user exits portal |

**Success Response (200 OK):**

```json
{
  "status": "success",
  "data": {
    "url": "https://billing.stripe.com/session/..."
  }
}
```

**Error Responses:**

- **400 Bad Request** - No active subscription found
  ```json
  {
    "statusCode": 400,
    "message": "No active subscription found. Please create a subscription first.",
    "error": "Bad Request"
  }
  ```

---

### 3. Get Current Subscription

Retrieves the current user's subscription details.

**Endpoint:** `GET /api/subscription/current`

**Rate Limit:** 30 requests per minute per user

**Request:**

```bash
curl -X GET 'http://localhost:3000/api/subscription/current' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Success Response (200 OK):**

```json
{
  "subscription": {
    "id": "sub_abc123xyz789",
    "status": "active",
    "plan": {
      "id": "basic_monthly",
      "name": "Basic Plan",
      "price": 9.99,
      "currency": "USD",
      "interval": "month"
    },
    "currentPeriodStart": 1704067200,
    "currentPeriodEnd": 1706745600,
    "cancelAtPeriodEnd": false
  }
}
```

**No Subscription Response (200 OK):**

```json
{
  "subscription": null
}
```

---

### 4. Get Subscription Plans

Retrieves all available subscription plans from Stripe.

**Endpoint:** `GET /api/subscription/plans`

**Rate Limit:** 50 requests per minute per user

**Request:**

```bash
curl -X GET 'http://localhost:3000/api/subscription/plans' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Success Response (200 OK):**

```json
{
  "plans": [
    {
      "id": "basic_monthly",
      "name": "Basic",
      "description": "Perfect for small projects",
      "price": 9.99,
      "currency": "USD",
      "interval": "month",
      "features": [
        "Up to 5 machines",
        "Basic monitoring",
        "Email support"
      ]
    },
    {
      "id": "professional_monthly",
      "name": "Professional",
      "description": "Best for growing businesses",
      "price": 29.99,
      "currency": "USD",
      "interval": "month",
      "features": [
        "Up to 50 machines",
        "Advanced monitoring",
        "Real-time alerts",
        "Priority support"
      ],
      "popular": true
    },
    {
      "id": "enterprise_monthly",
      "name": "Enterprise",
      "description": "For large scale operations",
      "price": 99.99,
      "currency": "USD",
      "interval": "month",
      "features": [
        "Unlimited machines",
        "Custom integrations",
        "Dedicated support",
        "SLA guarantee"
      ]
    }
  ]
}
```

**Demo Mode Response (when Stripe not configured):**

Returns hardcoded demo plans with the same structure.

---

### 5. Get Payment Methods

Retrieves payment methods for the current user.

**Endpoint:** `GET /api/subscription/payment-methods`

**Rate Limit:** 20 requests per minute per user

**Request:**

```bash
curl -X GET 'http://localhost:3000/api/subscription/payment-methods' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Success Response (200 OK):**

```json
{
  "status": "success",
  "data": {
    "payment_methods": [
      {
        "id": "pm_abc123xyz789",
        "brand": "visa",
        "last4": "4242",
        "exp_month": 12,
        "exp_year": 2025,
        "is_default": false
      }
    ]
  }
}
```

**Error Responses:**

- **404 Not Found** - No customer found
  ```json
  {
    "statusCode": 404,
    "message": "No customer found",
    "error": "Not Found"
  }
  ```

---

### 6. Cancel Subscription

Cancels a subscription at the end of the current billing period.

**Endpoint:** `DELETE /api/subscription/:subscriptionId`

**Rate Limit:** 5 requests per minute per user

**Request:**

```bash
curl -X DELETE 'http://localhost:3000/api/subscription/sub_abc123xyz789' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subscriptionId` | string | Yes | Stripe subscription ID |

**Success Response (200 OK):**

```json
{
  "status": "success",
  "data": {
    "subscription": {
      "id": "sub_abc123xyz789",
      "status": "active",
      "cancel_at_period_end": true,
      "current_period_end": 1706745600
    }
  }
}
```

**Error Responses:**

- **404 Not Found** - Subscription not found
  ```json
  {
    "statusCode": 404,
    "message": "Subscription not found",
    "error": "Not Found"
  }
  ```

---

### 7. Webhook Handler

Receives and processes Stripe webhook events.

**Endpoint:** `POST /api/webhooks/stripe`

**Authentication:** Stripe signature verification (no JWT required)

**Request:**

```bash
curl -X POST 'http://localhost:3000/api/webhooks/stripe' \
  -H 'Content-Type: application/json' \
  -H 'stripe-signature: t=timestamp,v1=signature_hash' \
  --data-raw '{
    "id": "evt_abc123xyz789",
    "type": "checkout.session.completed",
    "data": {
      "object": {
        "id": "cs_test_...",
        "object": "checkout.session",
        "metadata": {
          "user_id": "123",
          "lookup_key": "basic_monthly"
        },
        "subscription": "sub_abc123xyz789"
      }
    }
  }'
```

**Headers:**

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| `stripe-signature` | string | Yes | Stripe webhook signature for verification |
| `Content-Type` | string | Yes | Must be `application/json` |

**Success Response (200 OK):**

```json
{
  "received": true
}
```

**Error Responses:**

- **400 Bad Request** - Invalid signature
  ```json
  {
    "statusCode": 400,
    "message": "Webhook Error: Signature verification failed",
    "error": "Bad Request"
  }
  ```

---

## Supported Webhook Events

The webhook handler processes the following Stripe events:

| Event Type | Description |
|------------|-------------|
| `checkout.session.completed` | Checkout session successfully completed |
| `customer.subscription.created` | New subscription created |
| `customer.subscription.updated` | Subscription updated (plan change, etc.) |
| `customer.subscription.deleted` | Subscription canceled/deleted |
| `invoice.payment_succeeded` | Payment succeeded, subscription renewed |
| `invoice.payment_failed` | Payment failed, subscription past due |

### Idempotency

All webhook events are tracked for idempotency:

- Duplicate events (same `event.id`) are automatically skipped
- Each event is stored in the `webhook_events` table before processing
- Processing status is tracked: `processed` (boolean), `error` (text)
- Failed events are marked with error details for investigation

---

## Error Handling

### Common Error Responses

**Stripe Not Configured (Development Mode):**

```json
{
  "statusCode": 400,
  "message": "Stripe not configured - demo mode active",
  "error": "Bad Request"
}
```

**Stripe Connection Unhealthy:**

```json
{
  "statusCode": 400,
  "message": "Payment service is temporarily unavailable",
  "error": "Bad Request"
}
```

### Rate Limiting

When rate limits are exceeded, you'll receive:

```json
{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests",
  "error": "Too Many Requests"
}
```

**Rate Limits by Endpoint:**

| Endpoint | Limit | Period |
|----------|-------|--------|
| POST /create-checkout-session | 5 | 1 minute |
| POST /create-portal-session | 10 | 1 minute |
| GET /current | 30 | 1 minute |
| GET /plans | 50 | 1 minute |
| GET /payment-methods | 20 | 1 minute |
| DELETE /:subscriptionId | 5 | 1 minute |

---

## Environment Configuration

Required environment variables in `.env` or `.env.local`:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_51RwCz2HOHpiK2JjACjIn8UGlbSGWAYTOOqavqc9M8vB66LHft55zBiyCo8ReWCozsfDpUtgKhtaH9qSIrxT0whEw00SyRFIDhK
STRIPE_PUBLISHABLE_KEY=pk_test_51RwCz2HOHpiK2JjAzAuGUrBU2HJU5a2GkyO2b5mRlC3vTVeKc9ZYikOaFcDOtekryJdbBOuddGFacnv96HczNHaD00NZ2WpxMp
STRIPE_WEBHOOK_SECRET=whsec_282b3763fe4a23a46e87ef8bf4874bafc95294ee3ac654c2e43a8c50b9fffbb2
```

---

## Testing with Stripe CLI

For local development, use Stripe CLI to forward webhooks:

```bash
# Start webhook forwarding
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Test checkout session completed event
stripe trigger checkout.session.completed

# Test invoice payment failed event
stripe trigger invoice.payment_failed
```

---

## Security Best Practices

1. **Webhook Verification**: Always verify Stripe signatures using `STRIPE_WEBHOOK_SECRET`
2. **Idempotency**: All webhook events are checked for duplicates before processing
3. **Rate Limiting**: All endpoints protected with appropriate rate limits
4. **Authentication**: All endpoints require valid JWT except webhooks
5. **User Ownership**: Subscription operations verify user ownership before processing

---

## Database Schema

### User Subscriptions Table

```sql
CREATE TABLE user_subscription (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),
  plan_lookup_key VARCHAR(255),
  status VARCHAR(50),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  canceled_at TIMESTAMP,
  last_payment_date TIMESTAMP,
  payment_failed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Webhook Events Table

```sql
CREATE TABLE webhook_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Additional Resources

- [Stripe API Documentation](https://stripe.com/docs/api)
- [Stripe Webhooks Guide](https://stripe.com/docs/webhooks)
- [Stripe Checkout Guide](https://stripe.com/docs/payments/checkout)
- [Stripe Customer Portal](https://stripe.com/docs/billing/subscriptions/customer-portal)
