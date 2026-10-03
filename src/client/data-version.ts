import { queryOptions } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";

export type DataVersionMetadata = {
  dataVersion: string;
};

export class DataVersionMismatchError extends Error {
  readonly currentVersion: string | null;

  constructor(currentVersion: string | null) {
    super("表示中のデータ世代を取得できません。最新データを確認してください。");
    this.name = "DataVersionMismatchError";
    this.currentVersion = currentVersion;
  }
}

export const dataVersionQueryKey = ["data-version"] as const;

export function dataVersionQueryOptions() {
  return queryOptions({
    queryKey: dataVersionQueryKey,
    queryFn: fetchDataVersion,
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useDataVersion(initialVersion: string) {
  const versionQuery = useQuery(dataVersionQueryOptions());
  const [adoptedVersion, setAdoptedVersion] = useState(initialVersion);
  const [reportedVersion, setReportedVersion] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);

  const checkLatestVersion = useCallback(async (): Promise<string> => {
    const result = await versionQuery.refetch();
    if (result.isError || !result.data)
      throw result.error ?? new Error("データ更新情報を取得できませんでした");
    setReportedVersion(null);
    setActionError(null);
    return result.data.dataVersion;
  }, [versionQuery.refetch]);

  const reportError = useCallback((error: unknown): void => {
    const normalized =
      error instanceof Error
        ? error
        : new Error("データを取得できませんでした");
    if (normalized instanceof DataVersionMismatchError) {
      if (normalized.currentVersion)
        setReportedVersion(normalized.currentVersion);
      setActionError(normalized);
    }
  }, []);
  const clearError = useCallback(() => setActionError(null), []);

  return {
    adoptedVersion,
    setAdoptedVersion,
    latestVersion:
      reportedVersion ?? versionQuery.data?.dataVersion ?? initialVersion,
    availableVersion:
      (reportedVersion ?? versionQuery.data?.dataVersion) === adoptedVersion
        ? null
        : (reportedVersion ?? versionQuery.data?.dataVersion ?? null),
    error: actionError ?? versionQuery.error,
    isChecking: versionQuery.isFetching,
    checkLatestVersion,
    reportError,
    clearError,
  };
}

export async function fetchDataVersion(): Promise<DataVersionMetadata> {
  const response = await fetch("/api/data-version", {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(
      `データ更新情報を取得できませんでした (${response.status})`,
    );
  const value: unknown = await response.json();
  if (
    !value ||
    typeof value !== "object" ||
    !("dataVersion" in value) ||
    typeof value.dataVersion !== "string" ||
    value.dataVersion.length === 0
  )
    throw new Error("データ更新情報の形式が正しくありません");
  if (response.headers.get("X-Data-Version") !== value.dataVersion)
    throw new DataVersionMismatchError(response.headers.get("X-Data-Version"));
  return { dataVersion: value.dataVersion };
}

export function assertResponseVersion(
  response: Response,
  expectedVersion: string,
): void {
  const responseVersion = response.headers.get("X-Data-Version");
  if (response.status === 409)
    throw new DataVersionMismatchError(responseVersion);
  if (!response.ok) return;
  if (!responseVersion || responseVersion !== expectedVersion)
    throw new DataVersionMismatchError(responseVersion);
}
