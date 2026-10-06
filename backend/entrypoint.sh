#!/bin/sh
set -e

if [ -d migrations ]; then
  flask db upgrade
fi

exec "$@"
