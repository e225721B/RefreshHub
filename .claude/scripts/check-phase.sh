#!/usr/bin/env bash
# フェーズ終了ゲートの機械的確認。
# 使い方: bash .claude/scripts/check-phase.sh design|implement|review
set -u

phase="${1:-}"
case "$phase" in
  design)    targets=("docs/intern/requirements.md") ;;
  implement) targets=("docs/intern/requirements.md" "docs/intern/design.md") ;;
  review)    targets=("docs/intern/requirements.md" "docs/intern/design.md" "docs/intern/tasks.md") ;;
  *) echo "Usage: $0 design|implement|review" >&2; exit 1 ;;
esac

status=0
for f in "${targets[@]}"; do
  if [ ! -f "$f" ]; then
    echo "NG: $f がありません" ; status=1; continue
  fi
  if grep -n "未記入" "$f" >/dev/null; then
    echo "NG: $f に「未記入」が残っています:"
    grep -n "未記入" "$f" | sed 's/^/    /'
    status=1
  fi
  if ! grep -q "宣言" "$f"; then
    echo "NG: $f に「宣言」セクションがありません"; status=1
  fi
done

if [ "$status" -eq 0 ]; then
  echo "OK: $phase フェーズに進めます"
else
  echo ""
  echo "前のフェーズの成果物を埋めて、学生の確認を取ってから進んでください。"
fi
exit "$status"
