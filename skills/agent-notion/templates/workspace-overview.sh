#!/bin/bash
# Get an overview of the workspace accessible to the integration

echo "--- Current Bot Info ---"
agent-notion auth status --pretty

echo -e "\n--- Accessible Databases ---"
agent-notion database list --pretty

echo -e "\n--- Recent Pages (Search) ---"
agent-notion search "" --filter page --sort desc --page-size 5 --pretty
