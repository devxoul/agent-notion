#!/bin/bash
# Read a page and its direct children

if [ -z "$1" ]; then
  echo "Usage: $0 <page_id>"
  exit 1
fi

PAGE_ID=$1

echo "--- Page Metadata ---"
agent-notion page get "$PAGE_ID" --pretty

echo -e "\n--- Page Content (Direct Children) ---"
agent-notion block children "$PAGE_ID" --pretty
