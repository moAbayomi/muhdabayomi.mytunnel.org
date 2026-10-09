import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "data", "site.db");
const SCHEMA_PATH = path.join(__dirname, "utils", "schema.sql");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL"); // better read/write behavior for a small server

db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));

export default db;
