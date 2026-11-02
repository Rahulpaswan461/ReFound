/** A bookmark with a spark: something saved, found again. Mirrors the toolbar icon. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="16 16 96 96" aria-hidden="true">
      <rect x="16" y="16" width="96" height="96" rx="24" fill="#f0c778" />
      <path d="M42 34h28a4 4 0 0 1 4 4v56l-18-12-18 12V38a4 4 0 0 1 4-4z" fill="#2a2110" />
      <path
        d="M88 31C90.3 41.7 90.3 41.7 101 44C90.3 46.3 90.3 46.3 88 57C85.7 46.3 85.7 46.3 75 44C85.7 41.7 85.7 41.7 88 31Z"
        fill="#2a2110"
      />
    </svg>
  );
}
