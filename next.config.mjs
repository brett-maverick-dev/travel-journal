/** @type {import("next").NextConfig} */
const nextConfig = {
  // Photo uploads go through server actions, so raise the action body limit.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  // Uploads are served straight from public/assets — no optimizer in the path,
  // which keeps this portable to hosts without a sharp build.
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true }
};
export default nextConfig;
