# 📅 Date Selection Testing - Quick Cheatsheet

## ⚡ Quick Test Commands

```bash
# Validation test (no BrokerBay needed)
node test-date-selection.js 25

# UI test (start dashboard)
npm run dashboard
# Then open: http://localhost:3000/auto-book

# Full automation test (with BrokerBay)
HEADLESS=false node auto-book-enhanced.js "Your Address" "" "25"
```

---

## ✅ Valid Date Examples (Today is Dec 18, 2025)

| Input | Result |
|-------|--------|
| `18` | ✅ Today |
| `19` | ✅ Tomorrow |
| `25` | ✅ Dec 25 |
| `31` | ✅ Last day of month |
| *(empty)* | ✅ Uses today automatically |

---

## ❌ Invalid Date Examples (Today is Dec 18, 2025)

| Input | Error |
|-------|-------|
| `17` | ❌ In the past |
| `15` | ❌ Before today |
| `32` | ❌ Doesn't exist in December |
| `35` | ❌ Out of range |
| `abc` | ❌ Not a number |

---

## 🎯 What to Check

### Frontend (UI)
- [ ] Green border for valid dates
- [ ] Red border for invalid dates
- [ ] Warning message appears
- [ ] Form blocks submission for invalid dates
- [ ] Current date displays correctly

### Backend (Automation)
- [ ] Logs show date validation
- [ ] Correct date clicked in calendar
- [ ] Time slots appear
- [ ] Screenshot saved: `02_date_selected_preferred*.png`
- [ ] Booking continues successfully

---

## 🐛 Quick Fixes

**Date not selected?**
```javascript
// Increase wait time in auto-book-enhanced.js line 772
await wait(5000); // Was 2000
```

**Time slots not appearing?**
```javascript
// Increase wait after click in auto-book-enhanced.js line 819
await wait(5000); // Was 3000
```

**Validation too strict?**
- Check server timezone matches your timezone
- Use explicit format: `2025-12-25`

---

## 📊 Expected Log Output

```
Step 2: Selecting date (Preferred: 25) (Step 2 - Select Date) 🔍
  ✓ Valid date requested: 25 (Current day: 18)
  🔍 Looking for date 25 in calendar...
  ✅ Successfully selected date 25
  📍 Used selector: td.day:not(.disabled):not(.old):not(.new)
  ✅ Time slots loaded successfully
  ✅ Step 2: Date 25 selected successfully ✅
```

---

## 🎨 UI Validation States

| State | Border Color | Message |
|-------|-------------|---------|
| Valid | 🟢 Green | None |
| Invalid | 🔴 Red | "Date 15 is in the past..." |
| Empty | ⚪ Default | None (optional field) |

---

## 📸 Screenshots to Check

After running automation:
```bash
ls src/data/screenshots/02_date_*
```

Look for:
- `02_date_selected_preferred_*.png` - Shows selected date
- `02_date_auto_selected_*.png` - Shows fallback date
- `02_date_selection_failed_*.png` - If it failed (debug)

---

## 🚀 Quick Deploy

```bash
# After testing locally
git add .
git commit -m "Improve date selection validation"
git push

# Railway will auto-deploy
```

---

## 📚 Full Documentation

- **DATE_SELECTION_SUMMARY.md** - Complete changes overview
- **DATE_SELECTION_GUIDE.md** - Detailed testing guide
- **test-date-selection.js** - Validation test script

---

**That's it! Test locally, verify it works, then deploy.** ✨

