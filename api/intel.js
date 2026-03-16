// Ghost Intel — aggregates GitHub releases, changelog RSS, resources RSS, and repo stats
// Ported from ghost-intel into ghost-pm-signal so the tab is fully self-contained

function extractTag(xml, tag) {
  const re = new RegExp(
    `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    'i'
  );
  const m = xml.match(re);
  if (!m) return '';
  return (m[1] ?? m[2] ?? '').trim();
}

function parseRSS(xml, limit = 8) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < limit) {
    const raw = m[1];
    items.push({
      title: extractTag(raw, 'title').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
      link: extractTag(raw, 'link') || extractTag(raw, 'guid'),
      pubDate: extractTag(raw, 'pubDate'),
      description: extractTag(raw, 'description')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .trim()
        .slice(0, 280),
    });
  }
  return items;
}

function formatReleaseNotes(body) {
  if (!body) return '';
  return body
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 500);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Cache-Control', 's-maxage=1200, stale-while-revalidate=300');

  const ghHeaders = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ghost-pm-signal/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  try {
    const [releasesRes, repoRes, commitsRes, changelogRes, resourcesRes] = await Promise.all([
      fetch('https://api.github.com/repos/TryGhost/Ghost/releases?per_page=10', { headers: ghHeaders }),
      fetch('https://api.github.com/repos/TryGhost/Ghost', { headers: ghHeaders }),
      fetch('https://api.github.com/repos/TryGhost/Ghost/commits?per_page=20', { headers: ghHeaders }),
      fetch('https://ghost.org/changelog/rss/'),
      fetch('https://ghost.org/resources/rss/'),
    ]);

    const [releases, repo, commits, changelogXml, resourcesXml] = await Promise.all([
      releasesRes.ok ? releasesRes.json() : [],
      repoRes.ok ? repoRes.json() : {},
      commitsRes.ok ? commitsRes.json() : [],
      changelogRes.ok ? changelogRes.text() : '',
      resourcesRes.ok ? resourcesRes.text() : '',
    ]);

    const changelog = parseRSS(changelogXml, 6);
    const resources = parseRSS(resourcesXml, 5);

    const formattedReleases = (Array.isArray(releases) ? releases : [])
      .filter(r => !r.draft && !r.prerelease)
      .slice(0, 8)
      .map(r => ({
        version: r.tag_name,
        date: r.published_at,
        notes: formatReleaseNotes(r.body),
        url: r.html_url,
      }));

    const recentCommits = (Array.isArray(commits) ? commits : [])
      .slice(0, 12)
      .map(c => ({
        message: (c.commit?.message ?? '').split('\n')[0].slice(0, 120),
        date: c.commit?.author?.date,
        url: c.html_url,
      }));

    const repoStats = {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      latestVersion: formattedReleases[0]?.version ?? null,
    };

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentReleaseCount = formattedReleases.filter(
      r => new Date(r.date).getTime() > thirtyDaysAgo
    ).length;

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    let summary = null;

    if (anthropicKey && (formattedReleases.length > 0 || changelog.length > 0)) {
      const context = [
        `Latest Ghost version: ${formattedReleases[0]?.version ?? 'unknown'} (${formattedReleases[0]?.date?.slice(0, 10) ?? ''})`,
        `Releases in last 30 days: ${recentReleaseCount}`,
        `Recent release notes (latest): ${formattedReleases[0]?.notes?.slice(0, 300) ?? ''}`,
        `Latest changelog entry: ${changelog[0]?.title ?? ''} — ${changelog[0]?.description?.slice(0, 200) ?? ''}`,
        `Recent changelog titles: ${changelog.slice(1, 4).map(c => c.title).join('; ')}`,
        `Recent resource titles: ${resources.slice(0, 3).map(r => r.title).join('; ')}`,
        `Latest commits: ${recentCommits.slice(0, 5).map(c => c.message).join('; ')}`,
      ].join('\n');

      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 180,
            system: 'You are a concise product analyst. Given Ghost platform activity data, write a 2-sentence "this week at Ghost" summary. Be specific — name features, version numbers, and themes. No filler. Plain text only, no markdown.',
            messages: [{ role: 'user', content: `Ghost activity data:\n${context}\n\nWrite the 2-sentence summary now.` }],
          }),
        });
        if (claudeRes.ok) {
          const cd = await claudeRes.json();
          summary = cd.content?.[0]?.text?.trim() ?? null;
        }
      } catch {
        // summary stays null
      }
    }

    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      summary,
      repoStats,
      recentReleaseCount,
      releases: formattedReleases,
      changelog,
      resources,
      recentCommits,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message ?? 'Failed to fetch Ghost data' });
  }
}
