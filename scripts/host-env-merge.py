# Reads KEY=VALUE lines on stdin and merges them into /opt/costcap/.env (values never printed).
import sys, pathlib
p = pathlib.Path("/opt/costcap/.env")
new = dict(l.split("=", 1) for l in sys.stdin.read().splitlines() if "=" in l)
old = [l for l in p.read_text().splitlines() if l.split("=", 1)[0] not in new]
p.write_text("\n".join(old + [k + "=" + v for k, v in new.items()]) + "\n")
print("env merged keys:", ",".join(sorted(new)))
