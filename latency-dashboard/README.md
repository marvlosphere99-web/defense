# Network Delay & Latency Simulation Dashboard

A standalone, browser-based dashboard that simulates network delay and
latency under configurable conditions, and visualizes the results live —
a latency-over-time line chart, a latency distribution histogram, and
running session statistics.

No build step, no backend, no dependencies. Just open `index.html`.

## How the simulation works

At the configured send rate, each simulated packet:

1. Has an independent chance of being **dropped**, based on the packet
   loss setting.
2. If delivered, its latency is modelled as:
   - **Propagation delay** = base latency per hop × hop count
   - **Serialization delay** = derived from bandwidth (time to push a
     ~1500-byte packet onto the link)
   - **Jitter** = randomized variation (approximates a bell curve via the
     sum of three uniform random draws, rather than a flat uniform spread)

## Controls

- **Preset** — quick-start network profiles (Fiber/LAN, Wi-Fi, 4G,
  Satellite, Dial-up, Congested). Adjusting any slider switches back to
  "Custom".
- **Base latency / Hops / Jitter / Packet loss / Bandwidth / Send rate** —
  the underlying simulation parameters. Bandwidth is a log-scaled slider
  (0.05–1000 Mbps) so both dial-up and gigabit ranges are usable on the
  same control.
- **Pause / Resume** — freezes the simulation in place.
- **Reset** — clears all history and statistics (keeps current slider
  settings).

## What the charts show

- **Latency Over Time** — a rolling window of the last 150 samples.
  Dropped packets appear as red ticks along the bottom axis rather than
  being plotted as a latency value (they don't have one).
- **Latency Distribution** — a histogram of delivered-packet latencies
  within the same rolling window, bucketed into 16 bins.
- **Session Stats** — Min / Max / Jitter (standard deviation) / Loss %,
  computed over *all* packets since the last Reset (not just the visible
  window).

## Running it

Just open `index.html` in a browser — no server or install required.
