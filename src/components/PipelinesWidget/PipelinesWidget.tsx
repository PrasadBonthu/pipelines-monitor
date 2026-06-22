import "./PipelinesWidget.scss";
import * as Dashboard from "azure-devops-extension-api/Dashboard";
import React from "react";
import * as SDK from "azure-devops-extension-sdk";
import { showRootComponent } from "../../Common";
import { Card } from "azure-devops-ui/Card";
import { ColumnSorting, IColumnSortProps, ISimpleTableCell, ITableColumn, SimpleTableCell, SortOrder, Table, renderSimpleCell, sortItems } from "azure-devops-ui/Table";
import { ObservableValue } from "azure-devops-ui/Core/Observable";
import { ArrayItemProvider } from "azure-devops-ui/Utilities/Provider";
import { Observer } from "azure-devops-ui/Observer";
import { getPipelineOverview } from "../../services/pipelines";
import { IPipelineWidgetSettings } from "../PipelinesWidgetConfig/IPipelineWidgetSettings";
import { PipelineOverview } from "../../models/pipeline-overview";
import { Link } from "azure-devops-ui/Link";
import { FilterBar } from "azure-devops-ui/FilterBar";
import { Filter, FILTER_CHANGE_EVENT, IFilterState } from "azure-devops-ui/Utilities/Filter";
import { KeywordFilterBarItem } from "azure-devops-ui/TextFilterBarItem";


interface IPipelinesWidgetState {
  title: string;
  pipelines: PipelineOverview[];
  showProjectName: boolean;
  showAsPercentage: boolean;
  showRuns: boolean;
  showSucceeded: boolean;
  showFailed: boolean;
  showAverage: boolean;
  showAverageWaitTime: boolean;
  showSuccessTrend: boolean;
  showLastRunStatus: boolean;
  showTriggeredBy: boolean;
  showTopBranch: boolean;
  showCanceled: boolean;
  error: boolean;
  errorMessage: string;
  renderMultipleProjects: boolean;
  selectedProjects: string[];
}

export interface IPipelineTableItem extends ISimpleTableCell {
  name: string;
  url: string;
  projectName: string;
  runs: number;
  succeeded: number;
  failed: number;
  canceled: number;
  avgDuration: number;
  avgWaitTime: number;
  recentSuccessRate: number;
  previousSuccessRate: number;
  lastRunResult: string;
  lastRunDate: string;
  triggeredByManual: number;
  triggeredByCI: number;
  triggeredBySchedule: number;
  triggeredByPullRequest: number;
  triggeredByOther: number;
  topBranch: string;
  topBranchPercentage: number;
}

interface FilterValue extends IFilterState {
  searchTerm: {
    value: string;
  };
}

class PipelinesWidget
  extends React.Component<{}, IPipelinesWidgetState>
  implements Dashboard.IConfigurableWidget {
  private filter: Filter;
  private allTableItems: IPipelineTableItem[] = [];
  private filteredTableItems: IPipelineTableItem[] = [];
  private itemProvider = new ObservableValue<ArrayItemProvider<IPipelineTableItem>>(
    new ArrayItemProvider([])
  );
  private columns: ITableColumn<IPipelineTableItem>[] = [];
  private sortFunctions: ((item1: IPipelineTableItem, item2: IPipelineTableItem) => number)[] = [];
  private sortingBehavior = this.updateSortingBehavior();

  constructor(props: {}) {
    super(props);

    this.filter = new Filter();
    this.filter.subscribe(() => {
      this.applyFilter();
    }, FILTER_CHANGE_EVENT);
  }

  componentDidMount(): void {
    SDK.init().then(() => {
      SDK.register("pipelines-widget", this);
    });
  }

  applyFilter() {
    const filterValue = this.filter.getState() as FilterValue;
    if (filterValue?.searchTerm === undefined) {
      this.filteredTableItems = this.allTableItems;
    }
    else {
      this.filteredTableItems = this.allTableItems.filter(item => item.name.toLowerCase().includes(filterValue.searchTerm.value.toLowerCase()));
    }

    this.itemProvider.value = new ArrayItemProvider(this.filteredTableItems);
    this.sortingBehavior = this.updateSortingBehavior();
  }

  updateSortingBehavior(): ColumnSorting<IPipelineTableItem> {
    return new ColumnSorting<IPipelineTableItem>(
      (columnIndex: number, proposedSortOrder: SortOrder) => {
        this.itemProvider.value = new ArrayItemProvider(
          sortItems(
            columnIndex,
            proposedSortOrder,
            this.sortFunctions,
            this.columns,
            this.filteredTableItems
          )
        );
      }
    );
  }

  render(): JSX.Element {


    if (!this.state) {
      return <div></div>;
    }

    if (this.state.error) {
      return <div className="flex-column flex-center justify-center font-size-ll full-width">{this.state.errorMessage}</div>;
    }

    const { title, showProjectName, showAsPercentage, pipelines, showRuns, showSucceeded, showFailed, showAverage, showAverageWaitTime, showSuccessTrend, showLastRunStatus, showTriggeredBy, showTopBranch, showCanceled } = this.state;

    this.allTableItems = pipelines.map(({ pipeline: { name, url }, projectName, stats: {
      runs, succeeded, failed, canceled, avgDuration, avgWaitTime,
      recentSuccessRate, previousSuccessRate, lastRunResult, lastRunDate,
      triggeredByManual, triggeredByCI, triggeredBySchedule, triggeredByPullRequest, triggeredByOther,
      topBranch, topBranchPercentage,
    } }) => {
      return {
        name,
        url,
        projectName,
        runs,
        succeeded,
        failed,
        canceled,
        avgDuration,
        avgWaitTime,
        recentSuccessRate,
        previousSuccessRate,
        lastRunResult,
        lastRunDate: lastRunDate ? lastRunDate.toISOString() : "",
        triggeredByManual,
        triggeredByCI,
        triggeredBySchedule,
        triggeredByPullRequest,
        triggeredByOther,
        topBranch,
        topBranchPercentage,
      }
    });

    this.filteredTableItems = this.allTableItems;

    this.itemProvider = new ObservableValue<ArrayItemProvider<IPipelineTableItem>>(
      new ArrayItemProvider(this.filteredTableItems)
    );

    const renderNumericColumn = (
      rowIndex: number,
      columnIndex: number,
      tableColumn: ITableColumn<IPipelineTableItem>,
      tableItem: IPipelineTableItem,
    ): JSX.Element => {
      const value = Number(tableItem[tableColumn.id]);

      if (Number.isNaN(value)) {
        return <div></div>;
      }

      return renderCell(columnIndex, tableColumn, showAsPercentage ? `${value}%` : `${value}`);
    }

    const humanizeDuration = (duration: number): string => {
      const minutes = Math.floor(duration / 60000);
      const seconds = Math.floor((duration % 60000) / 1000);

      if (minutes === 0) {
        return `${seconds}s`;
      }
      else if (seconds === 0) {
        return `${minutes}m`;
      }
      else {
        return `${minutes}m ${seconds}s`;
      }
    }

    function renderPipelineNameCell(
      rowIndex: number,
      columnIndex: number,
      tableColumn: ITableColumn<IPipelineTableItem>,
      tableItem: IPipelineTableItem
    ): JSX.Element {
      const item = tableItem;
      return (
        <SimpleTableCell
          columnIndex={columnIndex}
          tableColumn={tableColumn}
          key={"col-" + columnIndex}
        >
          <span className="flex-row wrap-text">
            <Link
              className="bolt-table-link bolt-link no-underline-link text-ellipsis small-margin bolt-link"
              href={item.url}
              target="_blank"
            >
              {item.name}
            </Link>
          </span>
        </SimpleTableCell>
      );
    }

    const renderAverageColumn = (
      rowIndex: number,
      columnIndex: number,
      tableColumn: ITableColumn<IPipelineTableItem>,
      tableItem: IPipelineTableItem,
    ): JSX.Element => {
      const tableItemValue = Number(tableItem[tableColumn.id]);
      return renderCell(columnIndex, tableColumn, humanizeDuration(tableItemValue));
    }

    const renderTrendColumn = (
      rowIndex: number,
      columnIndex: number,
      tableColumn: ITableColumn<IPipelineTableItem>,
      tableItem: IPipelineTableItem,
    ): JSX.Element => {
      const { recentSuccessRate, previousSuccessRate } = tableItem;
      const delta = recentSuccessRate - previousSuccessRate;
      let arrow = "→";
      if (delta > 0) {
        arrow = "↑";
      } else if (delta < 0) {
        arrow = "↓";
      }
      return renderCell(columnIndex, tableColumn, `${recentSuccessRate}% ${arrow}`);
    }

    const renderLastRunStatusColumn = (
      rowIndex: number,
      columnIndex: number,
      tableColumn: ITableColumn<IPipelineTableItem>,
      tableItem: IPipelineTableItem,
    ): JSX.Element => {
      const { lastRunResult, lastRunDate } = tableItem;
      if (!lastRunResult) {
        return renderCell(columnIndex, tableColumn, "-");
      }
      const dateLabel = lastRunDate ? humanizeRelativeTime(new Date(lastRunDate)) : "";
      return renderCell(columnIndex, tableColumn, `${lastRunResult}${dateLabel ? " (" + dateLabel + ")" : ""}`);
    }

    const renderTriggeredByColumn = (
      rowIndex: number,
      columnIndex: number,
      tableColumn: ITableColumn<IPipelineTableItem>,
      tableItem: IPipelineTableItem,
    ): JSX.Element => {
      const { triggeredByManual, triggeredByCI, triggeredBySchedule, triggeredByPullRequest, triggeredByOther } = tableItem;
      const parts: string[] = [];
      if (triggeredByCI > 0) parts.push(`CI: ${triggeredByCI}`);
      if (triggeredByManual > 0) parts.push(`Manual: ${triggeredByManual}`);
      if (triggeredByPullRequest > 0) parts.push(`PR: ${triggeredByPullRequest}`);
      if (triggeredBySchedule > 0) parts.push(`Sched: ${triggeredBySchedule}`);
      if (triggeredByOther > 0) parts.push(`Other: ${triggeredByOther}`);
      return renderCell(columnIndex, tableColumn, parts.length > 0 ? parts.join(", ") : "-");
    }

    const renderTopBranchColumn = (
      rowIndex: number,
      columnIndex: number,
      tableColumn: ITableColumn<IPipelineTableItem>,
      tableItem: IPipelineTableItem,
    ): JSX.Element => {
      const { topBranch, topBranchPercentage } = tableItem;
      if (!topBranch) {
        return renderCell(columnIndex, tableColumn, "-");
      }
      return renderCell(columnIndex, tableColumn, `${topBranch} (${topBranchPercentage}%)`);
    }

    const humanizeRelativeTime = (date: Date): string => {
      const diffMs = Date.now() - date.valueOf();
      const minutes = Math.floor(diffMs / 60000);
      if (minutes < 1) return "just now";
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    }

    const renderCell = (
      columnIndex: number,
      tableColumn: ITableColumn<IPipelineTableItem>,
      content: string
    ): JSX.Element => {
      return (
        <SimpleTableCell
          columnIndex={columnIndex}
          tableColumn={tableColumn}
          key={"col-" + columnIndex}
        >
          <div>{content}</div>
        </SimpleTableCell>
      );
    }

    const numericSortProps = {
      ariaLabelAscending: "Sorted low to high",
      ariaLabelDescending: "Sorted high to low",
    };

    const addPipelineTableColumn = <T extends keyof IPipelineTableItem>(
      property: T,
      name: string,
      width: number = -12,
      renderCell: (rowIndex: number, columnIndex: number, tableColumn: ITableColumn<IPipelineTableItem>, tableItem: IPipelineTableItem) => JSX.Element = renderNumericColumn,
      sortProps: IColumnSortProps = numericSortProps,
    ): ITableColumn<IPipelineTableItem> => {
      return {
        id: property.toString(),
        name: name,
        width: width,
        renderCell: renderCell,
        sortProps: { ...sortProps }
      };
    }

    this.columns = [];
    this.sortFunctions = [];

    this.columns.push(addPipelineTableColumn("name", "Name", -35, renderPipelineNameCell, { ariaLabelAscending: "Sorted A to Z", ariaLabelDescending: "Sorted Z to A", }));
    this.sortFunctions.push((item1: IPipelineTableItem, item2: IPipelineTableItem): number => item1.name.localeCompare(item2.name));

    if (showProjectName) {
      this.columns.push(addPipelineTableColumn("projectName", "Project", -25, renderSimpleCell, { ariaLabelAscending: "Sorted A to Z", ariaLabelDescending: "Sorted Z to A", }));
      this.sortFunctions.push((item1: IPipelineTableItem, item2: IPipelineTableItem): number => item1.projectName.localeCompare(item2.projectName));
    }

    if (showRuns) {
      this.columns.push(addPipelineTableColumn("runs", "Runs", -10, renderSimpleCell));
      this.sortFunctions.push((item1: IPipelineTableItem, item2: IPipelineTableItem): number => item1.runs - item2.runs);
    }

    if (showSucceeded) {
      this.columns.push(addPipelineTableColumn("succeeded", "Succeeded", -14));
      this.sortFunctions.push((item1: IPipelineTableItem, item2: IPipelineTableItem): number => item1.succeeded - item2.succeeded);
    }

    if (showFailed) {
      this.columns.push(addPipelineTableColumn("failed", "Failed"));
      this.sortFunctions.push((item1: IPipelineTableItem, item2: IPipelineTableItem): number => item1.failed - item2.failed);
    }

    if (showCanceled) {
      this.columns.push(addPipelineTableColumn("canceled", "Canceled"));
      this.sortFunctions.push((item1: IPipelineTableItem, item2: IPipelineTableItem): number => item1.canceled - item2.canceled);
    }

    if (showAverage) {
      this.columns.push(addPipelineTableColumn("avgDuration", "Avg Duration", -15, renderAverageColumn));
      this.sortFunctions.push((item1: IPipelineTableItem, item2: IPipelineTableItem): number => item1.avgDuration - item2.avgDuration);
    }

    if (showAverageWaitTime) {
      this.columns.push(addPipelineTableColumn("avgWaitTime", "Avg Wait Time", -15, renderAverageColumn));
      this.sortFunctions.push((item1: IPipelineTableItem, item2: IPipelineTableItem): number => item1.avgWaitTime - item2.avgWaitTime);
    }

    if (showSuccessTrend) {
      this.columns.push(addPipelineTableColumn("recentSuccessRate", "Success Trend", -16, renderTrendColumn));
      this.sortFunctions.push((item1: IPipelineTableItem, item2: IPipelineTableItem): number => item1.recentSuccessRate - item2.recentSuccessRate);
    }

    if (showLastRunStatus) {
      this.columns.push(addPipelineTableColumn("lastRunResult", "Last Run", -20, renderLastRunStatusColumn, { ariaLabelAscending: "Sorted A to Z", ariaLabelDescending: "Sorted Z to A" }));
      this.sortFunctions.push((item1: IPipelineTableItem, item2: IPipelineTableItem): number => item1.lastRunResult.localeCompare(item2.lastRunResult));
    }

    if (showTriggeredBy) {
      this.columns.push(addPipelineTableColumn("triggeredByCI", "Triggered By", -28, renderTriggeredByColumn));
      this.sortFunctions.push((item1: IPipelineTableItem, item2: IPipelineTableItem): number => item1.triggeredByCI - item2.triggeredByCI);
    }

    if (showTopBranch) {
      this.columns.push(addPipelineTableColumn("topBranch", "Top Branch", -20, renderTopBranchColumn, { ariaLabelAscending: "Sorted A to Z", ariaLabelDescending: "Sorted Z to A" }));
      this.sortFunctions.push((item1: IPipelineTableItem, item2: IPipelineTableItem): number => item1.topBranch.localeCompare(item2.topBranch));
    }

    const renderedTitle = `${title} (${pipelines.length ?? 0})`;

    return (
      <Card className="flex-grow bolt-table-card" titleProps={{ text: renderedTitle, ariaLevel: 3 }}>
        <div className="flex-column flex-grow full-height">
          <div className="flex-noshrink">
            <FilterBar filter={this.filter}>
              <KeywordFilterBarItem filterItemKey="searchTerm" placeholder="Filter by pipeline name" />
            </FilterBar>
          </div>
          <div className="flex-grow full-height">

            <Observer itemProvider={this.itemProvider}>
              {(observableProps: { itemProvider: ArrayItemProvider<IPipelineTableItem> }) => (
                <Table<IPipelineTableItem>
                  ariaLabel="Pipelines Table"
                  columns={this.columns}
                  behaviors={[this.sortingBehavior]}
                  itemProvider={observableProps.itemProvider}
                  scrollable={true}
                  role="table"
                  pageSize={100}
                  containerClassName="h-scroll-auto full-height"
                />
              )}
            </Observer>
          </div>
        </div>
      </Card>
    );
  }

  async preload(_widgetSettings: Dashboard.WidgetSettings): Promise<Dashboard.WidgetStatus> {
    return Dashboard.WidgetStatusHelper.Success();
  }

  async load(
    widgetSettings: Dashboard.WidgetSettings
  ): Promise<Dashboard.WidgetStatus> {
    try {
      await this.setStateFromWidgetSettings(widgetSettings);
      return Dashboard.WidgetStatusHelper.Success();
    } catch (e) {
      return Dashboard.WidgetStatusHelper.Failure((e as any).toString());
    }
  }

  async reload(
    widgetSettings: Dashboard.WidgetSettings
  ): Promise<Dashboard.WidgetStatus> {
    try {
      await this.setStateFromWidgetSettings(widgetSettings);
      return Dashboard.WidgetStatusHelper.Success();
    } catch (e) {
      return Dashboard.WidgetStatusHelper.Failure((e as any).toString());
    }
  }

  private async setStateFromWidgetSettings(
    widgetSettings: Dashboard.WidgetSettings
  ) {
    try {
      const deserialized: IPipelineWidgetSettings = JSON.parse(
        widgetSettings.customSettings.data
      ) ?? this.getDefaultSettings();

      const pipelines = await getPipelineOverview(deserialized.selectedProjects, deserialized.showAsPercentage, deserialized.renderMultipleProjects);

      this.setState({ ...deserialized, title: widgetSettings.name, pipelines });

    } catch (e) {
      this.setErrorState("Error loading pipelines");
    }
  }

  private setErrorState(errorMessage: string) {
    this.setState({
      title: "Pipelines Monitor",
      error: true,
      errorMessage: errorMessage
    })
  }

  private getDefaultSettings(): IPipelineWidgetSettings {
    return {
      showProjectName: false,
      showAsPercentage: false,
      showRuns: true,
      showSucceeded: true,
      showFailed: true,
      showCanceled: true,
      showAverage: true,
      showAverageWaitTime: true,
      showSuccessTrend: false,
      showLastRunStatus: false,
      showTriggeredBy: false,
      showTopBranch: false,
      renderMultipleProjects: false,
      selectedProjects: [],
    };
  }

}
showRootComponent(<PipelinesWidget />);
