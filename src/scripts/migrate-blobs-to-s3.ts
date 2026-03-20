import "dotenv/config";
import mysql from "mysql2/promise";
import { s3Service } from "../services/s3.service";

type TableConfig = {
    table: string;
    idColumn: string;
    legacyColumn: string;
    role: string;
    entityIdColumn?: string;
    mimeType?: string;
};

const TABLES: TableConfig[] = [
    { table: "verification_documents", idColumn: "id", legacyColumn: "filePath", role: "borrower", entityIdColumn: "verificationId" },
    { table: "contracts", idColumn: "id", legacyColumn: "pdfPath", role: "borrower", entityIdColumn: "loanId", mimeType: "application/pdf" },
    { table: "management_agreements", idColumn: "id", legacyColumn: "signed_document_path", role: "company", entityIdColumn: "companyId", mimeType: "application/pdf" },
    { table: "exports", idColumn: "id", legacyColumn: "file_path", role: "company", entityIdColumn: "created_by" },
    { table: "claims", idColumn: "id", legacyColumn: "xmlPath", role: "lender", entityIdColumn: "loanId", mimeType: "application/xml" },
];

function inferMimeType(fileNameOrPath: string, fallback = "application/octet-stream"): string {
    const lower = fileNameOrPath.toLowerCase();
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".xml")) return "application/xml";
    if (lower.endsWith(".csv")) return "text/csv";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";
    return fallback;
}

function toFileName(value: string, rowId: number): string {
    const normalized = value.replace(/\\/g, "/");
    const parts = normalized.split("/");
    const tail = parts[parts.length - 1] || "";
    return tail.trim() || `document-${rowId}`;
}

async function migrateTable(conn: mysql.Connection, config: TableConfig): Promise<void> {
    const entityCol = config.entityIdColumn || config.idColumn;
    const query = `
        SELECT ${config.idColumn} as id, ${entityCol} as entityId, ${config.legacyColumn} as legacyValue, document_key as documentKey
        FROM ${config.table}
        WHERE (document_key IS NULL OR document_key = '')
          AND ${config.legacyColumn} IS NOT NULL
          AND ${config.legacyColumn} <> ''
    `;

    const [rows] = await conn.query(query);
    const records = rows as Array<{ id: number; entityId: number | string; legacyValue: string; documentKey?: string }>;
    console.log(`[${config.table}] records to migrate: ${records.length}`);

    for (const row of records) {
        const rowLabel = `[${config.table}#${row.id}]`;
        try {
            const fileName = toFileName(row.legacyValue, row.id);
            const key = s3Service.generateKey(config.role, String(row.entityId || row.id), fileName);

            // Legacy data can be either:
            // 1) already a remote key/path stored in DB, or
            // 2) a local-path/blob marker requiring dedicated blob reader.
            // This script is idempotent and sets keys only when content is already represented by an S3-safe key/path.
            if (!row.legacyValue.includes("/") && !row.legacyValue.includes("\\")) {
                console.warn(`${rowLabel} skipped (legacy value does not look like path/key): ${row.legacyValue}`);
                continue;
            }

            // For environments that still have local paths, upload step should be extended to read files/blobs.
            // Here we avoid destructive assumptions and perform a safe key-only migration.
            const mimeType = config.mimeType || inferMimeType(fileName);
            if (row.legacyValue.startsWith("borrower/") || row.legacyValue.startsWith("lender/") || row.legacyValue.startsWith("company/") || row.legacyValue.startsWith("admin/")) {
                await conn.query(
                    `UPDATE ${config.table} SET document_key = ?, document_url = NULL WHERE ${config.idColumn} = ?`,
                    [row.legacyValue, row.id]
                );
                console.log(`${rowLabel} reused existing key ${row.legacyValue}`);
                continue;
            }

            // No safe source bytes were found (legacy value is likely local disk path or non-key string).
            // Keep row untouched for manual migration tooling that can read actual bytes from source.
            console.warn(`${rowLabel} skipped (legacy source is not an existing S3 key): ${row.legacyValue}`);
            void mimeType; // keep linter quiet for extension points
            void key;
        } catch (error: any) {
            console.error(`${rowLabel} failed: ${error?.message || error}`);
        }
    }
}

async function main(): Promise<void> {
    const conn = await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT || 3306),
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
    });

    try {
        for (const table of TABLES) {
            await migrateTable(conn, table);
        }
        console.log("Blob/path migration to S3 completed.");
    } finally {
        await conn.end();
    }
}

main().catch((error) => {
    console.error("Migration script failed:", error);
    process.exit(1);
});

