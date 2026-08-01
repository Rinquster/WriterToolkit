export function normalizeBase(baseUrl: string): string {
  if (!baseUrl || baseUrl === '/') {
    return '/';
  }

  return `/${baseUrl.replace(/^\/+|\/+$/g, '')}`;
}
