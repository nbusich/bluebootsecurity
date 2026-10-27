# BlueBoot Security website

Static site for BlueBoot Security (independent SOC evaluation, plus labeled security datasets for training), built with [Bootstrap 5.3](https://getbootstrap.com/) from the jsDelivr CDN and Archivo / JetBrains Mono from Google Fonts. No build step; served by GitHub Pages from the `main` branch root.

- `index.html`: the whole site, one page with anchor sections (problem, how it works, offer, contact).
- `custom.css`: brand tokens (light and dark), type, the hero evaluation replay and section layouts, layered on top of Bootstrap. Blue means detected, orange means missed; keep orange for that only.
- `logo.svg`, `favicon.svg`: the logo and the shield icon.
