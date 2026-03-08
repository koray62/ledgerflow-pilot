

## Add Compare Toggle to Income Statement

### Overview
Add a "Compare" toggle button in the header. When enabled, the table expands to show the same date range offset by -1, -2, and -3 years side-by-side with the current period.

### How it works

**State**: Add `compareEnabled` boolean state toggled by a Switch + label in the header toolbar.

**Data fetching**: When compare is on, fire 3 additional `useQuery` calls for the same date range shifted back 1, 2, and 3 years (e.g., if selected range is Jan 1 – Jun 30 2026, comparison periods are Jan 1 – Jun 30 2025, 2024, 2023). Use `subYears` from `date-fns`. Each query follows the same pattern as the existing `lineTotals` query.

**Balance calculation**: Compute `ownBalances` maps for each comparison year using the same logic, yielding `compareBalances[0]`, `compareBalances[1]`, `compareBalances[2]`.

**Table rendering**: When compare is on:
- Widen the container from `max-w-3xl` to `max-w-5xl`
- Add column headers row: Account | Current | Year-1 | Year-2 | Year-3
- Each account row shows 4 value columns instead of 1
- Section totals and the summary card also show 4 columns
- Year labels derived from the selected start date (e.g., "2026", "2025", "2024", "2023")

**Toggle UI**: Place a `Switch` component with "Compare" label next to the DateRangeFilter, before the Net Profit/Loss badge.

### Changes

**`src/pages/dashboard/IncomeStatement.tsx`**
- Import `Switch`, `Label`, `subYears` from date-fns
- Add `compareEnabled` state
- Add 3 comparison `useQuery` hooks (conditionally enabled when `compareEnabled && !!tenantId`)
- Compute 3 comparison balance maps in `useMemo`
- Update table markup to render multi-column when compare is on
- Update summary card to show comparison columns
- Render Switch toggle in header

