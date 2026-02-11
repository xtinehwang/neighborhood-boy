import fs from 'fs';
import path from 'path';

const CSV_PATH = path.join(process.cwd(), 'public', 'data', 'restaurant_nb.csv');

const csvEscape = (value) => {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      name,
      category,
      website,
      phone,
      address,
      city,
      state,
      zip,
      notes,
      lat,
      lng
    } = body || {};

    if (!name || !address || !city || !state || !zip) {
      return new Response(JSON.stringify({ error: 'Missing required fields.' }), { status: 400 });
    }

    const row = [
      csvEscape(name),
      csvEscape(category),
      csvEscape(website),
      csvEscape(phone),
      csvEscape(address),
      csvEscape(city),
      csvEscape(state),
      csvEscape(zip),
      csvEscape(notes),
      csvEscape(lat),
      csvEscape(lng)
    ].join(',');

    fs.appendFileSync(CSV_PATH, `\n${row}`, 'utf8');

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to save row.' }), { status: 500 });
  }
}
