// Image resolution for inventory items
//
// Priority:  1. item.item_image_url  (user-uploaded, always wins)
//            2. Wikipedia REST API thumbnail (fetched async, no API key, CORS-enabled)
//            3. Emoji SVG data-URI   (instant placeholder, never wrong)
//
// Wikipedia thumbnails are ALWAYS the actual article photo —
// "Cashew" article → real cashew photo, never wrong.

const ARTICLE_MAP = [
  { words: ['basmati'],                      article: 'Basmati',       emoji: '🍚', bg: '#FEF9C3' },
  { words: ['brown rice'],                   article: 'Brown_rice',    emoji: '🍚', bg: '#FEF3C7' },
  { words: ['rice'],                         article: 'Rice',          emoji: '🍚', bg: '#FEF9C3' },
  { words: ['atta', 'whole wheat flour'],    article: 'Atta_flour',    emoji: '🌾', bg: '#FEF3C7' },
  { words: ['maida'],                        article: 'Maida_flour',   emoji: '🌾', bg: '#FEF3C7' },
  { words: ['suji', 'sooji', 'semolina', 'rawa', 'rava'], article: 'Semolina', emoji: '🌾', bg: '#FEF3C7' },
  { words: ['besan', 'gram flour'],          article: 'Gram_flour',    emoji: '🌾', bg: '#FEF3C7' },
  { words: ['wheat'],                        article: 'Wheat',         emoji: '🌾', bg: '#FEF3C7' },
  { words: ['chana', 'chickpea', 'chole'],   article: 'Chickpea',      emoji: '🫘', bg: '#FFFBEB' },
  { words: ['moong', 'mung'],                article: 'Mung_bean',     emoji: '🫘', bg: '#ECFDF5' },
  { words: ['toor', 'arhar', 'pigeon'],      article: 'Pigeon_pea',    emoji: '🫘', bg: '#FEF9C3' },
  { words: ['masoor'],                       article: 'Lentil',        emoji: '🫘', bg: '#FEE2E2' },
  { words: ['urad', 'black gram'],           article: 'Vigna_mungo',   emoji: '🫘', bg: '#F0FDF4' },
  { words: ['rajma', 'kidney'],              article: 'Kidney_bean',   emoji: '🫘', bg: '#FEE2E2' },
  { words: ['lentil', 'dal', 'daal'],        article: 'Lentil',        emoji: '🫘', bg: '#ECFDF5' },
  { words: ['cashew', 'kaju'],               article: 'Cashew',        emoji: '🥜', bg: '#FFFBEB' },
  { words: ['almond', 'badam'],              article: 'Almond',        emoji: '🌰', bg: '#FEF3C7' },
  { words: ['walnut', 'akhrot'],             article: 'Walnut',        emoji: '🌰', bg: '#FEF3C7' },
  { words: ['pistachio', 'pista'],           article: 'Pistachio',     emoji: '🫒', bg: '#ECFDF5' },
  { words: ['raisin', 'kishmish', 'kismis'], article: 'Raisin',        emoji: '🍇', bg: '#F3E8FF' },
  { words: ['fig', 'anjeer'],                article: 'Common_fig',    emoji: '🍇', bg: '#F3E8FF' },
  { words: ['date', 'khajoor'],              article: 'Date_palm',     emoji: '🌴', bg: '#FEF3C7' },
  { words: ['apricot', 'khubani'],           article: 'Apricot',       emoji: '🍑', bg: '#FEF3C7' },
  { words: ['dry fruit', 'dryfruit', 'mixed nut'], article: 'Dried_fruit', emoji: '🥜', bg: '#FFFBEB' },
  { words: ['sugar', 'cheeni', 'shakkar'],   article: 'Sugar',         emoji: '🍬', bg: '#FCE7F3' },
  { words: ['jaggery', 'gud', 'gur', 'khandsari', 'bellam'], article: 'Jaggery', emoji: '🍯', bg: '#FEF3C7' },
  { words: ['cumin', 'jeera'],               article: 'Cumin',         emoji: '🌱', bg: '#FEF9C3' },
  { words: ['coriander', 'dhania'],          article: 'Coriander',     emoji: '🌱', bg: '#ECFDF5' },
  { words: ['turmeric', 'haldi'],            article: 'Turmeric',      emoji: '🌶️', bg: '#FEF3C7' },
  { words: ['chilli', 'chili', 'mirchi', 'lal mirch'], article: 'Chili_pepper', emoji: '🌶️', bg: '#FEE2E2' },
  { words: ['black pepper', 'kali mirch'],   article: 'Black_pepper',  emoji: '🌶️', bg: '#E2E8F0' },
  { words: ['mustard', 'sarson', 'rai'],     article: 'Mustard_seed',  emoji: '🌱', bg: '#FEF9C3' },
  { words: ['fenugreek', 'methi'],           article: 'Fenugreek',     emoji: '🌱', bg: '#ECFDF5' },
  { words: ['sesame', 'til'],                article: 'Sesame',        emoji: '🌱', bg: '#FEF9C3' },
  { words: ['cardamom', 'elaichi'],          article: 'Cardamom',      emoji: '🌱', bg: '#ECFDF5' },
  { words: ['clove', 'laung'],               article: 'Clove',         emoji: '🌱', bg: '#FEF3C7' },
  { words: ['cinnamon', 'dalchini'],         article: 'Cinnamon',      emoji: '🌱', bg: '#FEF3C7' },
  { words: ['fennel', 'saunf'],              article: 'Fennel',        emoji: '🌱', bg: '#ECFDF5' },
  { words: ['ajwain', 'carom'],              article: 'Carom_seed',    emoji: '🌱', bg: '#FEF9C3' },
  { words: ['spice', 'masala'],              article: 'Spice',         emoji: '🌶️', bg: '#FEE2E2' },
  { words: ['ghee'],                         article: 'Ghee',          emoji: '🫙', bg: '#FEF9C3' },
  { words: ['oil', 'tel'],                   article: 'Cooking_oil',   emoji: '🫙', bg: '#FEF9C3' },
  { words: ['salt', 'namak'],                article: 'Salt',          emoji: '🧂', bg: '#F0F9FF' },
];

// In-memory cache: article → wikipedia thumbnail URL (persists for browser session)
const _wikiCache = new Map();
// In-progress fetch tracker to avoid duplicate requests
const _pending = new Map();

function buildKey(item) {
  return [
    item?.sub_category_name || '',
    item?.variant_grade     || '',
    item?.category_name     || '',
    item?.name              || '',
  ].join(' ').toLowerCase();
}

function matchEntry(item) {
  const key = buildKey(item);
  for (const entry of ARTICLE_MAP) {
    if (entry.words.some(w => key.includes(w))) return entry;
  }
  return null;
}

// Fetch Wikipedia article thumbnail — returns URL string or null.
// Caches result; deduplicates concurrent fetches for the same article.
async function fetchWikiThumb(article) {
  if (_wikiCache.has(article)) return _wikiCache.get(article);
  if (_pending.has(article))   return _pending.get(article);

  const promise = (async () => {
    try {
      const res = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(article)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const url = data.thumbnail?.source || data.originalimage?.source || null;
      if (url) _wikiCache.set(article, url);
      return url;
    } catch {
      return null;
    } finally {
      _pending.delete(article);
    }
  })();

  _pending.set(article, promise);
  return promise;
}

// Returns { article, emoji, bg } for an item, or null if unknown.
export function matchCategory(item) {
  return matchEntry(item);
}

// Returns article name for a matched item (used by FoodPhoto to kick off fetch).
export function getWikiArticle(item) {
  if (item?.item_image_url) return null;
  return matchEntry(item)?.article || null;
}

// Async: resolves to the best available photo URL.
export async function resolvePhotoUrl(item) {
  if (item?.item_image_url) return item.item_image_url;
  const entry = matchEntry(item);
  if (!entry) return null;
  return fetchWikiThumb(entry.article);
}

// Convenience export to pre-warm cache for a list of items.
export function prewarmImages(items) {
  items.forEach(item => {
    const article = getWikiArticle(item);
    if (article) fetchWikiThumb(article);
  });
}

// Emoji + bg for CSS-only placeholder (shown while Wikipedia fetch is in-flight).
export function getItemIcon(item) {
  const entry = matchEntry(item);
  return entry
    ? { emoji: entry.emoji, bg: entry.bg }
    : { emoji: '📦', bg: '#F1F5F9' };
}

export function makeEmojiSvg(emoji, bg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${bg}"/><text x="40" y="58" font-size="38" text-anchor="middle" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${emoji}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Stable color for text-initial avatar
const PALETTE = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#84CC16', '#F97316', '#06B6D4'];
export function getCategoryColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + (name || '').charCodeAt(i)) & 0xffffff;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

// Legacy compat — kept so nothing breaks if still imported somewhere
export function getItemPhotoUrls(item) {
  if (item?.item_image_url) return [item.item_image_url];
  const entry = matchEntry(item);
  const emojiUrl = makeEmojiSvg(entry?.emoji || '📦', entry?.bg || '#F1F5F9');
  return [emojiUrl];
}
export function getItemImage(item) {
  return getItemPhotoUrls(item)[0];
}
