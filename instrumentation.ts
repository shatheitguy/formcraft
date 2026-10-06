// Runs once when the Next.js server boots.
export async function register() {
  // Must stay an inline `if` so the bundler drops the Node-only import from the Edge build.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startup } = await import('./lib/startup');
    await startup();
  }
}
