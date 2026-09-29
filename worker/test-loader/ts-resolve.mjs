// Node ESM loader: resolve extensionless relative imports to .ts files
// (worker TS sources use extensionless imports; tests run with --experimental-strip-types)
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export async function resolve(specifier, context, next) {
    if (specifier.startsWith(".")) {
        const parentPath = fileURLToPath(context.parentURL);
        const base = path.resolve(path.dirname(parentPath), specifier);
        // 纯类型模块 ./models 在测试里用 stub 代替
        if (base.endsWith(`${path.sep}models`) || base.endsWith(`${path.sep}src${path.sep}models`)) {
            const stub = path.resolve(path.dirname(parentPath), "../../test-loader/stub-models.mjs");
            const alt = "/home/hatch/workspace/github/cloudflare_temp_email/fork/worker/test-loader/stub-models.mjs";
            const pick = existsSync(stub) ? stub : alt;
            return { url: pathToFileURL(pick).href, shortCircuit: true };
        }
        if (!path.extname(specifier)) {
            for (const candidate of [base + ".ts", path.join(base, "index.ts")]) {
                if (existsSync(candidate)) {
                    return { url: pathToFileURL(candidate).href, shortCircuit: true };
                }
            }
        }
    }
    return next(specifier, context);
}
