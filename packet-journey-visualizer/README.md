# Real-Time Packet Journey Visualizer

An animated, browser-based simulation of network packets traveling through
different topologies (Enterprise LAN, Home Network, Cloud/CDN, Microservices,
ISP Backbone), with a Supabase backend for saving custom topologies and
simulation run history.

## How to run it

This is a static site (HTML/CSS/JS) — there's nothing to install or build.
The **only** requirement is serving the files over `http://` instead of
opening `index.html` directly, because the app uses JavaScript modules
(`backend.js`), and browsers block those under the `file://` protocol.

Pick whichever you already have installed:

**Option A — Python (most systems already have this):**
```bash
python -m http.server 5173
```
Then open **http://localhost:5173** in your browser.

**Option B — Node.js:**
```bash
npx serve -l 5173 .
```
Then open **http://localhost:5173** in your browser.

That's it — no `npm install`, no build step, no config. Stop the server with
`Ctrl+C` when you're done.

## What you'll see

- A network topology diagram with animated packets traveling between nodes.
- Controls to switch topology, adjust send rate/latency/packet loss, toggle
  protocols, pause, and reset.
- A live event log of every packet's journey.
- **Session / My Topologies / Run History** panels, backed by a live
  Supabase project — no login required. Each browser silently gets its own
  private anonymous session, so you can save custom topologies (as JSON) and
  simulation run history without creating an account.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | Page structure and all UI panels |
| `style.css` | Styling (dark theme, layout, legend, forms) |
| `script.js` | Core simulation engine — topologies, packet animation, stats |
| `supabaseClient.js` | Supabase client setup (project URL + public key only) |
| `backend.js` | Auth session, custom topology CRUD, run history CRUD |
| `supabase-schema.sql` | Database schema (tables + Row Level Security policies) already applied to the live project — included for reference, no need to run it |

## Notes

- The Supabase backend is already fully configured and live — you don't need
  your own Supabase account or any API keys to use the save/load features.
- Only a public "publishable" key is embedded in the code, which is safe by
  design; all data access is protected server-side by Row Level Security.
