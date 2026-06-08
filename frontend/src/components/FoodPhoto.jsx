import React, { useState, useEffect } from 'react';
import { resolvePhotoUrl, getItemIcon, makeEmojiSvg } from '../lib/itemImage';

/**
 * Renders a real food photograph.
 *
 * Flow:
 *   1. Instantly shows emoji placeholder (correct color, zero latency)
 *   2. Fetches Wikipedia article thumbnail in background (no API key, CORS-ok)
 *   3. Crossfades to real photo when loaded
 *   4. Falls back to emoji if Wikipedia fetch fails
 *
 * Props:
 *   item    — item object (needs sub_category_name, variant_grade, item_image_url)
 *   size    — px (default 40)
 *   radius  — border-radius px (default 8)
 *   onClick — optional click handler
 *   style   — additional style overrides
 */
export default function FoodPhoto({ item, size = 40, radius = 8, onClick, style = {} }) {
  const { emoji, bg } = getItemIcon(item);
  const placeholder = makeEmojiSvg(emoji, bg);

  const [src, setSrc]   = useState(item?.item_image_url || placeholder);
  const [ready, setReady] = useState(!!item?.item_image_url);

  useEffect(() => {
    let cancelled = false;

    if (item?.item_image_url) {
      setSrc(item.item_image_url);
      setReady(true);
      return;
    }

    // Show placeholder immediately, fetch real photo in background
    setSrc(placeholder);
    setReady(false);

    resolvePhotoUrl(item).then(url => {
      if (cancelled || !url) return;
      // Pre-load to avoid flicker
      const img = new Image();
      img.onload = () => {
        if (!cancelled) { setSrc(url); setReady(true); }
      };
      img.onerror = () => { /* stay on placeholder */ };
      img.src = url;
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, item?.item_image_url, item?.sub_category_name, item?.variant_grade]);

  return (
    <img
      src={src}
      alt={item?.variant_grade || item?.sub_category_name || 'Item'}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        objectFit: 'cover',
        borderRadius: radius,
        display: 'block',
        flexShrink: 0,
        border: '1px solid var(--border)',
        background: bg,
        cursor: onClick ? 'pointer' : undefined,
        transition: ready ? 'opacity 0.25s ease' : 'none',
        opacity: 1,
        ...style,
      }}
      onError={() => setSrc(placeholder)}
    />
  );
}
