import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "fail unclaimed queued jobs",
  { seconds: 30 },
  internal.jobs.failUnclaimedSweep
);

export default crons;
