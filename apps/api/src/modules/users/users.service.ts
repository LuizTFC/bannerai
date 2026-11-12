import type { UserDto, UserSettings } from "@bannerai/shared";
import { userSettingsSchema } from "@bannerai/shared";
import { prisma } from "../../database/prisma.js";
import type { User } from "../../generated/prisma/client.js";
import { ForbiddenError, NotFoundError } from "../../utils/errors.js";

export interface GoogleProfileInput {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export function parseUserSettings(raw: unknown): UserSettings {
  const parsed = userSettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    settings: parseUserSettings(user.settings),
    creditBalance: user.creditBalance,
    createdAt: user.createdAt.toISOString(),
  };
}

export class UsersService {
  constructor(private readonly allowedEmailDomains: string[] = []) {}

  /** Creates the user on first login or updates profile data on subsequent logins. */
  async upsertFromGoogle(profile: GoogleProfileInput): Promise<User> {
    const email = profile.email.toLowerCase();
    if (this.allowedEmailDomains.length > 0) {
      const domain = email.split("@")[1] ?? "";
      if (!this.allowedEmailDomains.includes(domain)) {
        throw new ForbiddenError("This Google account is not allowed to access the studio.");
      }
    }
    const existing = await prisma.user.findFirst({ where: { OR: [{ googleId: profile.googleId }, { email }] } });
    if (existing) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { googleId: profile.googleId, email, name: profile.name, avatarUrl: profile.avatarUrl, lastLoginAt: new Date() },
      });
    }
    return prisma.user.create({
      data: { googleId: profile.googleId, email, name: profile.name, avatarUrl: profile.avatarUrl, lastLoginAt: new Date() },
    });
  }

  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async updateSettings(userId: string, patch: UserSettings): Promise<User> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");
    const merged = { ...parseUserSettings(user.settings), ...patch };
    // Drop undefined keys so JSON stays clean
    const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined));
    return prisma.user.update({ where: { id: userId }, data: { settings: clean } });
  }
}

export const usersService = new UsersService();
