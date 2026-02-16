// src/config/Config.ts

import convict from "convict";

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
            default: "localhost",
            env: "MYSQL_HOST",
        },
        port: {
            format: "port",
            default: 3306,
            env: "MYSQL_PORT",
        },
        username: {
            format: "*",
            default: "root",
            env: "MYSQL_USER",
        },
        password: {
            format: "*",
            default: "root",
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
            default: 18000000, // 5 hours in milliseconds
            env: "JWT_EXPIRATION",
        },
    },

    // Przelewy24 (P24) payment gateway
    p24: {
        merchantId: {
            format: "int",
            default: 0,
            env: "P24_MERCHANT_ID",
        },
        posId: {
            format: "int",
            default: 0,
            env: "P24_POS_ID",
        },
        apiKey: {
            format: "*",
            default: "",
            env: "P24_API_KEY",
        },
        crc: {
            format: "*",
            default: "",
            env: "P24_CRC",
        },
        orderKey: {
            format: "*",
            default: "",
            env: "P24_ORDER_KEY",
        },
        apiUrl: {
            format: "*",
            default: "https://sandbox.przelewy24.pl",
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
    },
});

// Validate configuration strictness
conf.validate({ allowed: "strict" });

// Export final validated config object
export default conf.getProperties();
