# Ghost PM Signal

Live PM intelligence dashboard for Ghost product decisions. Aggregates Ghost Forum feature votes, GitHub issues, Hacker News sentiment, Kit competitor changelog, and Ghost releases — synthesised by Claude into a PM decision brief.

## What It Does

- **Feature Votes** — Top-voted requests from Ghost Forum Ideas (880+ topics, live vote counts)
- **GitHub** — Feature requests from TryGhost/Ghost + ActivityPub strategic issues (Ghost's Fediverse bet)
- **HN Pulse** — How the technical community talks about Ghost (stories + comment sentiment)
- **Competitor Watch** — Kit (ConvertKit) changelog — what Ghost's closest competitor is shipping
- **Ghost Releases** — Official changelog + blog from ghost.org
- **PM Brief** — Claude synthesis: top 3 opportunities, competitive gaps, strategic signals, what to deprioritise

## Stack

- Vanilla HTML/CSS/JS (no framework)
- Claude API (`claude-sonnet-4-6`) via Vercel serverless
- Vercel serverless functions (`api/data.js`, `api/synthesize.js`)

## Data Sources

| Source | Endpoint |
|---|---|
| Ghost Forum Ideas | `forum.ghost.org/c/ideas/5.json?order=votes` |
| Ghost Changelog RSS | `ghost.org/changelog/rss/` |
| Ghost Blog RSS | `ghost.org/blog/rss/` |
| GitHub Ghost Issues | `api.github.com/repos/TryGhost/Ghost/issues` |
| GitHub ActivityPub | `api.github.com/repos/TryGhost/ActivityPub/issues` |
| HN Algolia | `hn.algolia.com/api/v1/search` |
| Kit Changelog | `updates.kit.com/changelog` (server-rendered HTML) |

## Run Locally

```bash
ANTHROPIC_API_KEY=sk-ant-... vercel dev
```

## Author

Built by [Roman Martins](https://romanmartins.com) as part of the Ghost Creator Suite.

- [Roman's Lab](https://sinkrest.github.io/romans-lab)
- [GitHub](https://github.com/sinkrest/ghost-pm-signal)
