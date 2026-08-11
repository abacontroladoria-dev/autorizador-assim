import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== 'production';

// ── connect-src do CSP, derivado do ambiente em vez de fixo ────────────────
//
// Antes esta lista era hardcoded com o host do Supabase de produção. O efeito
// colateral era que apontar o app para QUALQUER outro Supabase — em especial a
// stack local em 127.0.0.1:54321 — fazia o browser bloquear a chamada antes de
// ela sair da página. O sintoma é traiçoeiro: "Failed to fetch" no login sem
// nenhuma requisição aparecendo no devtools, porque o CSP corta antes da rede.
//
// Derivar do env garante que em produção o valor resolve para o mesmo host de
// sempre, e que testar contra o banco local passa a funcionar sem editar config.
function origensSupabase(): string[] {
  const urls = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ].filter((u): u is string => !!u && u.startsWith('http'));

  const origens = new Set<string>();
  for (const url of urls) {
    try {
      const { origin, protocol, host } = new URL(url);
      origens.add(origin);
      // Realtime usa websocket no mesmo host
      origens.add(`${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}`);
    } catch {
      // URL malformada no env: ignorar em vez de derrubar o build
    }
  }
  return [...origens];
}

const nextConfig: NextConfig = {
  output: 'standalone',
  trailingSlash: true,
  // 127.0.0.1 é tratado como origem distinta de localhost pelo Next 16: sem isso
  // os recursos de dev são bloqueados e a página nunca hidrata (o form cai para
  // submit nativo e o handler React nunca roda).
  allowedDevOrigins: ['192.168.0.241', '127.0.0.1'],
  typescript: {
    tsconfigPath: './tsconfig.json'
  },
  turbopack: { root: __dirname },

  // O hook webpack() que existia aqui foi removido: ele servia a um esquema de
  // importar arquivos de nina-api-oficial/ (projeto Vite irmão, do CRM Nina) que
  // nunca chegou a existir. Definia nove globais — __NINA_SUPABASE_URL__ e
  // companhia, mais import.meta.env.* — e nenhuma delas tinha uma única
  // referência no código; e tsconfig.json exclui `../nina-api-oficial` do
  // programa, então nada de lá é compilado. Sob Turbopack o hook não roda em dev
  // de todo modo.

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
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self'",
              [
                "connect-src 'self'",
                // Hosts do Supabase em uso, derivados do ambiente
                ...origensSupabase(),
                // Stack local do Supabase CLI — apenas em desenvolvimento
                ...(isDev
                  ? [
                      'http://127.0.0.1:54321', 'ws://127.0.0.1:54321',
                      'http://localhost:54321', 'ws://localhost:54321',
                      'http://127.0.0.1:3010',  'http://localhost:3010',
                    ]
                  : []),
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
