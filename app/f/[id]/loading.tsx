/** Public form pages: a neutral loader (the form shows its own branding once it loads). */
export default function Loading() {
  return (
    <div role="status" className="fc-loader flex min-h-[100dvh] items-center justify-center">
      <div className="fc-track h-1 w-32 overflow-hidden rounded-full bg-slate-200" aria-hidden>
        <div className="fc-track-fill h-full w-1/3 rounded-full bg-brand-500" />
      </div>
    </div>
  );
}
