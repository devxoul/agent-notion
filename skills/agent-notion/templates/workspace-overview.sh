#!/bin/bash
# Get an overview of the workspace accessible to the integration

if [ -z "$1" ]; then
  echo "Usage: $0 <workspace_id>"
  echo "Run 'agent-notion workspace list' to find your workspace ID."
  exit 1
fi

WORKSPACE_ID=$1

echo "--- Current Bot Info ---"
agent-notion auth status --pretty

echo -e "\n--- Accessible Databases ---"
agent-notion database list --pretty

echo -e "\n--- Recent Pages (Search) ---"
agent-notion search "" --workspace-id "$WORKSPACE_ID" --filter page --sort desc --page-size 5 --pretty
