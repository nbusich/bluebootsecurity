# BlueBoot Security website

Static site for BlueBoot Security (independent SOC evaluation, plus labeled security datasets for training), built with [Bootstrap 5.3](https://getbootstrap.com/) from the jsDelivr CDN and self-hosted Archivo / JetBrains Mono. No build step; served by GitHub Pages from the `main` branch root.

- `index.html`: the whole site, one page with anchor sections (problem, metrics, how it works, who it's for, contact).
- `custom.css`: brand tokens (light and dark), type, the hero evaluation replay and section layouts, layered on top of Bootstrap. Blue means detected, orange means missed; keep orange for that only.
- `logo.svg`, `favicon.svg`: the logo and the shield icon.
- `fonts/`: Archivo (variable width and weight) and JetBrains Mono, both SIL Open Font License, shared by the site and the demo so the demo renders offline.
- `demo/`: the interactive event demo (below). `demo/demo.css` uses the same tokens and type as `custom.css`: the navy evaluation console, blue for authorized or detected, orange for attack or missed, dashed outlines for illustrative content.


## Interactive event demo

Open `demo/index.html` directly in a modern browser, or serve the site locally:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Visit `http://127.0.0.1:8000/demo/`. The demo has no dependencies, external fonts,
CDN requests, build step, backend, or live lab connection. The existing homepage
continues to use its Bootstrap CDN assets. GitHub Pages serves the demo at `/demo/`
when these files are committed and deployed through the site's normal workflow.

- Five chapters: company, activity, evidence, answer key, evaluation.
- Next/Back and chapter buttons support a presenter; arrow keys also navigate.
- Play starts a two-minute loop; Pause, Restart and fullscreen support booth use.
- Choosing an activity, opening evidence or selecting a response pauses playback.
- After 90 seconds without interaction, an attract loop starts unless a dialog is
  open, a control has visible keyboard focus, or reduced motion is preferred.
- The page pauses when the browser tab is hidden. Restart clears the choice,
  selected response, chapter and playback state.
- Try the context-aware, overreacting and dismissive example responses in chapter 5.

### Evidence and presentation boundaries

The company (240 employees, three offices), the employee persona and company diagram
are illustrative. The bundled excerpts come from **one workstation** in experiment
`20261009-203708-example` in the sibling `shoepoc` repository. Three selected
security records retain their timestamps, record references and field-limited
process details. The answer key includes the origin and available execution
results. Action-to-log links remain candidate associations; timestamps alone do
not establish unique causality. An unconfirmed attack step is explicitly excluded
from executed-activity outcomes.

The installer and directory-check excerpts are grouped for comparison, not shown
in chronological order. Playback is an accelerated explanation, not a real-time
experiment clock. All evidence timestamps are UTC. A shortened command in the
activity scene is identified as abbreviated; the explorer shows its full selected
command. Evaluator scenario markers and cumulative employee output are omitted
from the exported excerpts. No passwords, API keys or raw exports are bundled.

Origin labels are hidden in the UI until chapter 4. This is a **presentation
boundary**, not secure authorization: the browser receives the complete fixture.
A real SOC evaluation must provide a separate, appropriately filtered feed or
platform account, excluding evaluator-only labels and scenario markers.

The responses and scorecards are illustrative, not measured SOC performance.
Timing is not measured. No separate XDR integration is demonstrated. There was no
lab video in the source repository; the evidence explorer provides real-record
inspection instead of fabricated footage. Optional booth footage can be recorded
separately, with credentials and evaluator markers kept out of the SOC view.

### Verify or refresh the evidence

From this repository's root (requires the sibling lab repository):

```sh
python3 demo/tools/build_evidence.py --source ../shoepoc --check
# Regenerate after reviewing changes to the fixed, selected source records:
python3 demo/tools/build_evidence.py --source ../shoepoc
```

The exporter selects explicit fields and records, validates their expected
commands and available outcomes, and stores source-file SHA-256 hashes for review.
It does not modify the lab, install software, or connect to running services.

### Checks

```sh
node --test demo/tests/*.test.cjs
node --check demo/app.js
python3 demo/tools/build_evidence.py --source ../shoepoc --check
```

An optional dependency-free browser check connects to a local Chrome DevTools
endpoint on port 9223: `node demo/tests/browser-check.mjs /tmp/blueboot-previews`.
It blocks HTTP(S) requests, exercises the presentation and evidence boundaries,
checks five viewport widths, and saves screenshots. Run Chrome headlessly with a
temporary profile and remote debugging enabled before invoking it. It requires
Node 22 or newer for the built-in WebSocket client; the website itself does not
require Node.

Before the event, open at laptop and phone widths, walk through all chapters,
make a choice, inspect a record before and after the reveal, change the example
response, and confirm restart clears the session. Disconnect the network and
reload the demo. Use a laptop browser's fullscreen mode for a booth display.
