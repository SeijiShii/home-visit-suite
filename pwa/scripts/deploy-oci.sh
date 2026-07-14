#!/usr/bin/env bash
# PWA を本番（OCI VM + Caddy, https://home-visit.givers.work/）へデプロイする。
# 構成・決定経緯: docs/wants/01_共通基盤.md「PWA 配信（本番ホスティング）」
#
# 前提:
#   - ssh 鍵 ~/.ssh/seijishii で ubuntu@161.33.151.237 に入れること
#   - VM 側に /var/www/app が ubuntu 所有で存在すること（初回のみ:
#     sudo mkdir -p /var/www/app && sudo chown ubuntu:ubuntu /var/www/app）
#
# 使い方: pwa/ ディレクトリで  ./scripts/deploy-oci.sh
set -euo pipefail

cd "$(dirname "$0")/.."

VM="${VM:-ubuntu@161.33.151.237}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/seijishii}"
DEST="/var/www/app"

# 本番値は .env.production.local に固定してある（Vite の production モードで
# .env.local の開発値を上書きする。gitignore 対象）。無いままビルドすると
# 開発値が焼き込まれるため、先に存在を確認する。
[ -f .env.production.local ] || {
  echo "ERROR: pwa/.env.production.local がありません（本番値の定義。docs/wants/01 参照）" >&2
  exit 1
}
npm run build

rsync -az --delete -e "ssh -i $SSH_KEY" dist/ "$VM:$DEST/"

echo "deployed: https://home-visit.givers.work/"
