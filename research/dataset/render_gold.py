#!/usr/bin/env python3
"""Render gold-set source sessions at given widths (same command and flags as render.py, private tmux
server -L glimpse, forked resume, no hooks/MCP). Output: renders/gold/<sid>-w<width>.txt (cached).

Usage: python3 render_gold.py <sid>:<cwd>:<width>[,<width>...] ...
"""
import concurrent.futures as cf, os, sys
import render

render.OUT = os.path.join(render.HERE, "renders", "gold")

if __name__ == "__main__":
    os.makedirs(render.OUT, exist_ok=True)
    render.tmux("start-server")
    render.tmux("set-option", "-g", "history-limit", "500000")
    jobs = []
    for arg in sys.argv[1:]:
        sid, cwd, ws = arg.split(":")
        jobs += [(sid, cwd, int(w)) for w in ws.split(",")]
    with cf.ThreadPoolExecutor(4) as pool:
        for (sid, _, w), (path, status) in zip(jobs, pool.map(lambda j: render.render(*j), jobs)):
            print(f"{sid[:8]} w{w}: {status}", flush=True)
    render.tmux("kill-server")
