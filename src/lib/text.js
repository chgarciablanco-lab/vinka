// Concordancia de número en textos: pl(1, 'cliente', 'clientes') → «1 cliente»; pl(3, …) → «3 clientes»
export const pl = (n, one, many) => `${n ?? 0} ${Number(n) === 1 ? one : many}`
export const plw = (n, one, many) => (Number(n) === 1 ? one : many)
