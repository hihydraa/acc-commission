/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "exceljs", "pdfjs-dist"],
    // pdfjs-dist dynamically imports its worker file at a path it computes
    // relative to its own module location. Next's file tracing can't see
    // that dynamic import statically, so without this the worker file gets
    // left out of the deployed function bundle entirely and pdfjs fails at
    // runtime with "Cannot find module .../pdf.worker.mjs" on Vercel even
    // though it works fine locally (node_modules has everything locally).
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/pdfjs-dist/legacy/build/*.mjs"],
    },
  },
};

export default nextConfig;
