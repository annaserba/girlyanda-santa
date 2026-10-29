#!/bin/sh
set -eu
# Registry authentication is supplied by main/template/common_gitlab_ci.
test -n "$REGISTRY_IMAGE"
test -n "$IMAGE_TAG"
test -n "$APP_URL"
test -n "$CI_NODE_IMAGE"
case "$APP_URL" in
  https://*) ;;
  *) printf '%s\n' "APP_URL must be an HTTPS origin" >&2; exit 1 ;;
esac
case "$APP_URL" in
  *localhost*|*.invalid*|*example.com*|*example.org*)
    printf '%s\n' "Set the actual environment URL before building" >&2; exit 1 ;;
esac
docker build \
  --build-arg "NODE_IMAGE=$CI_NODE_IMAGE" \
  --build-arg "NEXT_PUBLIC_APP_URL=$APP_URL" \
  --build-arg "NPM_REGISTRY=${NPM_REGISTRY:-https://registry.npmjs.org}" \
  --build-arg "ALPINE_MIRROR=${ALPINE_MIRROR:-}" \
  -t "$REGISTRY_IMAGE:$IMAGE_TAG" -f "$DOCKERFILE" .
docker push "$REGISTRY_IMAGE:$IMAGE_TAG"
