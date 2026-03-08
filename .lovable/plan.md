

## Plan: "Create New" Saves Current Form as a New Entry

**Goal**: The "Create New" button (visible when editing) should take the current form data (with any modifications the user made) and save it as a **new** journal entry, rather than resetting the form.

### Approach

**File: `src/components/dashboard/JournalEntryForm.tsx`**

1. **Add `onCreateNew` prop** to the Props interface (optional callback).

2. **Add a `handleCreateNew` function** that:
   - Runs the same validation as `handleSave`
   - Uses the "Create new entry" branch of `handleSave` logic (lines 277-340) regardless of `isEditMode`
   - Generates a new `entryNumber`
   - Inserts a new `journal_entries` row + `journal_lines` with the current form data
   - Shows a success toast ("New entry created from changes")
   - Calls `onCreateNew` callback so the parent can update `editEntryId` to the newly created entry

3. **Add the button** in the footer (line ~647), visible only when `isEditMode`:
   ```tsx
   {isEditMode && (
     <Button variant="outline" size="sm" onClick={handleCreateNew} disabled={saving} className="gap-2">
       <Plus className="h-4 w-4" /> Create New
     </Button>
   )}
   ```

**File: `src/pages/dashboard/JournalEntries.tsx`**

4. Pass `onCreateNew` to `JournalEntryForm` that receives the new entry ID and sets `editEntryId` to it (so the form now shows the newly created entry).

### Summary
- No form reset — current inputs are preserved and saved as a brand new entry
- The original entry remains unchanged
- After creation, the dialog stays open showing the new entry

