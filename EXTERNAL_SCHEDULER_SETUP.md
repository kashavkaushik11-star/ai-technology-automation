# AI & Technology — External Scheduler Setup

The GitHub Actions workflow no longer uses GitHub's unreliable `schedule` trigger. It is now triggered by GitHub `workflow_dispatch`.

Target Facebook posting times (India):
- 09:00 IST
- 13:00 IST
- 17:00 IST
- 21:00 IST

## External scheduler

Use cron-job.org to send a POST request to GitHub at the four times.

GitHub endpoint:

`https://api.github.com/repos/kashavkaushik11-star/ai-technology-automation/actions/workflows/ai_tech_video.yml/dispatches`

Method: `POST`

Headers:
- `Accept: application/vnd.github+json`
- `Authorization: Bearer YOUR_GITHUB_FINE_GRAINED_TOKEN`
- `X-GitHub-Api-Version: 2026-03-10`
- `Content-Type: application/json`

Body for the 09:00 job:
```json
{"ref":"main","inputs":{"slot":"09:00"}}
```

Use the same body for the other jobs, changing `slot` to `13:00`, `17:00`, and `21:00`.

## GitHub token

Create a fine-grained personal access token limited to this repository:
`kashavkaushik11-star/ai-technology-automation`

Repository permission required:
- Actions: Read and write

Do not put the token in the GitHub repository files. Enter it only as the Authorization header in the external scheduler.

## Schedules

If cron-job.org is configured for Asia/Kolkata:
- 09:00 every day
- 13:00 every day
- 17:00 every day
- 21:00 every day

If using UTC instead:
- 03:30 UTC
- 07:30 UTC
- 11:30 UTC
- 15:30 UTC

The GitHub API workflow-dispatch endpoint accepts a workflow file name and branch ref, so each external request starts the existing video-generation + Facebook-posting pipeline.
