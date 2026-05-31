import type { FabricObject } from 'fabric';
import { util } from 'fabric';
import type { Control } from 'fabric';

export function renderIcon(icon: HTMLCanvasElement): Control['render'] {
  return function renderIconControl(ctx, left, top, _styleOverride, fabricObject) {
    const size = this.cornerSize ?? 24;
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(util.degreesToRadians(fabricObject.angle ?? 0));
    ctx.drawImage(icon, -size / 2, -size / 2, size, size);
    ctx.restore();
  };
}

export type { FabricObject };
