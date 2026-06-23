import type { NextConfig } from "next";
import path from "path";

const ninaRoot = path.resolve(__dirname, "../nina-api-oficial/src").replace(/\\/g, '/');

const nextConfig: NextConfig = {
  output: 'standalone',
  trailingSlash: true,
  allowedDevOrigins: ['192.168.0.241'],
  typescript: {
    // Ignore TypeScript errors in ninaapioficial
    ignoreBuildErrors: true,
    tsconfigPath: './tsconfig.json'
  },
  turbopack: {},

  webpack(config, { webpack: wp }) {
    // ── Nina @/ alias: resolve @/foo → nina-api-oficial/src/foo when the
    //    importing file lives inside nina-api-oficial/ (contextual alias).
    //    Pulsar's own @/ alias (set by Next.js via tsconfig paths) is untouched.
    config.plugins.push({
      apply(compiler: any) {
        compiler.hooks.normalModuleFactory.tap('NinaAliasPlugin', (nmf: any) => {
          nmf.hooks.beforeResolve.tap('NinaAliasPlugin', (data: any) => {
            if (!data?.request?.startsWith('@/')) return;
            if (data.context?.includes('nina-api-oficial')) {
              // path.join uses OS separators; normalize to forward-slashes for webpack.
              data.request = path.join(ninaRoot, data.request.slice(2)).replace(/\\/g, '/');
            }
          });
        });
      },
    });

    // ── Nina @nina/hooks → frontend/hooks/nina redirect
    //    Ensures all Nina components use Pulsar's hooks, not their own.
    config.plugins.push({
      apply(compiler: any) {
        compiler.hooks.normalModuleFactory.tap('NinaHooksRedirect', (nmf: any) => {
          nmf.hooks.beforeResolve.tap('NinaHooksRedirect', (data: any) => {
            if (!data?.request?.startsWith('@nina/hooks/')) return;
            // Redirect @nina/hooks/useAuth → frontend/hooks/nina/useAuth
            const hookName = data.request.slice('@nina/hooks/'.length);
            data.request = path.resolve(__dirname, `hooks/nina/${hookName}`).replace(/\\/g, '/');
          });
        });
      },
    });

    // ── Replace Nina's build-time globals (import.meta.env.VITE_NINA_*)
    //    with values from Pulsar's .env.local (NEXT_PUBLIC_NINA_*).
    //    These globals are also defined in nina-api-oficial/vite.config.ts for
    //    standalone Vite builds.
    config.plugins.push(
      new wp.DefinePlugin({
        '__NINA_SUPABASE_URL__': JSON.stringify(process.env.NEXT_PUBLIC_NINA_SUPABASE_URL ?? ''),
        '__NINA_SUPABASE_KEY__': JSON.stringify(process.env.NEXT_PUBLIC_NINA_SUPABASE_ANON_KEY ?? ''),
        '__NINA_PROJECT_ID__': JSON.stringify(process.env.NEXT_PUBLIC_NINA_PROJECT_ID ?? ''),
        // These cover any Nina file that still reads import.meta.env directly.
        'import.meta.env.VITE_NINA_SUPABASE_URL': JSON.stringify(process.env.NEXT_PUBLIC_NINA_SUPABASE_URL ?? ''),
        'import.meta.env.VITE_NINA_SUPABASE_ANON_KEY': JSON.stringify(process.env.NEXT_PUBLIC_NINA_SUPABASE_ANON_KEY ?? ''),
        'import.meta.env.VITE_NINA_PROJECT_ID': JSON.stringify(process.env.NEXT_PUBLIC_NINA_PROJECT_ID ?? ''),
        'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'development'),
        'import.meta.env.DEV': String(process.env.NODE_ENV !== 'production'),
        'import.meta.env.PROD': String(process.env.NODE_ENV === 'production'),
        'import.meta.env.SSR': 'false',
      })
    );

    // ── @nina alias: used in Pulsar files to import from Nina's src.
    //    e.g. import Dashboard from '@nina/components/Dashboard'
    // DISABLED: Using local refactored components in frontend/components/nina/ instead
    // config.resolve.alias = {
    //   ...config.resolve.alias,
    //   '@nina': ninaRoot,
    // };

    // ── Module resolution for Nina files: nina-api-oficial/ is a sibling of
    //    frontend/, so webpack's default node_modules traversal never reaches
    //    frontend/node_modules when resolving Nina imports. Adding it explicitly
    //    ensures packages like class-variance-authority, zod, sonner, etc. are
    //    found without duplicating them inside nina-api-oficial/.
    config.resolve.modules = [
      path.resolve(__dirname, 'node_modules'),
      ...(config.resolve.modules ?? ['node_modules']),
    ];

    return config;
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            // Added Nina's Supabase to connect-src so Nina API/Realtime calls succeed.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self'",
              [
                "connect-src 'self'",
                // Pulsar Supabase
                "https://wmugemamnqxjfpxrlwes.supabase.co",
                "wss://wmugemamnqxjfpxrlwes.supabase.co",
                // Nina Supabase (Phase 1 backend)
                "https://mlttucjfmqnzbctwysks.supabase.co",
                "wss://mlttucjfmqnzbctwysks.supabase.co",
                // Local dev
                "http://127.0.0.1:3010",
                "http://localhost:3010",
              ].join(' '),
              "frame-ancestors 'none'",
            ].join('; '),
          },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
          },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

export default nextConfig;
