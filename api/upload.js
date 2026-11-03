// Saves Mom's voice recordings into the GitHub repo's voice folder.
// Vercel settings → Environment Variables:
//   GITHUB_TOKEN    fine-grained token with Contents: Read and write on the Littlecat repo
//   UPLOAD_PASSWORD any password you choose; type the same one once in Mom's corner
//   GITHUB_REPO     optional, defaults to amandasonghomes-design/Littlecat
//   GITHUB_BRANCH   optional, defaults to main
const crypto = require("crypto");

const NAME_RE = /^day\d{2}-(char|sentence)\.(m4a|mp3|mp4|aac|wav|webm|ogg)$/;
const MAX_BYTES = 3 * 1024 * 1024;

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const { GITHUB_TOKEN, UPLOAD_PASSWORD } = process.env;
  const repo = process.env.GITHUB_REPO || "amandasonghomes-design/Littlecat";
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!GITHUB_TOKEN || !UPLOAD_PASSWORD)
    return res.status(500).json({ error: "The server isn't set up yet: add GITHUB_TOKEN and UPLOAD_PASSWORD in Vercel." });

  const { password, name, data } = req.body || {};
  if (!password || !same(password, UPLOAD_PASSWORD)) return res.status(401).json({ error: "Wrong server password." });
  if (!NAME_RE.test(name || "")) return res.status(400).json({ error: "Bad file name." });
  if (typeof data !== "string" || data.length * 0.75 > MAX_BYTES) return res.status(413).json({ error: "Recording is too large (3 MB max)." });

  const gh = (path, opts = {}) =>
    fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "littlecat", ...(opts.headers || {}) },
    });

  try {
    const base = name.replace(/\.[^.]+$/, "");
    const list = await gh(`voice?ref=${branch}`);
    const files = list.ok ? await list.json() : [];
    // remove older versions saved with a different extension, so the new one is the one that plays
    for (const f of files) {
      if (f.name !== name && f.name.startsWith(base + ".")) {
        await gh(`voice/${f.name}`, { method: "DELETE", body: JSON.stringify({ message: `Replace ${f.name}`, sha: f.sha, branch }) });
      }
    }
    const existing = files.find((f) => f.name === name);
    const put = await gh(`voice/${name}`, {
      method: "PUT",
      body: JSON.stringify({ message: `Mom's voice: ${name}`, content: data, branch, ...(existing ? { sha: existing.sha } : {}) }),
    });
    if (!put.ok) {
      const t = await put.text();
      return res.status(502).json({ error: "GitHub refused the save. Check the token's permissions.", detail: t.slice(0, 300) });
    }
    return res.status(200).json({ ok: true, path: `voice/${name}` });
  } catch (e) {
    return res.status(502).json({ error: "Couldn't reach GitHub. Try again." });
  }
};
