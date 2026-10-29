import { describe, expect, it, vi } from "vitest";
import { renderApplication } from "../deployment/argocd/render.mjs";
import { publishApplication } from "../deployment/argocd/deploy.mjs";

const variables = {
  CI_PROJECT_URL: "https://git.company.internal/events/santa",
  CI_COMMIT_SHA: "b".repeat(40),
  CI_COMMIT_TAG: "v1.2.3",
  REGISTRY: "registry.company.internal/main",
  CI_ENV_URL_DEV: "https://santa-dev.company.internal",
  CI_ENV_URL_TEST: "https://santa-test.company.internal",
  CI_ENV_URL_PROD: "https://santa.company.internal",
  ARGOCD_SERVER: "https://argo.company.internal",
  ARGOCD_TOKEN: "test-only-token",
  GIRLYANDA_ENABLE_CD: "true",
};
describe("explicitly enabled and gated Argo CD publication", () => {
  it("does not make any network request while CD is disabled", async () => {
    const fetcher = vi.fn();
    const manifest = await renderApplication("dev", variables);
    await expect(
      publishApplication(
        "dev",
        { ...variables, GIRLYANDA_ENABLE_CD: "false" },
        manifest,
        fetcher,
      ),
    ).rejects.toThrow(/disabled/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("submits only the tested dev revision and does not issue an extra sync", async () => {
    const manifest = await renderApplication("dev", variables);
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    await publishApplication("dev", variables, manifest, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://argo.company.internal/api/v1/applications?upsert=true",
    );
    expect(request.redirect).toBe("error");
    expect(request.headers.Authorization).toBe("Bearer test-only-token");
    expect(JSON.parse(request.body).spec.source.targetRevision).toBe(
      variables.CI_COMMIT_SHA,
    );
  });
  it.each(["test", "prod"])(
    "syncs %s from its explicit manual pipeline job without pruning",
    async (environment) => {
      const manifest = await renderApplication(environment, variables);
      const fetcher = vi.fn().mockResolvedValue({ ok: true });
      await publishApplication(environment, variables, manifest, fetcher);
      expect(fetcher).toHaveBeenCalledTimes(2);
      const [url, request] = fetcher.mock.calls[1];
      expect(url).toMatch(/\/sync$/);
      expect(JSON.parse(request.body)).toEqual({
        revision:
          environment === "prod"
            ? variables.CI_COMMIT_TAG
            : variables.CI_COMMIT_SHA,
        prune: false,
      });
    },
  );
  it("rejects a manifest pointing at a different image before any API call", async () => {
    const manifest = JSON.parse(await renderApplication("prod", variables));
    manifest.spec.source.helm.parameters.find(
      (p: { name: string }) => p.name === "image.tag",
    ).value = "unchecked";
    const fetcher = vi.fn();
    await expect(
      publishApplication("prod", variables, JSON.stringify(manifest), fetcher),
    ).rejects.toThrow(/verified image/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses non-HTTPS Argo endpoints", async () => {
    const manifest = await renderApplication("dev", variables);
    const fetcher = vi.fn();
    await expect(
      publishApplication(
        "dev",
        { ...variables, ARGOCD_SERVER: "http://argo.company.internal" },
        manifest,
        fetcher,
      ),
    ).rejects.toThrow(/HTTPS/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not disclose API error bodies or continue to sync after a failure", async () => {
    const manifest = await renderApplication("prod", variables);
    const responseText = vi
      .fn()
      .mockResolvedValue("private infrastructure details");
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 403, text: responseText });
    await expect(
      publishApplication("prod", variables, manifest, fetcher),
    ).rejects.toThrow("Argo CD request failed: HTTP 403");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(responseText).not.toHaveBeenCalled();
  });
});
