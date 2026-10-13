import { cronJobs } from "convex/server";

// Infrastructure is paused (docs/infra-pause.md). Do not schedule work
// while infra/PAUSED exists. Restore failUnclaimedSweep when lifting:
//
//   crons.interval(
//     "fail unclaimed queued jobs",
//     { seconds: 30 },
//     internal.jobs.failUnclaimedSweep
//   );

const crons = cronJobs();

export default crons;
