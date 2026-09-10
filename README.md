# Defense — Final Year Projects

Four standalone network-simulation/visualization tools, each a self-contained
HTML/CSS/JS app wrapped as an Electron desktop application.

| Project | Folder | What it does |
|---|---|---|
| Real-Time Packet Journey Visualizer | [`packet-journey-visualizer/`](packet-journey-visualizer) | Animates simulated packets traveling across 5 network topologies (Enterprise LAN, Home, Cloud/CDN, Microservices, ISP Backbone), with live stats, an event log, and Supabase-backed saved topologies/run history. |
| Interactive Network Topology Builder | [`topology-builder/`](topology-builder) | Visually design network topologies — place nodes, draw links, define traffic routes — and export/import JSON compatible with the Packet Journey Visualizer's custom topology field. |
| Network Delay & Latency Simulation Dashboard | [`latency-dashboard/`](latency-dashboard) | Simulates network delay/latency under configurable conditions (bandwidth, jitter, packet loss, hop count) with live charts and per-preset network profiles (fiber, Wi-Fi, 4G, satellite, dial-up, congested). |
| AI-Based Network Behaviour Profiling System | [`ai-behaviour-profiler/`](ai-behaviour-profiler) | A hand-rolled statistical anomaly detector (rolling z-score / EWMA baselines) that profiles simulated traffic and flags injected attack patterns (DDoS, port scan, exfiltration, beaconing) in real time. |

## Running any project

Each folder is independent. Two ways to run one:

**As a desktop app:**
```bash
cd <project-folder>
npm install
npm start          # launches the Electron app
npm run dist        # builds a distributable (see that project's README)
```

**In a browser** — the Packet Journey Visualizer uses ES modules and needs a
local server:
```bash
cd packet-journey-visualizer
python -m http.server 5173
# open http://localhost:5173
```
The other three are plain scripts and can be opened directly:
```bash
cd topology-builder      # or latency-dashboard / ai-behaviour-profiler
# just open index.html in a browser
```

See each project's own README for full details.
