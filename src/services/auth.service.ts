import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { IDatabase } from '../db/index.js';
import { AuthenticatedUser, Role, User } from '../types/index.js';
import { config } from '../config.js';

export class AuthService {
  constructor(private db: IDatabase) {}

  async authenticate(email: string, passwordPlain: string): Promise<{ token: string; user: AuthenticatedUser } | null> {
    const user = await this.db.get<User>('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return null;
    }

    const valid = await bcrypt.compare(passwordPlain, user.password_hash);
    if (!valid) {
      return null;
    }

    const authUser = await this.getAuthenticatedUser(user.id);
    if (!authUser) {
      return null;
    }

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
      },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    return { token, user: authUser };
  }

  async getAuthenticatedUser(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.db.get<User>('SELECT id, email, name FROM users WHERE id = ?', [userId]);
    if (!user) return null;

    const memberships = await this.db.query<{
      team_id: string;
      team_name: string;
      team_slug: string;
      role: Role;
    }>(
      `SELECT m.team_id, t.name as team_name, t.slug as team_slug, m.role
       FROM memberships m
       JOIN teams t ON m.team_id = t.id
       WHERE m.user_id = ?`,
      [userId]
    );

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      memberships,
    };
  }

  async listDemoUsers(): Promise<{ id: string; email: string; name: string; memberships: any[] }[]> {
    const users = await this.db.query<User>('SELECT id, email, name FROM users ORDER BY name ASC');
    const result = [];
    for (const u of users) {
      const authUser = await this.getAuthenticatedUser(u.id);
      if (authUser) result.push(authUser);
    }
    return result;
  }
}
