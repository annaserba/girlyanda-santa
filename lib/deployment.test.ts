import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  deploymentSettings,
  renderApplication,
} from "../deployment/argocd/render.mjs";

const config = {
  CI_PROJECT_URL: "https://git.company.internal/events/girlyanda",
  REGISTRY: "registry.company.internal/main",
  CI_ENV_URL_DEV: "https://santa-dev.company.internal",
  CI_ENV_URL_TEST: "https://santa-test.company.internal",
  CI_ENV_URL_PROD: "https://santa.company.internal",
  CI_COMMIT_TAG: "v1.2.3",
  CI_COMMIT_SHA: "a".repeat(40),
};
describe("GitLab / Helm / Argo CD deployment contract", () => {
  it.each(["dev", "test", "prod"])(
    "renders %s without secrets, unresolved tokens or writes",
    async (environment) => {
      const settings = deploymentSettings(environment, config);
      const rendered = await renderApplication(environment, config);
      expect(rendered).not.toMatch(/__[A-Z_]+__/);
      const app = JSON.parse(rendered);
      expect(app.spec.source.repoURL).toBe(config.CI_PROJECT_URL + ".git");
      expect(app.spec.source.targetRevision).toBe(settings.REVISION);
      expect(app.spec.source.helm.parameters).toEqual(
        expect.arrayContaining([
          { name: "image.name", value: settings.IMAGE },
          { name: "image.tag", value: settings.IMAGE_TAG },
          { name: "envs.BETTER_AUTH_URL", value: settings.APP_URL },
        ]),
      );
      expect("automated" in app.spec.syncPolicy).toBe(environment === "dev");
      expect(rendered).not.toMatch(
        /BETTER_AUTH_SECRET|DATABASE_URL|kubectl|docker push/,
      );
      expect(settings.VAULT_PATH).toBe("gsp/girlyanda/" + environment);
    },
  );
  it("pins production code and image to the same release tag", () => {
    const settings = deploymentSettings("prod", config);
    expect(settings.REVISION).toBe("v1.2.3");
    expect(settings.IMAGE_TAG).toBe(settings.REVISION);
    expect(() =>
      deploymentSettings("prod", { ...config, CI_COMMIT_TAG: "" }),
    ).toThrow(/CI_COMMIT_TAG/);
  });
  it("pins dev and test to the verified full commit instead of an unchecked branch", () => {
    expect(deploymentSettings("dev", config)).toMatchObject({
      REVISION: config.CI_COMMIT_SHA,
      IMAGE_TAG: config.CI_COMMIT_SHA,
    });
    expect(deploymentSettings("test", config)).toMatchObject({
      REVISION: config.CI_COMMIT_SHA,
      IMAGE_TAG: config.CI_COMMIT_SHA,
    });
  });
  it.each([
    "",
    "http://santa.company.internal",
    "https://santa.example.invalid",
    "https://private:secret@company.internal",
    "https://santa.company.internal/path",
    "$CI_ENV_URL_DEV",
  ])("refuses unconfigured or unsafe origin %s", (url) => {
    expect(() =>
      deploymentSettings("dev", { ...config, CI_ENV_URL_DEV: url }),
    ).toThrow();
  });
  it("requires the actual repository and registry instead of guessing another project's addresses", () => {
    expect(() =>
      deploymentSettings("dev", { ...config, CI_PROJECT_URL: "" }),
    ).toThrow(/REPOSITORY_URL/);
    expect(() =>
      deploymentSettings("dev", { ...config, REGISTRY: "" }),
    ).toThrow(/REGISTRY_IMAGE/);
  });
  it("allows explicit corporate repository, image, namespace and Vault path overrides", () => {
    expect(
      deploymentSettings("dev", {
        ...config,
        DEPLOY_REPOSITORY_URL:
          "ssh://git@git.company.internal:2424/events/santa.git",
        REGISTRY_IMAGE_DEV: "registry.company.internal/events/santa/app",
        KUBE_NAMESPACE_DEV: "events-santa-dev",
        VAULT_PATH_DEV: "events/santa/dev",
      }),
    ).toMatchObject({
      REPOSITORY_URL: "ssh://git@git.company.internal:2424/events/santa.git",
      IMAGE: "registry.company.internal/events/santa/app",
      NAMESPACE: "events-santa-dev",
      VAULT_PATH: "events/santa/dev",
    });
  });
  it("reuses the local universal chart and keeps migrations outside the serving process", () => {
    const values = readFileSync("deployment/helm/values.default.yaml", "utf8");
    expect(values).toContain("replicas: 1");
    expect(values).toContain("type: Recreate");
    expect(values).toContain('command: ["node", "dist-migrate.cjs"]');
    expect(values).toContain('command: ["node", "server.js"]');
    expect(values).toContain("vault-secret-store");
    expect(values).toContain("harbor-auth-secret");
    expect(values).not.toContain("secretEnvs:");
    const chart = readFileSync(
      "deployment/helm/charts/nxs-universal-chart/Chart.yaml",
      "utf8",
    );
    expect(chart).toContain("version: 2.8.2");
  });
  it("runs verification before image builds and gates production manually", () => {
    const pipeline = readFileSync(
      "deployment/gitlab_ci/.gitlab-ci.yml",
      "utf8",
    );
    expect(pipeline).toMatch(/stages:\n  - test\n  - build\n/);
    expect(pipeline).toContain("main/template/common_gitlab_ci");
    expect(pipeline).toContain("npm run test:db");
    expect(pipeline).toContain("POSTGRES_DB: santa_verification");
    expect(pipeline).toContain("IMAGE_TAG: $CI_COMMIT_SHA");
    expect(pipeline).toContain(
      "needs: [typecheck-and-unit, postgres-integration, helm-check]",
    );
    expect(pipeline).toContain('GIRLYANDA_ENABLE_CD: "false"');
    expect(pipeline).toMatch(
      /build-prod:[\s\S]+?when: manual[\s\S]+?allow_failure: false/,
    );
    expect(pipeline).not.toContain("kubectl");
  });
});
