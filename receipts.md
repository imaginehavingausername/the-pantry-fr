# Receipt Scanner — Setup Notes (v2)


## 3. File placement (matches your actual src/app structure)
```
src/lib/receiptGemini.ts
src/app/api/receipt/scan/route.ts
src/app/api/receipt/confirm/route.ts
src/app/receipt-review/page.tsx
```

## 4. Two import paths to double check
- Both API routes import `{ prisma }` from `"@/lib/prisma"` — point this at wherever your
  Prisma singleton actually lives if it's not there already.
- The review page imports `{ UploadButton }` from `"@/lib/uploadthing"` — update this to
  wherever your app actually exports its generated UploadThing components. It uses your
  existing `imageUploader` FileRouter endpoint, so no new UploadThing route is needed.

## 5. Fixed category list lives in one place
`FOOD_CATEGORIES` in `src/lib/receiptGemini.ts` is the single source of truth for the
8 allowed categories (Breakfast, Lunch, Dinner, Snack, Dessert, Main, Veggie, Starch) —
used both in Gemini's structured-output schema (so it can only suggest from this list)
and in the review page's checkbox list. If you ever rename/add a `FoodCategory` row in
the DB, update this array to match.

## 6. How new-item creation actually flows now
1. Gemini suggests `suggested_categories` (subset of the 8) and `suggested_keywords`
   (brand names, descriptors, alt names) per new item.
2. Review page pre-fills the category checkboxes and a keywords text field from those
   suggestions — fully editable before confirming.
3. User must also fill in `expirationDate` and `placement` per new item (Gemini has no way
   to know either from a receipt) — the Confirm button stays disabled until every
   included new item has both.
4. User optionally uploads a photo per new item via the existing UploadThing
   `imageUploader` endpoint; `imageUrl` is attached once the upload completes.
5. Confirm route validates categories are all from the fixed set, then creates each
   `FoodItem` + connects categories inside a single Prisma transaction alongside the
   `matched_items` quantity increments.

## 7. Known gaps / things to revisit
- **Category upsert on confirm**: the confirm route does `foodCategory.upsert` by exact
  name for safety (won't fail if a category row is somehow missing), but since the list
  is fixed, this should always just match existing rows in practice.
- **Auth**: not touched here since you said the app already has accounts/auth in place —
  make sure `/receipt-review` and both `/api/receipt/*` routes sit behind whatever
  middleware/session check gates the rest of `/app`.
- **Styling**: still intentionally plain/unstyled — wire into your existing design system
  rather than shipping the raw `<input>`/`<label>` tags as-is.
- **Multiple images per new item**: current UploadButton only supports one image per new
  item. Fine to extend if you want multiple.