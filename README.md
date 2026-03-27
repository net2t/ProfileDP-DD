# ProfileDP-DD

Static portfolio site (single-page) built with `index.html` + custom fonts.

## Files that matter

```
ProfileDP-DD/
  index.html
  fonts.css
  fonts/
```

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

## Deploy

This is a static site. Deploy via:

- GitHub Pages
- Netlify
- Vercel

## Maintainer

- GitHub: `net2t`
- Email: `net2tara@gmail.com`
