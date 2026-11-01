#!/bin/bash
set -euo pipefail

[[ "${GITHUB_REPOSITORY:-}" == "Frenvius/rail-browser" ]] || exit 1
[[ "${GITHUB_EVENT_NAME:-}" == "workflow_dispatch" ]] || exit 1
[[ "${GITHUB_REF:-}" == "refs/heads/master" ]] || exit 1
[[ "${GITHUB_WORKFLOW_REF:-}" == "Frenvius/rail-browser/.github/workflows/macos.yml@refs/heads/master" ]] || exit 1
