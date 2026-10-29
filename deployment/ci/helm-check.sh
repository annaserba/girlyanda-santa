#!/bin/sh
set -eu
chart=deployment/helm/charts/nxs-universal-chart
for environment in dev test prod; do
  helm lint "$chart" --strict \
    -f deployment/helm/values.default.yaml \
    -f "deployment/helm/values.$environment.yaml" \
    --set-string image.tag=verification
  # Parse/render without any cluster connection or secret material.
  helm template "gsp-girlyanda-$environment" "$chart" \
    --namespace "gsp-girlyanda-$environment" \
    -f deployment/helm/values.default.yaml \
    -f "deployment/helm/values.$environment.yaml" \
    --set-string image.tag=verification >/dev/null
done
