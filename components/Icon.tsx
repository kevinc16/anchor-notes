const paths = {
  library: 'M4 4h5v16H4z M9 4h5v16H9z M14 5l5-1 3 15-5 1z',
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
  search: 'M16 10a6 6 0 1 0-12 0 6 6 0 0 0 12 0 M14.5 14.5 21 21',
  external: 'M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7',
  chevron: 'M6 9l6 6 6-6',
};

export function Icon({ name, className = '' }: { name: keyof typeof paths; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <path d={paths[name]} />
    </svg>
  );
}
