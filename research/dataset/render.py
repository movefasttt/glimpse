#!/usr/bin/env python3
"""Render chosen sessions in hidden tmux terminals and capture the copy-equivalent screen text.

Uses a private tmux server (-L glimpse) so the user's own tmux is untouched. Resumes are forked,
skip project settings (no project hooks) and start no MCP servers. See docs/dataset.md.
"""
import concurrent.futures as cf, hashlib, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "renders")
WIDTHS = [100, 150]
CMD = ("claude --resume {sid} --fork-session --setting-sources user "
       "--strict-mcp-config --mcp-config '{{\"mcpServers\":{{}}}}'")


def tmux(*args):
    return subprocess.run(["tmux", "-L", "glimpse", *args], capture_output=True, text=True)


def capture(name):
    return tmux("capture-pane", "-t", name, "-p", "-J", "-S", "-", "-E", "-").stdout


def render(sid, cwd, width):
    path = os.path.join(OUT, f"{sid}-w{width}.txt")
    if os.path.exists(path):
        return path, "cached"
    name = f"g{sid[:8]}w{width}"
    tmux("kill-session", "-t", name)
    tmux("new-session", "-d", "-s", name, "-x", str(width), "-y", "50", "-c", cwd)
    tmux("send-keys", "-t", name, CMD.format(sid=sid), "Enter")
    prev, stable, start = None, 0, time.time()
    while time.time() - start < 90:
        time.sleep(1)
        text = capture(name)
        h = hashlib.md5(text.encode()).hexdigest()
        stable = stable + 1 if h == prev else 0
        prev = h
        if stable >= 2 and "❯" in text.split("\n")[-15:].__str__():
            break
    text = capture(name)
    tmux("kill-session", "-t", name)
    if "No conversation found" in text or "❯" not in text:
        return path, "FAILED"
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path, f"ok {len(text.splitlines())} lines {time.time() - start:.0f}s"


def main():
    os.makedirs(OUT, exist_ok=True)
    tmux("start-server")
    tmux("set-option", "-g", "history-limit", "500000")
    sessions = json.load(open(os.path.join(HERE, "sessions.json")))
    jobs = [(s["sid"], s["cwd"], w) for s in sessions for w in WIDTHS]
    if len(sys.argv) > 1:
        jobs = jobs[: int(sys.argv[1])]
    with cf.ThreadPoolExecutor(4) as pool:
        for (sid, _, w), (path, status) in zip(jobs, pool.map(lambda j: render(*j), jobs)):
            print(f"{sid[:8]} w{w}: {status}", flush=True)
    tmux("kill-server")


if __name__ == "__main__":
    main()
