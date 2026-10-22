#!/usr/bin/env bash
# Добавляет в сборку все моды из mods.list через packwiz.
# Нужен packwiz: https://packwiz.infra.link/installation/
# Запуск: ./install-mods.sh   (повторный запуск безопасен: уже добавленные моды пропускаются)
set -u
cd "$(dirname "$0")"

if ! command -v packwiz >/dev/null 2>&1; then
  echo "packwiz не найден. Установите: go install github.com/packwiz/packwiz@latest" >&2
  exit 1
fi

failed=()
while read -r source slug _; do
  [[ -z "${source:-}" || "$source" == \#* ]] && continue
  if [[ -f "mods/$slug.pw.toml" ]]; then
    echo "• $slug уже добавлен"
    continue
  fi
  echo "→ $source: $slug"
  if ! packwiz -y "$source" add "$slug"; then
    failed+=("$source $slug")
  fi
done < mods.list

packwiz refresh

if ((${#failed[@]})); then
  echo
  echo "Не удалось добавить (проверьте slug на сайте мода и добавьте вручную):"
  printf '  %s\n' "${failed[@]}"
  exit 1
fi
echo
echo "Готово: все моды добавлены."
