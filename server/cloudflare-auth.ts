import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import type { Environment, TeacherAccess } from './types.ts';

const keySets = new Map<string, JWTVerifyGetKey>();
const links = { signInUrl: '/teacher', signOutUrl: '/cdn-cgi/access/logout' };

export async function cloudflareAccess(request: Request, env: Environment, testKeys?: JWTVerifyGetKey): Promise<TeacherAccess> {
  let issuer: string;
  try {
    const team = new URL(env.CF_ACCESS_TEAM_DOMAIN || '');
    if (team.protocol !== 'https:' || !/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team.hostname)
      || team.port || team.username || team.password || team.pathname !== '/' || team.search || team.hash || !env.CF_ACCESS_AUD?.trim()) throw new Error('Invalid Access configuration');
    issuer = team.origin;
  } catch {
    return { ...links, error: { status: 503, message: 'Teacher sign-in is not configured.' } };
  }
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ...links, error: { status: 401, message: 'Sign in to the teacher account to continue.' } };
  try {
    let keys = testKeys || keySets.get(issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer), { timeoutDuration: 5000 });
      keySets.set(issuer, keys);
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer, audience: env.CF_ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp', 'sub', 'email']
    });
    if (typeof payload.sub !== 'string' || !payload.sub.trim() || typeof payload.email !== 'string' || !payload.email.trim()) throw new Error('Missing teacher identity');
    return { ...links, identity: { userId: payload.sub, email: payload.email } };
  } catch {
    return { ...links, error: { status: 401, message: 'Your teacher sign-in has expired or is invalid. Sign in again.' } };
  }
}
