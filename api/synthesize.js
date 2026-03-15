export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { data } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const topForumRequests = (data.forum || []).slice(0, 10).map(t =>
    `- "${t.title}" — ${t.votes} votes, ${t.replies} replies (${t.url})`
  ).join('\n');

  const kitFeatures = (data.competitors?.kit || []).slice(0, 6).map(k =>
    `- [${k.category}] ${k.title}${k.date ? ` (${k.date})` : ''}`
  ).join('\n');

  const hnHighlights = (data.hn?.stories || []).slice(0, 5).map(h =>
    `- "${h.title}" — ${h.points} pts, ${h.comments} comments`
  ).join('\n');

  const recentReleases = (data.ghost?.changelog || []).slice(0, 4).map(r =>
    `- ${r.title}${r.pubDate ? ` (${new Date(r.pubDate).toLocaleDateString()})` : ''}`
  ).join('\n');

  const activityPubIssues = (data.github?.activitypub || []).slice(0, 5).map(i =>
    `- "${i.title}" — ${i.reactions} reactions, ${i.comments} comments`
  ).join('\n');

  const systemPrompt = `You are a senior product manager at Ghost (ghost.org), the independent publishing platform.
You are reviewing this week's signals to prepare for a product strategy session.
Your job is to produce a sharp, evidence-based PM brief that helps decide what to build, what to deprioritise, and where competitive pressure is highest.

Rules:
- Be specific. Reference actual feature request titles, vote counts, and competitor moves.
- Be decisive. Don't hedge. A PM needs to make calls.
- Connect dots across sources. A Forum request + a Kit ship = an urgent gap.
- Flag anything ActivityPub/Fediverse-related as a strategic signal, not just a feature request.
- Keep each section tight. This is a briefing, not an essay.

Output exactly these four sections in markdown:

## 🔥 Top 3 Opportunities This Week
For each: what it is, evidence (votes/source), why now, recommended action.

## ⚔️ Competitive Gap Alert
What Kit or other competitors have shipped that Ghost doesn't have. Which Forum requests does this map to? What's the urgency?

## 🛰️ Strategic Signal: ActivityPub & Fediverse
What's moving in Ghost's Fediverse bet. Is momentum accelerating or stalling? What does the community think?

## 🚫 What to Deprioritise
1-2 items in the signal that look urgent but aren't. Why.`;

  const userPrompt = `Here is this week's signal data for Ghost:

**Ghost Forum — Top Feature Requests (by votes):**
${topForumRequests || 'No data available'}

**Kit (ConvertKit) — Recently Shipped:**
${kitFeatures || 'No data available'}

**Hacker News — Recent Ghost Discussions:**
${hnHighlights || 'No data available'}

**Ghost ActivityPub — Open Issues:**
${activityPubIssues || 'No data available'}

**Ghost Releases (recent):**
${recentReleases || 'No data available'}

Generate the PM brief.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    const result = await response.json();

    if (result.error) {
      return res.status(500).json({ error: result.error.message });
    }

    const synthesis = result.content?.[0]?.text || 'Analysis unavailable.';
    res.json({ synthesis, generated_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
