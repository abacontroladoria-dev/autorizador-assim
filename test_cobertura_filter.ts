/**
 * Test: Validar impacto do filtro id_unidade = 280 na Cobertura Clínica
 *
 * Executa queries que simulam o modal de substituição e mostra:
 * 1. Quantos profissionais desapareceram (unidade 177 apenas)
 * 2. Quantos profissionais continuam (têm registros em 280)
 * 3. Status específico dos 4 profissionais reportados
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://qnwlzwxpspmjzxkopzcv.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function validateCobertukaFilter() {
  console.log('🔍 Validating Cobertura Clínica Filter (id_unidade = 280)\n');
  console.log('Migration: 20260609000001_fase1_filtro_unidade_280_cobertura');
  console.log('Date:', new Date().toISOString());
  console.log('=' .repeat(80));
  console.log('\n');

  // Test 1: Profissionais EXCLUSIVAMENTE em unidade 177 (devem desaparecer)
  console.log('📋 Test A: Profissionais que desaparecerão (apenas unidade 177)\n');

  const { data: onlyUnit177, error: error1 } = await supabase
    .from('grade_profissionais_tita')
    .select('profissional_id, nome_profissional, id_unidade, data');

  if (!error1 && onlyUnit177) {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 4);

    const filtered = onlyUnit177
      .filter(r => new Date(r.data) >= weekStart && new Date(r.data) <= weekEnd)
      .reduce((acc: any, r: any) => {
        if (!acc[r.profissional_id]) {
          acc[r.profissional_id] = {
            id: r.profissional_id,
            nome: r.nome_profissional,
            has_177: false,
            has_280: false,
            count_177: 0,
            count_280: 0
          };
        }
        if (r.id_unidade === 177) {
          acc[r.profissional_id].has_177 = true;
          acc[r.profissional_id].count_177++;
        }
        if (r.id_unidade === 280) {
          acc[r.profissional_id].has_280 = true;
          acc[r.profissional_id].count_280++;
        }
        return acc;
      }, {});

    const disappearing = Object.values(filtered).filter((p: any) => p.has_177 && !p.has_280);
    console.log(`Total: ${disappearing.length} profissionais\n`);

    if (disappearing.length > 0) {
      disappearing.slice(0, 10).forEach((p: any) => {
        console.log(`  • ID ${p.id}: ${p.nome}`);
      });
      if (disappearing.length > 10) {
        console.log(`  ... e mais ${disappearing.length - 10}`);
      }
    } else {
      console.log('  (nenhum - ótimo sinal!)');
    }
    console.log('\n');

    // Test 2: Profissionais em AMBAS as unidades (continuarão)
    console.log('📋 Test B: Profissionais que permanecerão (têm registros em 280)\n');

    const both = Object.values(filtered).filter((p: any) => p.has_177 && p.has_280);
    console.log(`Total: ${both.length} profissionais\n`);

    if (both.length > 0) {
      both.slice(0, 10).forEach((p: any) => {
        console.log(`  • ID ${p.id}: ${p.nome} (slots_177=${p.count_177}, slots_280=${p.count_280})`);
      });
      if (both.length > 10) {
        console.log(`  ... e mais ${both.length - 10}`);
      }
    }
    console.log('\n');

    // Test 3: Os 4 profissionais específicos
    console.log('🎯 Test C: Status dos 4 profissionais reportados\n');

    const reported = [
      { id: 8617, name: 'Anne Christine Da Silva Moura' },
      { id: 8587, name: 'Catislene Ferreira De Andrade' },
      { id: 8604, name: 'Vinicius De Andrade Pereira' },
      { id: 8684, name: 'Daiane Fernandes De Azevedo' }
    ];

    console.log('┌─────────┬────────────────────────────────┬──────┬──────┬──────────────────────┐');
    console.log('│ ID      │ Nome                           │ Uni  │ 177  │ Status após filtro   │');
    console.log('│         │                                │ 280  │ slot │                      │');
    console.log('├─────────┼────────────────────────────────┼──────┼──────┼──────────────────────┤');

    reported.forEach(prof => {
      const found: any = Object.values(filtered).find((p: any) => p.id === prof.id);
      if (found) {
        const status = found.has_177 && !found.has_280
          ? '❌ DESAPARECE'
          : found.has_280
          ? '✅ PERMANECE'
          : '❓ AUSENTE';

        const name = prof.name.substring(0, 30).padEnd(30);
        const col280 = found.count_280.toString().padEnd(4);
        const col177 = found.count_177.toString().padEnd(4);

        console.log(`│ ${prof.id.toString().padEnd(7)} │ ${name} │ ${col280} │ ${col177} │ ${status.padEnd(20)} │`);
      } else {
        const name = prof.name.substring(0, 30).padEnd(30);
        console.log(`│ ${prof.id.toString().padEnd(7)} │ ${name} │ -    │ -    │ ❓ NÃO ENCONTRADO    │`);
      }
    });
    console.log('└─────────┴────────────────────────────────┴──────┴──────┴──────────────────────┘');
    console.log('\n');

    // Test 4: Validação de slots Livres via vw_modal_substituicao_terapeutas Part 2
    console.log('📊 Test D: Contagem de slots Livres (grade sem sessão ativa)\n');

    const livre = onlyUnit177
      .filter(r => new Date(r.data) >= weekStart && new Date(r.data) <= weekEnd)
      .filter(r => r.id_unidade === 280);

    console.log(`Slots "Livres" (id_unidade=280) na semana atual: ${livre.length}`);
    console.log('\n');

  } else if (error1) {
    console.error('❌ Erro ao consultar grade_profissionais_tita:', error1.message);
  }

  console.log('=' .repeat(80));
  console.log('\n✅ Validação concluída!');
  console.log('\nConclussão esperada:');
  console.log('  • Anne (8617) e Catislene (8587): DESAPARECEM (apenas unidade 177)');
  console.log('  • Daiane (8684) e Vinicius (8604): PERMANECEM (têm unidade 280)');
  console.log('  • Profissionais ativos: continuam normalmente');
}

validateCobertukaFilter().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
