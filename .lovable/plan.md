

## Add Date Range Filters to Financial Reports

### Overview
Add "From" and "To" date pickers to the Balance Sheet, Income Statement, and Cash Flow pages so users can filter data by date range. The Balance Sheet uses an "As of" date (single date), while Income Statement and Cash Flow use a date range.

### Approach

Create a reusable `DateRangeFilter` component with two date pickers (From/To) using the existing Shadcn Calendar + Popover pattern. Each report page will add this filter in its header area and pass the dates into queries.

### Changes

**1. New component: `src/components/dashboard/DateRangeFilter.tsx`**
- Two date pickers (From / To) using Popover + Calendar with `pointer-events-auto`
- Props: `startDate`, `endDate`, `onStartDateChange`, `onEndDateChange`
- Compact inline layout that fits in the page header

**2. `src/pages/dashboard/BalanceSheet.tsx`**
- Add state: `asOfDate` (defaults to today)
- Render a single date picker labeled "As of" in the header
- Filter journal entries query: `.lte("entry_date", asOfDate)` so only entries on or before that date are included
- Update query keys to include the date
- Update subtitle text to show selected date

**3. `src/pages/dashboard/IncomeStatement.tsx`**
- Add state: `startDate` (default: start of current fiscal year or Jan 1) and `endDate` (default: today)
- Render `DateRangeFilter` in the header
- Filter journal entries query: `.gte("entry_date", startDate).lte("entry_date", endDate)`
- Update query keys to include dates
- Update subtitle text

**4. `src/pages/dashboard/CashFlow.tsx`**
- Add state: `startDate` and `endDate` for the historical burn rate calculation
- Render `DateRangeFilter` in the header
- Filter bills query for burn rate by the selected date range
- Filter invoices/bills for the forecast starting point
- Update query keys to include dates

### Technical Notes
- The journal entries table has an `entry_date` column (type `date`) which is the correct field to filter on
- Bills have `bill_date` and `due_date`; invoices have `invoice_date` and `due_date`
- Uses `date-fns` `format` for formatting dates to ISO strings for queries
- Calendar component needs `pointer-events-auto` class per Shadcn guidance

