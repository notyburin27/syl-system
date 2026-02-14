/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ant Design SSR support
  transpilePackages: ['antd', '@ant-design/icons'],

  // Exclude pdf-parse from webpack bundling (uses native Node.js require)
  serverExternalPackages: ['pdf-parse'],

  // Disable x-powered-by header
  poweredByHeader: false,

  // Skip ESLint and TypeScript errors during build
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Disable React strict mode
  reactStrictMode: false,

  // Output for production deployment
  output: 'standalone',

  // Webpack configuration to handle bcrypt and optional dependencies
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle bcrypt on client side
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }

    // Ignore optional dependencies of bcrypt
    config.externals = [...config.externals, 'mock-aws-s3', 'aws-sdk', 'nock'];

    // Ignore HTML files in node_modules
    config.module.rules.push({
      test: /\.html$/,
      loader: 'ignore-loader',
    });

    return config;
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
