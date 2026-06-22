import { getClient } from "azure-devops-extension-api";
import { PipelinesRestClient } from "azure-devops-extension-api/Pipelines/PipelinesClient";
import { Pipeline } from "azure-devops-extension-api/Pipelines/Pipelines";
import {
  Build,
  BuildRestClient,
  BuildResult,
  BuildReason,
} from "azure-devops-extension-api/Build";
import { PipelineOverview } from "../models/pipeline-overview";
import { getCurrentProjectName } from "./projects";

export async function getPipelineOverview(
  projects: string[],
  showAsPercentage: boolean,
  renderMultipleProjects: boolean
): Promise<PipelineOverview[]> {
  const stats: PipelineOverview[] = [];

  if (renderMultipleProjects) {
    // FIX 1: Run all projects in parallel with Promise.allSettled so a single
    // failing project does not abort the entire widget load.
    const results = await Promise.allSettled(
      projects.map((project) => getPipelinesPerProject(project, showAsPercentage))
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        stats.push(...result.value);
      }
      // Silently skip rejected projects so the widget still renders the rest.
      // You can add console.warn(result.reason) here for debugging if needed.
    }
  } else {
    const project = await getCurrentProjectName();
    stats.push(...(await getPipelinesPerProject(project, showAsPercentage)));
  }

  return stats.sort((a, b) => b.stats.runs - a.stats.runs);
}

async function getPipelinesPerProject(
  projectName: string,
  showAsPercentage: boolean
): Promise<PipelineOverview[]> {
  const pipelines = await getClient(PipelinesRestClient).listPipelines(
    projectName
  );

  // FIX 2: Guard against projects with no pipelines to avoid an invalid
  // getBuilds call with an empty definition list.
  if (pipelines.length === 0) {
    return [];
  }

  const map = await getBuildsGroupedByPipeline(projectName, pipelines);
  const stats: PipelineOverview[] = [];

  map.forEach((value, key) => {
    let succeeded = 0;
    let failed = 0;
    let canceled = 0;
    let avgDuration = 0;
    let avgWaitTime = 0;
    const count = value.builds.length;

    // Sort chronologically (oldest first) since the API does not guarantee
    // build order. This is required for "last run" and "trend" calculations.
    const sortedBuilds = [...value.builds].sort(
      (a, b) => a.startTime.valueOf() - b.startTime.valueOf()
    );

    const triggerCounts = {
      manual: 0,
      ci: 0,
      schedule: 0,
      pullRequest: 0,
      other: 0,
    };
    const branchCounts = new Map<string, number>();

    sortedBuilds.forEach((build) => {
      avgDuration += build.finishTime.valueOf() - build.startTime.valueOf();
      avgWaitTime += build.startTime.valueOf() - build.queueTime.valueOf();
      if (build.result === BuildResult.Succeeded) {
        succeeded += 1;
      } else if (build.result === BuildResult.Failed) {
        failed += 1;
      } else if (build.result === BuildResult.Canceled) {
        canceled += 1;
      }

      switch (build.reason) {
        case BuildReason.Manual:
          triggerCounts.manual += 1;
          break;
        case BuildReason.IndividualCI:
        case BuildReason.BatchedCI:
          triggerCounts.ci += 1;
          break;
        case BuildReason.Schedule:
        case BuildReason.ScheduleForced:
          triggerCounts.schedule += 1;
          break;
        case BuildReason.PullRequest:
          triggerCounts.pullRequest += 1;
          break;
        default:
          triggerCounts.other += 1;
          break;
      }

      const branch = build.sourceBranch ?? "";
      branchCounts.set(branch, (branchCounts.get(branch) ?? 0) + 1);
    });

    // Success-rate trend: compare the most recent half of runs to the older half.
    const midpoint = Math.floor(sortedBuilds.length / 2);
    const olderHalf = sortedBuilds.slice(0, midpoint);
    const recentHalf = sortedBuilds.slice(midpoint);
    const recentSuccessRate = calculateSuccessRate(recentHalf);
    const previousSuccessRate = calculateSuccessRate(olderHalf);

    // Last run: the most recent build chronologically.
    const lastBuild = sortedBuilds[sortedBuilds.length - 1];
    const lastRunResult = lastBuild ? buildResultToLabel(lastBuild.result) : "";
    const lastRunDate = lastBuild ? lastBuild.finishTime : undefined;

    // Top branch: the branch with the most runs, plus its share of total runs.
    let topBranch = "";
    let topBranchCount = 0;
    branchCounts.forEach((branchCount, branch) => {
      if (branchCount > topBranchCount) {
        topBranchCount = branchCount;
        topBranch = branch;
      }
    });
    const topBranchPercentage = count > 0 ? convertValueToPercent(topBranchCount, count) : 0;

    if (showAsPercentage) {
      succeeded = convertValueToPercent(succeeded, count);
      failed = convertValueToPercent(failed, count);
      canceled = convertValueToPercent(canceled, count);
    }

    stats.push({
      projectName: projectName,
      pipeline: {
        name: key,
        url: value.pipelineUrl,
      },
      stats: {
        runs: count,
        succeeded,
        failed,
        canceled,
        // FIX 3: Guard against division by zero when a pipeline has no builds.
        avgDuration: count > 0 ? avgDuration / count : 0,
        avgWaitTime: count > 0 ? avgWaitTime / count : 0,
        recentSuccessRate,
        previousSuccessRate,
        lastRunResult,
        lastRunDate,
        triggeredByManual: triggerCounts.manual,
        triggeredByCI: triggerCounts.ci,
        triggeredBySchedule: triggerCounts.schedule,
        triggeredByPullRequest: triggerCounts.pullRequest,
        triggeredByOther: triggerCounts.other,
        topBranch: formatBranchName(topBranch),
        topBranchPercentage,
      },
    });
  });

  if (pipelines.length !== stats.length) {
    pipelines.forEach((pipeline) => {
      if (!stats.some((run) => run.pipeline.name === pipeline.name)) {
        stats.push({
          projectName: projectName,
          pipeline: {
            name: pipeline.name,
            url: pipeline.url,
          },
          stats: {
            runs: 0,
            succeeded: 0,
            failed: 0,
            canceled: 0,
            avgDuration: 0,
            avgWaitTime: 0,
            recentSuccessRate: 0,
            previousSuccessRate: 0,
            lastRunResult: "",
            lastRunDate: undefined,
            triggeredByManual: 0,
            triggeredByCI: 0,
            triggeredBySchedule: 0,
            triggeredByPullRequest: 0,
            triggeredByOther: 0,
            topBranch: "",
            topBranchPercentage: 0,
          },
        });
      }
    });
  }

  return stats;
}

async function getBuildsGroupedByPipeline(
  projectName: string,
  pipelines: Pipeline[]
): Promise<Map<string, { builds: Build[]; pipelineUrl: string }>> {
  const buildsClient = getClient(BuildRestClient);

  const builds = await buildsClient.getBuilds(
    projectName,
    pipelines.map((p) => p.id)
  );

  const map = new Map<string, { builds: Build[]; pipelineUrl: string }>();

  builds
    .filter((run) => run.finishTime !== undefined)
    .forEach((build) => {
      const key = build.definition.name;
      const currentValue = map.get(key);
      if (!currentValue) {
        const url = pipelines.find((p) => p.id === build.definition.id)?._links.web.href;
        map.set(key, { builds: [build], pipelineUrl: url });
      } else {
        currentValue.builds.push(build);
      }
    });

  return map;
}

function convertValueToPercent(value: number, total: number): number {
  return Math.round((value / total) * 100);
}

function calculateSuccessRate(builds: Build[]): number {
  if (builds.length === 0) {
    return 0;
  }
  const succeededCount = builds.filter((b) => b.result === BuildResult.Succeeded).length;
  return convertValueToPercent(succeededCount, builds.length);
}

function buildResultToLabel(result: BuildResult): string {
  switch (result) {
    case BuildResult.Succeeded:
      return "Succeeded";
    case BuildResult.PartiallySucceeded:
      return "Partially Succeeded";
    case BuildResult.Failed:
      return "Failed";
    case BuildResult.Canceled:
      return "Canceled";
    default:
      return "Unknown";
  }
}

function formatBranchName(branch: string): string {
  // Azure DevOps source branches are typically formatted as "refs/heads/main"
  // or "refs/pull/123/merge". Strip the common prefixes for display.
  if (!branch) {
    return "";
  }
  return branch.replace(/^refs\/heads\//, "").replace(/^refs\//, "");
}
