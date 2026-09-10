# Interactive Network Topology Builder

A standalone, browser-based tool for visually designing network topologies:
place nodes, draw links between them, define the routes traffic can take
through them, and export the result as JSON.

No build step, no backend, no accounts — everything lives in `localStorage`
in your browser. Just open `index.html`.

## Features

- **Add / move / delete nodes** — each has a type (client, network device,
  security, gateway, compute, storage, queue, or internet/edge), a label,
  and an optional sub-label (e.g. an IP address or port).
- **Add / delete links** between nodes, with an optional label (e.g. "1 Gbps",
  "wireless").
- **Define routes** — click a chain of connected nodes to record a path a
  packet could travel across the topology.
- **Live JSON preview** of the current topology.
- **Export / Import JSON** — save your work to a file, or reload it later.
- **Auto-saved** to `localStorage` as you work, so a refresh won't lose it.

## Running it

Just open `index.html` in a browser — no server or install required.

## Compatibility with the Packet Journey Visualizer

The exported JSON shape —

```json
{
  "nodes": { "a": { "x": 100, "y": 200, "label": "A", "sub": "", "type": "client" } },
  "edges": [["a", "b"]],
  "routes": [["a", "b"]]
}
```

— matches the custom topology field in the companion *Real-Time Packet
Journey Visualizer* project. Build a topology here, export it, and paste it
into that project's "My Topologies" panel to simulate traffic across it.

Note: link labels are a builder-only convenience for readability while
designing: the visualizer doesn't render them, so they're dropped from the
exported `edges` array (which is plain `[from, to]` pairs).

## Controls

| Mode | Action |
|---|---|
| Select / Move | Click a node or link to edit it in the Properties panel. Drag nodes to reposition. `Delete`/`Backspace` removes the current selection. |
| Add Node | Pick a type, then click anywhere on the canvas to place it. |
| Add Link | Click a node, then click a second node to connect them. `Esc` cancels. |
| Define Route | Click connected nodes in order, then **Finish Route** (or press `Enter`). `Esc` cancels. |

A route that references two nodes with no link between them is flagged as
**BROKEN LINK** in the Routes panel (this can happen if you delete a link
after defining a route that depended on it).
