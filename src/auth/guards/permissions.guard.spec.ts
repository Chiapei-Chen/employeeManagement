import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../auth-user.js';
import {
  AUTHENTICATED_ONLY_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
} from '../decorators/access.decorators.js';
import { Permission, Role } from '../permissions.js';
import { PermissionsGuard } from './permissions.guard.js';

function contextFor(
  metadata: Record<string, unknown>,
  user?: AuthUser,
): ExecutionContext {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const admin: AuthUser = { id: 1, username: 'admin', role: Role.Admin };
const viewer: AuthUser = { id: 2, username: 'viewer', role: Role.Readonly };

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('allows @Public routes', () => {
    expect(guard.canActivate(contextFor({ [IS_PUBLIC_KEY]: true }))).toBe(true);
  });

  it('allows @AuthenticatedOnly routes for any role', () => {
    expect(
      guard.canActivate(contextFor({ [AUTHENTICATED_ONLY_KEY]: true }, viewer)),
    ).toBe(true);
  });

  it('fails closed when a route declares no access policy', () => {
    expect(() => guard.canActivate(contextFor({}, admin))).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN', status: 403 }),
    );
  });

  it.each([
    [viewer, Permission.EmployeeRead, true],
    [viewer, Permission.EmployeeCreate, false],
    [viewer, Permission.EmployeeUpdate, false],
    [admin, Permission.EmployeeRead, true],
    [admin, Permission.EmployeeCreate, true],
    [admin, Permission.EmployeeUpdate, true],
  ])('%o requesting %s -> allowed=%s', (user, permission, allowed) => {
    const ctx = contextFor({ [PERMISSIONS_KEY]: [permission] }, user);
    if (allowed) {
      expect(guard.canActivate(ctx)).toBe(true);
    } else {
      expect(() => guard.canActivate(ctx)).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN', status: 403 }),
      );
    }
  });
});
