

## Clear and Seed Dummy Test Data

### Overview
Create a backend function that deletes all existing journal entries, journal lines, and bank transactions for the tenant, then seeds 4 years of realistic dummy accounting data for testing.

### Step 1: Create Edge Function `seed-test-data`

A new edge function that:

**Clears existing data** (in correct FK order):
1. Delete all `journal_lines` for the tenant
2. Delete all `bank_transactions` for the tenant  
3. Delete all `journal_entries` for the tenant
4. Delete all `documents` for the tenant

**Seeds 4 years of dummy data** (2022-2025) using the tenant's existing chart of accounts:
- Monthly revenue entries from customers (using existing AR and Revenue accounts)
- Monthly expense entries (payroll, rent, utilities, software subscriptions)
- Quarterly tax payments
- Bank transactions linked to journal entries
- Mix of posted/draft statuses
- Approximately 15-20 entries per month = ~700-900 total entries

### Step 2: Add "Seed Test Data" Button

In `DashboardSettings.tsx`, add a danger-zone section with a button that invokes the edge function. Includes a confirmation dialog to prevent accidental clicks.

### Technical Details

- Edge function uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS for bulk operations
- Validates the calling user is the tenant owner before proceeding
- Uses the tenant's actual chart of accounts codes for realistic entries
- Entry numbers follow format `JE-YYYY-NNN`
- Bank transactions reference their linked journal entries
- All entries use the existing bank account (TEB Vadesiz TL)

### File Changes
1. **New**: `supabase/functions/seed-test-data/index.ts` - Edge function
2. **Edit**: `supabase/config.toml` - Not needed (auto-configured)
3. **Edit**: `src/pages/dashboard/DashboardSettings.tsx` - Add seed button with confirmation

