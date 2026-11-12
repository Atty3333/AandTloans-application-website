import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/apply', '/dashboard', '/profile', '/reset-password', '/api/'] } };
}
