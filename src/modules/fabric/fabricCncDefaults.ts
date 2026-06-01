import { FabricObject, Point } from 'fabric';
import { canvasPalette } from '../devlab/CanvasPalette';

/**
 * CNC engineering defaults: stroke must not inflate layout bounds or SVG coordinates.
 * Call once before any Fabric canvas or SVG IO is created.
 */
export function applyFabricCncDefaults(): void {
  const palette = canvasPalette.getState();
  FabricObject.prototype.strokeUniform = true;
  FabricObject.prototype.includeDefaultValues = false;
  FabricObject.prototype.cornerColor = palette.handleCorner;
  FabricObject.prototype.cornerStrokeColor = '#1a1a1a';
  FabricObject.prototype.borderColor = '#d1d1d6';
  FabricObject.prototype.transparentCorners = false;
  FabricObject.prototype.cornerStyle = 'rect';
  FabricObject.prototype.cornerSize = 9;

  FabricObject.prototype._getNonTransformedDimensions = function (
    this: FabricObject
  ): Point {
    return new Point(this.width, this.height);
  };
}
