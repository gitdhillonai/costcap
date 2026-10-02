# Substrate spike (NON-PRODUCTION)

Local-only demo of the smallest CostCap control loop: register one agent, enforce one policy, execute one kill. No network beyond 127.0.0.1, no secrets, no shared infra.

Run from a clean checkout (Node 20+):

    node spikes/substrate/demo.mjs

Needs src/cap.js, src/kill.js, src/proxy.js, src/hosted/policy.js (from stories #4, #9, #13).

## What this is and is not
This is the substrate-neutral baseline. Epic #16 asks for the spike on the substrate the adoption plan (#19) selects, but #17-#19 have no recorded outcome yet, so no substrate is selected. The demo isolates the three operations behind a `localSubstrate` seam (register/authenticate, setPolicy/getPolicy, kill/resume/killCheck). To spike OpenClaw Enterprise or engrams, implement those same methods against it and rerun the same script. Nothing here claims either product works.
