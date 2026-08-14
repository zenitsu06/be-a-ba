function toCsv(rows, columns = null) {
  const fieldnames = Array.isArray(columns) && columns.length
    ? columns.map((column) => column.key || column[0] || column)
    : rows.length
      ? Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).sort()
      : ['mensagem'];
  const headers = Array.isArray(columns) && columns.length
    ? columns.map((column) => column.label || column[1] || column.key || column[0] || column)
    : fieldnames;
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };
  const data = rows.length ? rows : [{ mensagem: 'Sem dados para exportar' }];
  return [
    headers.map(escape).join(';'),
    ...data.map((row) => fieldnames.map((field) => escape(row[field])).join(';')),
  ].join('\n');
}

module.exports = { toCsv };
