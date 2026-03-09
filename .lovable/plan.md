
## Plan: Add Delete Account Feature

### Overview
Add a "Delete Account" option in Settings that permanently deletes all user data and the account itself, then redirects to the login page.

### Changes

**1. Create Edge Function** (`supabase/functions/delete-account/index.ts`)
- Validate authenticated user
- Use service role to bypass RLS
- Find all tenants where user is owner
- Delete data in order (respecting foreign key dependencies):
  - `journal_lines`, `journal_entries`, `invoices`, `invoice_lines`
  - `bank_transactions`, `bank_accounts`, `bills`, `vendors`, `customers`
  - `documents`, `forecast_entries`, `audit_logs`, `usage_metrics`
  - `subscriptions`, `tenant_permissions`, `user_tenant_roles`
  - `chart_of_accounts`, `tenants`
- Delete files from `tenant-documents` storage bucket
- Delete user profile
- Delete auth user via `auth.admin.deleteUser()`
- Return success confirmation

**2. Update Settings Page** (`src/pages/dashboard/DashboardSettings.tsx`)
- Add "Delete Account" section in Danger Zone card
- Add confirmation dialog with strong warning
- On confirm:
  - Call the `delete-account` edge function
  - Show success toast message
  - Sign out the user
  - Navigate to `/login`

### Technical Details

```text
Deletion Order (respecting FK constraints):
┌─────────────────────────────────────────┐
│ 1. journal_lines (FK → journal_entries) │
│ 2. journal_entries                      │
│ 3. invoice_lines (FK → invoices)        │
│ 4. invoices                             │
│ 5. bank_transactions                    │
│ 6. bank_accounts                        │
│ 7. bills                                │
│ 8. vendors, customers                   │
│ 9. documents, forecast_entries          │
│ 10. audit_logs, usage_metrics           │
│ 11. subscriptions, tenant_permissions   │
│ 12. user_tenant_roles                   │
│ 13. chart_of_accounts                   │
│ 14. tenants                             │
│ 15. profiles                            │
│ 16. auth.users (admin API)              │
└─────────────────────────────────────────┘
```

Edge function config in `supabase/config.toml`:
```toml
[functions.delete-account]
verify_jwt = false
```

UI will require owner permission check before showing the delete button.
