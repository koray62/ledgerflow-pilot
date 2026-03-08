

## Performance Analysis Dashboard

### Overview
New `/dashboard/performance` page with 4-year financial KPIs (2023-2026), interactive charts, data tables, and key financial analysis metrics including Quick Ratio.

### Page Layout

**Tab 1 - Overview:**
- **4 KPI summary cards** (current year): Revenue, Net Income, Net Profit Margin %, Quick Ratio -- each with YoY change badge
- **Revenue vs Expenses** grouped BarChart (4 years)
- **Net Income trend** LineChart (4 years)
- **Margins & Ratios trend** LineChart (Net Profit Margin %, Expense Ratio)

**Tab 2 - Detailed Table:**
- Year-by-year table with rows: Revenue, Expenses, Net Income, Gross Margin %, Net Profit Margin %, Expense Ratio, Revenue Growth %, Expense Growth %, Operating Leverage, Quick Ratio, Monthly Avg Revenue, Monthly Avg Expenses (Burn Rate)
- YoY change columns for each year (except oldest)
- CAGR row in footer

**Tab 3 - Financial Ratios:**
- Cards for each metric with 4-year sparkline trends:
  - **Quick Ratio** = (Cash + AR) / (AP + short-term liabilities) -- uses bank_accounts.current_balance + unpaid invoices vs unpaid bills
  - **Net Profit Margin** = Net Income / Revenue
  - **Expense Ratio** = Expenses / Revenue
  - **Operating Leverage** = Revenue Growth % / Expense Growth %
  - **AR Turnover** = Revenue / Average AR
  - **AP Turnover** = Expenses / Average AP

### Data Fetching
- Reuse `fetchLineTotals` + `computeBalances` pattern from IncomeStatement (4 parallel useQuery calls, one per year)
- Query `chart_of_accounts` for all account types (need asset/liability for Quick Ratio)
- Query `bank_accounts` for cash balance
- Query `invoices` (sent/overdue) and `bills` (received/overdue) per year for AR/AP data
- Quick Ratio computation: cash from bank_accounts + outstanding AR from invoices, divided by outstanding AP from bills

### Files to Change

1. **New**: `src/pages/dashboard/PerformanceAnalysis.tsx`
   - Uses: Card, Table, Badge, Skeleton, Tabs, recharts (BarChart, LineChart, ResponsiveContainer, Tooltip, Legend)
   - 4 yearly useQuery for journal line totals
   - useQuery for accounts, bank_accounts, invoices, bills
   - Computes all KPIs per year, renders charts + tables

2. **Edit**: `src/components/dashboard/DashboardLayout.tsx` (line 20)
   - Add `{ title: "Performance", icon: Activity, path: "/dashboard/performance" }` after Cash Flow
   - Import `Activity` from lucide-react

3. **Edit**: `src/App.tsx`
   - Import `PerformanceAnalysis`, add `<Route path="performance" element={<PerformanceAnalysis />} />`

