import { DatabaseSync } from "node:sqlite";

export function createD1() {
    const sqlite = new DatabaseSync(":memory:");
    function prepared(sql, params = []) {
        const statement = () => sqlite.prepare(sql);
        return {
            bind: (...values) => prepared(sql, values.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value)),
            async first(column) {
                const row = statement().get(...params);
                return (column ? row?.[column] : row) ?? null;
            },
            async all() { return { results: statement().all(...params) }; },
            async run() {
                const { changes, lastInsertRowid } = statement().run(...params);
                return { success: true, meta: { changes, last_row_id: lastInsertRowid } };
            },
        };
    }
    return {
        sqlite,
        prepare: prepared,
        async exec(sql) { sqlite.exec(sql); },
        async batch(statements) {
            sqlite.exec("BEGIN");
            try {
                const results = [];
                for (const statement of statements) results.push(await statement.all());
                sqlite.exec("COMMIT");
                return results;
            } catch (error) {
                sqlite.exec("ROLLBACK");
                throw error;
            }
        },
    };
}
