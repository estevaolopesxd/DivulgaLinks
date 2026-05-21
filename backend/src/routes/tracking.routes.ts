import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/r/:shortCode
 *
 * Public redirect route — no auth required.
 * Finds the product whose trackingUrl ends with /r/<shortCode>,
 * logs the click to ClickLog, then 302-redirects to affiliateUrl.
 */
router.get('/:shortCode', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { shortCode } = req.params;

  try {
    // Find product by matching the trailing shortCode in trackingUrl
    const product = await prisma.product.findFirst({
      where: {
        trackingUrl: {
          endsWith: `/r/${shortCode}`,
        },
      },
    });

    if (!product) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }

    // Log the click
    await prisma.clickLog.create({
      data: {
        productId: product.id,
        shortCode,
        ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    });

    logger.info('Tracking: click registered', {
      shortCode,
      productId: product.id,
    });

    // Redirect to the actual affiliate URL
    res.redirect(302, product.affiliateUrl);
  } catch (error) {
    next(error);
  }
});

export default router;
