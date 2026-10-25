export async function teacherFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'XMLHttpRequest');
  return fetch(path, { ...options, headers, credentials: 'same-origin', redirect: 'manual' });
}

export function teacherSignInRequired(response: Response): boolean {
  return response.status === 401 || response.type === 'opaqueredirect' || response.status === 302;
}

type TeacherResponse = { error?: string; signInUrl?: string; signOutUrl?: string };
export async function teacherJSON<T extends object = Record<string, unknown>>(response: Response): Promise<T & TeacherResponse> {
  if (response.headers.get('Content-Type')?.includes('application/json')) {
    try { return await response.json(); } catch { /* Show a useful error for a malformed gateway response. */ }
  }
  return { error: teacherSignInRequired(response) ? 'Your teacher sign-in has expired. Sign in again.' : 'Unable to read the teacher service response. Please try again.', signInUrl: '/teacher' } as T & TeacherResponse;
}
