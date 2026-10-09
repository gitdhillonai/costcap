# Runaway acceptance 2026-10-07

Command: `npm run acceptance:runaway`

The run uses the CLI wrapper, a local fake OpenAI server, and no credentials. Paid provider calls: 0. Unknown cost stays null. Receipts are in `2026-10-07-runaway.json`.

| scenario | upstream calls | blocked reason | scope | receipts | unknown-cost receipts |
|---|---:|---|---|---:|---:|
| cap | 1 | budget_exceeded | run | 2 | 0 |
| retry-spiral | 5 | spiral_detected |  | 6 | 0 |
| steps | 3 | step_budget |  | 4 | 0 |
| day-cap | 0 | budget_exceeded | day | 2 | 0 |
| month-cap | 0 | budget_exceeded | month | 2 | 0 |
| unknown-cost | 0 | unreconciled_receipt | accounting | 2 | 1 |
| kill-file | 0 | killed |  | 1 | 0 |

Checked at 2026-10-07T14:31:49.283Z. Node v24.16.0.
