import { handle } from './api.ts';
import { cloudflareAccess } from './cloudflare-auth.ts';
import type { JWTVerifyGetKey } from 'jose';
import type { Assets, Environment } from './types.ts';

export async function handleCloudflare(request: Request, env: Environment, assets: Assets = {}, testKeys?: JWTVerifyGetKey): Promise<Response> {
  const path = new URL(request.url).pathname;
  const access = path === '/api/teacher' || path.startsWith('/api/teacher/')
    ? await cloudflareAccess(request, env, testKeys)
    : { signInUrl: '/teacher', signOutUrl: '/cdn-cgi/access/logout' };
  return handle(request, env, assets, access);
}
