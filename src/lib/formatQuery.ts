const formatQuery = (query: string) => {
  return query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();
};

export default formatQuery;
