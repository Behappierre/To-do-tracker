const stakeholderAppOrigin = (() => {
  try {
    const url = new URL(
      process.env.STAKEHOLDER_APP_URL || 'https://stakemapper.netlify.app'
    )
    const isLocalDevelopment =
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')

    return url.protocol === 'https:' || isLocalDevelopment
      ? url.origin
      : 'https://stakemapper.netlify.app'
  } catch {
    return 'https://stakemapper.netlify.app'
  }
})()

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
  async headers() {
    return [
      {
        source: '/dashboard/stakeholders',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: `frame-src 'self' ${stakeholderAppOrigin}`,
          },
        ],
      },
    ]
  },
}

export default nextConfig
