import type { Platform, Rect } from './types';

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

export function getPlatformCollisionRect(platform: Platform): Rect {
  const defaultRect = getDefaultPlatformCollisionRect(platform);
  return {
    x: platform.x + (platform.collisionOffsetX ?? defaultRect.x - platform.x),
    y: platform.y + (platform.collisionOffsetY ?? defaultRect.y - platform.y),
    w: platform.collisionW ?? defaultRect.w,
    h: platform.collisionH ?? defaultRect.h,
  };
}

export function hasCustomPlatformCollision(platform: Platform): boolean {
  return (
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

export function resetPlatformCollisionOverrides(platform: Platform): void {
  delete platform.collisionOffsetX;
  delete platform.collisionOffsetY;
  delete platform.collisionW;
  delete platform.collisionH;
}

export function clampPlatformCollisionOverrides(platform: Platform): void {
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
  platform.collisionOffsetX = Math.round((platform.collisionOffsetX ?? 0) * scaleX);
  platform.collisionOffsetY = Math.round((platform.collisionOffsetY ?? 0) * scaleY);
  platform.collisionW = Math.round((platform.collisionW ?? platform.w) * scaleX);
  platform.collisionH = Math.round((platform.collisionH ?? platform.h) * scaleY);
  clampPlatformCollisionOverrides(platform);
}

export function getPlatformGroundClampOffset(platform: Platform): number {
  const hit = getPlatformCollisionRect(platform);
  return hit.y - platform.y + hit.h;
}

export function getPlatformCollisionSummary(platform: Platform): string {
  if (!hasCustomPlatformCollision(platform)) return '';
  const hit = getPlatformCollisionRect(platform);
  const ox = Math.round(hit.x - platform.x);
  const oy = Math.round(hit.y - platform.y);
  return `  cw:${Math.round(hit.w)}  ch:${Math.round(hit.h)}  cox:${ox}  coy:${oy}`;
}