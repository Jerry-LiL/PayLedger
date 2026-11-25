import 'reflect-metadata';

process.env.NODE_ENV = 'test';
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5432';
process.env.DB_USER ??= 'payledger';
process.env.DB_PASSWORD ??= 'payledger';
process.env.DB_NAME = 'payledger_test';
process.env.DB_SYNCHRONIZE = 'true';
process.env.SEED_DEMO = 'false';
process.env.THROTTLE_TTL_MS ??= '60000';
process.env.THROTTLE_SENSITIVE_LIMIT ??= '1000';
