export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const GITHUB_HEADERS = {
    'User-Agent': 'ghost-pm-signal',
    'Accept': 'application/vnd.github.v3+json'
  };
  const HN_BASE = 'https://hn.algolia.com/api/v1';
  const ninetyDaysAgo = Math.floor(Date.now() / 1000) - (90 * 86400);

  const [forum, githubFeatures, githubActivityPub, hnStories, hnComments, kitChangelog, ghostChangelog, ghostBlog] =
    await Promise.allSettled([

      // 1. Ghost Forum — top voted feature requests
      fetch('https://forum.ghost.org/c/ideas/5.json?order=votes&per_page=30')
        .then(r => r.json())
        .then(d => d.topic_list?.topics?.slice(0, 20).map(t => ({
          id: t.id,
          title: t.title,
          votes: t.vote_count || 0,
          likes: t.like_count || 0,
          views: t.views,
          replies: t.posts_count,
          url: `https://forum.ghost.org/t/${t.slug}/${t.id}`,
          created_at: t.created_at,
          last_activity: t.last_posted_at,
          tags: t.tags || []
        }))),

      // 2. GitHub — Ghost main repo feature requests by reactions
      fetch('https://api.github.com/repos/TryGhost/Ghost/issues?labels=feature+request&state=all&sort=reactions&direction=desc&per_page=15', { headers: GITHUB_HEADERS })
        .then(r => r.json())
        .then(issues => Array.isArray(issues) ? issues.map(i => ({
          number: i.number,
          title: i.title,
          url: i.html_url,
          reactions: i.reactions?.total_count || 0,
          comments: i.comments,
          state: i.state,
          created_at: i.created_at,
          labels: i.labels?.map(l => l.name) || []
        })) : []),

      // 3. GitHub — ActivityPub (Ghost's Fediverse bet)
      fetch('https://api.github.com/repos/TryGhost/ActivityPub/issues?state=open&sort=reactions&direction=desc&per_page=10', { headers: GITHUB_HEADERS })
        .then(r => r.json())
        .then(issues => Array.isArray(issues) ? issues.map(i => ({
          number: i.number,
          title: i.title,
          url: i.html_url,
          reactions: i.reactions?.total_count || 0,
          comments: i.comments,
          created_at: i.created_at,
          labels: i.labels?.map(l => l.name) || []
        })) : []),

      // 4. HN — Ghost stories (significant community discussions)
      fetch(`${HN_BASE}/search?query=ghost+cms&tags=story&numericFilters=created_at_i>${ninetyDaysAgo},points>3&hitsPerPage=15`)
        .then(r => r.json())
        .then(d => (d.hits || []).map(h => ({
          id: h.objectID,
          title: h.title,
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
          hn_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
          points: h.points,
          comments: h.num_comments,
          author: h.author,
          created_at: h.created_at
        }))),

      // 5. HN — Ghost comments (comparative sentiment, "Ghost vs X")
      fetch(`${HN_BASE}/search?query=ghost+publishing&tags=comment&numericFilters=created_at_i>${ninetyDaysAgo}&hitsPerPage=10`)
        .then(r => r.json())
        .then(d => (d.hits || []).map(h => ({
          id: h.objectID,
          text: h.comment_text?.replace(/<[^>]+>/g, '').slice(0, 300),
          story_title: h.story_title,
          hn_url: `https://news.ycombinator.com/item?id=${h.objectID}`,
          author: h.author,
          created_at: h.created_at
        }))),

      // 6. Kit (ConvertKit) Changelog — server-rendered HTML
      fetch('https://updates.kit.com/changelog', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ghost-pm-signal)' }
      }).then(r => r.text()).then(html => {
        const entries = [];
        const entryRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
        const titleRegex = /<h\d[^>]*>([\s\S]*?)<\/h\d>/i;
        const dateRegex = /(\w+ \d+,?\s*\d{4})/;
        const categoryRegex = /class="[^"]*tag[^"]*"[^>]*>([^<]+)</i;
        let match;
        while ((match = entryRegex.exec(html)) !== null && entries.length < 8) {
          const content = match[1];
          const titleMatch = titleRegex.exec(content);
          const dateMatch = dateRegex.exec(content);
          const catMatch = categoryRegex.exec(content);
          if (titleMatch) {
            entries.push({
              title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
              date: dateMatch ? dateMatch[1] : null,
              category: catMatch ? catMatch[1].trim() : 'Update',
              url: 'https://updates.kit.com/changelog'
            });
          }
        }
        return entries;
      }),

      // 7. Ghost Changelog RSS
      fetch('https://ghost.org/changelog/rss/')
        .then(r => r.text())
        .then(xml => {
          const items = [];
          const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
          let match;
          while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
            const content = match[1];
            const title = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(content)?.[1] ||
                          /<title>(.*?)<\/title>/.exec(content)?.[1];
            const link = /<link>(.*?)<\/link>/.exec(content)?.[1];
            const pubDate = /<pubDate>(.*?)<\/pubDate>/.exec(content)?.[1];
            const desc = /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/s.exec(content)?.[1]?.replace(/<[^>]+>/g, '').slice(0, 200);
            if (title) items.push({ title: title.trim(), link, pubDate, description: desc?.trim() });
          }
          return items;
        }),

      // 8. Ghost Blog RSS (positioning + ecosystem signals)
      fetch('https://ghost.org/blog/rss/')
        .then(r => r.text())
        .then(xml => {
          const items = [];
          const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
          let match;
          while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
            const content = match[1];
            const title = /<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(content)?.[1] ||
                          /<title>(.*?)<\/title>/.exec(content)?.[1];
            const link = /<link>(.*?)<\/link>/.exec(content)?.[1];
            const pubDate = /<pubDate>(.*?)<\/pubDate>/.exec(content)?.[1];
            if (title) items.push({ title: title.trim(), link, pubDate });
          }
          return items;
        })
    ]);

  const val = (result) => result.status === 'fulfilled' ? result.value : null;

  res.json({
    forum: val(forum),
    github: { features: val(githubFeatures), activitypub: val(githubActivityPub) },
    hn: { stories: val(hnStories), comments: val(hnComments) },
    competitors: { kit: val(kitChangelog) },
    ghost: { changelog: val(ghostChangelog), blog: val(ghostBlog) },
    fetched_at: new Date().toISOString(),
    sources_status: {
      forum: forum.status,
      github: githubFeatures.status,
      activitypub: githubActivityPub.status,
      hn: hnStories.status,
      kit: kitChangelog.status,
      changelog: ghostChangelog.status
    }
  });
}
