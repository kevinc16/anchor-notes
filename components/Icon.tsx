import library from '@/assets/icons/library.svg?raw';
import settings from '@/assets/icons/settings.svg?raw';
import search from '@/assets/icons/search.svg?raw';
import external from '@/assets/icons/external.svg?raw';
import chevron from '@/assets/icons/chevron.svg?raw';
import close from '@/assets/icons/close.svg?raw';

const icons = { library, settings, search, external, chevron, close };

export function Icon({ name, className = '' }: { name: keyof typeof icons; className?: string }) {
  // Only bundled SVG assets enter this markup; user content is never interpolated.
  return <span className={`inline-flex shrink-0 ${className}`} dangerouslySetInnerHTML={{ __html: icons[name] }} />;
}
