// =====================================================================
// FARM PLAN · Edge Function "criar-acesso"
// Cria o login de uma pessoa da fazenda (usuário + senha, sem e-mail)
// ou troca a senha dela. Só gestor ou consultor da fazenda pode usar.
// Também cadastra os Consultores da Gesta'Up (e-mail + senha), que
// enxergam todas as fazendas da consultoria. Só consultor pode usar.
// A chave secreta (service_role) fica guardada no próprio Supabase:
// ela NUNCA aparece no site nem neste arquivo.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const DOMINIO = '@campo.gestaup.com';   // e-mail "de mentira" por trás do usuário; nunca recebe mensagem

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    // Chave secreta: o próprio Supabase entrega aqui dentro (nome antigo ou novo)
    let chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!chave) { try { chave = String(Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'))[0] || ''); } catch { chave = ''; } }
    if (!chave) return responder({ erro: 'Chave Secreta Não Encontrada na Função.' }, 500);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, chave, { auth: { persistSession: false } });

    // 1. Quem está pedindo?
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: { user }, error: eLogin } = await admin.auth.getUser(token);
    if (eLogin || !user) return responder({ erro: 'Faça Login de Novo.' }, 401);

    const { acao, fazenda_id, pessoa_id, usuario, senha, papel, email: emailC, nome: nomeC, consultor_id } = await req.json();

    // ---------- CONSULTORES DA GESTA'UP ----------
    if (String(acao || '').startsWith('consultor_')) {
      const { data: euC } = await admin.from('consultores').select('conta_id, ativo').eq('user_id', user.id).maybeSingle();
      if (!euC || !euC.ativo) return responder({ erro: 'Só o Consultor Pode Cadastrar Consultores.' }, 403);
      const conta = euC.conta_id;
      const { data: fzs } = await admin.from('fazendas').select('id').eq('conta_id', conta);
      const idsFz = (fzs || []).map((f: { id: string }) => f.id);
      const darAcessos = async (uid: string) => {
        if (!idsFz.length) return;
        await admin.from('acessos').upsert(idsFz.map((fz: string) => ({ user_id: uid, fazenda_id: fz, papel: 'consultor' })), { onConflict: 'user_id,fazenda_id' });
      };
      const alvo = async (uid: string) => {
        const { data: c } = await admin.from('consultores').select('user_id, conta_id').eq('user_id', uid).maybeSingle();
        return c && c.conta_id === conta ? c : null;
      };

      if (acao === 'consultor_criar') {
        const email = String(emailC || '').trim().toLowerCase();
        const nome = String(nomeC || '').trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ erro: 'E-mail Inválido.' }, 400);
        if (nome.length < 2) return responder({ erro: 'Informe o Nome do Consultor.' }, 400);
        if (!senha || String(senha).length < 8) return responder({ erro: 'A Senha do Consultor Precisa Ter Pelo Menos 8 Letras ou Números.' }, 400);
        const { data: novo, error: eCria } = await admin.auth.admin.createUser({ email, password: String(senha), email_confirm: true, user_metadata: { nome } });
        if (eCria) return responder({ erro: /already|registered|exists/i.test(eCria.message) ? 'Esse E-mail Já Tem Login no Farm Plan.' : eCria.message }, 400);
        await admin.from('consultores').insert({ user_id: novo.user.id, conta_id: conta, nome, email });
        await darAcessos(novo.user.id);
        return responder({ ok: true, email, fazendas: idsFz.length });
      }
      const uid = String(consultor_id || '');
      if (!(await alvo(uid))) return responder({ erro: 'Consultor Não Encontrado.' }, 404);
      if (acao === 'consultor_editar') {
        const nome = String(nomeC || '').trim();
        const email = String(emailC || '').trim().toLowerCase();
        if (nome.length < 2) return responder({ erro: 'Informe o Nome do Consultor.' }, 400);
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return responder({ erro: 'E-mail Inválido.' }, 400);
        const { data: atual } = await admin.from('consultores').select('email').eq('user_id', uid).maybeSingle();
        if (atual && atual.email !== email) {
          const { error } = await admin.auth.admin.updateUserById(uid, { email, email_confirm: true, user_metadata: { nome } });
          if (error) return responder({ erro: /already|registered|exists/i.test(error.message) ? 'Esse E-mail Já Tem Login no Farm Plan.' : error.message }, 400);
        } else {
          await admin.auth.admin.updateUserById(uid, { user_metadata: { nome } });
        }
        await admin.from('consultores').update({ nome, email }).eq('user_id', uid);
        return responder({ ok: true, email });
      }
      if (acao === 'consultor_senha') {
        if (!senha || String(senha).length < 8) return responder({ erro: 'A Senha Precisa Ter Pelo Menos 8 Letras ou Números.' }, 400);
        const { error } = await admin.auth.admin.updateUserById(uid, { password: String(senha) });
        if (error) return responder({ erro: error.message }, 400);
        return responder({ ok: true });
      }
      if (acao === 'consultor_desligar') {
        if (uid === user.id) return responder({ erro: 'Você Não Pode Desligar a Si Mesmo.' }, 400);
        await admin.from('consultores').update({ ativo: false }).eq('user_id', uid);
        if (idsFz.length) await admin.from('acessos').delete().eq('user_id', uid).eq('papel', 'consultor').in('fazenda_id', idsFz);
        await admin.auth.admin.updateUserById(uid, { ban_duration: '876000h' });
        return responder({ ok: true });
      }
      if (acao === 'consultor_religar') {
        await admin.from('consultores').update({ ativo: true }).eq('user_id', uid);
        await admin.auth.admin.updateUserById(uid, { ban_duration: 'none' });
        await darAcessos(uid);
        return responder({ ok: true });
      }
      return responder({ erro: 'Ação Desconhecida.' }, 400);
    }

    // 2. Só gestor ou consultor desta fazenda
    const { data: meu } = await admin.from('acessos').select('papel').eq('user_id', user.id).eq('fazenda_id', fazenda_id).maybeSingle();
    if (!meu || !['consultor', 'gestor'].includes(meu.papel)) return responder({ erro: 'Só Gestor ou Consultor Cria Acessos.' }, 403);

    // 3. A pessoa precisa ser desta fazenda
    const { data: p } = await admin.from('pessoas').select('id, user_id').eq('id', pessoa_id).eq('fazenda_id', fazenda_id).maybeSingle();
    if (!p) return responder({ erro: 'Pessoa Não Encontrada nesta Fazenda.' }, 404);
    if (!senha || String(senha).length < 6) return responder({ erro: 'A Senha Precisa Ter Pelo Menos 6 Números ou Letras.' }, 400);

    if (acao === 'criar') {
      if (p.user_id) return responder({ erro: 'Essa Pessoa Já Tem Acesso.' }, 400);
      if (!['colaborador', 'lider', 'administrativo', 'gestor'].includes(papel)) return responder({ erro: 'Perfil Inválido.' }, 400);
      const u = String(usuario || '').trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,40}$/.test(u)) return responder({ erro: 'Usuário: Só Letras sem Acento, Números, Ponto ou Traço (Mínimo 3).' }, 400);
      const { data: novo, error: eCria } = await admin.auth.admin.createUser({
        email: u + DOMINIO, password: String(senha), email_confirm: true, user_metadata: { usuario: u }
      });
      if (eCria) return responder({ erro: /already|registered|exists/i.test(eCria.message) ? 'Esse Usuário Já Existe. Escolha Outro.' : eCria.message }, 400);
      await admin.from('pessoas').update({ user_id: novo.user.id, usuario: u }).eq('id', p.id);
      await admin.from('acessos').insert({ user_id: novo.user.id, fazenda_id, papel });
      return responder({ ok: true, usuario: u });
    }

    if (acao === 'senha') {
      if (!p.user_id) return responder({ erro: 'Essa Pessoa Ainda Não Tem Acesso.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(p.user_id, { password: String(senha) });
      if (error) return responder({ erro: error.message }, 400);
      return responder({ ok: true });
    }

    return responder({ erro: 'Ação Desconhecida.' }, 400);
  } catch (e) {
    return responder({ erro: String(e) }, 500);
  }
});
