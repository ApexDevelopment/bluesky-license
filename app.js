// Bluesky License: AT Protocol の公開APIでプロフィールを読み込み、運転免許証風カードを生成する / Load a profile from the public AT Protocol API and generate a driver's-license-style card.
const API = "https://public.api.bsky.app/xrpc";

const $ = (id) => document.getElementById(id);
const canvas = $("license-canvas");
const ctx = canvas.getContext("2d");

let lastData = null;

// Offscreen holographic mask canvas
const maskCanvas = document.createElement("canvas");
maskCanvas.width = 1568;
maskCanvas.height = 984;

// Offscreen card back canvas
const backCanvas = document.createElement("canvas");
backCanvas.width = 1568;
backCanvas.height = 984;

// Offscreen clean front canvas for Three.js
const threeFrontCanvas = document.createElement("canvas");
threeFrontCanvas.width = 1568;
threeFrontCanvas.height = 984;

// Three.js state
let scene, camera, renderer, cardMesh, cardTexture, maskTexture, backTexture, controls;
let threeInitialized = false;
let animationFrameId = null;

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (kind ? " " + kind : "");
}

// ===== i18n (front-end UI only; the card itself always uses English) =====
let LANG = "en";
const L = () => I18N[LANG] || I18N.en;
const I18N = {
  en: {
    tagline: "Turn your Bluesky identity into a driver's-license-style card.",
    ph: "alice.bsky.social",
    issue: "Issue", design: "Design", language: "Language", lang_auto: "Auto",
    avatarFit: "Square avatar (no cropping)",
    th_sky: "Bluesky", th_skyphoto: "Blue Sky photo", th_sunset: "Sunset", th_mint: "Mint", th_cyber: "Cyberpunk", th_gold: "Gold", th_germ: "Germ",
    download: "Download PNG", about: "About / notes",
    a1: "Enter a Bluesky handle (e.g. <code>user.bsky.social</code> or a custom domain) or a DID, then press Issue.",
    a2: "Reads public AT Protocol data: profile, plus your posts / likes / follows (up to the most recent 1000) and the follower graph. No login required.",
    a3: "Stats: Web of Trust (mutual follows), Engagement, Generosity (likes given), Velocity, Streak, Veteran, Mileage, and peak posting hours (UTC).",
    a4: "HANDLE shows a green ✓ when the account is verified (custom-domain handle, or Bluesky verified / trusted-verifier status).",
    a5: "This is not affiliated with Bluesky and is not an official ID.",
    glossary: "Glossary",
    glossaryHtml: `<dl class="glossary">
      <dt>Web of Trust</dt><dd>Mutual follows: people you follow who also follow you back.</dd>
      <dt>Engagement</dt><dd>Total likes + reposts + replies your recent posts received.</dd>
      <dt>Generosity</dt><dd>Total likes you've given to others.</dd>
      <dt>Velocity</dt><dd>Posts per day (total posts ÷ account age).</dd>
      <dt>Streak</dt><dd>Your longest run of consecutive days with at least one post.</dd>
      <dt>Veteran</dt><dd>How long your account has existed.</dd>
      <dt>Mileage</dt><dd>Your total number of posts, similar to an odometer.</dd>
      <dt>Peak (UTC)</dt><dd>The 2-hour window, in UTC, when you post the most.</dd>
      <dt>DID</dt><dd>Your decentralized identifier (<code>did:plc:…</code>), which is the permanent ID behind your handle.</dd>
      <dt>Handle ✓</dt><dd>Your @handle. A green ✓ means verified: a custom-domain handle, or Bluesky verified / trusted-verifier status.</dd>
      <dt>License Class</dt><dd>A rank from your stats: Newcomer → Explorer → Citizen → Veteran.</dd>
      <dt>Sampling</dt><dd>Analysis covers up to your most recent ~1000 posts/likes and up to 2500 follows (for mutuals). Bigger accounts show "+".</dd>
    </dl>`,
    canvasHint: "Enter a handle or DID and press Issue",
    stProfile: "Fetching Bluesky profile...",
    stPosts: (n, m) => `Analyzing posts... ${n}/${m}`,
    stWoT: (n, m) => `Computing Web of Trust... ${n}/${m}`,
    stLikes: "Counting likes given...",
    stAvatar: "Generating avatar / QR...",
    err: (m) => "Error: " + m,
    errEnter: "Enter a handle or DID",
    errNotFound: "Profile not found",
    errDownload: (m) => "Download failed (possible avatar CORS restriction): " + m,
    errCompatibility: (m) => `${m} is restricted. If prompted, click the address bar icon to allow permission, or adjust browser settings.`,
  },
  ja: {
    tagline: "あなたのBlueskyアイデンティティを運転免許証風カードにします。",
    ph: "ハンドル または DID（例: user.bsky.social）",
    issue: "発行", design: "デザイン", language: "言語", lang_auto: "自動",
    avatarFit: "アイコンを正方形で表示（切り取りなし）",
    th_sky: "Bluesky（ブルー）", th_skyphoto: "青空写真", th_sunset: "サンセット", th_mint: "ミント", th_cyber: "サイバーパンク", th_gold: "ゴールド", th_germ: "Germ",
    download: "PNGをダウンロード", about: "このサービスについて / 注意",
    a1: "Blueskyのハンドル（例: <code>user.bsky.social</code> やカスタムドメイン）または DID を入力して「発行」を押してください。",
    a2: "AT Protocol の公開データを読み込みます：プロフィールに加え、あなたの投稿／いいね／フォロー（直近最大1000件）とフォロワーグラフ。ログイン不要。",
    a3: "指標：Web of Trust（相互フォロー）／ Engagement ／ Generosity（付けたいいね）／ Velocity ／ Streak ／ Veteran ＋ Mileage と最も投稿が多い時間帯（UTC）。",
    a4: "アカウントが認証済み（カスタムドメインのハンドル、または Bluesky の verified / trusted-verifier）のとき、HANDLE に緑の ✓ が付きます。",
    a5: "これは<strong>非公式のファンカード</strong>（遊び）です。Blueskyとは無関係で、公的な身分証ではありません。",
    glossary: "カードの用語解説",
    glossaryHtml: `<dl class="glossary">
      <dt>Web of Trust</dt><dd>相互フォロー数。あなたがフォローしていて、相手もあなたをフォローし返している人数。</dd>
      <dt>Engagement</dt><dd>直近の投稿が受け取った いいね＋リポスト＋返信 の合計。</dd>
      <dt>Generosity</dt><dd>あなたが他の人に付けた いいね の総数。</dd>
      <dt>Velocity</dt><dd>1日あたりの投稿数（総投稿 ÷ アカウント日数）。</dd>
      <dt>Streak</dt><dd>1投稿以上した日が連続した最長日数。</dd>
      <dt>Veteran</dt><dd>アカウントの利用期間（古さ）。</dd>
      <dt>Mileage</dt><dd>総投稿数。オドメーター（走行距離）的な表示。</dd>
      <dt>Peak (UTC)</dt><dd>最も投稿が多い2時間帯（UTC・協定世界時）。</dd>
      <dt>DID</dt><dd>分散型ID（<code>did:plc:…</code>）。ハンドルの裏にある不変の識別子。</dd>
      <dt>Handle ✓</dt><dd>あなたの @ハンドル。緑の ✓ は認証済み（カスタムドメインのハンドル、または Bluesky の verified / trusted-verifier）。</dd>
      <dt>License Class</dt><dd>指標から決まるランク：Newcomer → Explorer → Citizen → Veteran。</dd>
      <dt>Sampling（取得上限）</dt><dd>解析は直近およそ1000件の投稿/いいね、相互フォローは最大2500フォローまで。超過は「+」表示。</dd>
    </dl>`,
    canvasHint: "ハンドル または DID を入力して「発行」",
    stProfile: "Blueskyプロフィールを取得中…",
    stPosts: (n, m) => `投稿を解析中… ${n}/${m}`,
    stWoT: (n, m) => `Web of Trust を計算中… ${n}/${m}`,
    stLikes: "付けたいいねを集計中…",
    stAvatar: "アバター / QR を生成中…",
    err: (m) => "エラー: " + m,
    errEnter: "ハンドル または DID を入力してください",
    errNotFound: "プロフィールが見つかりません",
    errDownload: (m) => "ダウンロード失敗（アバター画像のCORS制限の可能性）: " + m,
    errCompatibility: (m) => `${m} が制限されています。確認ダイアログが表示された場合は、アドレスバーのアイコンをクリックして許可するか、ブラウザ設定を調整してください。`,
  },
};
function detectLang() {
  const n = (navigator.language || (navigator.languages && navigator.languages[0]) || "en").toLowerCase();
  return n.startsWith("ja") ? "ja" : "en";
}
function applyLang(choice) {
  LANG = choice === "auto" || !choice ? detectLang() : (I18N[choice] ? choice : "en");
  document.documentElement.lang = LANG;
  const dict = L();
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = dict[el.getAttribute("data-i18n")];
    if (v != null) el.innerHTML = v;
  });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => {
    const v = dict[el.getAttribute("data-i18n-ph")];
    if (v != null) el.placeholder = v;
  });
  if (!lastData) drawPlaceholder();
}

const MAX_RECORDS = 1000; // 解析の取得上限（直近 N 件） / Analysis fetch limit (most recent N records)
const THROTTLE_MS = 80;   // API 連続呼び出しの間隔（公開APIに優しく） / Delay between consecutive API calls to be gentle with the public API
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// DID から PDS エンドポイントを解決 / Resolve the PDS endpoint from a DID
async function resolvePds(did) {
  try {
    if (did.startsWith("did:plc:")) {
      const doc = await fetch(`https://plc.directory/${did}`).then((r) => r.json());
      const svc = (doc.service || []).find((s) => (s.id || "").endsWith("atproto_pds"));
      return svc ? svc.serviceEndpoint : null;
    }
    if (did.startsWith("did:web:")) {
      const host = did.slice("did:web:".length).replace(/:/g, "/");
      const doc = await fetch(`https://${host}/.well-known/did.json`).then((r) => r.json());
      const svc = (doc.service || []).find((s) => (s.id || "").endsWith("atproto_pds"));
      return svc ? svc.serviceEndpoint : null;
    }
  } catch {}
  return null;
}

// PDS の listRecords でコレクションを最大 max 件まで数える（{ count, capped }） / Count collection records via PDS listRecords up to max entries ({ count, capped })
async function countRecords(pds, did, collection, max) {
  let cursor = null, count = 0;
  const pagesMax = Math.ceil(max / 100);
  for (let page = 0; page < pagesMax; page++) {
    const url = `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}&collection=${collection}&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    let j;
    try { j = await fetch(url).then((r) => { if (!r.ok) throw 0; return r.json(); }); } catch { break; }
    const recs = j.records || [];
    count += recs.length;
    cursor = j.cursor;
    if (!cursor || recs.length === 0) return { count, capped: false };
    await sleep(THROTTLE_MS);
  }
  return { count, capped: true };
}

// 自分の投稿（リポスト除外）を最大 max 件取得 → タイムスタンプとエンゲージメント / Fetch up to max of the user's own posts (excluding reposts), with timestamps and engagement
async function fetchAuthorPosts(did, max) {
  let cursor = null;
  const posts = [];
  const pagesMax = Math.ceil(max / 100);
  for (let page = 0; page < pagesMax; page++) {
    setStatus(L().stPosts(posts.length, max));
    const url = `${API}/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(did)}&limit=100&filter=posts_with_replies` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    let j;
    try { j = await fetch(url).then((r) => r.json()); } catch { break; }
    for (const it of (j.feed || [])) {
      if (it.reason) continue; // リポストは除外 / Exclude reposts
      const p = it.post;
      if (!p || !p.author || p.author.did !== did) continue;
      const ts = Date.parse((p.record && p.record.createdAt) || p.indexedAt);
      if (!isFinite(ts)) continue;
      posts.push({ ts: Math.floor(ts / 1000), eng: (p.likeCount || 0) + (p.repostCount || 0) + (p.replyCount || 0) });
      if (posts.length >= max) return posts;
    }
    cursor = j.cursor;
    if (!cursor) break;
    await sleep(THROTTLE_MS);
  }
  return posts;
}

// フォロー/フォロワーの DID 配列を取得（最大 max 件） / Fetch follow/follower DID lists up to max entries
async function fetchGraphList(method, did, max) {
  let cursor = null;
  const out = [];
  const key = method === "getFollows" ? "follows" : "followers";
  const pagesMax = Math.ceil(max / 100);
  for (let page = 0; page < pagesMax; page++) {
    const url = `${API}/app.bsky.graph.${method}?actor=${encodeURIComponent(did)}&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
    let j;
    try { j = await fetch(url).then((r) => r.json()); } catch { break; }
    for (const a of (j[key] || [])) { out.push(a.did); if (out.length >= max) return out; }
    cursor = j.cursor;
    if (!cursor) break;
    await sleep(THROTTLE_MS);
  }
  return out;
}

// WoT＝相互フォロー数。小さい側（通常はフォロー数）を全取得し getRelationships で相互判定。 / WoT is the mutual-follow count; fetch the smaller side (usually follows) and classify mutuals via getRelationships.
// → フォロワー数百万の巨大アカウントでも、フォロー数が常識的なら正確に出せる。 / This stays accurate even for accounts with millions of followers, as long as their follow count is still manageable.
const WOT_CAP = 2500;
async function computeWoT(did, followsCount, followersCount) {
  const useFollows = (followsCount || 0) <= (followersCount || 0);
  const method = useFollows ? "getFollows" : "getFollowers";
  const list = await fetchGraphList(method, did, WOT_CAP);
  let mutual = 0;
  for (let i = 0; i < list.length; i += 30) {
    setStatus(L().stWoT(Math.min(i + 30, list.length), list.length));
    const batch = list.slice(i, i + 30);
    const qs = batch.map((d) => "others=" + encodeURIComponent(d)).join("&");
    let j;
    try { j = await fetch(`${API}/app.bsky.graph.getRelationships?actor=${encodeURIComponent(did)}&${qs}`).then((r) => r.json()); } catch { continue; }
    for (const rel of (j.relationships || [])) {
      if (useFollows ? rel.followedBy : rel.following) mutual++;
    }
    await sleep(THROTTLE_MS);
  }
  return { wot: mutual, capped: list.length >= WOT_CAP };
}

// 最長連続投稿日数（UTC日付ベース） / Longest streak of consecutive posting days (UTC date basis)
function longestStreak(timestamps) {
  const days = [...new Set(timestamps.map((t) => Math.floor(t / 86400)))].sort((a, b) => a - b);
  if (!days.length) return 0;
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) { cur++; best = Math.max(best, cur); } else { cur = 1; }
  }
  return best;
}
// 最も投稿が多い2時間帯（UTC） / Two-hour UTC window with the most posts
function peakBand(timestamps) {
  if (!timestamps.length) return "—";
  const h = new Array(24).fill(0);
  for (const t of timestamps) h[new Date(t * 1000).getUTCHours()]++;
  let bi = 0, bv = -1;
  for (let i = 0; i < 24; i++) { const v = h[i] + h[(i + 1) % 24]; if (v > bv) { bv = v; bi = i; } }
  const p = (n) => String(n).padStart(2, "0");
  return `${p(bi)}-${p((bi + 2) % 24)} UTC`;
}

// ===== Data fetching and analysis =====
async function fetchProfile(actor) {
  const isDebug = new URLSearchParams(window.location.search).get("debug") === "1";
  setStatus(L().stProfile);
  const p = await fetch(`${API}/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`)
    .then((r) => { if (!r.ok) throw new Error(L().errNotFound); return r.json(); });
  const did = p.did;

  const createdAt = p.createdAt ? Math.floor(Date.parse(p.createdAt) / 1000) : null;
  const lastSeen = p.indexedAt ? Math.floor(Date.parse(p.indexedAt) / 1000) : null;
  const posts = p.postsCount || 0;
  const ageDays = createdAt ? Math.max(1, (Date.now() / 1000 - createdAt) / 86400) : 1;

  // 投稿解析（エンゲージメント・連続日数・ピーク時間帯） / Post analysis: engagement, streak length, and peak posting time
  const postRecs = isDebug ? [] : await fetchAuthorPosts(did, MAX_RECORDS);
  const engagement = postRecs.reduce((a, r) => a + r.eng, 0);
  const streak = longestStreak(postRecs.map((r) => r.ts));
  const peakUTC = peakBand(postRecs.map((r) => r.ts));
  const postsCapped = postRecs.length >= MAX_RECORDS;

  // WoT (相互フォロー): 小さい側を全取得して getRelationships で相互判定 / Fetch the smaller side and detect mutuals through getRelationships
  const wotRes = isDebug ? { wot: 0, capped: false } : await computeWoT(did, p.followsCount, p.followersCount);
  const wot = wotRes.wot;
  const wotCapped = wotRes.capped;

  // Generosity (付けたいいね総数): repo を直接参照 / Total likes given, counted directly from the repo
  let likesGiven = 0, likesCapped = false;
  const pds = await resolvePds(did);
  if (pds && !isDebug) {
    setStatus(L().stLikes);
    const r = await countRecords(pds, did, "app.bsky.feed.like", MAX_RECORDS);
    likesGiven = r.count;
    likesCapped = r.capped;
  }

  // 検証：カスタムドメイン handle（= ドメイン認証）または trusted verifier / verified / Verification: custom-domain handle (domain-verified) or trusted verifier / verified
  const v = p.verification || {};
  const customDomain = !!p.handle && !/\.bsky\.social$/i.test(p.handle) && p.handle !== "handle.invalid";
  const verified = customDomain || v.verifiedStatus === "valid" || v.trustedVerifierStatus === "valid";

  return {
    did,
    handle: p.handle || "",
    name: p.displayName || p.handle || "NO NAME",
    picture: p.avatar || "",
    posts,                          // Mileage（オドメーター） / Mileage (odometer-style total posts)
    velocity: posts / ageDays,      // 1日あたり投稿数 / Posts per day
    engagement, postsCapped,
    streak,
    peakUTC,
    wot, wotCapped,
    likesGiven, likesCapped, pdsOk: !!pds,
    pds: pds || "https://bsky.social",
    createdAt,
    lastSeen: lastSeen || createdAt || Math.floor(Date.now() / 1000),
    verified,
  };
}

// ===== Rank (based on real data) =====
function computeRank(d) {
  const ageY = d.createdAt ? (Date.now() / 1000 - d.createdAt) / (365.25 * 24 * 3600) : 0;
  if (d.wot >= 300 || ageY >= 3) return "BLUESKY VETERAN";
  if (d.wot >= 50 || d.posts >= 1000) return "BLUESKY CITIZEN";
  if (d.posts >= 50 || d.engagement >= 100) return "BLUESKY EXPLORER";
  return "BLUESKY NEWCOMER";
}

// 実数 → ★(1..5)。log スケール。 / Convert a numeric value to a 1..5 star rating on a log scale.
function starFrom(x, k, base = 1) {
  const n = Math.round(Math.log10((x || 0) + 1) * k) + base;
  return Math.max(1, Math.min(5, n));
}
// ステータス（6項目・すべて実データ）。2×3グリッドで表示。各 {label, n, icon} / Status metrics: six real-data categories shown in a 2x3 grid as {label, n, icon}
function computeStars(d) {
  const ageY = d.createdAt ? (Date.now() / 1000 - d.createdAt) / (365.25 * 24 * 3600) : 0;
  return [
    { label: "Web of Trust", icon: "shield", n: starFrom(d.wot, 1.4) },
    { label: "Engagement", icon: "bolt", n: starFrom(d.engagement, 1.2) },
    { label: "Generosity", icon: "heart", n: starFrom(d.likesGiven, 1.2) },
    { label: "Velocity", icon: "relay", n: starFrom(d.velocity, 2.5) },
    { label: "Streak", icon: "bubble", n: starFrom(d.streak, 2.2) },
    // Veteran：Bluesky は最長でも ~3.4 年なので、3年以上＝星5になるよう調整 / Bluesky is only about 3.4 years old at most, so 3+ years maps to 5 stars
    { label: "Veteran", icon: "person", n: ageY >= 3 ? 5 : ageY >= 2 ? 4 : ageY >= 1 ? 3 : ageY >= 0.25 ? 2 : 1 },
  ];
}

// ===== Image loading (fall back to the weserv proxy for CORS issues) =====
function loadImage(url, { crossOrigin = true } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
async function loadAvatar(url) {
  if (!url) return null;
  try { return await loadImage(url); } catch {}
  try {
    const proxied = "https://images.weserv.nl/?url=" + encodeURIComponent(url) + "&w=480&h=480&fit=cover";
    return await loadImage(proxied);
  } catch {}
  return null;
}

// 背景写真（同一オリジンのアセット）をキャッシュ付きでロード / Load same-origin background photos with caching
const _bgCache = {};
async function getBgPhoto(src) {
  if (!src) return null;
  if (src in _bgCache) return _bgCache[src];
  try { _bgCache[src] = await loadImage(src, { crossOrigin: false }); }
  catch { _bgCache[src] = null; }
  return _bgCache[src];
}

// ===== QR code generation (linking to the bsky.app profile) =====
async function makeQR(text) {
  try {
    const QR = (await import("https://esm.sh/qrcode@1.5.4")).default;
    const dataUrl = await QR.toDataURL(text, { margin: 1, width: 300, errorCorrectionLevel: "H", color: { dark: "#16233a", light: "#ffffff" } });
    return await loadImage(dataUrl);
  } catch {
    return null;
  }
}

// ===== Drawing utilities =====
function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function fmtISO(ts) {
  const dt = new Date(ts * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function licenseNo(d) {
  const h = d.did || d.handle || "";
  let n = 0; for (const ch of h) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return `BSKY-${String(n % 10000).padStart(4, "0")}-${new Date().getFullYear()}`;
}
function hexPath(c, cx, cy, r) {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.closePath();
}
function guilloche(c, cx, cy, R, amp, k, turns, color, alpha, lw = 1) {
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.beginPath();
  const steps = turns * 160;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * turns * Math.PI * 2;
    const r = R + amp * Math.cos(k * t);
    const x = cx + r * Math.cos(t), y = cy + r * Math.sin(t);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.stroke();
  c.restore();
}
// 蝶（Bluesky）グリフ / Butterfly (Bluesky) glyph
function drawButterfly(c, cx, cy, s, col) {
  c.save();
  c.translate(cx, cy);
  const scale = (s * 1.68) / 64;
  c.scale(scale, scale);
  c.translate(-32, -31.5);
  c.fillStyle = col;
  const p = new Path2D("M14.6366 7.81116C21.8491 13.3459 29.607 24.5681 32.4553 30.5905C35.3038 24.5685 43.0612 13.3458 50.2739 7.81116C55.4781 3.81752 63.9102 0.727462 63.9102 10.5602C63.9102 12.5239 62.8087 27.0565 62.1627 29.4158C59.9171 37.6184 51.7344 39.7106 44.4557 38.4443C57.1787 40.6577 60.4153 47.9893 53.4255 55.3209C40.1504 69.2451 34.3454 51.8273 32.8572 47.3642C32.4543 46.1554 32.4558 46.1554 32.0529 47.3642C30.5654 51.8273 24.7605 69.2455 11.4847 55.3209C4.49475 47.9893 7.73124 40.6573 20.4544 38.4443C13.1755 39.7106 4.99271 37.6184 2.74748 29.4158C2.10144 27.0563 1 12.5237 1 10.5602C1 0.727462 9.43267 3.81752 14.6366 7.81116Z");
  c.fill(p);
  c.restore();
}
// 六角バッジ＋白い蝶（ブランドロゴ） / Hex badge with white butterfly (brand logo)
function drawHexLogo(c, cx, cy, s, colA, colB) {
  c.save();
  hexPath(c, cx, cy, s);
  if (typeof colA === "string") {
    const g = c.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
    g.addColorStop(0, colA);
    g.addColorStop(1, colB);
    c.fillStyle = g;
  } else {
    c.fillStyle = colA;
  }
  c.fill();
  c.lineWidth = Math.max(1, s * 0.05);
  c.strokeStyle = "rgba(255,255,255,0.55)";
  c.stroke();
  drawButterfly(c, cx, cy, s * 0.66, "#ffffff");
  c.restore();
}
// 円バッジ＋白い蝶（QRコード用ブランドロゴ） / Circle badge with white butterfly (brand logo for QR code)
function drawCircleLogo(c, cx, cy, r, colA, colB) {
  c.save();
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  if (typeof colA === "string") {
    const g = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, colA);
    g.addColorStop(1, colB);
    c.fillStyle = g;
  } else {
    c.fillStyle = colA;
  }
  c.fill();
  c.lineWidth = Math.max(1, r * 0.05);
  c.strokeStyle = "rgba(255,255,255,0.55)";
  c.stroke();
  drawButterfly(c, cx, cy, r * 0.66, "#ffffff");
  c.restore();
}
// Barcode drawing using JsBarcode
async function drawBarcode(c, text, x, y, width, height, color) {
  try {
    const JsBarcode = (await import("https://esm.sh/jsbarcode@3.11.6")).default;
    const bcCanvas = document.createElement("canvas");
    JsBarcode(bcCanvas, text, {
      format: "CODE128",
      lineColor: color,
      background: "transparent",
      width: 3,
      height: height,
      displayValue: false,
      margin: 0
    });
    c.drawImage(bcCanvas, x, y, width, height);
  } catch (e) {
    console.error("Barcode generation failed:", e);
    // Draw a fallback pattern if library fails to load
    c.fillStyle = color;
    c.fillRect(x, y, width, height);
  }
}

// Render the card back
async function renderCardBack(d, theme = "sky") {
  const t = THEMES[theme] || THEMES.sky;
  const c = backCanvas.getContext("2d");
  const W = backCanvas.width, H = backCanvas.height;
  c.clearRect(0, 0, W, H);
  c.lineCap = "round";
  c.lineJoin = "round";

  // Background gradient
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, t.paper[0]);
  bg.addColorStop(0.5, t.paper[1]);
  bg.addColorStop(1, t.paper[2]);
  roundRect(c, 0, 0, W, H, 24);
  c.fillStyle = bg;
  c.fill();

  // Background waves and security patterns
  {
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const g = off.getContext("2d");
    g.lineCap = "round"; g.lineJoin = "round";
    for (let i = 0; i < 78; i++) {
      const yy = 26 + i * 12.4;
      g.strokeStyle = i % 2 ? t.line : t.accent;
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 24; x <= W - 24; x += 5) {
        const y2 = yy + Math.sin(x / 44 + i * 0.55) * 7 + Math.sin(x / 128 - i * 0.32) * 5 + Math.cos(x / 320 + i * 0.12) * 3;
        x === 24 ? g.moveTo(x, y2) : g.lineTo(x, y2);
      }
      g.stroke();
    }
    for (let j = 0; j < 50; j++) {
      const xx = 24 + j * 31;
      g.strokeStyle = j % 2 ? t.accent : t.line;
      g.lineWidth = 1;
      g.beginPath();
      for (let y = 24; y <= H - 24; y += 6) {
        const x2 = xx + Math.sin(y / 50 + j * 0.5) * 6 + Math.sin(y / 150 - j * 0.3) * 4;
        y === 24 ? g.moveTo(x2, y) : g.lineTo(x2, y);
      }
      g.stroke();
    }
    guilloche(g, W * 0.20, H * 0.34, 230, 74, 9, 26, t.accent, 1, 1);
    guilloche(g, W * 0.20, H * 0.34, 150, 52, 14, 26, t.accent2, 1, 1);
    guilloche(g, W * 0.50, H * 0.50, 380, 104, 7, 30, t.accent, 1, 1);
    guilloche(g, W * 0.50, H * 0.50, 250, 84, 17, 26, t.accent2, 1, 1);
    guilloche(g, W * 0.83, H * 0.72, 210, 66, 11, 24, t.accent2, 1, 1);
    guilloche(g, W * 0.83, H * 0.72, 130, 46, 16, 24, t.accent, 1, 1);
    for (const [px, py] of [[110, 120], [W - 120, 120], [120, H - 110], [W - 120, H - 110]]) {
      guilloche(g, px, py, 70, 26, 13, 18, t.accent, 1, 1);
    }
    g.globalCompositeOperation = "destination-out";
    const fade = g.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0.0, "rgba(0,0,0,0)");
    fade.addColorStop(1.0, "rgba(0,0,0,0.5)");
    g.fillStyle = fade;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
    c.save();
    c.globalAlpha = 0.20;
    c.drawImage(off, 0, 0);
    c.restore();
  }

  // Subtle border outline
  c.save();
  c.strokeStyle = t.border;
  c.lineWidth = 6;
  c.globalAlpha = 0.2;
  roundRect(c, 20, 20, W - 40, H - 40, 16);
  c.stroke();
  c.restore();

  // Top header title
  c.fillStyle = t.accent;
  c.font = "800 32px 'Inter',sans-serif";
  c.textAlign = "center";
  c.fillText("AT PROTOCOL IDENTITY CARD", W / 2, 100);

  // Divider line
  c.beginPath();
  c.moveTo(100, 135);
  c.lineTo(W - 100, 135);
  c.strokeStyle = t.line;
  c.lineWidth = 2;
  c.stroke();

  // Draw Ghost Avatar
  const squareAvatar = !!$("square-avatar")?.checked;
  const w = 240;
  const h = squareAvatar ? 240 : 312;
  const x = 160;
  const y = 220 + (320 - h) / 2; // vertically center inside Y=220..540
  
  if (d._avatar) {
    const img = d._avatar;
    const ratio = squareAvatar
      ? Math.min(w / img.width, h / img.height)
      : Math.max(w / img.width, h / img.height);
    const dw = img.width * ratio, dh = img.height * ratio;
    c.save();
    c.filter = "grayscale(100%)";
    c.globalAlpha = 0.18;
    roundRect(c, x, y, w, h, 12);
    c.clip();
    c.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    c.restore();
  }

  // Draw thin border around ghost avatar frame
  c.save();
  c.strokeStyle = t.border;
  c.lineWidth = 2;
  c.globalAlpha = 0.15;
  roundRect(c, x, y, w, h, 12);
  c.stroke();
  c.restore();

  // Metadata Fields on the right side of the avatar
  const fieldX = 460;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";

  const didParts = (d.did || "").split(":");
  const didMethod = didParts.length > 1 ? didParts[1].toUpperCase() : "PLC";

  const rows = [
    { label: "HOLDER", val: d.name + (d.handle ? " (@" + d.handle + ")" : "") },
    { label: "ISSUING AUTHORITY", val: d.pds || "https://bsky.social" },
    { label: "DOCUMENT TYPE", val: `VERIFIED DID RECORD (DID:${didMethod})` }
  ];

  let rowY = 240;
  for (const row of rows) {
    c.fillStyle = t.sub;
    c.font = "700 18px 'Inter',sans-serif";
    c.fillText(row.label, fieldX, rowY);

    c.fillStyle = t.ink;
    c.font = "600 24px 'JetBrains Mono',monospace";
    // Truncate value if too long to prevent spillover
    let valText = row.val;
    if (c.measureText(valText).width > 900) {
      while (valText.length > 5 && c.measureText(valText + "...").width > 900) {
        valText = valText.slice(0, -1);
      }
      valText += "...";
    }
    c.fillText(valText, fieldX, rowY + 34);

    rowY += 105;
  }

  // Draw barcode at the bottom
  const bcText = d.did || "";
  await drawBarcode(c, bcText, 150, 630, W - 300, 130, t.ink);

  // Draw DID text under the barcode
  c.fillStyle = t.sub;
  c.textAlign = "center";
  c.textBaseline = "top";
  c.font = "600 22px 'JetBrains Mono',monospace";
  c.fillText(bcText, W / 2, 775);

  // Disclaimer text at the very bottom
  c.fillStyle = t.sub;
  c.font = "500 16px 'Inter',sans-serif";
  c.globalAlpha = 0.7;
  c.fillText("This is not an official identity card.", W / 2, 850);
  c.globalAlpha = 1;
}

function drawShieldPath(c, cx, cy, w, h) {
  const x = cx - w / 2, y = cy - h / 2;
  c.beginPath();
  c.moveTo(cx, y);
  c.lineTo(x + w, y + h * 0.2);
  c.lineTo(x + w, y + h * 0.55);
  c.quadraticCurveTo(x + w, y + h * 0.9, cx, y + h);
  c.quadraticCurveTo(x, y + h * 0.9, x, y + h * 0.55);
  c.lineTo(x, y + h * 0.2);
  c.closePath();
}
function drawShield(c, cx, cy, w, h, t) {
  c.save();
  const x = cx - w / 2, y = cy - h / 2;
  drawShieldPath(c, cx, cy, w, h);
  const g = c.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#dfeeff");
  g.addColorStop(0.5, "#dce8ff");
  g.addColorStop(1, "#e2f3ff");
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = t.border;
  c.globalAlpha = 0.75;
  c.stroke();
  c.globalAlpha = 1;

  // Smaller lock icon near the top of the shield
  const lockScale = 0.55;
  const lw = w * 0.26 * lockScale;
  const lh = h * 0.2 * lockScale;
  const lx = cx - lw / 2;
  const ly = cy - h * 0.18;
  c.fillStyle = t.accent;
  roundRect(c, lx, ly, lw, lh, 4);
  c.fill();
  c.lineWidth = w * 0.07 * lockScale;
  c.strokeStyle = t.accent;
  c.beginPath();
  c.arc(cx, ly, lw * 0.32, Math.PI, 0);
  c.stroke();

  // "VERIFIED" and "DID DOCUMENT" text right over top of the shield
  c.fillStyle = t.accent2;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = "800 22px 'Inter',sans-serif";
  c.fillText("VERIFIED", cx, cy + h * 0.06);
  c.font = "800 17px 'Inter',sans-serif";
  c.fillText("DID DOCUMENT", cx, cy + h * 0.20);

  c.restore();
}

function drawHoloOverlay(c, cx, cy, w, h) {
  c.save();
  drawShieldPath(c, cx, cy, w, h);
  c.clip();
  const x = cx - w / 2, y = cy - h / 2;
  const hg = c.createLinearGradient(x - 50, y - 50, x + w + 50, y + h + 50);
  hg.addColorStop(0.0, "rgba(255, 0, 0, 0.0)");
  hg.addColorStop(0.15, "rgba(255, 0, 0, 0.14)");
  hg.addColorStop(0.3, "rgba(255, 127, 0, 0.14)");
  hg.addColorStop(0.45, "rgba(255, 255, 0, 0.14)");
  hg.addColorStop(0.6, "rgba(0, 255, 0, 0.14)");
  hg.addColorStop(0.75, "rgba(0, 0, 255, 0.14)");
  hg.addColorStop(0.9, "rgba(139, 0, 255, 0.14)");
  hg.addColorStop(1.0, "rgba(139, 0, 255, 0.0)");
  c.fillStyle = hg;
  c.fill();

  const hg2 = c.createLinearGradient(x, y, x + w, y + h);
  hg2.addColorStop(0.35, "rgba(255,255,255,0)");
  hg2.addColorStop(0.5, "rgba(255,255,255,0.25)");
  hg2.addColorStop(0.65, "rgba(255,255,255,0)");
  c.fillStyle = hg2;
  c.fill();
  c.restore();
}

function drawStatIcon(c, name, x, y, s, color) {
  c.save();
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineWidth = s * 0.12;
  c.lineCap = "round";
  c.lineJoin = "round";
  if (name === "bubble") {
    roundRect(c, x, y, s, s * 0.78, s * 0.22);
    c.fill();
    c.beginPath();
    c.moveTo(x + s * 0.25, y + s * 0.72);
    c.lineTo(x + s * 0.18, y + s);
    c.lineTo(x + s * 0.45, y + s * 0.72);
    c.closePath();
    c.fill();
  } else if (name === "relay") {
    const pts = [[x + s * 0.5, y + s * 0.16], [x + s * 0.14, y + s * 0.84], [x + s * 0.86, y + s * 0.84]];
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[1][0], pts[1][1]);
    c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[2][0], pts[2][1]);
    c.moveTo(pts[1][0], pts[1][1]); c.lineTo(pts[2][0], pts[2][1]);
    c.stroke();
    for (const p of pts) { c.beginPath(); c.arc(p[0], p[1], s * 0.13, 0, Math.PI * 2); c.fill(); }
  } else if (name === "shield") {
    c.beginPath();
    c.moveTo(x + s * 0.5, y);
    c.lineTo(x + s, y + s * 0.22);
    c.lineTo(x + s, y + s * 0.55);
    c.quadraticCurveTo(x + s, y + s * 0.92, x + s * 0.5, y + s);
    c.quadraticCurveTo(x, y + s * 0.92, x, y + s * 0.55);
    c.lineTo(x, y + s * 0.22);
    c.closePath();
    c.fill();
    c.strokeStyle = "#fff";
    c.lineWidth = s * 0.1;
    c.beginPath();
    c.moveTo(x + s * 0.3, y + s * 0.52);
    c.lineTo(x + s * 0.45, y + s * 0.68);
    c.lineTo(x + s * 0.72, y + s * 0.34);
    c.stroke();
  } else if (name === "bolt") {
    c.beginPath();
    c.moveTo(x + s * 0.56, y);
    c.lineTo(x + s * 0.16, y + s * 0.56);
    c.lineTo(x + s * 0.46, y + s * 0.56);
    c.lineTo(x + s * 0.4, y + s);
    c.lineTo(x + s * 0.84, y + s * 0.42);
    c.lineTo(x + s * 0.52, y + s * 0.42);
    c.closePath();
    c.fill();
  } else if (name === "person") {
    c.beginPath();
    c.arc(x + s * 0.5, y + s * 0.28, s * 0.22, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(x + s * 0.1, y + s);
    c.quadraticCurveTo(x + s * 0.5, y + s * 0.5, x + s * 0.9, y + s);
    c.closePath();
    c.fill();
  } else if (name === "heart") {
    c.beginPath();
    c.moveTo(x + s * 0.5, y + s * 0.9);
    c.bezierCurveTo(x + s * 0.14, y + s * 0.68, x, y + s * 0.42, x, y + s * 0.24);
    c.bezierCurveTo(x, y + s * 0.08, x + s * 0.12, y, x + s * 0.28, y);
    c.bezierCurveTo(x + s * 0.4, y, x + s * 0.5, y + s * 0.1, x + s * 0.5, y + s * 0.2);
    c.bezierCurveTo(x + s * 0.5, y + s * 0.1, x + s * 0.6, y, x + s * 0.72, y);
    c.bezierCurveTo(x + s * 0.88, y, x + s, y + s * 0.08, x + s, y + s * 0.24);
    c.bezierCurveTo(x + s, y + s * 0.42, x + s * 0.86, y + s * 0.68, x + s * 0.5, y + s * 0.9);
    c.closePath();
    c.fill();
  }
  c.restore();
}
function drawStarRating(c, x, y, n, size, fill, empty) {
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.font = `${size}px 'Inter','Apple Color Emoji',sans-serif`;
  for (let i = 0; i < 5; i++) {
    c.fillStyle = i < n ? fill : empty;
    c.fillText(i < n ? "★" : "☆", x + i * size * 0.96, y);
  }
}
function drawPill(c, text, x, y, { bg, fg, font, padX = 14, h = 34, r = 7 }) {
  c.font = font;
  c.textAlign = "left";
  c.textBaseline = "middle";
  const w = c.measureText(text).width + padX * 2;
  roundRect(c, x, y, w, h, r);
  c.fillStyle = bg;
  c.fill();
  c.fillStyle = fg;
  c.fillText(text, x + padX, y + h / 2 + 1);
  return w;
}
// 車アイコン（Material 未読込時のフォールバック） / Airplane icon fallback when Material Symbols is unavailable
function drawAirplane(c, x, cy, color) {
  c.save();
  c.translate(x + 28, cy);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-24, -4);
  c.lineTo(4, -4);
  c.quadraticCurveTo(18, -4, 24, 0);
  c.quadraticCurveTo(18, 4, 4, 4);
  c.lineTo(-24, 4);
  c.closePath();
  c.fill();
  
  c.beginPath();
  c.moveTo(-6, -4);
  c.lineTo(-12, -22);
  c.lineTo(-4, -22);
  c.lineTo(6, -4);
  c.lineTo(6, 4);
  c.lineTo(-4, 22);
  c.lineTo(-12, 22);
  c.lineTo(-6, 4);
  c.closePath();
  c.fill();

  c.beginPath();
  c.moveTo(-20, -2);
  c.lineTo(-24, -10);
  c.lineTo(-21, -10);
  c.lineTo(-15, -2);
  c.lineTo(-15, 2);
  c.lineTo(-21, 10);
  c.lineTo(-24, 10);
  c.lineTo(-20, 2);
  c.closePath();
  c.fill();
  c.restore();
}

const THEMES = {
  sky:      { accent: "#1185fe", accent2: "#0a63d6", ink: "#10243f", sub: "#3a5680", line: "#9fc0ef", border: "#1185fe", gold1: "#dcc07f", gold2: "#b48a3c", paper: ["#eef5ff", "#eef1fc", "#f2f6ff"] },
  // 青空写真モード（ユーザー撮影の写真を薄く敷く） / Blue-sky photo mode with a lightly overlaid user-shot background image
  skyphoto: { accent: "#0a63d6", accent2: "#0a4fb0", ink: "#0e244f", sub: "#33507e", line: "#bcd6f5", border: "#1185fe", gold1: "#dcc07f", gold2: "#b48a3c", paper: ["#f4f9ff", "#eef5ff", "#f6fbff"], photo: "bg/sky1.jpg", photoAlpha: 0.34 },
  sunset:   { accent: "#e2603a", accent2: "#c23b6a", ink: "#3a1f24", sub: "#7a4a52", line: "#f0b9a0", border: "#e2603a", gold1: "#e8c074", gold2: "#c98a3a", paper: ["#fff3ec", "#ffeef0", "#fff0e6"] },
  mint:     { accent: "#10a37f", accent2: "#0a7d8c", ink: "#0e2a26", sub: "#3a6a60", line: "#a8e0d0", border: "#10a37f", gold1: "#dcc07f", gold2: "#b48a3c", paper: ["#eefbf6", "#eef6f4", "#f2fbf8"] },
  cyber:    { accent: "#0a9fc0", accent2: "#d6249f", ink: "#142539", sub: "#3a5066", line: "#9bd3e2", border: "#0a9fc0", gold1: "#bcae72", gold2: "#8c7a38", paper: ["#eafaff", "#eef0fb", "#fde8f6"] },
  gold:     { accent: "#b4863a", accent2: "#9a6b1e", ink: "#2a2206", sub: "#5a4d22", line: "#dcc79a", border: "#b4863a", gold1: "#e6cd84", gold2: "#b4863a", paper: ["#fffaf0", "#fff4e2", "#fdeed6"] },
  germ:     { accent: "#00b2ff", accent2: "#00e676", ink: "#051d30", sub: "#2c4c64", line: "#7de1ff", border: "#00b2ff", gold1: "#dcc07f", gold2: "#b48a3c", paper: ["#c0ecff", "#a8f9d0", "#bbfce7"] },
};

// ===== Card rendering (premium holographic look / English labels) =====
async function drawCardFaceToCanvas(targetCanvas, d, theme = "sky", useHolo = false, updateMask = false) {
  const t = THEMES[theme] || THEMES.sky;
  const c = targetCanvas.getContext("2d");
  const W = targetCanvas.width, H = targetCanvas.height; // 1568 x 984
  c.clearRect(0, 0, W, H);
  c.lineCap = "round";
  c.lineJoin = "round";

  let mCtx = null;
  if (updateMask) {
    mCtx = maskCanvas.getContext("2d");
    mCtx.clearRect(0, 0, W, H);
  }

  let flightFont = false;
  try {
    await document.fonts.load('400 46px "Material Symbols Outlined"', "flight");
    flightFont = document.fonts.check('400 46px "Material Symbols Outlined"');
  } catch {}

  // ===== Background (iridescent) =====
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, t.paper[0]);
  bg.addColorStop(0.5, t.paper[1]);
  bg.addColorStop(1, t.paper[2]);
  roundRect(c, 0, 0, W, H, 24);
  c.fillStyle = bg;
  c.fill();

  c.save();
  roundRect(c, 0, 0, W, H, 24);
  c.clip();

  // 背景写真（テーマに photo があれば、cover で薄く敷く） / If the theme has a photo, draw it softly with cover sizing
  if (t.photo) {
    const ph = await getBgPhoto(t.photo);
    if (ph) {
      c.save();
      c.globalAlpha = t.photoAlpha != null ? t.photoAlpha : 0.25;
      const ratio = Math.max(W / ph.width, H / ph.height);
      const dw = ph.width * ratio, dh = ph.height * ratio;
      c.drawImage(ph, (W - dw) / 2, (H - dh) / 2, dw, dh);
      c.restore();
    }
  }

  const sheen = c.createLinearGradient(0, H, W, 0);
  sheen.addColorStop(0.0, "rgba(120,180,255,0.10)");
  sheen.addColorStop(0.35, "rgba(150,200,255,0.06)");
  sheen.addColorStop(0.6, "rgba(180,210,255,0.07)");
  sheen.addColorStop(0.85, "rgba(160,230,255,0.06)");
  sheen.addColorStop(1.0, "rgba(200,225,255,0.08)");
  c.fillStyle = sheen;
  c.fillRect(0, 0, W, H);

  // 地紋：別キャンバスに不透明で一度だけ描き、最後に1回だけ薄く合成（端末差を防ぐ） / Draw the security pattern once on a separate canvas, then blend it back once to reduce device-specific differences
  {
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const g = off.getContext("2d");
    g.lineCap = "round"; g.lineJoin = "round";

    let holoGrad = null;
    if (useHolo) {
      holoGrad = g.createLinearGradient(0, 0, W, H);
      holoGrad.addColorStop(0.0, "rgba(255, 90, 90, 0.95)");
      holoGrad.addColorStop(0.15, "rgba(255, 170, 70, 0.95)");
      holoGrad.addColorStop(0.3, "rgba(240, 240, 70, 0.95)");
      holoGrad.addColorStop(0.45, "rgba(70, 230, 110, 0.95)");
      holoGrad.addColorStop(0.6, "rgba(70, 200, 240, 0.95)");
      holoGrad.addColorStop(0.75, "rgba(80, 100, 255, 0.95)");
      holoGrad.addColorStop(0.9, "rgba(180, 80, 255, 0.95)");
      holoGrad.addColorStop(1.0, "rgba(255, 100, 230, 0.95)");
    }

    for (let i = 0; i < 78; i++) {
      const yy = 26 + i * 12.4;
      g.strokeStyle = useHolo ? holoGrad : (i % 2 ? t.line : t.accent);
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 24; x <= W - 24; x += 5) {
        const y2 = yy + Math.sin(x / 44 + i * 0.55) * 7 + Math.sin(x / 128 - i * 0.32) * 5 + Math.cos(x / 320 + i * 0.12) * 3;
        x === 24 ? g.moveTo(x, y2) : g.lineTo(x, y2);
      }
      g.stroke();
    }
    for (let j = 0; j < 50; j++) {
      const xx = 24 + j * 31;
      g.strokeStyle = useHolo ? holoGrad : (j % 2 ? t.accent : t.line);
      g.lineWidth = 1;
      g.beginPath();
      for (let y = 24; y <= H - 24; y += 6) {
        const x2 = xx + Math.sin(y / 50 + j * 0.5) * 6 + Math.sin(y / 150 - j * 0.3) * 4;
        y === 24 ? g.moveTo(x2, y) : g.lineTo(x2, y);
      }
      g.stroke();
    }
    guilloche(g, W * 0.20, H * 0.34, 230, 74, 9, 26, useHolo ? holoGrad : t.accent, 1, 1);
    guilloche(g, W * 0.20, H * 0.34, 150, 52, 14, 26, useHolo ? holoGrad : t.accent2, 1, 1);
    guilloche(g, W * 0.50, H * 0.50, 380, 104, 7, 30, useHolo ? holoGrad : t.accent, 1, 1);
    guilloche(g, W * 0.50, H * 0.50, 250, 84, 17, 26, useHolo ? holoGrad : t.accent2, 1, 1);
    guilloche(g, W * 0.83, H * 0.72, 210, 66, 11, 24, useHolo ? holoGrad : t.accent2, 1, 1);
    guilloche(g, W * 0.83, H * 0.72, 130, 46, 16, 24, useHolo ? holoGrad : t.accent, 1, 1);
    for (const [px, py] of [[110, 120], [W - 120, 120], [120, H - 110], [W - 120, H - 110]]) {
      guilloche(g, px, py, 70, 26, 13, 18, useHolo ? holoGrad : t.accent, 1, 1);
    }
    g.globalCompositeOperation = "destination-out";
    const fade = g.createLinearGradient(0, 0, 0, H);
    fade.addColorStop(0.0, "rgba(0,0,0,0)");
    fade.addColorStop(1.0, "rgba(0,0,0,0.5)");
    g.fillStyle = fade;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
    c.save();
    c.globalAlpha = 0.20;
    c.drawImage(off, 0, 0);
    c.restore();

    // Copy the background waves and guilloches into the holographic mask canvas
    if (updateMask && mCtx) {
      mCtx.drawImage(off, 0, 0);
      mCtx.save();
      mCtx.globalCompositeOperation = "source-in";
      mCtx.fillStyle = "#ffffff";
      mCtx.fillRect(0, 0, W, H);
      mCtx.restore();
    }
  }

  const streak = c.createLinearGradient(0, 0, W, H);
  streak.addColorStop(0.30, "rgba(255,255,255,0)");
  streak.addColorStop(0.44, "rgba(150,200,255,0.16)");
  streak.addColorStop(0.50, "rgba(180,210,255,0.18)");
  streak.addColorStop(0.56, "rgba(170,220,255,0.14)");
  streak.addColorStop(0.70, "rgba(255,255,255,0)");
  c.fillStyle = streak;
  c.fillRect(0, 0, W, H);

  // 透かしの大きな蝶 / Large watermark butterfly
  c.save();
  c.globalAlpha = 0.06;
  drawButterfly(c, W * 0.46, 330, 150, t.accent);
  c.restore();

  c.restore(); // unclip

  // ===== Double border =====
  c.lineWidth = 5;
  c.strokeStyle = t.border;
  roundRect(c, 10, 10, W - 20, H - 20, 20);
  c.stroke();
  c.lineWidth = 1.5;
  c.strokeStyle = "rgba(17,133,254,0.45)";
  roundRect(c, 22, 22, W - 44, H - 44, 14);
  c.stroke();

  const PAD = 70;

  // ===== Header =====
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  c.fillStyle = "#11151c";
  c.font = "800 76px 'Inter', sans-serif";
  c.fillText("BLUESKY LICENSE", PAD, 118);
  c.fillStyle = t.accent;
  c.font = "italic 600 30px 'Inter', sans-serif";
  c.fillText("Your handle, your identity.", PAD + 4, 158);

  c.textAlign = "right";
  c.fillStyle = t.accent;
  c.font = "800 30px 'Inter', sans-serif";
  c.fillText("BLUESKY SOCIAL", W - PAD - 86, 102);
  drawHexLogo(c, W - PAD - 36, 90, 40, t.accent, t.accent2);

  if (updateMask && mCtx) {
    mCtx.save();
    mCtx.fillStyle = "#ffffff";
    mCtx.textAlign = "right";
    mCtx.font = "800 30px 'Inter', sans-serif";
    mCtx.fillText("BLUESKY SOCIAL", W - PAD - 86, 102);
    drawHexLogo(mCtx, W - PAD - 36, 90, 40, "#ffffff", "#ffffff");
    mCtx.restore();
  }

  c.strokeStyle = t.line;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(PAD, 182);
  c.lineTo(W * 0.62, 182);
  c.stroke();
  c.setLineDash([6, 8]);
  c.beginPath();
  c.moveTo(W * 0.62, 182);
  c.lineTo(W - PAD, 182);
  c.stroke();
  c.setLineDash([]);

  const rank = computeRank(d);

  // ===== Photo =====
  // 正方形モード：枠を正方形にして元のポートレート枠(202..670)内で縦中央寄せ。 / Square mode uses a square frame vertically centered within the original portrait bounds (202..670).
  // アイコン(1:1)を左右切り取りなしで全体表示できる。 / This lets a 1:1 avatar fit fully without left/right cropping.
  const squareAvatar = !!$("square-avatar")?.checked;
  const phX = 850, phR = 16;
  // 正方形時も幅は通常枠と同じ360に揃え、右カラム(LICENSE NO. 1270)との余白60pxを確保。 / Keep the square mode width at the normal 360px and preserve a 60px gap before the right column (LICENSE NO. at 1270).
  // 高さだけ短くなるので元のポートレート枠(202..670)内で縦中央寄せ。 / Only the height shrinks, so the frame stays vertically centered within the original portrait area.
  const phW = 360;
  const phH = squareAvatar ? 360 : 468;
  const phY = squareAvatar ? 202 + (468 - phH) / 2 : 202;
  c.save();
  c.shadowColor = "rgba(30,40,80,0.28)";
  c.shadowBlur = 26;
  c.shadowOffsetY = 10;
  roundRect(c, phX, phY, phW, phH, phR);
  c.fillStyle = "#e7ecf6";
  c.fill();
  c.restore();
  c.save();
  roundRect(c, phX, phY, phW, phH, phR);
  c.clip();
  if (d._avatar) {
    const img = d._avatar;
    // 正方形モードは contain（全体表示）、通常はポートレート枠に cover（はみ出し切り取り） / Square mode uses contain to show the whole image; portrait mode uses cover and crops overflow
    const ratio = squareAvatar
      ? Math.min(phW / img.width, phH / img.height)
      : Math.max(phW / img.width, phH / img.height);
    const dw = img.width * ratio, dh = img.height * ratio;
    c.drawImage(img, phX + (phW - dw) / 2, phY + (phH - dh) / 2, dw, dh);
  } else {
    c.fillStyle = t.sub;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "22px 'Inter', sans-serif";
    c.fillText("NO IMAGE", phX + phW / 2, phY + phH / 2);
  }
  c.restore();
  c.lineWidth = 3;
  c.strokeStyle = "rgba(255,255,255,0.9)";
  roundRect(c, phX + 2, phY + 2, phW - 4, phH - 4, phR - 2);
  c.stroke();
  c.lineWidth = 2;
  c.strokeStyle = t.border;
  roundRect(c, phX, phY, phW, phH, phR);
  c.stroke();

  // ===== Left column: fields =====
  const lx = PAD;
  const fieldMaxW = phX - 40 - lx;
  c.textAlign = "left";
  c.textBaseline = "alphabetic";

  drawPill(c, "NAME", lx, 208, { bg: t.accent, fg: "#fff", font: "700 22px 'Inter', sans-serif", h: 34 });
  c.fillStyle = t.ink;
  let np = 46; // 長い表示名は枠内に収まるまで縮小 / Shrink long display names until they fit in the field
  while (np > 20) {
    c.font = `800 ${np}px 'Inter', sans-serif`;
    if (c.measureText(d.name).width <= fieldMaxW) break;
    np -= 2;
  }
  c.fillText(d.name, lx, 278);

  // HANDLE（検証マーク付き） / Handle field with verification mark
  drawPill(c, "HANDLE", lx, 314, { bg: t.accent, fg: "#fff", font: "700 22px 'Inter', sans-serif", h: 34 });
  const handleText = d.handle ? "@" + d.handle : "—";
  let hp = 32;
  while (hp > 14) {
    c.font = `600 ${hp}px 'JetBrains Mono', monospace`;
    if (c.measureText(handleText).width <= fieldMaxW - 36) break;
    hp -= 1;
  }
  c.fillStyle = t.ink;
  c.fillText(handleText, lx, 376);
  if (d.handle && d.verified) {
    const aw = c.measureText(handleText).width;
    c.font = "700 28px 'Inter', sans-serif";
    c.fillStyle = "#1c9e57";
    c.fillText("✓", lx + aw + 12, 375);
  }

  // DID
  drawPill(c, "DID", lx, 408, { bg: t.accent, fg: "#fff", font: "700 22px 'Inter', sans-serif", h: 34 });
  c.fillStyle = t.ink;
  let dp = 28;
  while (dp > 13) {
    c.font = `600 ${dp}px 'JetBrains Mono', monospace`;
    if (c.measureText(d.did).width <= fieldMaxW) break;
    dp -= 1;
  }
  c.fillText(d.did, lx, 468);

  // PDS
  drawPill(c, "PDS", lx, 500, { bg: t.accent, fg: "#fff", font: "700 22px 'Inter', sans-serif", h: 34 });
  const pdsText = d.pds || "https://bsky.social";
  let pp = 28;
  c.fillStyle = t.ink;
  while (pp > 13) {
    c.font = `600 ${pp}px 'JetBrains Mono', monospace`;
    if (c.measureText(pdsText).width <= fieldMaxW) break;
    pp -= 1;
  }
  c.fillText(pdsText, lx, 560);

  // 下段：ISSUED / CREATED / LICENSE CLASS
  const col = [lx, lx + 230, lx + 450];
  c.textAlign = "left";
  c.textBaseline = "alphabetic";
  const r1 = 615;
  c.fillStyle = t.sub;
  c.font = "700 19px 'Inter', sans-serif";
  c.fillText("ISSUED", col[0], r1);
  c.fillText("CREATED", col[1], r1);
  c.fillText("LICENSE CLASS", col[2], r1);
  c.fillStyle = t.ink;
  c.font = "400 25px 'Inter', sans-serif";
  c.fillText(fmtISO(Math.floor(Date.now() / 1000)), col[0], r1 + 30);
  c.fillText(d.createdAt ? fmtISO(d.createdAt) : "—", col[1], r1 + 30);
  drawPill(c, rank, col[2], r1 + 12, { bg: t.accent2, fg: "#fff", font: "700 21px 'Inter', sans-serif", h: 34 });

  // ===== Right column =====
  const rlx = 1270;
  const rcx = 1384;
  c.textAlign = "left";
  c.fillStyle = t.sub;
  c.font = "700 22px 'Inter', sans-serif";
  c.fillText("LICENSE NO.", rlx, 222);
  c.fillStyle = t.ink;
  c.font = "500 25px 'Inter', sans-serif";
  c.fillText(licenseNo(d), rlx, 260);

  if (d._qr) {
    const qs = 200, qx = rcx - qs / 2, qy = 470 - qs / 2;
    c.fillStyle = "#fff";
    roundRect(c, qx - 10, qy - 10, qs + 20, qs + 20, 14);
    c.fill();
    c.drawImage(d._qr, qx, qy, qs, qs);
    drawCircleLogo(c, qx + qs / 2, qy + qs / 2, 26, t.accent, t.accent2);
  }

  // ===== Status panel =====
  const pnX = 60, pnY = 690, pnW = 1000, pnH = 206;
  c.save();
  c.shadowColor = "rgba(80,60,20,0.18)";
  c.shadowBlur = 16;
  c.shadowOffsetY = 6;
  const pg = c.createLinearGradient(pnX, pnY, pnX, pnY + pnH);
  pg.addColorStop(0, "#f6efdc");
  pg.addColorStop(1, "#efe6cf");
  roundRect(c, pnX, pnY, pnW, pnH, 12);
  c.fillStyle = pg;
  c.fill();
  c.restore();
  c.lineWidth = 1.5;
  c.strokeStyle = t.gold2;
  c.globalAlpha = 0.6;
  roundRect(c, pnX, pnY, pnW, pnH, 12);
  c.stroke();
  c.globalAlpha = 1;

  c.save();
  const tbW = 404, tbH = 46, tbX = pnX + 16, tbY = pnY - 20;
  c.beginPath();
  c.moveTo(tbX, tbY + 12);
  c.arcTo(tbX, tbY, tbX + 12, tbY, 12);
  c.lineTo(tbX + tbW, tbY);
  c.lineTo(tbX + tbW - 28, tbY + tbH);
  c.lineTo(tbX + 12, tbY + tbH);
  c.arcTo(tbX, tbY + tbH, tbX, tbY + tbH - 12, 12);
  c.closePath();
  const tg = c.createLinearGradient(tbX, tbY, tbX, tbY + tbH);
  tg.addColorStop(0, t.gold1);
  tg.addColorStop(1, t.gold2);
  c.fillStyle = tg;
  c.fill();
  c.fillStyle = "#3a2c08";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.font = "800 24px 'Inter', sans-serif";
  c.fillText("BLUESKY FLYER PROFILE", tbX + 24, tbY + tbH / 2 + 1);
  c.restore();

  const stats = computeStars(d);
  const colX = [pnX + 40, pnX + 510];
  const rowsY = [pnY + 54, pnY + 100, pnY + 146];
  for (let i = 0; i < stats.length; i++) {
    const s = stats[i];
    const cxp = colX[i % 2];
    const cyp = rowsY[Math.floor(i / 2)];
    drawStatIcon(c, s.icon, cxp, cyp - 15, 28, t.accent);
    c.fillStyle = t.ink;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = "700 27px 'Inter', sans-serif";
    c.fillText(s.label, cxp + 44, cyp);
    drawStarRating(c, cxp + 296, cyp, s.n, 28, "#1e2a5a", "#b9c1d7");
  }

  // パネル内フッター：MILEAGE / PEAK（区切り線つき） / Panel footer: MILEAGE / PEAK with a divider line
  c.save();
  c.strokeStyle = t.gold2; c.globalAlpha = 0.4; c.lineWidth = 1;
  c.beginPath(); c.moveTo(pnX + 40, pnY + 172); c.lineTo(pnX + pnW - 40, pnY + 172); c.stroke();
  c.restore();
  const fy = pnY + 194;
  c.textAlign = "left"; c.textBaseline = "alphabetic";
  c.fillStyle = t.sub; c.font = "700 18px 'Inter', sans-serif";
  c.fillText("MILEAGE", colX[0], fy);
  c.fillStyle = t.ink; c.font = "700 22px 'JetBrains Mono', monospace";
  c.fillText(d.posts.toLocaleString("en-US"), colX[0] + 104, fy);
  c.fillStyle = t.sub; c.font = "700 18px 'Inter', sans-serif";
  c.fillText("PEAK (UTC)", colX[1], fy);
  c.fillStyle = t.ink; c.font = "700 22px 'Inter', sans-serif";
  c.fillText(d.peakUTC, colX[1] + 144, fy);

  // ===== Seal and verification label (bottom right) =====
  const shX = 1384, shY = 765, shW = 200, shH = 240;
  drawShield(c, shX, shY, shW, shH, t);

  if (updateMask && mCtx) {
    mCtx.fillStyle = "#ffffff";
    drawShieldPath(mCtx, shX, shY, shW, shH);
    mCtx.fill();

    mCtx.save();
    mCtx.globalCompositeOperation = "destination-over";
    mCtx.fillStyle = "#000000";
    mCtx.fillRect(0, 0, W, H);
    mCtx.restore();
  }

  // Draw the static holographic rainbow sheen over the 2D canvas shield
  if (useHolo) {
    drawHoloOverlay(c, shX, shY, shW, shH);
  }

  // ===== Bottom tagline =====
  const capY = 936;
  if (flightFont) {
    c.fillStyle = t.accent;
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.font = '400 40px "Material Symbols Outlined"';
    c.fillText("flight", PAD, capY);
  } else {
    drawAirplane(c, PAD, capY, t.accent);
  }
  c.fillStyle = "#2a3550";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.font = "600 25px 'Inter', sans-serif";
  c.fillText("Fly the open social web.", PAD + 64, capY);

  c.fillStyle = t.accent;
  c.textAlign = "right";
  c.font = "800 25px 'Inter', sans-serif";
  c.fillText("SEE YOU IN THE SKY.", W - PAD, capY);
}

async function renderCard(d, theme = "sky") {
  // Preload web fonts
  try {
    await Promise.all([
      document.fonts.load("400 12px 'Inter'"),
      document.fonts.load("500 12px 'Inter'"),
      document.fonts.load("600 12px 'Inter'"),
      document.fonts.load("700 12px 'Inter'"),
      document.fonts.load("800 12px 'Inter'"),
      document.fonts.load("500 12px 'JetBrains Mono'"),
      document.fonts.load("600 12px 'JetBrains Mono'"),
      document.fonts.load("700 12px 'JetBrains Mono'")
    ]);
  } catch (e) {
    console.warn("Failed to pre-load Inter/JetBrains Mono fonts:", e);
  }

  // 1. Draw clean version to offscreen threeFrontCanvas, updating mask
  await drawCardFaceToCanvas(threeFrontCanvas, d, theme, false, true);

  // 2. Draw holographic version to visible canvas (no mask updates)
  await drawCardFaceToCanvas(canvas, d, theme, true, false);

  // 3. Initialize or update Three.js using the clean offscreen canvas
  try {
    const container = $("three-container");
    const panel = $("three-panel");
    if (panel) panel.style.display = "block";
    container.style.display = "block";
    await renderCardBack(d, theme);
    if (!threeInitialized) {
      initThree(container, threeFrontCanvas, maskCanvas, backCanvas);
    } else {
      cardTexture.needsUpdate = true;
      maskTexture.needsUpdate = true;
      backTexture.needsUpdate = true;
    }
  } catch (e) {
    console.error("Three.js initialization/update error:", e);
  }

  $("download-btn").disabled = false;
}

// ===== Issuance flow =====
function normalizeActor(raw) {
  raw = raw.trim().replace(/^@/, "");
  if (raw.startsWith("http")) {
    const m = raw.match(/\/profile\/([^/?#]+)/);
    if (m) raw = m[1];
  }
  if (!raw) throw new Error(L().errEnter);
  return raw;
}

function checkCompatibility() {
  let canvasOk = false;
  try {
    const canvas = document.createElement("canvas");
    canvasOk = !!(canvas.getContext && canvas.getContext("2d"));
  } catch (e) {}

  let readbackOk = false;
  if (canvasOk) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#ff0000";
        ctx.fillRect(0, 0, 2, 2);
        const data = ctx.getImageData(0, 0, 1, 1).data;
        readbackOk = (data[0] === 255);
      }
    } catch (e) {}
  }

  let webglOk = false;
  try {
    const canvas = document.createElement("canvas");
    webglOk = !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
  } catch (e) {}

  if (!canvasOk || !readbackOk || !webglOk) {
    const missing = [];
    if (!canvasOk || !readbackOk) missing.push("HTML5 Canvas readback");
    if (!webglOk) missing.push("WebGL");
    const msg = L().errCompatibility(missing.join(" and "));
    throw new Error(msg);
  }
}

async function issueFor(actor) {
  try {
    const data = await fetchProfile(actor);
    setStatus(L().stAvatar);
    const [avatar, qr] = await Promise.all([
      loadAvatar(data.picture),
      makeQR("https://bsky.app/profile/" + (data.handle || data.did)),
    ]);
    data._avatar = avatar;
    data._qr = qr;
    lastData = data;

    await renderCard(data, $("theme-select").value);
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus(L().err(err?.message || err), "error");
  }
}

$("manual-btn").addEventListener("click", async () => {
  const raw = $("npub-input").value;
  if (!raw.trim()) { setStatus(L().errEnter, "error"); return; }
  try {
    checkCompatibility();
  } catch (err) {
    setStatus(err.message, "error");
    return;
  }
  const btn = $("manual-btn");
  btn.disabled = true;
  try {
    await issueFor(normalizeActor(raw));
  } catch (err) {
    setStatus(L().err(err?.message || err), "error");
  } finally {
    btn.disabled = false;
  }
});
$("npub-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("manual-btn").click(); });

$("theme-select").addEventListener("change", () => {
  if (lastData) renderCard(lastData, $("theme-select").value);
});

// 初期プレースホルダ描画 / Draw the initial placeholder
function drawPlaceholder() {
  const t = THEMES.sky;
  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  g.addColorStop(0, t.paper[0]);
  g.addColorStop(0.5, t.paper[1]);
  g.addColorStop(1, t.paper[2]);
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 24);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = t.border;
  roundRect(ctx, 10, 10, canvas.width - 20, canvas.height - 20, 20);
  ctx.stroke();
  guilloche(ctx, canvas.width * 0.5, canvas.height * 0.5, 320, 90, 7, 18, t.accent, 0.06, 1);
  ctx.fillStyle = t.sub;
  ctx.font = "700 30px 'Inter',sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(L().canvasHint, canvas.width / 2, canvas.height / 2);
}

// ===== Language: auto-detect from browser language, with manual override =====
const savedLang = (() => { try { return localStorage.getItem("bsl_lang"); } catch { return null; } })() || "auto";
$("lang-select").value = savedLang;
$("lang-select").addEventListener("change", (e) => {
  try { localStorage.setItem("bsl_lang", e.target.value); } catch {}
  applyLang(e.target.value);
});
applyLang(savedLang);

// ===== Square-avatar toggle =====
try {
  const sq = $("square-avatar");
  if (localStorage.getItem("bsl_square") === "1") sq.checked = true;
  sq.addEventListener("change", () => {
    try { localStorage.setItem("bsl_square", sq.checked ? "1" : "0"); } catch {}
    if (lastData) renderCard(lastData, $("theme-select").value);
  });
} catch {}

// ===== Light/Dark Theme toggle =====
try {
  const themeToggle = $("theme-toggle");
  if (themeToggle) {
    const savedTheme = localStorage.getItem("bsl_theme") || "dark";
    if (savedTheme === "light") {
      document.body.setAttribute("data-theme", "light");
      themeToggle.setAttribute("aria-checked", "true");
    } else {
      document.body.removeAttribute("data-theme");
      themeToggle.setAttribute("aria-checked", "false");
    }
    themeToggle.addEventListener("click", () => {
      const isLight = themeToggle.getAttribute("aria-checked") === "true";
      if (isLight) {
        document.body.removeAttribute("data-theme");
        themeToggle.setAttribute("aria-checked", "false");
        try { localStorage.setItem("bsl_theme", "dark"); } catch {}
      } else {
        document.body.setAttribute("data-theme", "light");
        themeToggle.setAttribute("aria-checked", "true");
        try { localStorage.setItem("bsl_theme", "light"); } catch {}
      }
    });
  }
} catch {}

$("download-btn").addEventListener("click", () => {
  try {
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = "bluesky-license.png";
    a.click();
  } catch (err) {
    setStatus(L().errDownload(err.message), "error");
  }
});

async function initThree(container, cardCanvas, maskCanvas, backCanvas) {
  if (threeInitialized) return;
  threeInitialized = true;

  const THREE = await import("three");
  const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");

  const width = container.clientWidth;
  const height = container.clientHeight;

  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
  camera.position.set(0, 0, 3.8);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  cardTexture = new THREE.CanvasTexture(cardCanvas);
  cardTexture.minFilter = THREE.LinearFilter;
  maskTexture = new THREE.CanvasTexture(maskCanvas);
  maskTexture.minFilter = THREE.LinearFilter;
  backTexture = new THREE.CanvasTexture(backCanvas);
  backTexture.minFilter = THREE.LinearFilter;

  const holoMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tCard: { value: cardTexture },
      tHoloMask: { value: maskTexture },
      tBack: { value: backTexture },
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying float vObjectNormalZ;
      void main() {
        vObjectNormalZ = normal.z;
        vUv = vec2(position.x / 2.39 + 0.5, position.y / 1.5 + 0.5);
        vNormal = normalize(normalMatrix * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tCard;
      uniform sampler2D tHoloMask;
      uniform sampler2D tBack;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying float vObjectNormalZ;

      vec3 getRainbow(float x) {
        vec3 c = vec3(0.0);
        c.r = sin(x * 6.283 + 0.0) * 0.5 + 0.5;
        c.g = sin(x * 6.283 + 2.094) * 0.5 + 0.5;
        c.b = sin(x * 6.283 + 4.188) * 0.5 + 0.5;
        return c;
      }

      bool isInsideShield(vec2 uv) {
        float u_c = 1384.0 / 1568.0;
        float v_c = 1.0 - 765.0 / 984.0;
        float w = 200.0 / 1568.0;
        float h = 240.0 / 984.0;

        float dx = (uv.x - u_c) / (w * 0.5);
        float dy = (uv.y - v_c) / (h * 0.5);

        if (abs(dx) > 1.0 || dy < -1.0 || dy > 1.0) {
          return false;
        }

        float adx = abs(dx);

        if (dy > 0.6) {
          float max_x = (1.0 - dy) / 0.4;
          if (adx > max_x) return false;
        }
        else if (dy < -0.1) {
          float norm_y = (dy + 0.1) / -0.9;
          float max_x = 1.0 - norm_y * norm_y;
          if (adx > max_x) return false;
        }

        return true;
      }

      void main() {
        if (vObjectNormalZ < 0.0) {
          vec2 backUv = vec2(1.0 - vUv.x, vUv.y);
          vec4 backColor = texture2D(tBack, backUv);
          if (backColor.a < 0.1) {
            discard;
          }
          gl_FragColor = backColor;
          return;
        }

        vec4 cardColor = texture2D(tCard, vUv);
        if (cardColor.a < 0.1) {
          discard;
        }

        vec3 normal = normalize(vNormal);
        bool inShield = isInsideShield(vUv);

        if (inShield) {
          float gridSpacing = 16.0;
          vec2 gridUv = (vUv * vec2(1568.0, 984.0)) / gridSpacing;
          
          vec2 center = floor(gridUv) + 0.5;
          vec2 diff = gridUv - center;
          float dist = length(diff);
          float r_bump = 0.28;
          
          if (dist < r_bump) {
            float slope = sin((1.0 - dist / r_bump) * 1.570796);
            vec2 dir = normalize(diff);
            float strength = 0.38;
            normal.xy += dir * slope * strength;
            normal = normalize(normal);
          }
        }

        float mask = texture2D(tHoloMask, vUv).r;

        if (mask > 0.05) {
          float dotNL = dot(normal, vec3(0.0, 0.0, 1.0));
          float shift = normal.x * 2.2 + normal.y * 2.2 + vWorldPosition.x * 0.3 + vWorldPosition.y * 0.3 + sin(uTime * 0.8) * 0.25;
          vec3 holoColor = getRainbow(shift);
          
          vec3 spec = holoColor * 0.45 * mask * (0.15 + 0.85 * max(0.0, dotNL));
          cardColor.rgb += spec;
        }

        if (inShield) {
          vec3 lightDir = normalize(vec3(0.3, 0.4, 0.8));
          float diffFactor = dot(normal, lightDir);
          cardColor.rgb *= (0.9 + 0.15 * max(0.0, diffFactor));
        }

        gl_FragColor = cardColor;
      }
    `,
    transparent: true
  });

  const plasticMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });

  const materials = [
    holoMaterial, // Front & Back caps
    plasticMat    // Sides & Bevels
  ];

  const shape = new THREE.Shape();
  const w = 2.37, h = 1.48, r = 0.035;
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x, y + r);
  shape.lineTo(x, y + h - r);
  shape.quadraticCurveTo(x, y + h, x + r, y + h);
  shape.lineTo(x + w - r, y + h);
  shape.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  shape.lineTo(x + w, y + r);
  shape.quadraticCurveTo(x + w, y, x + w - r, y);
  shape.lineTo(x + r, y);
  shape.quadraticCurveTo(x, y, x, y + r);

  const extrudeSettings = {
    steps: 1,
    depth: 0.01,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 3
  };

  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geom.center();

  cardMesh = new THREE.Mesh(geom, materials);
  scene.add(cardMesh);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enableZoom = true;
  controls.enablePan = false;
  controls.minDistance = 1.5;
  controls.maxDistance = 6.0;

  const clock = new THREE.Clock();
  function animate() {
    animationFrameId = requestAnimationFrame(animate);
    const time = clock.getElapsedTime();
    holoMaterial.uniforms.uTime.value = time;
    
    cardMesh.rotation.y = Math.sin(time * 0.5) * 0.18;
    cardMesh.rotation.x = Math.cos(time * 0.4) * 0.06;

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  const resizeObserver = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  });
  resizeObserver.observe(container);
}

// ===== OpenGraph Preview Mode =====
try {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('preview')) {
    document.body.classList.add('preview-mode');
    window.addEventListener('load', async () => {
      try {
        await issueFor("apex.bsky.social");
      } catch (e) {
        console.error("Preview issue error:", e);
      }
    });
  }
} catch (e) {}

