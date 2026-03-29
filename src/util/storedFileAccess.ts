import { existsSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { s3Service } from "../services/s3.service";

export type ResolvedDownload =
    | { mode: "local"; path: string }
    | { mode: "remote"; url: string };

/**
 * Resolve a DB-stored reference: local disk path, http(s) URL, or S3 object key.
 */
export async function resolveStoredRefForDownload(
    stored: string | null | undefined,
    presignSeconds = 3600
): Promise<ResolvedDownload> {
    if (!stored || !String(stored).trim()) {
        throw new Error("Missing file reference");
    }
    const s = String(stored).trim();

    if (s.startsWith("http://") || s.startsWith("https://")) {
        return { mode: "remote", url: s };
    }

    const normalized = normalize(s);
    const candidates: string[] = [];
    if (isAbsolute(normalized)) {
        candidates.push(normalized);
    } else {
        candidates.push(join(process.cwd(), normalized.replace(/^[/\\]+/, "")));
        candidates.push(join(process.cwd(), normalized));
    }

    for (const p of candidates) {
        try {
            if (existsSync(p)) {
                return { mode: "local", path: p };
            }
        } catch {
            /* ignore */
        }
    }

    const url = await s3Service.getPresignedUrl(s, presignSeconds);
    return { mode: "remote", url };
}
