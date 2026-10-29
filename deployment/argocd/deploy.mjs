import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deploymentSettings } from "./render.mjs";

export async function publishApplication(
  environment,
  variables,
  manifest,
  fetcher = fetch,
) {
  if (variables.GIRLYANDA_ENABLE_CD !== "true")
    throw new Error(
      "CD is disabled; set GIRLYANDA_ENABLE_CD=true after platform setup",
    );
  const settings = deploymentSettings(environment, variables);
  const server = new URL(variables.ARGOCD_SERVER || "");
  if (
    server.protocol !== "https:" ||
    server.username ||
    server.password ||
    server.pathname !== "/" ||
    server.search ||
    server.hash
  )
    throw new Error(
      "ARGOCD_SERVER must be an HTTPS origin without credentials",
    );
  const token = variables.ARGOCD_TOKEN;
  if (!token || /[\r\n]/.test(token))
    throw new Error("Set a scoped ARGOCD_TOKEN");
  const app = JSON.parse(manifest);
  if (
    app.kind !== "Application" ||
    app.metadata?.name !== settings.APP_NAME ||
    app.spec?.destination?.namespace !== settings.NAMESPACE ||
    app.spec?.source?.repoURL !== settings.REPOSITORY_URL ||
    app.spec?.source?.targetRevision !== settings.REVISION
  )
    throw new Error(
      "Manifest does not match this pipeline's verified deployment",
    );
  const parameters = app.spec.source.helm?.parameters || [];
  for (const [name, value] of [
    ["image.name", settings.IMAGE],
    ["image.tag", settings.IMAGE_TAG],
    ["envs.BETTER_AUTH_URL", settings.APP_URL],
    ["envs.NEXT_PUBLIC_APP_URL", settings.APP_URL],
  ]) {
    if (
      parameters.find((parameter) => parameter.name === name)?.value !== value
    )
      throw new Error(
        "Manifest does not match the verified image or application origin",
      );
  }
  const request = async (path, body) => {
    const response = await fetcher(server.origin + path, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    // The API body may contain sensitive infrastructure details; never log it.
    if (!response.ok)
      throw new Error("Argo CD request failed: HTTP " + response.status);
  };
  await request("/api/v1/applications?upsert=true", app);
  // Dev reconciles automatically. Test/prod sync only from their manual CI jobs.
  if (environment !== "dev")
    await request(
      "/api/v1/applications/" + encodeURIComponent(settings.APP_NAME) + "/sync",
      { revision: settings.REVISION, prune: false },
    );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const manifest = await readFile(process.argv[3], "utf8");
    await publishApplication(process.argv[2], process.env, manifest);
    console.log("Verified revision submitted to Argo CD.");
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Argo CD deployment failed",
    );
    process.exitCode = 1;
  }
}
