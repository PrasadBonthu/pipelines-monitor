export interface IPipelineWidgetSettings {
  showProjectName: boolean;
  showRuns: boolean;
  showSucceeded: boolean;
  showFailed: boolean;
  showAverage: boolean;
  showAverageWaitTime: boolean;
  showCanceled: boolean;
  showAsPercentage: boolean;
  showSuccessTrend: boolean;
  showLastRunStatus: boolean;
  showTriggeredBy: boolean;
  showTopBranch: boolean;
  selectedProjects: string[];
  renderMultipleProjects: boolean;
}
