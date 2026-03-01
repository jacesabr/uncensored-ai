# Future Features

---

## Monetization — Stripe Subscription + Email Auth

**Status**: Planned (not started)
**Priority**: High

### Pricing Model
- **100 free messages** per account (trial)
- **$9.99/month** unlimited subscription (soft cap ~2000 messages/month to prevent abuse)

### Payment: Stripe Checkout
- Hosted Checkout page — PCI-compliant, no card handling on our side
- Stripe Customer Portal — users manage/cancel subscriptions themselves
- Stripe Webhooks — server listens for subscription lifecycle events:
  - `checkout.session.completed` — activate subscription
  - `invoice.paid` — renew subscription
  - `customer.subscription.deleted` — revoke access
  - `invoice.payment_failed` — grace period / notify user

### Auth Overhaul: Email Verification
- Replace phrase-only auth with email + phrase
- Email required at signup, verification link sent (Resend, SendGrid, or SES)
- 1 account per email address
- Existing phrase-hash users migrated: prompt to add email on next login

### Anti-Abuse
- **IP logging** — store `registrationIP` on signup, flag duplicates (soft limit, not hard block)
- **Registration rate limit** — max 3 accounts per IP per 24 hours
- **Message counter** — `messageCount` on user schema, checked before each `/api/chat` call
- Paywall UI when free messages exhausted — redirect to Stripe Checkout

### Schema Changes (User)
```js
{
  email: String,           // unique, verified
  emailVerified: Boolean,
  subscription: {
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    status: String,        // 'free' | 'active' | 'past_due' | 'cancelled'
    currentPeriodEnd: Date,
    messageLimit: Number,  // null = unlimited
  },
  messageCount: Number,    // reset monthly or per billing period
  registrationIP: String,
  createdAt: Date,
}
```

### New Endpoints
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/register` | Email + phrase signup |
| POST | `/api/auth/verify-email` | Confirm email token |
| POST | `/api/billing/checkout` | Create Stripe Checkout session |
| POST | `/api/billing/webhook` | Stripe webhook receiver |
| GET | `/api/billing/portal` | Create Stripe Customer Portal link |
| GET | `/api/billing/status` | Current subscription status |

### Client Changes
- Signup form: email + passphrase fields + "verify your email" flow
- Paywall modal when `messageCount >= 100` and `subscription.status !== 'active'`
- Account settings page: subscription status, manage/cancel link (Stripe Portal)
- Message counter display (e.g., "73/100 free messages remaining")

### Dependencies
- `stripe` npm package (server)
- Email service: Resend ($0), SendGrid (free tier), or AWS SES
- Stripe account + webhook endpoint configured
