# ProfileDP-DD

Static portfolio site (single-page) built with `index.html` + custom fonts.

## What this is (non‑coder explanation)

This folder contains a single web page (a personal profile/portfolio).
When you open it in a browser, it shows:

- A hero section (name + tagline)
- Poetry + About sections
- A portfolio/repository section
- A “Send Message / Check Reply” modal (connects to Google Apps Script)

It is a **static site** (no server required). You can host it anywhere.

## Files that matter

```
ProfileDP-DD/
  index.html
  fonts.css
  fonts/
```

## Mobile / responsive support

This page is designed to work on:

- Desktop browsers
- Mobile browsers
- In‑app “webviews” (like browsers inside mobile apps)

How it works:

- The layout uses `width: 100%` with `max-width: 1080px` so it fits on small screens.
- A mobile rule (`@media (max-width: 768px)`) reduces padding, collapses grids to one column, and keeps the modal usable.
- Large hero text uses `clamp(...)` so it scales smoothly between phone and desktop sizes.

## Run locally

You can open `index.html` directly, but the safest way is to run a small local server:

```bash
python -m http.server 8000
```

Then visit:

`http://localhost:8000/`

## Messaging system

The message modal sends/loads conversations through Google Apps Script.
Update `SHEET_URL` inside `index.html` to point to your deployed Apps Script URL.

Important:

- Visitors do not need to sign in.
- Replies are shown only when the correct Message ID + PIN is provided.

## What changed in the latest update

- Fixed layout responsiveness (removed hard-coded 1080px widths).
- Added mobile styles for better readability and tap targets.
- Removed duplicated CSS rules so the file is easier to maintain.
- Kept the hero background embedded (base64) to avoid adding a public image file.

## Deploy

This is a static site. Deploy via:

- GitHub Pages
- Netlify
- Vercel

## Maintainer

- GitHub: `net2t`
- Email: `net2tara@gmail.com`
