import { AuthenticatedUser, Role } from '../types/index.js';

export class RbacService {
  /**
   * Get user's role in a specific team. Returns null if user is not a member.
   * If user has global ADMIN role in any team or is Alice Admin, they get ADMIN.
   */
  static getRoleInTeam(user: AuthenticatedUser, teamId: string): Role | null {
    // Check if user has global ADMIN role in any team
    const hasGlobalAdmin = user.memberships.some((m) => m.role === 'ADMIN');
    if (hasGlobalAdmin) {
      return 'ADMIN';
    }

    const membership = user.memberships.find((m) => m.team_id === teamId);
    return membership ? membership.role : null;
  }

  /**
   * Asserts user has access to view the team's data
   */
  static canViewTeam(user: AuthenticatedUser, teamId: string): boolean {
    const role = this.getRoleInTeam(user, teamId);
    return role !== null;
  }

  /**
   * Asserts user can create or modify items in this team (Requires MEMBER, LEAD, or ADMIN)
   */
  static canMutateTeamItem(user: AuthenticatedUser, teamId: string): boolean {
    const role = this.getRoleInTeam(user, teamId);
    return role === 'MEMBER' || role === 'LEAD' || role === 'ADMIN';
  }

  /**
   * Asserts user has permission to approve workflow steps (Requires LEAD or ADMIN)
   */
  static canApproveInTeam(user: AuthenticatedUser, teamId: string): boolean {
    const role = this.getRoleInTeam(user, teamId);
    return role === 'LEAD' || role === 'ADMIN';
  }
}
