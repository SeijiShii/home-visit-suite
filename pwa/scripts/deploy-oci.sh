#!/usr/bin/env bash
# PWA を本番（OCI VM + Caddy, https://app.givers.work/）へデプロイする。
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

# .env.local は開発値を含むため、本番で異なるべき値だけシェル環境変数で
# 上書きする（Vite は process.env を .env.* より優先する）。
# VITE_PAIRING_BASE_URL: 空 = 実行時オリジンを使用（本番の正しい挙動）
VITE_PAIRING_BASE_URL= npm run build

rsync -az --delete -e "ssh -i $SSH_KEY" dist/ "$VM:$DEST/"

echo "deployed: https://app.givers.work/"
