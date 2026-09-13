declare const process: { env: Record<string, string | undefined> };

export default {
  providers: [
    {
      applicationID: "convex",
      domain: process.env.CONVEX_SITE_URL,
    },
  ],
};
