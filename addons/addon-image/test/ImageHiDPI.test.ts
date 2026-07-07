/**
 * Copyright (c) 2026 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import test, { Browser } from '@playwright/test';
import { readFileSync } from 'fs';
import { ITestContext, createTestContext, openTerminal, pollFor } from '../../../test/playwright/TestUtils';
import { deepStrictEqual, strictEqual } from 'assert';

/**
 * Regression coverage for HiDPI (devicePixelRatio) image rendering.
 *
 * The image addon renders into a device-pixel backing store and tiles/places
 * images in device pixels, while the image protocols define sizes in CSS
 * pixels (1 image pixel == 1 CSS pixel). A previous fix sized the backing
 * store in device pixels but left the decoders producing CSS-resolution
 * sources, so on DPR>1 the placement math halved every image. These tests
 * pin the two invariants of the corrected behaviour:
 *
 *   1. an image occupies the same cell area at any devicePixelRatio, and
 *   2. sources are rasterized at device resolution (crisp on HiDPI).
 *
 * A 72x48 PNG delivered over the iTerm inline-image (IIP) protocol at its
 * natural size (width/height default to auto ⇒ image px == CSS px).
 */
const IIP_W3C_PNG = readFileSync('./addons/addon-image/fixture/iip/w3c_png.iip', { encoding: 'utf-8' });
const INTRINSIC_WIDTH = 72;
const INTRINSIC_HEIGHT = 48;

/**
 * Open a terminal at the given devicePixelRatio, render the test image, and
 * hand the ready context to `read`. The context is always torn down.
 */
async function renderAtDpr<T>(
  browser: Browser,
  deviceScaleFactor: number,
  read: (ctx: ITestContext) => Promise<T>
): Promise<T> {
  const ctx = await createTestContext(browser, { deviceScaleFactor });
  try {
    await openTerminal(ctx, { cols: 80, rows: 24 });
    await ctx.page.evaluate(`
      window.imageAddon = new ImageAddon();
      window.term.loadAddon(window.imageAddon);
    `);
    await ctx.proxy.write(IIP_W3C_PNG);
    await pollFor(ctx.page, 'window.imageAddon._storage._images.size', 1);
    return await read(ctx);
  } finally {
    await ctx.page.close();
  }
}

/** Cells the stored image occupies on screen (cols * rows, bounded by view). */
const tileCount = (ctx: ITestContext): Promise<number> =>
  ctx.page.evaluate('window.imageAddon._storage._images.get(1).tileCount');

/** Pixel dimensions of the rasterized source held in storage. */
const sourceSize = (ctx: ITestContext): Promise<[number, number]> =>
  ctx.page.evaluate<any>(`[
    window.imageAddon._storage._images.get(1).orig.width,
    window.imageAddon._storage._images.get(1).orig.height
  ]`);

test.describe('ImageAddon - HiDPI (devicePixelRatio)', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'image addon tests do not run on webkit');

  test('image occupies the same cell area at DPR 1 and DPR 2', async ({ browser }) => {
    const atDpr1 = await renderAtDpr(browser, 1, tileCount);
    const atDpr2 = await renderAtDpr(browser, 2, tileCount);
    strictEqual(
      atDpr2,
      atDpr1,
      'image must span the same number of cells at DPR 2 as at DPR 1 (regressed to half size)'
    );
  });

  test('source is rasterized at device resolution (crisp on HiDPI)', async ({ browser }) => {
    deepStrictEqual(
      await renderAtDpr(browser, 1, sourceSize),
      [INTRINSIC_WIDTH, INTRINSIC_HEIGHT],
      'at DPR 1 the source keeps its intrinsic (CSS-pixel) size'
    );
    deepStrictEqual(
      await renderAtDpr(browser, 2, sourceSize),
      [INTRINSIC_WIDTH * 2, INTRINSIC_HEIGHT * 2],
      'at DPR 2 the source is rasterized at 2x for a device-resolution backing store'
    );
  });
});
