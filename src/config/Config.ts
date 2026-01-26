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
            default: "",
            env: "MYSQL_PASSWORD",
        },
        database: {
            format: "*",
            default: "lms_db",
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
    }
});

// Validate configuration strictness
conf.validate({ allowed: "strict" });

// Export final validated config object
export default conf.getProperties();
