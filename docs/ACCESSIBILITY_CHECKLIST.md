# Accessibility Checklist for Developers

Use this checklist when adding new components, pages, or features to ensure WCAG AA compliance.

## Form Inputs

- [ ] **Has `<label>` tag** with `htmlFor` matching input `id`
- [ ] **Has `aria-label`** for additional context
- [ ] **Has `aria-required="true"`** if field is required
- [ ] **Has `aria-invalid="true"`** when validation fails
- [ ] **Placeholder is NOT the only label** (use `<label>` tag instead)
- [ ] **Focus indicator visible** (browser default or custom)

**Example:**
```tsx
<div>
  <label htmlFor="email">Email Address</label>
  <input
    id="email"
    type="email"
    aria-label="Email address for notifications"
    aria-required="true"
    required
    className="border focus:outline-blue-500"
  />
</div>
```

## Buttons

### Primary Buttons
- [ ] **Sufficient padding** (min 10px vertical, 16px horizontal)
- [ ] **Minimum height 40px** (use `min-h-10`)
- [ ] **Clear hover/active states**
- [ ] **Accessible text** (not just an icon)

### Icon-Only Buttons
- [ ] **Has `aria-label`** describing the action
- [ ] **Minimum size 40x40px** (use `min-h-10 w-10`)
- [ ] **Clear hover state**

**Example:**
```tsx
// Primary button
<button
  onClick={handleSave}
  className="px-4 py-2.5 min-h-10 bg-blue-600 text-white rounded"
>
  Save Changes
</button>

// Icon-only button
<button
  onClick={handleDelete}
  aria-label="Delete item"
  className="min-h-10 w-10 flex items-center justify-center rounded hover:bg-red-100"
>
  🗑
</button>
```

## Color Contrast

- [ ] **Text contrast at least 4.5:1** (WCAG AA)
- [ ] **Large text contrast at least 3:1** (18pt+ or 14pt+ bold)
- [ ] **Never use color alone** to convey information
- [ ] **Verify with WebAIM** contrast checker

**Safe Color Combinations:**
- White text on `#1d4ed8` (blue) ✓
- White text on `#047857` (green) ✓
- White text on `#b91c1c` (dark red) ✓
- Black text on `#fbbf24` (yellow) ✓

**Avoid:**
- Light gray text on white ❌
- Light colors on light backgrounds ❌

## Status Indicators & Badges

- [ ] **Includes text label**, not just color
- [ ] **Includes icon** (✓, ⚠, ✕, etc.)
- [ ] **Sufficient color contrast**
- [ ] **Works for color-blind users**

**Example:**
```tsx
// Before (fails: color-only)
<span className="bg-green-100">Approved</span>

// After (passes: text + icon + color)
<span className="inline-flex items-center gap-2 bg-green-100 text-green-800">
  <span>✓</span>
  <span>Approved</span>
</span>
```

## Keyboard Navigation

- [ ] **All interactive elements are focusable** (Tab key)
- [ ] **Tab order is logical** and follows visual layout
- [ ] **No keyboard traps** (can Tab out of every element)
- [ ] **Enter/Space activates buttons**
- [ ] **Arrow keys work in lists and dropdowns**
- [ ] **Focus indicator is visible** (minimum 2px)

**Example:**
```tsx
<div role="button" onClick={handleClick} onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') handleClick()
}}>
  Clickable div with keyboard support
</div>
```

## Screen Reader Support

- [ ] **Descriptive `aria-label`** on all icon-only buttons
- [ ] **`aria-live="polite"`** on dynamic content changes
- [ ] **`role` attribute** for non-semantic elements
- [ ] **Semantic HTML** (use `<button>`, `<label>`, `<nav>`, etc.)
- [ ] **Headings have proper hierarchy** (h1, h2, h3, not skipped)

**Example:**
```tsx
<div role="status" aria-live="polite" aria-atomic="true">
  {isLoading ? 'Saving...' : 'Changes saved'}
</div>

<button aria-label="Download report as PDF">
  ⬇ Download
</button>
```

## Mobile/Touch

- [ ] **Touch targets minimum 40x40px** (44x44px preferred)
- [ ] **Spacing between touch targets** at least 8px
- [ ] **Text is readable** at mobile size (16px minimum)
- [ ] **No horizontal scrolling** for text content

**Example:**
```tsx
<button className="min-h-10 px-4 py-2.5 text-base">
  Touch-friendly button
</button>
```

## Links

- [ ] **Clear, descriptive text** (not "click here")
- [ ] **4.5:1 color contrast** with surrounding text
- [ ] **Underlined or otherwise distinguished** from text
- [ ] **Keyboard accessible** (Tab key)

**Example:**
```tsx
// ❌ Bad
<a href="/docs">Click here</a> for documentation

// ✓ Good
<a href="/docs" className="underline text-blue-600 hover:text-blue-800">
  Read the documentation
</a>
```

## Images & Diagrams

- [ ] **Has `alt` text** describing content
- [ ] **Alt text is not "image" or "picture"**
- [ ] **Decorative images have empty `alt=""`**
- [ ] **Complex images have longer description** nearby

**Example:**
```tsx
// Photo of a sunset
<img
  src="/sunset.jpg"
  alt="Sunset over the ocean with orange and pink clouds"
  className="w-full"
/>

// Decorative spacer
<img src="/spacer.png" alt="" className="h-4" />
```

## Modals & Dialogs

- [ ] **Modal is properly focused** when opened
- [ ] **Keyboard can close modal** (Escape key)
- [ ] **Focus trapped inside modal** (Tab doesn't escape)
- [ ] **Backdrop prevents clicking outside** (screen reader users)
- [ ] **Close button is accessible** (min 40x40px)

**Example:**
```tsx
<div role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 id="modal-title">Confirm Action</h2>
  <p>Are you sure?</p>
  <button onClick={close}>Cancel</button>
  <button onClick={confirm}>Confirm</button>
</div>
```

## Testing Checklist

Before committing, test with:

- [ ] **WebAIM Contrast Checker** - verify all text colors
- [ ] **axe DevTools** - run automated scan
- [ ] **Keyboard only** - navigate entire component with Tab/Enter/Space
- [ ] **Screen reader** - NVDA (Windows) or VoiceOver (Mac)
- [ ] **Mobile device** - verify touch targets and responsive layout
- [ ] **Color blindness simulator** - Color Oracle or similar

## Common Mistakes to Avoid

❌ **Placeholder as only label**
```tsx
<input placeholder="Email" /> // No label!
```

✓ **Proper label association**
```tsx
<label htmlFor="email">Email</label>
<input id="email" placeholder="user@example.com" />
```

---

❌ **Icon-only button with no label**
```tsx
<button>🗑</button> // What does this do?
```

✓ **Icon button with aria-label**
```tsx
<button aria-label="Delete item">🗑</button>
```

---

❌ **Color-only status**
```tsx
<div className="bg-green-100">Approved</div> // Color-blind users see nothing
```

✓ **Text + color + icon**
```tsx
<div className="bg-green-100 text-green-800">✓ Approved</div>
```

---

❌ **Button too small on mobile**
```tsx
<button className="px-2 py-1">Tap me</button> // Hard to tap!
```

✓ **Touch-friendly button**
```tsx
<button className="px-4 py-2.5 min-h-10">Tap me</button>
```

---

## Quick Command Reference

**Check contrast ratio:**
https://webaim.org/resources/contrastchecker/

**Download NVDA (screen reader):**
https://www.nvaccess.org/download/

**Install axe DevTools (Chrome):**
- Chrome Web Store → "axe DevTools"
- Run scan on any page

**Test color blindness:**
Download Color Oracle: https://colororacle.org/

---

## Questions?

Refer to:
- `/ACCESSIBILITY.md` - Full accessibility guide
- `/docs/ACCESSIBILITY_CHECKLIST.md` - This checklist
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Articles](https://webaim.org/articles/)

