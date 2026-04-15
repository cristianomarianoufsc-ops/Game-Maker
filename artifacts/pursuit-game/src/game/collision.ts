import type { CollisionBox, Platform, Rect } from './types';

const CAR_COLLISION_W_RATIO = 0.82;
const CAR_COLLISION_H_RATIO = 0.68;

export function getDefaultPlatformCollisionRect(platform: Platform): Rect {
  if (platform.type === 'car') {
    const w = Math.round(platform.w * CAR_COLLISION_W_RATIO);
    const h = Math.round(platform.h * CAR_COLLISION_H_RATIO);
    return {
      x: platform.x + Math.round((platform.w - w) / 2),
      y: platform.y,
      w,
      h,
    };
  }

  return {
    x: platform.x,
    y: platform.y,
    w: platform.w,
    h: platform.h,
  };
}

function rectToBox(platform: Platform, rect: Rect): CollisionBox {
  return {
    x: Math.round(rect.x - platform.x),
    y: Math.round(rect.y - platform.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
  };
}

function clampBox(platform: Platform, box: CollisionBox): CollisionBox {
  const minSize = 6;
  const w = Math.max(minSize, Math.min(Math.round(box.w), platform.w));
  const h = Math.max(minSize, Math.min(Math.round(box.h), platform.h));
  const x = Math.max(0, Math.min(Math.round(box.x), platform.w - w));
  const y = Math.max(0, Math.min(Math.round(box.y), platform.h - h));
  return { x, y, w, h };
}

export function getPlatformCollisionBoxes(platform: Platform): CollisionBox[] {
  if (platform.collisionBoxes && platform.collisionBoxes.length > 0) {
    return platform.collisionBoxes.map((box) => clampBox(platform, box));
  }

  const defaultRect = getDefaultPlatformCollisionRect(platform);
  return [
    clampBox(platform, {
      x: platform.collisionOffsetX ?? defaultRect.x - platform.x,
      y: platform.collisionOffsetY ?? defaultRect.y - platform.y,
      w: platform.collisionW ?? defaultRect.w,
      h: platform.collisionH ?? defaultRect.h,
    }),
  ];
}

export function getPlatformCollisionRects(platform: Platform): Rect[] {
  return getPlatformCollisionBoxes(platform).map((box) => ({
    x: platform.x + box.x,
    y: platform.y + box.y,
    w: box.w,
    h: box.h,
  }));
}

export function getPlatformCollisionRect(platform: Platform): Rect {
  return getPlatformCollisionRects(platform)[0] ?? getDefaultPlatformCollisionRect(platform);
}

export function hasCustomPlatformCollision(platform: Platform): boolean {
  return (
    (platform.collisionBoxes !== undefined && platform.collisionBoxes.length > 0) ||
    platform.collisionW !== undefined ||
    platform.collisionH !== undefined ||
    platform.collisionOffsetX !== undefined ||
    platform.collisionOffsetY !== undefined
  );
}

export function ensurePlatformCollisionOverrides(platform: Platform): void {
  const hit = getPlatformCollisionRect(platform);
  platform.collisionOffsetX = Math.round(hit.x - platform.x);
  platform.collisionOffsetY = Math.round(hit.y - platform.y);
  platform.collisionW = Math.round(hit.w);
  platform.collisionH = Math.round(hit.h);
}

export function ensurePlatformCollisionBoxes(platform: Platform): CollisionBox[] {
  if (!platform.collisionBoxes || platform.collisionBoxes.length === 0) {
    platform.collisionBoxes = getPlatformCollisionRects(platform).map((rect) => rectToBox(platform, rect));
  }
  platform.collisionBoxes = platform.collisionBoxes.map((box) => clampBox(platform, box));
  delete platform.collisionOffsetX;
  delete platform.collisionOffsetY;
  delete platform.collisionW;
  delete platform.collisionH;
  return platform.collisionBoxes;
}

export function ensurePlatformCollisionBox(platform: Platform, index: number): CollisionBox {
  const boxes = ensurePlatformCollisionBoxes(platform);
  const safeIndex = Math.max(0, Math.min(index, boxes.length - 1));
  boxes[safeIndex] = clampBox(platform, boxes[safeIndex]);
  return boxes[safeIndex];
}

export function addPlatformCollisionBox(platform: Platform, sourceIndex: number): number {
  const boxes = ensurePlatformCollisionBoxes(platform);
  const source = boxes[Math.max(0, Math.min(sourceIndex, boxes.length - 1))] ?? {
    x: 0,
    y: 0,
    w: Math.max(20, Math.round(platform.w / 3)),
    h: Math.max(12, Math.round(platform.h / 2)),
  };
  const copy = clampBox(platform, {
    x: source.x + 12,
    y: source.y,
    w: source.w,
    h: source.h,
  });
  boxes.push(copy);
  return boxes.length - 1;
}

export function removePlatformCollisionBox(platform: Platform, index: number): number {
  const boxes = platform.collisionBoxes;
  if (!boxes || boxes.length === 0) return 0;
  if (boxes.length === 1) {
    // Última caixa — remove todo o override customizado
    delete platform.collisionBoxes;
    delete platform.collisionOffsetX;
    delete platform.collisionOffsetY;
    delete platform.collisionW;
    delete platform.collisionH;
    return 0;
  }
  boxes.splice(index, 1);
  return Math.max(0, Math.min(index, boxes.length - 1));
}

export function resetPlatformCollisionOverrides(platform: Platform): void {
  delete platform.collisionBoxes;
  delete platform.collisionOffsetX;
  delete platform.collisionOffsetY;
  delete platform.collisionW;
  delete platform.collisionH;
}

export function clampPlatformCollisionOverrides(platform: Platform): void {
  if (platform.collisionBoxes && platform.collisionBoxes.length > 0) {
    platform.collisionBoxes = platform.collisionBoxes.map((box) => clampBox(platform, box));
    return;
  }

  ensurePlatformCollisionOverrides(platform);
  const minSize = 6;
  const w = Math.max(minSize, Math.min(platform.collisionW ?? platform.w, platform.w));
  const h = Math.max(minSize, Math.min(platform.collisionH ?? platform.h, platform.h));
  const ox = Math.max(0, Math.min(platform.collisionOffsetX ?? 0, platform.w - w));
  const oy = Math.max(0, Math.min(platform.collisionOffsetY ?? 0, platform.h - h));
  platform.collisionW = Math.round(w);
  platform.collisionH = Math.round(h);
  platform.collisionOffsetX = Math.round(ox);
  platform.collisionOffsetY = Math.round(oy);
}

export function scalePlatformCollisionOverrides(
  platform: Platform,
  scaleX: number,
  scaleY: number,
): void {
  if (!hasCustomPlatformCollision(platform)) return;
  if (platform.collisionBoxes && platform.collisionBoxes.length > 0) {
    platform.collisionBoxes = platform.collisionBoxes.map((box) => clampBox(platform, {
      x: Math.round(box.x * scaleX),
      y: Math.round(box.y * scaleY),
      w: Math.round(box.w * scaleX),
      h: Math.round(box.h * scaleY),
    }));
    return;
  }
  platform.collisionOffsetX = Math.round((platform.collisionOffsetX ?? 0) * scaleX);
  platform.collisionOffsetY = Math.round((platform.collisionOffsetY ?? 0) * scaleY);
  platform.collisionW = Math.round((platform.collisionW ?? platform.w) * scaleX);
  platform.collisionH = Math.round((platform.collisionH ?? platform.h) * scaleY);
  clampPlatformCollisionOverrides(platform);
}

export function getPlatformGroundClampOffset(platform: Platform): number {
  return Math.max(...getPlatformCollisionRects(platform).map((hit) => hit.y - platform.y + hit.h));
}

export function getPlatformCollisionSummary(platform: Platform): string {
  if (!hasCustomPlatformCollision(platform)) return '';
  if (platform.collisionBoxes && platform.collisionBoxes.length > 0) {
    const boxes = getPlatformCollisionBoxes(platform)
      .map((box) => `${box.x},${box.y},${box.w},${box.h}`)
      .join('|');
    return `  boxes:${boxes}`;
  }
  const hit = getPlatformCollisionRect(platform);
  const ox = Math.round(hit.x - platform.x);
  const oy = Math.round(hit.y - platform.y);
  return `  cw:${Math.round(hit.w)}  ch:${Math.round(hit.h)}  cox:${ox}  coy:${oy}`;
}