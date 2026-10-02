# Extrator XLSM -> JSON intermediario (etapa 1 do adaptador).
# Le so as abas pedidas em read_only+data_only e despeja linhas como arrays.
# Uso: python extract.py <arquivo.xlsm> --sheets "Diárias,Estoque,..." --out extract.json
import json, sys, io, argparse, datetime
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import openpyxl

ap = argparse.ArgumentParser()
ap.add_argument('file')
ap.add_argument('--sheets', required=True, help='nomes separados por virgula; vazio = todas')
ap.add_argument('--out', required=True)
ap.add_argument('--max-cols', type=int, default=60, help='corta colunas alem de N (dimensao de abas pode estar inflada)')
a = ap.parse_args()

wb = openpyxl.load_workbook(a.file, read_only=True, data_only=True)
wanted = [s.strip() for s in a.sheets.split(',') if s.strip()]
names = wb.sheetnames
missing = [w for w in wanted if w not in names]
if missing:
    print(f'[warn] abas ausentes: {missing} — disponiveis: {names}', flush=True)

def conv(v):
    if isinstance(v, datetime.datetime):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, datetime.date):
        return v.isoformat()
    if isinstance(v, datetime.time):
        return v.strftime('%H:%M:%S')
    return v

EMPTY_STOP = 200  # para a leitura apos N linhas totalmente vazias consecutivas (dimensao inflada)

out = {}
for name in wanted:
    if name not in names:
        continue
    ws = wb[name]
    rows = []
    empty = 0
    for row in ws.iter_rows(max_col=a.max_cols, values_only=True):
        vals = [conv(v) for v in row]
        if all(v is None for v in vals):
            empty += 1
            if empty >= EMPTY_STOP:
                break
        else:
            empty = 0
        # preserva linhas vazias dentro do bloco usado (leituras por posicao fixa, ex. Cadastros!Q17)
        rows.append(vals)
    out[name] = rows
    print(f'[sheet] {name}: {len(rows)} linhas x {len(rows[0]) if rows else 0} cols', flush=True)

json.dump({'file': a.file, 'sheets': out}, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False)
print(f'[ok] {a.out}')
