function toCsv(rows) {
  const fieldnames = rows.length ? Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).sort() : ['mensagem'];
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const data = rows.length ? rows : [{ mensagem: 'Sem dados para exportar' }];
  return [
    fieldnames.join(';'),
    ...data.map((row) => fieldnames.map((field) => escape(row[field])).join(';')),
  ].join('\n');
}

module.exports = { toCsv };
