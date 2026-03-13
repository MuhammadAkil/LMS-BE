// src/config/Config.ts

import convict from "convict";

function normalizeFrontendOrigin(input?: string): string {
    const raw = (input ?? "").trim();
    if (!raw) return "";
    try {
        const url = new URL(raw);
        // Keep only scheme + host (+port). Payment return paths are appended by services.
        return `${url.protocol}//${url.host}`;
    } catch {
        // Fallback for plain host values without protocol
        return raw.replace(/\/+$/, "").replace(/\/auth\/login$/i, "");
    }
}

const conf = convict({
    env: {
        format: ["development", "production", "test"],
        default: "development",
        env: "NODE_ENV",
    },

    server: {
        port: {
            format: "port",
            default: 3009,
            env: "APP_PORT",
        },
        routingPrefix: {
            format: "*",
            default: "/api",
            env: "CONTEXT_PATH",
        },
    },


    // MySQL configuration
    mysql: {
        host: {
            format: "*",
            default: "209.182.238.150",
            env: "MYSQL_HOST",
        },
        port: {
            format: "port",
            default: 3306,
            env: "MYSQL_PORT",
        },
        username: {
            format: "*",
            default: "lms_user",
            env: "MYSQL_USER",
        },
        password: {
            format: "*",
            default: "LmsPortal@786",
            env: "MYSQL_PASSWORD",
        },
        database: {
            format: "*",
            default: "lending_platform",
            env: "MYSQL_DATABASE",
        },
    },

    // JWT configuration
    jwt: {
        secret: {
            format: "*",
            default: "your-secret-key-change-in-production",
            env: "JWT_SECRET",
        },
        expiration: {
            format: "int",
            default: 28800000, // 8 hours in milliseconds
            env: "JWT_EXPIRATION",
        },
    },

    // Przelewy24 (P24) payment gateway
    p24: {
        merchantId: {
            format: "int",
            default: 119558,
            env: "P24_MERCHANT_ID",
        },
        posId: {
            format: "int",
            default: 119558,
            env: "P24_POS_ID",
        },
        apiKey: {
            format: "*",
            default: "17d25a5bedb1b7d51cb404062c4f1974",
            env: "P24_API_KEY",
        },
        crc: {
            format: "*",
            default: "08eed59d347b8dca",
            env: "P24_CRC",
        },
        orderKey: {
            format: "*",
            default: "e6df8910",
            env: "P24_ORDER_KEY",
        },
        apiUrl: {
            format: "*",
            default: "https://secure.przelewy24.pl",
            env: "P24_API_URL",
        },
    },

    // App URL for payment return/status URLs (must be reachable by user and P24)
    app: {
        baseUrl: {
            format: "*",
            default: "http://localhost:3009",
            env: "APP_BASE_URL",
        },
        // Frontend URL used as urlReturn (where the user is redirected after payment).
        // Defaults to APP_BASE_URL when frontend and backend share the same origin.
        // Override with FRONTEND_BASE_URL when they are on different domains (typical production setup).
        frontendUrl: {
            format: "*",
            default: "http://209.182.238.150",
            env: "FRONTEND_BASE_URL",
        },
        // Frontend URL used specifically for CORS allow-list.
        // Kept as separate mapping because existing deployments commonly set FRONTEND_URL.
        frontendCorsUrl: {
            format: "*",
            default: "",
            env: "FRONTEND_URL",
        },
    },

    smtp: {
        host: {
            format: "*",
            default: "smtp.gmail.com",
            env: "SMTP_HOST",
        },
        port: {
            format: "port",
            default: 587,
            env: "SMTP_PORT",
        },
        secure: {
            format: Boolean,
            default: false,
            env: "SMTP_SECURE",
        },
        user: {
            format: "*",
            default: "",
            env: "SMTP_USER",
        },
        pass: {
            format: "*",
            default: "",
            env: "SMTP_PASS",
        },
        from: {
            format: "*",
            default: "noreply@lendingplatform.pl",
            env: "SMTP_FROM",
        },
    },
});

// Validate configuration strictness
conf.validate({ allowed: "strict" });

const properties = conf.getProperties() as any;

// Harmonize frontend URL envs and normalize to origin-only format.
// This allows values like "http://209.182.238.150/auth/login/" from env
// while still generating correct payment return URLs.
const frontendUrlFromBase = normalizeFrontendOrigin(properties.app?.frontendUrl);
const frontendUrlFromCors = normalizeFrontendOrigin(properties.app?.frontendCorsUrl);
properties.app.frontendUrl = frontendUrlFromBase || frontendUrlFromCors || "";
properties.app.frontendCorsUrl = frontendUrlFromCors || frontendUrlFromBase || "";

// Normalize P24 values to prevent subtle prod issues from whitespace/casing.
properties.p24.apiKey = String(properties.p24?.apiKey ?? "").trim();
properties.p24.crc = String(properties.p24?.crc ?? "").trim();
properties.p24.orderKey = String(properties.p24?.orderKey ?? "").trim();
properties.p24.apiUrl = String(properties.p24?.apiUrl ?? "https://secure.przelewy24.pl")
    .trim()
    .replace(/\/+$/, "");

// Export final validated config object
export default properties;
