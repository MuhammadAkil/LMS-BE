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

    // MongoDB configuration
    mongo: {
        url: {
            format: "*",
            default: "",
            env: "MONGO_URL",
        },
        database: {
            format: "*",
            default: "",
            env: "MONGO_DB",
        },
    },

    // JWT configuration
    jwt: {
        secret: {
            format: "*",
            default: "",
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
