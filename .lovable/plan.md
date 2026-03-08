

## Add Preset Date Range Buttons

### Overview
Add quick-select preset buttons ("This Month", "Q1", "Q2", "Q3", "YTD") to the `DateRangeFilter` component. These appear as small toggle-style buttons next to the date pickers.

### Preset Logic (all relative to current year)
- **This Month**: 1st of current month → today
- **Q1**: Jan 1 → Mar 31
- **Q2**: Jan 1 → Jun 30 (cumulative: Q1+Q2)
- **Q3**: Jan 1 → Sep 30 (cumulative: Q1+Q2+Q3)
- **YTD**: Jan 1 → today

### Changes

**`src/components/dashboard/DateRangeFilter.tsx`**
- Add a `presets` array with label and date-computing functions
- Render preset buttons as small `variant="ghost"` or `variant="outline"` buttons in a row below or beside the date pickers
- Clicking a preset calls both `onStartDateChange` and `onEndDateChange` with the computed dates
- Track active preset to highlight the selected one (compare current start/end dates against preset values)
- Only show presets in the `DateRangeFilter` component (not `AsOfDateFilter`)

### UI Layout
The presets render as a row of compact buttons alongside the From/To pickers:
```text
[This Month] [Q1] [Q2] [Q3] [YTD]   From [date] To [date]
```

