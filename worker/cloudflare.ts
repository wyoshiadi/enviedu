import assets from 'enviedu:assets';
import { handleCloudflare } from '../server/cloudflare-handler.ts';
import { scheduledSessionCleanup } from '../server/session-retention.ts';
import type { Environment } from '../server/types.ts';

export default { fetch(request: Request, env: Environment) { return handleCloudflare(request, env, assets); }, scheduled: scheduledSessionCleanup };
