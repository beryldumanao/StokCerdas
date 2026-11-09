/** @type {import('next').NextConfig} */
const securityHeaders = [
  {key: "X-Content-Type-Options", value: "nosniff"},
  {key: "X-Frame-Options", value: "DENY"},
  {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
  {key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()"},
  {key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains"},
  // Subset CSP yang aman tanpa nonce: melarang embed di situs lain, plugin, dan <base> palsu.
  {key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'"},
];
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() { return [{source: "/:path*", headers: securityHeaders}]; },
};
export default nextConfig;
