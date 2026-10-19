import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req: Request) => {
  // Habilitar CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, x-fazenda-id, x-acesso-id, authorization',
      },
    });
  }

  // Obter headers de validação
  const fazendaId = req.headers.get('x-fazenda-id');
  const acessoId = req.headers.get('x-acesso-id');

  // Validar se headers estão presentes
  if (!fazendaId || !acessoId) {
    return new Response(
      JSON.stringify({ error: 'Headers x-fazenda-id e x-acesso-id são obrigatórios' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  // Validar se fazenda_id e acesso_id correspondem
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  const { data: fazenda, error } = await supabase
    .from('fazendas')
    .select('id, acesso_id, nome, ativo')
    .eq('id', fazendaId)
    .eq('acesso_id', acessoId)
    .eq('ativo', true)
    .single();

  if (error || !fazenda) {
    return new Response(
      JSON.stringify({ error: 'Acesso inválido: fazenda não encontrada ou acesso_id incorreto' }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  // Acesso válido
  return new Response(
    JSON.stringify({ 
      valid: true, 
      fazenda_id: fazenda.id,
      fazenda_nome: fazenda.nome 
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
});