import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { usersService } from "../users/users.service.js";

export const GOOGLE_CALLBACK_PATH = "/api/auth/google/callback";

export function configurePassport(): typeof passport {
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await usersService.findById(id);
      done(null, user ?? false);
    } catch (err) {
      done(err);
    }
  });

  if (env.googleOAuthConfigured) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID!,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
          callbackURL: `${env.apiPublicUrl}${GOOGLE_CALLBACK_PATH}`,
          scope: ["profile", "email"],
          // Stores a random state in the session and verifies it on callback (CSRF protection for OAuth)
          state: true,
        },
        async (_accessToken: string, _refreshToken: string, profile: Profile, done) => {
          try {
            const email = profile.emails?.find((e) => (e as { verified?: boolean }).verified !== false)?.value ?? profile.emails?.[0]?.value;
            if (!email) {
              done(null, false, { message: "Google account has no email address" });
              return;
            }
            const user = await usersService.upsertFromGoogle({
              googleId: profile.id,
              email,
              name: profile.displayName || email.split("@")[0]!,
              avatarUrl: profile.photos?.[0]?.value ?? null,
              emailVerified: true,
            });
            done(null, user);
          } catch (err) {
            logger.warn({ err }, "Google sign-in rejected");
            done(err as Error);
          }
        },
      ),
    );
  }
  return passport;
}
