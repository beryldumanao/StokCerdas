// Loader khusus tes: mengizinkan impor relatif tanpa ekstensi ("./demo") seperti yang dipakai bundler Next.js.
export async function resolve(spec, ctx, next) {
  if (/^\.\.?\//.test(spec) && !/\.[mc]?[jt]sx?$/.test(spec)) { try { return await next(spec + ".ts", ctx); } catch { /* lanjut */ } }
  return next(spec, ctx);
}
