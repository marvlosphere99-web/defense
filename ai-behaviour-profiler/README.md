# AI-Based Network Behaviour Profiling System

A standalone, browser-based anomaly detector for network traffic. It
generates a live synthetic traffic stream, learns what "normal" looks like
using statistical baselining, and flags deviations in real time — with a
self-scoring precision/recall panel, since the tool controls (and therefore
knows) exactly when it injected an attack.

No build step, no backend, no ML framework, no dependencies. Just open
`index.html`.

## How the detection works

**Baseline learning.** For the first 20 ticks (~20 seconds), the system
only observes traffic and computes an initial mean/variance per metric —
it doesn't flag anything yet ("Learning baseline…"). After that, the
baseline is maintained live via an **EWMA (exponentially weighted moving
average)** mean and variance — but only on ticks that *aren't* flagged as
anomalous (see "Why the baseline freezes on anomalies" below).

**Per-metric z-scores.** Four traffic metrics are tracked: packets/sec,
bytes/sec, average packet size, and unique destination ports touched. Each
new sample gets a z-score against its own baseline: `(value − mean) / stddev`.
The **composite anomaly score** is the largest absolute z-score across the
four metrics — an anomaly is flagged when it exceeds the sensitivity
threshold.

**Periodicity detection (for beaconing).** Separately, the system tracks
the timing of new-connection events and computes the **coefficient of
variation** (stddev ÷ mean) of the intervals between them. Malware
beaconing — calling home at a fixed interval — produces an unnaturally
*regular* pattern, which this catches even though the traffic's magnitude
never leaves "normal" (see below).

**Why two techniques?** The four injectable scenarios are deliberately
chosen so no single detector catches all of them:

| Scenario | Caught by |
|---|---|
| DDoS Burst | z-score (packets/sec, bytes/sec spike) |
| Port Scan | z-score (unique destination ports spike, packet size drops) |
| Data Exfiltration | z-score (bytes/sec and avg packet size rise) |
| Beaconing | **only** the periodicity/CV detector — magnitude stays normal by design |

## Why the baseline freezes on anomalies

A naive EWMA baseline that updates on *every* sample has a well-known
failure mode: a single large outlier disproportionately inflates the
variance estimate (the update's cross-term scales with the squared
deviation), which widens "normal" enough that a sustained attack gets
smoothed away and the detector goes blind to it within a tick or two —
effectively erasing its own alert. This system instead **only updates the
baseline on ticks that weren't flagged**, so a sustained attack keeps
being scored against the baseline from *before* it started, and stays
reliably detected for the full injection window regardless of severity.

The adaptation-rate slider still matters — it controls how fast the
baseline settles right after the initial warm-up, and how fast it
re-stabilizes to a new "normal" once an attack scenario ends and traffic
returns to background levels.

## Detector Performance panel

Because every injected scenario is ground truth, the system tracks:

- **True Positive** — flagged while an attack was actually active
- **False Positive** — flagged while nothing was injected
- **False Negative** — an attack was active but not flagged

...and reports **Precision**, **Recall**, and **F1** live. This is what
lets you *demonstrate*, not just claim, that the detector works — inject a
few scenarios and the numbers update themselves.

## Controls

- **Pause / Resume**, **Reset** (wipes baseline, history, alerts, and
  performance counters — starts learning from scratch).
- **Inject Attack Scenario** — four buttons, each active for 15–24 seconds
  (disabled until the initial baseline has finished learning).
- **Sensitivity** — the z-score threshold (σ) for flagging an anomaly.
- **Baseline adaptation rate** — the EWMA alpha.

## Running it

Just open `index.html` in a browser — no server or install required.
