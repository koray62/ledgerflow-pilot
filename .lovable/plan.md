

# Team Management Page

## Overview
Create a Team page at `/dashboard/team` for managing team members (users with roles in the current tenant). Supports inviting new users, updating roles, and removing members. Follows the same patterns as `Contacts.tsx`.

## Key Constraints
- `user_tenant_roles` table: only **owners** can INSERT, UPDATE, DELETE roles (per existing RLS)
- Roles come from `app_role` enum: `owner`, `admin`, `accountant`, `viewer`
- Need to join `user_tenant_roles` with `profiles` to show user names/emails
- Inviting a new user requires creating an auth user -- this needs a backend function with service role key

## Implementation

### 1. New Edge Function: `manage-team-member`
**Path:** `supabase/functions/manage-team-member/index.ts`

Handles two operations using the service role key:
- **invite**: Creates a new auth user (via `supabase.auth.admin.createUser` with auto-confirm), creates their profile, and inserts a `user_tenant_roles` record. Requires caller to be tenant owner (verified server-side).
- **remove**: Soft-deletes the `user_tenant_roles` record (sets `deleted_at`). Does NOT delete the auth user (they may belong to other tenants).
- **update-role**: Updates the role on `user_tenant_roles`.

Auth: Validates the caller's JWT and checks they are the tenant owner before performing any action.

### 2. New Page: `src/pages/dashboard/Team.tsx`

Single file containing:
- **Member list**: Fetches `user_tenant_roles` joined with `profiles` for the current tenant. Displays name, email, role, and joined date.
- **Invite dialog**: Form with email, first name, last name, temporary password, and role selector. Calls the edge function.
- **Edit role**: Inline select or dialog to change a member's role. Calls the edge function.
- **Remove member**: Confirmation dialog, then calls the edge function to soft-delete the role.
- Search/filter by name or email.
- Current user cannot remove themselves or change their own role.

### 3. Update `src/App.tsx`
Replace the `PlaceholderPage` import for `/dashboard/team` with the new `Team` component.

### Files to Create/Modify
1. **Create** `supabase/functions/manage-team-member/index.ts`
2. **Create** `src/pages/dashboard/Team.tsx`
3. **Modify** `src/App.tsx` -- update team route

