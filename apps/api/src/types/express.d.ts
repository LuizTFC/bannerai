import type { User as DbUser } from "../generated/prisma/client.js";

declare global {
  namespace Express {
    // Passport attaches the deserialized database user to req.user
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface User extends DbUser {}
  }
}

declare module "express-session" {
  interface SessionData {
    csrfToken?: string;
    userId?: string;
    loginAt?: number;
  }
}

export {};
