import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isReceiptReviewRoute = createRouteMatcher(["/receipt-review(.*)"]);

export default clerkMiddleware(
  async (auth, req) => {
    if (isReceiptReviewRoute(req)) {
      await auth.protect();
    }
  },
  {
    publishableKey:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
      process.env.CLERK_PUBLISHABLE_KEY,
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
  },
);

export const config = {
  matcher: [
    "/((?!_next|api/health|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
