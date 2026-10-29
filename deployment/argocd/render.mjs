import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function deploymentSettings(environment, variables) {
  if (!["dev", "test", "prod"].includes(environment))
    throw new Error("Environment must be dev, test or prod");
  const suffix = environment.toUpperCase();
  const required = (name, value) => {
    if (!value || /[\r\n]/.test(value) || value.includes("$"))
      throw new Error("Set " + name + " to a concrete value");
    return value;
  };
  const appURL = new URL(
    required("CI_ENV_URL_" + suffix, variables["CI_ENV_URL_" + suffix]),
  );
  if (
    appURL.protocol !== "https:" ||
    appURL.username ||
    appURL.password ||
    appURL.pathname !== "/" ||
    appURL.search ||
    appURL.hash ||
    appURL.hostname === "localhost" ||
    appURL.hostname.endsWith(".invalid")
  )
    throw new Error(
      "Application URL must be a concrete HTTPS origin without credentials or a path",
    );
  const repositoryURL = required(
    "DEPLOY_REPOSITORY_URL or CI_PROJECT_URL",
    variables.DEPLOY_REPOSITORY_URL ||
      (variables.CI_PROJECT_URL
        ? variables.CI_PROJECT_URL.replace(/\/$/, "") + ".git"
        : ""),
  );
  const repo = new URL(repositoryURL);
  if (
    !["https:", "ssh:"].includes(repo.protocol) ||
    repo.password ||
    (repo.protocol === "https:" && repo.username) ||
    repo.hostname.endsWith(".invalid")
  )
    throw new Error(
      "Repository must be HTTPS or ssh:// without embedded credentials",
    );
  const defaultNamespace =
    "gsp-girlyanda" + (environment === "prod" ? "" : "-" + environment);
  const namespace = variables["KUBE_NAMESPACE_" + suffix] || defaultNamespace;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(namespace))
    throw new Error("Invalid Kubernetes namespace");
  const image = required(
    "REGISTRY_IMAGE_" + suffix,
    variables["REGISTRY_IMAGE_" + suffix] ||
      (variables.REGISTRY
        ? variables.REGISTRY.replace(/\/$/, "") +
          "/" +
          defaultNamespace +
          "/app"
        : ""),
  );
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9.:_/-]*\/[a-zA-Z0-9._/-]+$/.test(image) ||
    image.includes("@") ||
    image.split("/").at(-1).includes(":") ||
    image.endsWith(":")
  )
    throw new Error("Image must be an untagged registry repository");
  const revision =
    environment === "prod"
      ? required("CI_COMMIT_TAG", variables.CI_COMMIT_TAG)
      : required("CI_COMMIT_SHA", variables.CI_COMMIT_SHA);
  if (
    environment !== "prod" &&
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)
  )
    throw new Error("Use the full verified commit SHA");
  if (
    environment === "prod" &&
    !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/.test(revision)
  )
    throw new Error("Release tag must also be a valid Docker tag");
  const vaultPath =
    variables["VAULT_PATH_" + suffix] || "gsp/girlyanda/" + environment;
  if (!/^[a-zA-Z0-9_/-]+$/.test(vaultPath))
    throw new Error("Invalid Vault path");
  return {
    APP_NAME: defaultNamespace,
    NAMESPACE: namespace,
    REPOSITORY_URL: repositoryURL,
    REVISION: revision,
    IMAGE: image,
    // The source and built image always refer to the same verified revision.
    IMAGE_TAG: revision,
    APP_URL: appURL.origin,
    HOSTNAME: appURL.hostname,
    VAULT_PATH: vaultPath,
  };
}

export async function renderApplication(environment, variables) {
  const settings = deploymentSettings(environment, variables);
  const template = await readFile(
    new URL("./app-" + environment + ".yaml", import.meta.url),
    "utf8",
  );
  const result = template.replace(/"__([A-Z_]+)__"/g, (_, key) => {
    if (!(key in settings)) throw new Error("Unknown template token: " + key);
    return JSON.stringify(settings[key]);
  });
  if (/__[A-Z_]+__/.test(result))
    throw new Error("Unresolved deployment template");
  JSON.parse(result); // JSON is also valid YAML and can be posted to Argo unchanged.
  return result;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const environment = process.argv[2];
    const output = process.argv[3] || ".local-deployment";
    const manifest = await renderApplication(environment, process.env);
    await mkdir(output, { recursive: true });
    await writeFile(resolve(output, "app-" + environment + ".yaml"), manifest, {
      flag: "wx",
    });
    console.log(
      "Prepared Argo CD application; no registry or cluster changes were made.",
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Deployment configuration is invalid",
    );
    process.exitCode = 1;
  }
}
