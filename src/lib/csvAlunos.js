/*
 * Leitura da lista de alunos do "Cadastrar alunos → Em lote" (Painel do administrador).
 * Aceita o .csv exportado do Excel/Google Planilhas (separador ; , ou tab) ou linhas
 * coladas. Colunas: Nome, Email, CPF, Telefone — em qualquer ordem quando há cabeçalho;
 * sem cabeçalho, nessa ordem. As regras de verdade (CPF válido, e-mail repetido…) ficam
 * no banco: admin_import_students (migrations/20261210_cadastro_em_lote.sql).
 */

const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const HEADERS = {
  name: ['nome', 'nome completo', 'aluno', 'cliente', 'name'],
  email: ['email', 'e-mail', 'e mail', 'mail'],
  cpf: ['cpf', 'documento'],
  phone: ['telefone', 'whatsapp', 'celular', 'fone', 'contato', 'telefone/whatsapp', 'phone', 'tel'],
}

/** Uma linha de CSV respeitando aspas ("Silva; Maria"). */
function splitLine(line, sep) {
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') quoted = false
      else cur += c
    } else if (c === '"') quoted = true
    else if (c === sep) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((v) => v.trim())
}

function detectSeparator(lines) {
  const sample = lines.slice(0, 5).join('\n')
  const count = (ch) => sample.split(ch).length - 1
  return ['\t', ';', ','].sort((a, b) => count(b) - count(a))[0]
}

const colOf = (cell) => Object.keys(HEADERS).find((k) => HEADERS[k].includes(strip(cell)))

/**
 * Texto → { rows: [{ name, email, cpf, phone, line }], error }
 * `line` é o número da linha no arquivo (para o aviso da prévia).
 */
export function parseStudentList(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/)
  const filled = lines.map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => l.trim())
  if (!filled.length) return { rows: [], error: 'Cole a lista ou escolha um arquivo .csv.' }

  const sep = detectSeparator(filled.map((f) => f.l))
  const first = splitLine(filled[0].l, sep)
  const headerCols = first.map(colOf)
  const hasHeader = headerCols.filter(Boolean).length >= 2
  const order = hasHeader ? headerCols : ['name', 'email', 'cpf', 'phone']
  if (hasHeader && (!order.includes('name') || !order.includes('email'))) {
    return { rows: [], error: 'O cabeçalho precisa ter pelo menos as colunas Nome e Email.' }
  }

  const rows = []
  for (const { l, n } of hasHeader ? filled.slice(1) : filled) {
    const cells = splitLine(l, sep)
    if (cells.every((c) => !c)) continue
    const r = { name: '', email: '', cpf: '', phone: '', line: n }
    order.forEach((k, i) => {
      if (k && cells[i] != null && !r[k]) r[k] = cells[i]
    })
    rows.push(r)
  }
  if (!rows.length) return { rows: [], error: 'Nenhum aluno encontrado abaixo do cabeçalho.' }
  return { rows, error: '' }
}

/** Lê o .csv: tenta UTF-8 e, se vier com caracteres quebrados (Excel antigo), Windows-1252. */
export async function readCsvFile(file) {
  const buf = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (!utf8.includes('�')) return utf8
  return new TextDecoder('windows-1252').decode(buf)
}

/** "12345678900" → "123.***.***-00" (prévia sem expor o CPF inteiro na tela). */
export function maskCpf(v) {
  const d = String(v || '').replace(/\D/g, '')
  if (d.length !== 11) return v || ''
  return `${d.slice(0, 3)}.***.***-${d.slice(9)}`
}

/** CPF enquanto digita: 123.456.789-00 */
export function formatCpfInput(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

/** Exemplo para baixar (abre certo no Excel brasileiro: separador ; e BOM). */
export const CSV_TEMPLATE = '﻿Nome;Email;CPF;Telefone\nMaria Souza;maria@email.com;123.456.789-09;(48) 99999-0001\nJoão Lima;joao@email.com;;(48) 98888-0002\n'
