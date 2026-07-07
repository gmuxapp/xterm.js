/**
 * Copyright (c) 2020 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { ImageStorage, CELL_SIZE_DEFAULT } from './ImageStorage';
import { IImageAddonOptions, ITerminalExt } from './Types';
import { ImageRenderer } from './ImageRenderer';

/**
 * Sixel-specific image storage controller.
 *
 * Wraps the shared ImageStorage with sixel protocol semantics:
 * - Cursor behavior governed by DECSET 80 (sixelScrolling option)
 * - advanceCursor for empty sixels carrying only height
 */
export class SixelImageStorage {
  constructor(
    private readonly _storage: ImageStorage,
    private readonly _opts: IImageAddonOptions,
    private readonly _renderer: ImageRenderer,
    private readonly _terminal: ITerminalExt
  ) {}

  /**
   * Add a sixel image to storage.
   * Cursor behavior depends on the sixelScrolling option (DECSET 80).
   */
  public addImage(img: HTMLCanvasElement | ImageBitmap): void {
    this._storage.addImage(this._toDevicePixels(img), this._opts.sixelScrolling);
  }

  /**
   * Sixel pixels are decoded at their intrinsic resolution and treated as CSS
   * pixels (image px == CSS px). The renderer tiles/draws in device pixels, so
   * upscale to device resolution here to keep the displayed size correct and
   * the backing store crisp on HiDPI. No-op at DPR 1.
   */
  private _toDevicePixels(img: HTMLCanvasElement | ImageBitmap): HTMLCanvasElement | ImageBitmap {
    const dpr = this._renderer.dpr;
    if (dpr === 1) {
      return img;
    }
    const dw = Math.round(img.width * dpr);
    const dh = Math.round(img.height * dpr);
    const canvas = ImageRenderer.createCanvas(undefined, dw, dh);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return img;
    }
    ctx.drawImage(img, 0, 0, dw, dh);
    return canvas;
  }

  /**
   * Only advance text cursor.
   * This is an edge case from empty sixels carrying only a height but no pixels.
   * Partially fixes https://github.com/jerch/xterm-addon-image/issues/37.
   */
  public advanceCursor(height: number): void {
    if (this._opts.sixelScrolling) {
      let cellSize = this._renderer.cellSize;
      if (cellSize.width === -1 || cellSize.height === -1) {
        cellSize = CELL_SIZE_DEFAULT;
      }
      const rows = Math.ceil(height / cellSize.height);
      for (let i = 1; i < rows; ++i) {
        this._terminal._core._inputHandler.lineFeed();
      }
    }
  }
}
