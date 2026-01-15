# Authentication API Specification

This document describes all authentication-related API endpoints that the MES Dashboard frontend expects from the backend.

## Base URL

```
{VITE_API_URL}/auth
```

Default: `http://localhost:3000/auth`

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Email/password login |
| POST | `/auth/signup` | User registration |
| POST | `/auth/google` | Google SSO login |
| GET | `/auth/profile` | Get current user profile |
| PUT | `/auth/profile` | Update user profile |
| PUT | `/auth/change-password` | Change password (authenticated) |
| GET | `/auth/verify-email` | Verify email address |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password with token |

---

## Detailed API Specifications

### 1. Login (Email/Password)

**Endpoint:** `POST /auth/login`

**Description:** Authenticate user with email and password.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "userPassword123"
}
```

**Success Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": 1,
    "username": "John Doe",
    "email": "user@example.com",
    "accessLevel": "admin",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
}
```

**Error Responses:**

| Status | Description | Response |
|--------|-------------|----------|
| 401 | Invalid credentials | `{"message": "Invalid email or password"}` |
| 400 | Validation error | `{"message": "Email and password are required"}` |

**Frontend Behavior:**
- On success: Stores token in `localStorage` as `auth_token`, redirects to dashboard
- On 401: Shows error message "Invalid email or password"
- Token is sent in `Authorization: Bearer {token}` header for subsequent requests

---

### 2. Sign Up (User Registration)

**Endpoint:** `POST /auth/signup`

**Description:** Register a new user account. Sends verification email.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "newuser@example.com",
  "password": "SecurePass123!",
  "role": "Operator"
}
```

**Field Validation:**
| Field | Requirements |
|-------|--------------|
| name | 2-50 characters |
| email | Valid email format |
| password | Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char |

**Success Response (201 Created):**
```json
{
  "message": "Account created successfully. Please check your email to verify your account.",
  "user": {
    "userId": 2,
    "username": "John Doe",
    "email": "newuser@example.com",
    "accessLevel": "operator",
    "status": "pending_verification"
  }
}
```

**Error Responses:**

| Status | Description | Response |
|--------|-------------|----------|
| 400 | Validation error | `{"message": "Password does not meet requirements"}` |
| 409 | Email already exists | `{"message": "An account with this email already exists"}` |

**Frontend Behavior:**
- Shows success message instructing user to check email
- Does NOT automatically log user in
- User must verify email before login

---

### 3. Google SSO Login

**Endpoint:** `POST /auth/google`

**Description:** Authenticate user using Google OAuth 2.0.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij..."
}
```

**Notes:**
- `idToken` is the Google ID token from the OAuth flow
- Backend must verify this token with Google's token info endpoint
- If user doesn't exist, create account automatically
- Return existing JWT if user already exists

**Success Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": 1,
    "username": "John Doe",
    "email": "user@example.com",
    "accessLevel": "operator",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

**Error Responses:**

| Status | Description | Response |
|--------|-------------|----------|
| 401 | Invalid token | `{"message": "Invalid Google token"}` |
| 400 | Token expired | `{"message": "Google token has expired"}` |

**Frontend Behavior:**
- Uses `@react-oauth/google` library to obtain ID token
- Sends ID token to backend for verification
- Stores returned JWT and redirects to dashboard

---

### 4. Get Profile

**Endpoint:** `GET /auth/profile`

**Description:** Get current authenticated user's profile.

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Request Body:** None

**Success Response (200 OK):**
```json
{
  "userId": 1,
  "username": "John Doe",
  "email": "user@example.com",
  "accessLevel": "admin",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

**Error Responses:**

| Status | Description | Response |
|--------|-------------|----------|
| 401 | Unauthorized | Token cleared, redirect to login |

**Frontend Behavior:**
- Called on app startup to check if user is logged in
- Called after login to get full user details
- Frontend maps `accessLevel` to `role` (admin → admin, others → operator)

---

### 5. Update Profile

**Endpoint:** `PUT /auth/profile`

**Description:** Update current user's profile information.

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "John Smith",
  "email": "newemail@example.com"
}
```

**Success Response (200 OK):**
```json
{
  "userId": 1,
  "username": "John Smith",
  "email": "newemail@example.com",
  "accessLevel": "admin",
  "status": "active",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-09T12:30:00Z"
}
```

**Error Responses:**

| Status | Description | Response |
|--------|-------------|----------|
| 400 | Validation error | `{"message": "Invalid email format"}` |
| 409 | Email already exists | `{"message": "Email already in use"}` |

---

### 6. Change Password

**Endpoint:** `PUT /auth/change-password`

**Description:** Change user's password (requires current password).

**Request Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass456!"
}
```

**Success Response (200 OK):**
```json
{
  "message": "Password changed successfully"
}
```

**Error Responses:**

| Status | Description | Response |
|--------|-------------|----------|
| 400 | Validation error | `{"message": "New password does not meet requirements"}` |
| 401 | Wrong password | `{"message": "Current password is incorrect"}` |

---

### 7. Verify Email

**Endpoint:** `GET /auth/verify-email?token={token}`

**Description:** Verify user's email address using token sent via email.

**Request Headers:** None

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | Yes | Email verification token |

**Success Response (200 OK):**
```json
{
  "message": "Email verified successfully",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": 2,
    "username": "John Doe",
    "email": "newuser@example.com",
    "accessLevel": "operator",
    "status": "active"
  }
}
```

**Error Responses:**

| Status | Description | Response |
|--------|-------------|----------|
| 400 | Invalid/missing token | `{"message": "Invalid verification link"}` |
| 400 | Token expired | `{"message": "Verification link has expired"}` |
| 400 | Already verified | `{"message": "Email already verified"}` |

**Frontend Behavior:**
- User clicks link in email: `{frontend_url}/verify-email?token=xxx`
- Frontend calls backend to verify token
- On success, shows success screen and offers login

---

### 8. Forgot Password

**Endpoint:** `POST /auth/forgot-password`

**Description:** Send password reset email to user.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200 OK):**
```json
{
  "message": "If an account with this email exists, a password reset link has been sent."
}
```

**Important Security Note:**
- **Always return success response**, even if email doesn't exist
- This prevents email enumeration attacks
- Email should contain reset link: `{frontend_url}/reset-password?token=xxx`

**Error Responses:**

| Status | Description | Response |
|--------|-------------|----------|
| 400 | Invalid email | `{"message": "Invalid email format"}` |

---

### 9. Reset Password

**Endpoint:** `POST /auth/reset-password`

**Description:** Reset password using token from email.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "token": "reset_token_here",
  "password": "NewSecurePass123!"
}
```

**Field Validation:**
| Field | Requirements |
|-------|--------------|
| token | Valid reset token from email |
| password | Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char |

**Success Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "userId": 1,
    "username": "John Doe",
    "email": "user@example.com",
    "accessLevel": "operator"
  }
}
```

**Error Responses:**

| Status | Description | Response |
|--------|-------------|----------|
| 400 | Invalid token | `{"message": "Invalid or expired reset link"}` |
| 400 | Token expired | `{"message": "Reset link has expired"}` |
| 400 | Weak password | `{"message": "Password does not meet requirements"}` |

**Frontend Behavior:**
- Token can come from URL param: `/reset-password/:token`
- Or query string: `/reset-password?token=xxx`
- On success, auto-logs user in and redirects to dashboard

---

## User Object Schema

The frontend expects the following user object structure across all endpoints:

```typescript
{
  userId: number;        // Database primary key
  username: string;      // Display name
  email: string;         // Email address (unique)
  accessLevel: string;   // Role: 'admin' | 'operator' | 'manager'
  status?: string;       // 'active' | 'pending_verification' | 'inactive'
  createdAt?: string;    // ISO 8601 timestamp
  updatedAt?: string;    // ISO 8601 timestamp
}
```

**Role Mapping:**
The frontend uses a simplified role system:
- Backend `accessLevel: 'admin'` → Frontend `role: 'admin'`
- Backend `accessLevel: 'operator'` → Frontend `role: 'operator'`
- Backend `accessLevel: 'manager'` → Frontend `role: 'operator'`

---

## Token Management

### JWT Token Format

The frontend expects a JWT access token with the following claims:

```json
{
  "sub": "1",           // User ID
  "email": "user@example.com",
  "role": "admin",      // User role
  "iat": 1234567890,    // Issued at
  "exp": 1234570490     // Expiration
}
```

### Token Storage

- Frontend stores token in `localStorage` with key: `auth_token`
- Token sent in `Authorization: Bearer {token}` header for all protected requests
- Frontend handles 401 responses by clearing token and redirecting to `/login`

### Token Expiration

- Recommended token expiration: 1 hour
- Frontend does NOT implement refresh tokens currently
- User must re-login when token expires

---

## Error Response Format

All endpoints should return errors in this format:

```json
{
  "statusCode": 400,
  "message": "Human-readable error message",
  "error": "ERROR_CODE"  // Optional
}
```

### Standard HTTP Status Codes

| Status | Usage |
|--------|-------|
| 200 | Success |
| 201 | Created (signup) |
| 400 | Bad request / Validation error |
| 401 | Unauthorized / Invalid credentials |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not found |
| 409 | Conflict (duplicate email) |
| 500 | Server error |

---

## Security Requirements

### Password Requirements

- Minimum 8 characters
- At least 1 uppercase letter (A-Z)
- At least 1 lowercase letter (a-z)
- At least 1 number (0-9)
- At least 1 special character (!@#$%^&* etc.)
- Must not be a common password (e.g., "password123")

### Email Verification

- Send verification email after signup
- User cannot login until email is verified
- Verification tokens should expire (recommend: 24 hours)

### Password Reset Tokens

- Reset tokens should expire (recommend: 1 hour)
- Tokens should be single-use only
- Invalidate old tokens when new one is requested

### Rate Limiting

Recommended rate limits:
- Login: 5 attempts per 15 minutes per IP
- Signup: 3 attempts per hour per IP
- Forgot password: 3 attempts per hour per IP

---

## Frontend-Backend Integration Notes

### Environment Variables

The frontend requires these environment variables:

```bash
# Backend API URL
VITE_API_URL=http://localhost:3000

# Google OAuth Client ID (optional, for Google SSO)
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

### Google SSO Setup

To enable Google Sign-In:

1. Create OAuth 2.0 credentials in Google Cloud Console
2. Add authorized JavaScript origins: `http://localhost:5173` (dev), your production URL
3. Add authorized redirect URI (if using authorization code flow)
4. Set `VITE_GOOGLE_CLIENT_ID` in frontend `.env`
5. Backend should verify ID tokens using Google's public keys

### Email Templates

The backend should send the following emails:

**Verification Email:**
```
Subject: Verify your MES Dashboard account

Hello {username},

Please verify your email by clicking the link below:
{frontend_url}/verify-email?token={token}

This link expires in 24 hours.

If you did not create an account, please ignore this email.
```

**Password Reset Email:**
```
Subject: Reset your MES Dashboard password

Hello {username},

Click the link below to reset your password:
{frontend_url}/reset-password?token={token}

This link expires in 1 hour.

If you did not request a password reset, please ignore this email.
```

---

## Testing Checklist

- [ ] Login with valid credentials returns JWT
- [ ] Login with invalid credentials returns 401
- [ ] Signup creates user and sends verification email
- [ ] Signup with duplicate email returns 409
- [ ] Email verification with valid token activates account
- [ ] Email verification with expired token returns error
- [ ] Forgot password sends email for existing user
- [ ] Forgot password returns success for non-existent user (security)
- [ ] Reset password with valid token changes password
- [ ] Reset password with invalid token returns error
- [ ] Google SSO with valid ID token creates/returns user
- [ ] Protected endpoints require valid JWT
- [ ] Expired JWT returns 401 and redirects to login
