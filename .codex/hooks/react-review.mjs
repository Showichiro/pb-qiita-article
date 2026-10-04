let input = "";
for await (const chunk of process.stdin) input += chunk;
const event = JSON.parse(input);
const toolInput = JSON.stringify(event.tool_input ?? {});
const toolName = event.tool_name ?? "";
const createsPr = /\bgh\s+pr\s+create\b/i.test(toolInput) ||
  /create[_-]?(pull[_-]?request|pr)/i.test(toolName);
if (event.hook_event_name === "SessionStart" ||
    (event.hook_event_name === "PreToolUse" && createsPr)) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: event.hook_event_name,
      additionalContext: "PR作成・更新前にAGENTS.mdのセルフレビュー手順を実行する。React関連変更はdocs/react-review.mdを読み、最終差分と関連コードをレビューし、問題を修正・検証してからPRを作成する。PR本文に対象・確認観点・修正・検証結果・制約を記載する。未実施ならPR作成前にレビューを済ませる。",
    },
  }));
}
