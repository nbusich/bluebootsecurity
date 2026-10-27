# BlueBoot Security website

Static site for BlueBoot Security (independent SOC evaluation, plus labeled security datasets for training), built with [Bootstrap 5.3](https://getbootstrap.com/) from the jsDelivr CDN and self-hosted Archivo / JetBrains Mono. No build step; served by GitHub Pages from the `main` branch root.

- `index.html`: the whole site, one page with anchor sections (problem, metrics, how it works, who it's for, contact).
- `custom.css`: brand tokens (light and dark), type, the hero evaluation replay and section layouts, layered on top of Bootstrap. Blue means detected, orange means missed; keep orange for that only.
- `logo.svg`, `favicon.svg`: the logo and the shield icon.
- `fonts/`: Archivo (variable width and weight) and JetBrains Mono, both SIL Open Font License, shared by the site and the demo so the demo renders offline.
- `demo/`: the interactive event demo (below). `demo/demo.css` uses the same tokens and type as `custom.css`: the navy evaluation console, blue for authorized or detected, orange for attack or missed, dashed outlines for illustrative content.


## Interactive event demo

`demo/` is an evaluation console: the visitor runs a BlueBoot evaluation as a CISO watching the operation.

1. **Pick SOCs:** choose two to four of four simulated SOCs (an agentic SOC, two MDRs, an in-house SOC).
2. **Run the workday:** a fictional bank's network (nodes and edges) runs 09:00 to 17:00 in about 75 seconds. Normal logs (slate) and an eight-step Carbanak-style attack (orange) flow into the SIEM, and each SOC's lane shows when it detected and responded, what it missed, and its false alarms. Click a device to see its latest logs; click a SOC lane to see what it caught on the network. 1×/4×, pause (also Space) and Skip to report are available.
3. **Report:** a ranked scorecard of attacks detected, false alarms, mean and max time to detect, mean time to respond, whether the SOC contained the attack before data left, and an overall score. Swap SOCs to compare another lineup against the same attack.

Serve the site (`python3 -m http.server 8000 --bind 127.0.0.1`) and visit `/demo/`. Opening `demo/index.html` straight from disk also works, but browsers block the bundled fonts there and fall back to system fonts. It has no dependencies, build step or network requests; fonts come from `fonts/`. Its CSS and scripts are loaded as `demo.css?v=YYYYMMDD` and so on (and the homepage's `custom.css` the same way). GitHub Pages lets browsers cache files for 10 minutes, so bump the version whenever those files change, or a visitor can get the new page with old cached scripts. After 90 seconds idle on the setup or report screen it runs the day again (not under reduced motion). Fullscreen is in the control bar.

`demo/core.js` holds the whole model: network, attack steps, SOC profiles and scoring. Everything on screen and in the report is computed from one event list it compiles, so they can't disagree. The SOCs, bank and logs are simulated and labeled as such; the profiles are deliberate trade-offs (fastest is not best). The homepage hero shows SOC B from this model, and a test fails if the two drift apart.

### Checks

```sh
node --test demo/tests/sim.test.cjs
node --check demo/app.js
```

The browser check drives the full flow with all network access blocked and checks five widths for horizontal overflow. Start headless Chrome with `--remote-debugging-port=9223` and a temporary profile, then run `node demo/tests/browser-check.mjs <screenshot-dir>` (Node 22+).
