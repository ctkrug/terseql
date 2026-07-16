---
title: "I built a daily SQL code-golf puzzle that runs SQLite in your browser"
published: false
tags: sql, sqlite, webassembly, javascript
---

# I built a daily SQL code-golf puzzle that runs SQLite in your browser

Most SQL practice sites stop at "correct." You write a query, a green check appears, you move on.
But anyone who has been writing SQL for a few years already knows how to be correct. Correct is
where the interesting part starts.

So I built [Terseql](https://apps.charliekrug.com/terseql): one puzzle a day, and your score is
the UTF-8 byte length of your query. Shortest wins.

Day one asks for each customer's total spend, highest first, excluding customers who never
ordered. Here's the query you'd actually put in a pull request, at 126 bytes:

```sql
SELECT c.name, SUM(o.amount) AS total
FROM customers c JOIN orders o ON o.customer_id = c.id
GROUP BY c.id
ORDER BY total DESC
```

And here's 96, which returns the same rows and passes the same hidden fixtures:

```sql
SELECT name,SUM(amount)FROM customers c,orders WHERE customer_id=c.id GROUP BY 1 ORDER BY 2 DESC
```

The alias is gone, because `ORDER BY 2` points at the column by position. The explicit join became
a comma join and a `WHERE`. `GROUP BY 1` does the same trick as `ORDER BY 2`. Whitespace the
parser doesn't need is gone. I don't think 96 is the floor, which is the whole point.

## Decision one: ship the actual database, not a checker

The obvious way to build this is to compare the player's query against an expected result set on
a server. I didn't want to, for two reasons: a server-side grader needs a server, a queue, and
rate limits, and more importantly it turns every Run into a round-trip. Golfing is a tight loop.
You cut two bytes, you Run, you see if you broke it. A second of latency in that loop kills the
feel of the thing.

So [sql.js](https://github.com/sql-js/sql.js), which is SQLite compiled to WebAssembly, runs in
the tab. There is no backend in the solve loop at all. Whatever SQLite accepts, Terseql accepts:
window functions, CTEs, `GROUP BY` ordinals. Whatever SQLite rejects, you get its actual error
message.

Two things fell out of that which I didn't expect.

The first is that the engine costs about 660KB of WASM to fetch and compile, and it happens on
first use. That put roughly a second between the player's very first Run and their first result
table, which is precisely the moment the whole product has to feel instant. The fix is boring and
effective: start compiling the engine at mount, while the player is still reading the prompt.

```js
export function warmEngine() {
  return createDatabase()
    .then((db) => db.close())
    .catch(() => {});
}
```

The swallowed error is deliberate. This is a head start, not a dependency. If it fails, the first
real query pays the cost it would have paid anyway and reports its own error.

The second is that players can write anything, including `DROP TABLE orders`. Rather than police
that, every Run gets a fresh seeded database:

```js
export async function executeQuery(sql, setupSql) {
  let db;
  try {
    db = await createSeededDatabase(setupSql);
    const [result] = db.exec(sql);
    return { ok: true, result: result ?? { columns: [], values: [] } };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  } finally {
    db?.close();
  }
}
```

Seeding is sub-millisecond once the engine is warm, so isolation costs nothing the player can
feel, and dropping a table costs you nothing but bytes.

## Decision two: hidden fixtures are what make the score mean anything

If you can see the sample data, you can cheat. Not maliciously, just accidentally: it's very easy
to write a query that happens to produce the right two rows for three customers and five orders,
and that has nothing to do with the query being right.

So every puzzle ships fixtures the player never sees. Day one grades against a customer with no
orders, a refund that drives a total negative, and ties on the same amount. If your query fits
the visible sample and nothing else, you get told this:

> Passes the sample, but fails a hidden case.

And that's all you get. Naming the fixture would hand over the edge case, which is the half of the
puzzle worth solving. The failure message is a genuine design decision, not a placeholder: it has
to tell you that you're wrong without telling you why.

## What I'd do differently

The scoring is honest but the _content_ is the hard part, and I underestimated it by a lot. The
engine, the grader, the byte counter and the share card are maybe a week of evenings. Authoring
puzzles where the golf is interesting, where there's a real gap between the obvious query and the
short one, and where the hidden fixtures punish exactly the right shortcuts, is the actual job. I
have five. A daily game needs a pipeline, not a catalogue, and I built the catalogue first because
it was the part I knew how to do.

I'd also key the solve records to "the day you played" rather than "the id of the puzzle you
played," which are the same thing right up until they aren't.

The share card is the piece I'm happiest with. It's the golf trail as a shrinking staircase, and
it carries no query text at all, so posting it can't spoil the day for anyone:

```
Terseql 2026-07-16 — Top Spenders

🟦🟦🟦🟦🟦🟦🟦🟦🟦🟦 126
🟦🟦🟦🟦🟦🟦🟦🟦🟦 113
🟦🟦🟦🟦🟦🟦🟦🟦 101
🟩🟩🟩🟩🟩🟩🟩🟩 96

96 bytes (4 cuts)
```

Play it: [apps.charliekrug.com/terseql](https://apps.charliekrug.com/terseql)
Source: [github.com/ctkrug/terseql](https://github.com/ctkrug/terseql)

If you get day one under 96, I'd like to know how.
