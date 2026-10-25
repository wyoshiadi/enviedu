import assets from 'enviedu:assets';
import { handle } from '../server/api.ts';
import type { Environment } from '../server/types.ts';
// This entry is only for the Sites gateway, which supplies trusted identity headers.
// Standalone Cloudflare deployments use cloudflare.ts instead.
export default { fetch(request: Request, env: Environment) {
  const userId = request.headers.get('oai-authenticated-user-id'), email = request.headers.get('oai-authenticated-user-email');
  return handle(request, env, assets, {
    ...(userId && email ? { identity: { userId, email } } : {}),
    signInUrl: '/signin-with-chatgpt?return_to=%2Fteacher',
    signOutUrl: '/signout-with-chatgpt?return_to=%2Fteacher'
  });
} };
