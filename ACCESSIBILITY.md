# WorshipFlow Accessibility Standards (WCAG AA)

This document outlines the accessibility improvements made to WorshipFlow and provides guidance for maintaining and testing accessibility compliance.

## Accessibility Compliance Status

**Current Standard:** WCAG 2.1 Level AA

**Last Updated:** June 29, 2026

**Status:** Improved (accessibility overhaul in progress)

---

## What's Been Fixed

### 1. Color Contrast (WCAG AA: 4.5:1 minimum)

#### Changes Made:
- **Danger/Delete Buttons**: Darkened red from `#f87171` (3.1:1) to `#b91c1c`-`#991b1b` (5:1+)
- **Placeholder Text**: Darkened from `#9ca3af` (2.8:1) to `#6b7280` (4.5:1)
- **Warning Badges**: Changed text color from white to black for better contrast on yellow backgrounds
- **Error Messages**: Ensured all error text meets 4.5:1 ratio with background

**Testing:** Use [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

### 2. Touch Target Size (Mobile Accessibility)

#### Changes Made:
- **Button minimum height:** `min-h-10` (40px) for primary buttons
- **Small buttons:** `min-h-9` (36px) for secondary actions
- **Service items:** 40px minimum clickable height in lists
- **Icon buttons:** Ensured 40x40px minimum for tappable elements

**WCAG Standard:** 44x44px recommended for mobile (40px minimum acceptable)

### 3. Form Labels & ARIA Attributes

#### All Form Inputs Now Have:
- **Associated `<label>` tags** with `htmlFor` attributes
- **`aria-label` attributes** for screen reader users
- **Proper semantic HTML** structure

#### Examples:
```html
<!-- Scripture Reference -->
<label htmlFor="scripture-ref">Scripture Reference</label>
<input id="scripture-ref" aria-label="Scripture reference (e.g., John 3:16)" />

<!-- Song Lyrics -->
<label htmlFor="song-lyrics">Lyrics</label>
<textarea id="song-lyrics" aria-label="Song lyrics (blank line creates new slide section)" />

<!-- Countdown Timer -->
<label htmlFor="countdown-minutes">Minutes</label>
<input id="countdown-minutes" type="number" min="1" max="1440" />
```

### 4. Icon-Only Button Labels

#### All Icon Buttons Now Have:
- **`aria-label` attributes** describing the action
- **Minimum 40px touch targets**
- **Hover states** for keyboard/mouse users

#### Examples:
```tsx
// Delete button
<button aria-label="Delete work order" onClick={handleDelete}>
  🗑 Delete
</button>

// Save button
<button aria-label="Save song lyrics" onClick={saveSong}>
  Save lyrics
</button>

// Close button
<button aria-label="Close item editor" onClick={onClose}>
  ✕ Close
</button>
```

### 5. Status Indicators & Color-Only Warnings

#### Changes Made:
- **Status badges** now include text labels, not just colors
- **Warning indicators** include symbols (`✓`, `⚠`)
- **Live status** announced to screen readers with `aria-live="polite"`

#### Examples:
```tsx
// Before (color-only, fails color-blind users)
<span className="bg-green-100 text-green-800">Approved</span>

// After (text + icon + color)
<span className="badge-success">✓ Approved</span>
```

### 6. Button States & ARIA Attributes

#### Added Semantic ARIA:
- **`aria-pressed`** on toggle buttons (text alignment, position buttons)
- **`aria-live="polite"`** on dynamic status messages
- **`aria-label`** on all clickable elements

#### Example:
```tsx
<button
  aria-label="Align text center"
  aria-pressed={isSelected}
  onClick={handleAlign}
>
  ▪ Center
</button>
```

### 7. Keyboard Navigation

#### Improvements:
- **Tab order** follows visual layout
- **Enter & Space keys** activate buttons
- **Service list items** can be selected with keyboard
- **Form inputs** properly focused with visible indicators

---

## How to Test Accessibility

### 1. Contrast Ratio Testing

**Tool:** [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

**Steps:**
1. Identify the foreground and background colors
2. Enter hex codes into the checker
3. Verify ratio is at least 4.5:1 for text or 3:1 for large text

**Example:**
- White text (#FFFFFF) on dark red (#B91C1C) = 5.9:1 ✓ (passes AA)

### 2. Screen Reader Testing

**Windows Options:**
- **NVDA** (free, open-source): [Download](https://www.nvaccess.org/)
- **JAWS** (commercial): [Purchase](https://www.freedomscientific.com/products/software/jaws/)

**macOS Options:**
- **VoiceOver** (built-in): Cmd+F5 to enable

**Testing Steps:**
1. Enable screen reader
2. Tab through all interactive elements
3. Verify all buttons, links, and form inputs are announced
4. Listen for aria-label text being read correctly

### 3. Mobile Touch Target Testing

**Tool:** Chrome DevTools

**Steps:**
1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Set viewport to mobile size (375px width)
4. Verify all buttons are at least 40x40px (44x44px preferred)

**Using axe DevTools Extension:**
1. Install [axe DevTools](https://www.deque.com/axe/devtools/) for Chrome
2. Run scan on each page
3. Review and fix any flagged accessibility issues

### 4. Keyboard Navigation Testing

**Steps:**
1. Disconnect mouse/touchpad
2. Use only Tab, Shift+Tab, Enter, and Space keys
3. Verify all interactive elements are reachable
4. Ensure logical tab order follows visual layout

**Checklist:**
- [ ] All buttons can be activated with Tab + Enter
- [ ] All form inputs can be filled without mouse
- [ ] All dropdowns can be navigated with arrow keys
- [ ] No keyboard traps (elements you can't Tab out of)

### 5. Color Blindness Testing

**Tool:** [Color Oracle](https://colororacle.org/)

**Types to Test:**
- Deuteranopia (red-green color blindness)
- Protanopia (red-green color blindness)
- Tritanopia (blue-yellow color blindness)

**Steps:**
1. Enable color blindness simulation
2. Verify status badges are distinguishable (use text + icon)
3. Verify all color-coded information has text labels

### 6. Automated Testing

**Using axe-core (programmatic):**
```bash
npm install --save-dev @axe-core/react
```

**In Jest tests:**
```tsx
import { axe, toHaveNoViolations } from 'jest-axe'

describe('CardEditPanel', () => {
  test('should not have any accessibility violations', async () => {
    const { container } = render(<CardEditPanel ... />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
```

---

## Maintenance Guidelines

### When Adding New Features

1. **Forms**: Always add `<label>` tags with `htmlFor` attributes
2. **Buttons**: Include `aria-label` for icon-only buttons
3. **Interactions**: Add `aria-pressed`, `aria-live`, or `role` as needed
4. **Colors**: Never use color alone to convey information
5. **Touch targets**: Ensure minimum 40px height for mobile

### Before Releasing

- [ ] Run axe DevTools scan (no violations)
- [ ] Test with keyboard only (Tab through all elements)
- [ ] Test with screen reader (NVDA or JAWS)
- [ ] Check color contrast (WebAIM checker)
- [ ] Test on mobile device (touch target verification)

### Color Palette for Contrast

**Safe for WCAG AA (4.5:1 with white text):**
- Primary Blue: `#1d4ed8`
- Success Green: `#047857` or `#059669`
- Danger Red: `#b91c1c` or `#991b1b`
- Warning Orange: `#b45309` (with black text)

**Unsafe combinations (fails WCAG AA):**
- Light gray text (#9ca3af) on white background = 2.8:1 ❌
- Light red (#f87171) on white background = 3.1:1 ❌

---

## Common Issues & Solutions

### Issue: Button not keyboard-accessible

**Solution:** Ensure button has proper `onClick` and `aria-label`:
```tsx
<button
  onClick={handleAction}
  aria-label="Delete item"
  className="min-h-10 px-3 py-2"
>
  Delete
</button>
```

### Issue: Form input not associated with label

**Solution:** Use `htmlFor` attribute on label:
```tsx
<label htmlFor="field-id">Field Label</label>
<input id="field-id" aria-label="Field description" />
```

### Issue: Color-only status indicators

**Solution:** Add text and icon:
```tsx
// Before
<div className="bg-green-100">Approved</div>

// After
<div className="bg-green-100 text-green-800">✓ Approved</div>
```

### Issue: Buttons too small on mobile

**Solution:** Add minimum height:
```tsx
<button className="min-h-10 px-3 py-2">
  Action
</button>
```

---

## Resources

- **WCAG 2.1 Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/
- **WebAIM**: https://webaim.org/
- **MDN Accessibility**: https://developer.mozilla.org/en-US/docs/Web/Accessibility
- **A11y Project**: https://www.a11yproject.com/
- **Deque University**: https://dequeuniversity.com/ (free courses)

---

## Accessibility Statement

WorshipFlow is committed to being accessible to all users, including those with disabilities. We strive to meet WCAG 2.1 Level AA standards and are continuously improving the accessibility of our application.

If you encounter any accessibility barriers, please report them by:
1. Opening a GitHub issue with "[Accessibility]" in the title
2. Describing the barrier and your assistive technology
3. Providing steps to reproduce

---

## Changelog

### June 29, 2026
- Implemented WCAG AA color contrast fixes
- Added form labels and ARIA attributes to all inputs
- Added aria-labels to icon-only buttons
- Increased touch target sizes for mobile
- Added visual text labels to status badges
- Added keyboard navigation to service lists

