/** @type {import("next").NextConfig} */
const nextConfig = {
  // Photo uploads go through server actions, one photo per request (see
  // components/Photos.jsx). Photos are capped at 12 MB each (lib/storage.js);
  // this leaves room for one at the cap plus the form's own overhead.
  experimental: { serverActions: { bodySizeLimit: "14mb" } },
  // Uploads are served straight from public/assets — no optimizer in the path,
  // which keeps this portable to hosts without a sharp build.
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true }
};
export default nextConfig;
