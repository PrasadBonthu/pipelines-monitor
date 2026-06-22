export interface PipelineOverview {
  pipeline: {
    name: string;
    url: string;
  }
  projectName: string,
  stats: {
    runs: number;
    succeeded: number;
    failed: number;
    canceled: number;
    avgDuration: number;
    avgWaitTime: number;
    // Success rate (%) over the most recent half of runs vs. the older half.
    // Lets you see whether a pipeline is getting more or less reliable over time.
    recentSuccessRate: number;
    previousSuccessRate: number;
    // Result and timestamp of the single most recent finished run.
    lastRunResult: string;
    lastRunDate: Date | undefined;
    // Count of runs grouped by what triggered them (manual, CI, schedule, pull request, etc).
    triggeredByManual: number;
    triggeredByCI: number;
    triggeredBySchedule: number;
    triggeredByPullRequest: number;
    triggeredByOther: number;
    // The branch most frequently built for this pipeline, and what fraction of
    // runs came from it (helps spot pipelines dominated by a single branch).
    topBranch: string;
    topBranchPercentage: number;
  };
}
