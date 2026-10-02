# Shared React UI Foundation (SHO-105 M1)

This directory provides accessible, reusable React UI primitives designed for incremental React islands within the Hono application.

## 1. Overview & Architecture

The UI foundation components coexist with the outer Hono shell powered by Tailwind CSS v4 and daisyUI v5. All styling and token mappings are strictly scoped to the `.react-island` container class, ensuring that the Hono SSR shell and existing daisyUI theme colors remain unaffected.

### Component Provenance

| Component | Source / Provenance | Dependencies |
| :--- | :--- | :--- |
| `Button` | Adapted from [shadcn/ui Button](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/button.tsx) (new-york style). Native HTML `<button>` with `type="button"` default. | None (zero Radix Slot, zero CVA) |
| `Input` | Adapted from [shadcn/ui Input](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/input.tsx) (new-york style). Native HTML `<input>` with `data-slot="input"`. | None |
| `Table` | Adapted from [shadcn/ui Table](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/table.tsx) (new-york style). Semantic HTML table with responsive container. | None |
| `Card` | Adapted from [shadcn/ui Card](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/new-york-v4/ui/card.tsx) (new-york style). Composable card layout primitives with `data-slot`. | None |
| `Select` | **Hand-authored** native HTML `<select>` primitive with custom SVG chevron wrapper (`Select`, `SelectOption`, `SelectGroup`). | None (native HTML `<select>`) |
| `cn` | **Hand-authored** zero-dependency class name concatenation utility (`utils.ts`). | None (zero `clsx` / `tailwind-merge`) |

## 2. Important Usage Guidelines

### React JSX Pragma
The root project `tsconfig.json` defines `"jsxImportSource": "hono/jsx"` for Hono SSR templates. Therefore, **every React component and island file must include the per-file JSX pragma at the very top**:

```tsx
/** @jsxImportSource react */
```

Omitting this pragma causes the TypeScript compiler and bundler to resolve JSX elements to Hono's JSX factory instead of React's runtime, resulting in runtime rendering errors.

### The `cn` Utility Behavior
The `cn(...)` utility in `./utils.ts` is a lightweight, zero-dependency class joiner. It accepts strings, numbers, booleans, nested arrays, and conditional objects (`{ [className]: boolean }`).

> [!WARNING]
> Unlike `tailwind-merge`, `cn` **concatenates** class names and does not resolve or deduplicate conflicting Tailwind utilities (e.g. passing both `px-2` and `px-4` will output both classes, governed by stylesheet order). Callers should pass specific, non-conflicting utility classes when overriding styles.

### Native Select
`Select` is built on the browser's native `<select>` element rather than a Radix UI overlay. It provides:
- Native OS picker interaction on mobile devices (iOS wheel / Android bottom sheet).
- Native keyboard navigation (Arrow Up/Down, typing to jump to options, Enter/Space/Escape).
- High performance with zero portal overhead.

## 3. Scoped CSS & Theme Compatibility

Styles are declared in `src/client/ui.css` and imported via `src/client/ui/index.ts`. All selectors and custom CSS variables are scoped to `.react-island`:

- Variables inherit the active daisyUI theme (e.g. `data-theme="lemonade"`):
  - `--background`: `var(--color-base-100)`
  - `--foreground`: `var(--color-base-content)`
  - `--primary`: `var(--color-primary)`
  - `--primary-foreground`: `var(--color-primary-content)`
  - `--muted`: `var(--color-base-200)`
  - `--border` / `--input`: `var(--color-base-300)`
  - `--destructive`: `var(--color-error)`
- Scoped utility classes handle states not provided by daisyUI: `hover:bg-accent`, `hover:text-accent-foreground`, `focus-visible:ring-2`, `focus-visible:ring-offset-1`, `focus-visible:ring-offset-2`, `aria-invalid:*`.

## 4. Accessibility & Testing

Unit tests in `ui.test.tsx` verify:
- Button click dispatch, disabled states, variant/size class assignment.
- Input data-slot attributes, controlled/uncontrolled changes, invalid states.
- Select native selection handling, option rendering, and chevron indicator.
- Table semantic table elements (`<th scope="col">`, `<caption>`, etc.).
- Card container and section hierarchy.

*Accessibility Note*: Interactive components utilize standard semantic HTML elements (`<button>`, `<input>`, `<select>`, `<table>`) providing native keyboard focus and assistive technology support. Formal screen-reader validation across NVDA/VoiceOver should be verified during staging integration.

## 5. Upstream License Notice

Portions of this code (specifically `button.tsx`, `input.tsx`, `table.tsx`, and `card.tsx`) are adapted from [shadcn/ui](https://github.com/shadcn-ui/ui), licensed under the MIT License:

```
MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
