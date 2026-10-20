import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, getFazendaIdForUser, useLotes, toFarmDateOnly } from '@gestaup/shared'
import { Button, Card, Select, useToast } from '@gestaup/ui'
import {
  useCategoriasDoLote,
  useIdentificarLote,
  useRacasFazenda,
  type ResultadoIdentificacao,
} from '../../hooks/useIdentificarLote'
import { parseListaAnimais } from '../../utils/listaAnimaisIdentificacao'
import { planilhaAnimaisParaTexto } from '../../utils/planilhaAnimaisParaTexto'

const campo =
  'w-full px-3 py-2 bg-surface-1 text-content-strong placeholder-content-faint border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all'

export function IdentificarLote() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [fazendaId, setFazendaId] = useState<string | undefined>(undefined)
  const [loteId, setLoteId] = useState('')
  const [categoria, setCategoria] = useState('')
  const [racaPadrao, setRacaPadrao] = useState('')
  const [texto, setTexto] = useState('')
  const [ajustar, setAjustar] = useState(false)
  const hoje = toFarmDateOnly(new Date().toISOString()) ?? new Date().toISOString().split('T')[0]
  const [dataAjuste, setDataAjuste] = useState(hoje)
  const [resultado, setResultado] = useState<ResultadoIdentificacao | null>(null)

  useEffect(() => {
    if (!user) return
    let ativo = true
    getFazendaIdForUser(user.id).then((id) => {
      if (ativo && id) setFazendaId(id)
    })
    return () => {
      ativo = false
    }
  }, [user])

  const { data: lotes = [] } = useLotes(fazendaId)
  const categorias = useCategoriasDoLote(loteId || undefined)
  const racas = useRacasFazenda(fazendaId)
  const identificar = useIdentificarLote(fazendaId)

  const animais = useMemo(() => parseListaAnimais(texto), [texto])
  const cat = categorias.data?.find((c) => c.categoria === categoria)

  // Qualquer mudança invalida a validação anterior
  const limparResultado = () => {
    setResultado(null)
    setAjustar(false)
  }

  const executar = async (confirmar: boolean) => {
    try {
      const r = await identificar.mutateAsync({
        loteId,
        categoria,
        animais,
        racaPadrao,
        confirmar,
        ajustarExcesso: ajustar,
        data: dataAjuste,
      })
      setResultado(r)
      if (confirmar && r.success) {
        toast.success(`${r.criados} animal(is) identificado(s).`)
        setTexto('')
        setResultado(null)
        setAjustar(false)
      } else if (!r.success && r.error && !r.erros) {
        toast.error(r.error)
      }
    } catch (error) {
      toast.error((error as Error).message || 'Não foi possível concluir a identificação.')
    }
  }

  const aoCarregarArquivo = async (arquivo: File | undefined) => {
    if (!arquivo) return
    try {
      const planilha = /\.xlsx?$/i.test(arquivo.name)
      setTexto(planilha ? await planilhaAnimaisParaTexto(await arquivo.arrayBuffer()) : await arquivo.text())
    } catch {
      toast.error('Não foi possível ler o arquivo. Confira se é uma planilha válida.')
    }
    limparResultado()
  }

  const temErros = (resultado?.erros?.length ?? 0) > 0
  const excesso = resultado?.excesso ?? 0
  const validado = !!resultado && resultado.success && resultado.aplicado === false
  const podeGravar = validado && !temErros && (resultado?.criar ?? 0) > 0 && (excesso === 0 || ajustar)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-content-strong">Identificar lote</h2>
          <p className="text-sm text-content-muted mt-1 max-w-2xl">
            Cadastre os animais identificados de uma categoria do lote <strong>sem alterar a contagem</strong>: eles já estão entre as
            cabeças do lote. A contagem só muda se você confirmar o ajuste de excesso.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/controller/individuos')} className="h-10">
          ← Indivíduos
        </Button>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            label="Lote"
            value={loteId}
            onChange={(v) => {
              setLoteId(v)
              setCategoria('')
              limparResultado()
            }}
            options={lotes.filter((l) => l.ativo).map((l) => ({ value: l.id, label: l.nome }))}
            placeholder="Selecione o lote"
          />
          <Select
            label="Categoria"
            value={categoria}
            onChange={(v) => {
              setCategoria(v)
              limparResultado()
            }}
            options={(categorias.data ?? []).map((c) => ({
              value: c.categoria,
              label: `${c.categoria} — ${c.confirmados} de ${c.quant_atual} identificados`,
            }))}
            placeholder={loteId ? 'Selecione a categoria' : 'Escolha o lote primeiro'}
          />
          <div>
            <label className="block text-sm font-medium text-content mb-1">Raça padrão</label>
            <input
              list="racas-identificacao"
              value={racaPadrao}
              onChange={(e) => {
                setRacaPadrao(e.target.value)
                limparResultado()
              }}
              placeholder="Usada quando a linha não traz raça"
              className={campo}
            />
            <datalist id="racas-identificacao">
              {(racas.data ?? []).map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
        </div>

        {cat && (
          <p className="text-sm text-content-muted">
            O lote conta <strong className="text-content-strong">{cat.quant_atual}</strong> cabeça(s) de {cat.categoria}; já há{' '}
            <strong className="text-content-strong">{cat.confirmados}</strong> identificada(s) com localização confirmada
            {cat.incertos > 0 ? ` e ${cat.incertos} com localização incerta` : ''}.
          </p>
        )}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <label className="block text-sm font-medium text-content">Animais (um por linha)</label>
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain"
              onChange={(e) => aoCarregarArquivo(e.target.files?.[0])}
              className="text-sm text-content-muted"
            />
          </div>
          <textarea
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              limparResultado()
            }}
            rows={8}
            placeholder={'Só o brinco, um por linha:\n1001\n1002\n\nou brinco;chip;peso (kg):\n1003;982000123456789;310,5\n\nou com cabeçalho: brinco;chip;manejo;sexo;raca;peso;nascimento;sisbov'}
            className={`${campo} font-mono text-sm`}
          />
          <p className="text-xs text-content-muted mt-1">{animais.length} linha(s) lida(s). Planilha XLSX: só a 1ª aba, cabeçalho na 1ª linha. O sexo vem da categoria quando ela é de um sexo só.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            onClick={() => executar(false)}
            disabled={!loteId || !categoria || animais.length === 0 || identificar.isPending}
          >
            Validar
          </Button>
          <Button onClick={() => executar(true)} disabled={!podeGravar || identificar.isPending}>
            Gravar identificação
          </Button>
        </div>
      </Card>

      {resultado && (
        <Card className="p-4 space-y-3">
          {resultado.success && resultado.aplicado === false && (
            <p className="text-sm text-content">
              {temErros ? (
                <>
                  <strong className="text-red-700 dark:text-red-300">{resultado.erros!.length} linha(s) com erro.</strong> Corrija e valide
                  de novo: nada é gravado enquanto houver erro.
                </>
              ) : (
                <>
                  Tudo certo para gravar <strong>{resultado.criar}</strong> animal(is). O lote terá{' '}
                  <strong>{resultado.confirmados_depois}</strong> identificado(s) de <strong>{resultado.quant_atual}</strong> cabeça(s)
                  contada(s).
                </>
              )}
            </p>
          )}

          {temErros && (
            <ul className="text-sm divide-y divide-border-base">
              {resultado.erros!.map((e) => (
                <li key={e.linha} className="py-1.5 text-content">
                  <span className="font-medium text-content-strong">Linha {e.linha}:</span> {e.mensagem}
                </li>
              ))}
            </ul>
          )}

          {!temErros && excesso > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
              <p className="text-sm text-content">
                Há mais animais identificados do que cabeças contadas no lote (excesso de <strong>{excesso}</strong>). Para gravar, o
                sistema registra uma <strong>Entrada de ajuste de inventário de {excesso} cabeça(s)</strong> e a contagem do lote sobe.
              </p>
              <label className="flex items-center gap-2 text-sm text-content">
                <input type="checkbox" checked={ajustar} onChange={(e) => setAjustar(e.target.checked)} />
                Confirmo o ajuste do agregado
              </label>
              {ajustar && (
                <div className="max-w-xs">
                  <label className="block text-sm font-medium text-content mb-1">Data do ajuste</label>
                  <input type="date" value={dataAjuste} max={hoje} onChange={(e) => setDataAjuste(e.target.value)} className={campo} />
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

export default IdentificarLote
