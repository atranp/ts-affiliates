/** @type {import('next').NextConfig} */
const nextConfig = {
  // Lets a verification build run without clobbering the dev server's .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
