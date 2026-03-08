

## Plan: Add "Full Year" Preset to Income Statement (Compare Mode Only)

### What

Add a "Full Year" shortcut button in the Income Statement filter area that:
- Only appears when the Compare toggle is enabled
- Sets the date range to Jan 1 – Dec 31 for previous years, and Jan 1 – today (YTD) for the current year

### How

**File: `src/pages/dashboard/IncomeStatement.tsx`**

1. Add a "Full Year" button next to the Compare toggle (or near the date presets), conditionally rendered only when `compareEnabled` is `true`.
2. On click, set `startDate` to Jan 1 of the current year and `endDate` to Dec 31 of the current year.
3. Update the comparison date computation logic: for past years, use full Jan 1 – Dec 31 ranges. For the current year, the existing `endDate` will naturally be Dec 31, but since comparison years are computed via `subYears`, they will automatically span full years.

The key insight: setting end date to Dec 31 of the current year means the current year shows full-year data (or whatever is available up to that date since future entries won't exist), while `subYears` on those dates gives full Jan 1 – Dec 31 for prior years automatically.

**File: `src/pages/dashboard/IncomeStatement.tsx` changes:**
- Add a `Button` with label "Full Year" after the Compare switch, visible only when `compareEnabled` is true
- On click: `setStartDate(new Date(currentYear, 0, 1))` and `setEndDate(new Date(currentYear, 11, 31))`

This is a small, self-contained change — roughly 10-12 lines added.

