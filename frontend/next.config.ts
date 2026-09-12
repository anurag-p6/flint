import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Trust tunnel origins for dev HMR (cloudflared quick tunnels rotate hosts). */
  allowedDevOrigins: ["*.trycloudflare.com"],
};

const headers = async () => {
  return ( [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Permissions-Policy',
          value: 'hid=*'
        }
      ]
    }
  ]
)};

export default nextConfig;
