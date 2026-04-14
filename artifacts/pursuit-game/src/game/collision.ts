import type { Platform, Rect } from './types';

const CAR_COLLISION_W_RATIO = 0.82;
const CAR_COLLISION_H_RATIO = 0.68;

export function getPlatformCollisionRect(platform: Platform): Rect {
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
    x: platform.x + (platform.collisionOffsetX ?? 0),
    y: platform.y + (platform.collisionOffsetY ?? 0),
    w: platform.collisionW ?? platform.w,
    h: platform.collisionH ?? platform.h,
  };
}

export function getPlatformGroundClampOffset(platform: Platform): number {
  if (platform.type === 'car') {
    return Math.round(platform.h * CAR_COLLISION_H_RATIO);
  }

  return (platform.collisionOffsetY ?? 0) + (platform.collisionH ?? platform.h);
}