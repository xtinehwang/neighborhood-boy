import { Pool } from 'pg';

let pool;
const getPool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { type, name, address, description } = body || {};

    if (!type || (type !== 'recommend' && type !== 'mistake')) {
      return new Response(JSON.stringify({ error: 'Invalid type.' }), { status: 400 });
    }

    if (type === 'recommend') {
      if (!name || !address) {
        return new Response(JSON.stringify({ error: 'Missing required fields.' }), { status: 400 });
      }
    }

    if (type === 'mistake') {
      if (!name || !address || !description) {
        return new Response(JSON.stringify({ error: 'Missing required fields.' }), { status: 400 });
      }
    }

    const wordCount = String(description || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    if (wordCount > 200) {
      return new Response(JSON.stringify({ error: 'Description too long.' }), { status: 400 });
    }

    const db = getPool();
    await db.query(
      `INSERT INTO recommendations (type, name, address, description)
       VALUES ($1, $2, $3, $4)`,
      [
        type,
        name || null,
        address || null,
        description || null
      ]
    );

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('Recommendations API error:', err?.message || err);
    return new Response(JSON.stringify({ error: 'Failed to save row.' }), { status: 500 });
  }
}
