/** @jsxImportSource react */
import { Button } from "./ui";

type DataVersionControlsProps = {
  availableVersion: string | null;
  error: Error | null;
  isBusy: boolean;
  isChecking: boolean;
  onRefresh: () => void;
  onCheck: () => void;
};

export function DataVersionControls({
  availableVersion,
  error,
  isBusy,
  isChecking,
  onRefresh,
  onCheck,
}: DataVersionControlsProps) {
  return (
    <div data-slot="data-version-controls" aria-live="polite">
      {availableVersion && <p role="status">新しいデータがあります。</p>}
      {error && <p role="alert">{error.message}</p>}
      <Button
        type="button"
        variant="outline"
        disabled={isBusy || isChecking}
        data-version-action="refresh"
        onClick={onRefresh}
      >
        {availableVersion ? "新しいデータに更新" : "表示中のデータを更新"}
      </Button>
      {error && (
        <Button
          type="button"
          variant="outline"
          disabled={isChecking}
          data-version-action="check"
          onClick={onCheck}
        >
          更新情報を再確認
        </Button>
      )}
    </div>
  );
}
