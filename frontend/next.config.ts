import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
