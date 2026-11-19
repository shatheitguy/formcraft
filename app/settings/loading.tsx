import { BrandLoader } from '@/components/brand-loader';

/** Switching between settings pages: the header and settings menu stay, the content area shows the loader. */
export default function Loading() {
  return <BrandLoader full={false} />;
}
