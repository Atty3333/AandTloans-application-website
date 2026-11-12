import type { MetadataRoute } from 'next';
import { LENDER_NAME } from '@/lib/config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: LENDER_NAME,
    short_name: 'A&T Loans',
    description: 'Fast, flexible student loan applications.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#faf8ff',
    theme_color: '#4c1d95',
    icons: [{ src: '/icon.jpg', sizes: 'any', type: 'image/jpeg' }],
  };
}
