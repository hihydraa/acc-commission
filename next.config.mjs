/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "exceljs", "pdfjs-dist"],
  },
};

export default nextConfig;
